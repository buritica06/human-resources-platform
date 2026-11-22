// Reportes del panel (M8): resumen, ausentismo (+CSV) y auditoría con filtros. Solo admincontable.
// El ausentismo NO muestra diagnósticos ni motivos: solo quién, qué tipo, cuándo y cuántos días.
import { invalido } from '../../core/errors.js';
import { fechaValida, hoyBogota, sumarDias } from '../vacaciones/calendario.js';

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;


const BOM = String.fromCharCode(0xfeff); // Excel reconoce así el UTF-8
// CSV para Excel en español: separador ";", BOM UTF-8 y protección contra fórmulas (=, +, -, @)
export function aCsv(encabezados, filas) {
  const celda = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${BOM}${[encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')}\r\n`;
}

export function crearReportes(ctx) {
  const { db, auditar } = ctx;

  async function resumen() {
    const hoy = hoyBogota();
    const contar = async (q) => Number((await q.count({ n: '*' }))[0].n);
    const anioSig = Number(hoy.slice(0, 4)) + 1;
    const [porAprobar, incapacidades, ultima, sinSaldo, sinCorreo, fijosPorVencer, festivosSig] = await Promise.all([
      contar(db('solicitudes').where({ estado: 'PENDIENTE_CONTABLE' })),
      ctx.servicioIncapacidades ? ctx.servicioIncapacidades.pendientes() : 0,
      db('periodos_nomina').whereNot({ estado: 'ANULADO' }).orderBy('fecha_inicio', 'desc').first('id', 'nombre_hoja', 'estado', 'fecha_inicio', 'fecha_fin', 'colaboradores'),
      contar(db('colaboradores as c').where({ 'c.estado': 'ACTIVO' }).whereNotExists(db('saldos_vacaciones as s').whereRaw('s.colaborador_id = c.id'))),
      contar(db('usuarios').where({ activo: true }).whereNull('correo_verificado_en')),
      contar(db('colaboradores').where({ estado: 'ACTIVO' }).where('tipo_contrato', 'like', '%FIJO%').whereBetween('fecha_fin_contrato', [hoy, sumarDias(hoy, 30)])),
      contar(db('festivos').where({ anio: anioSig })),
    ]);
    const params = await ctx.params.listar();
    // Parámetros que vencen pronto sin versión siguiente, o sin valor hoy
    const porClave = new Map();
    for (const p of params) (porClave.get(p.clave) ?? porClave.set(p.clave, []).get(p.clave)).push(p);
    const porVencer = [];
    for (const [clave, vs] of porClave) {
      const vigente = vs.find((p) => p.vigente_desde <= hoy && (!p.vigente_hasta || p.vigente_hasta >= hoy));
      const siguiente = vigente?.vigente_hasta ? vs.find((p) => p.vigente_desde === sumarDias(vigente.vigente_hasta, 1)) : null;
      if (!vigente) porVencer.push(`${clave} (sin valor hoy)`);
      else if (vigente.vigente_hasta && vigente.vigente_hasta <= sumarDias(hoy, 60) && !siguiente) porVencer.push(`${clave} (vence el ${vigente.vigente_hasta})`);
    }
    const verificar = new Set(params.filter((p) => /VERIFICAR/.test(p.descripcion ?? '') && p.vigente_desde <= hoy && (!p.vigente_hasta || p.vigente_hasta >= hoy)).map((p) => p.clave)).size;
    const alertas = [];
    if (sinSaldo) alertas.push({ nivel: 'alerta', texto: `${sinSaldo} colaborador(es) activo(s) sin saldo de vacaciones registrado: no pueden pedir vacaciones.`, enlace: '/colaboradores' });
    if (fijosPorVencer) alertas.push({ nivel: 'alerta', texto: `${fijosPorVencer} contrato(s) a término fijo vencen en los próximos 30 días.`, enlace: '/colaboradores' });
    if (!festivosSig) alertas.push({ nivel: hoy.slice(5) >= '10-01' ? 'error' : 'info', texto: `Aún no están cargados los festivos de ${anioSig}.`, enlace: '/admin/festivos' });
    if (sinCorreo) alertas.push({ nivel: 'info', texto: `${sinCorreo} usuario(s) aún no confirman su correo (no reciben avisos).`, enlace: '/usuarios' });
    if (porVencer.length) alertas.push({ nivel: 'error', texto: `Parámetros por vencer sin versión siguiente: ${porVencer.join(', ')}. Programe el valor nuevo.`, enlace: '/admin/parametros' });
    if (verificar) alertas.push({ nivel: 'info', texto: `${verificar} parámetro(s) vigente(s) marcados "VERIFICAR" con un asesor.`, enlace: '/admin/parametros' });
    return { porAprobar, incapacidades, ultimaNomina: ultima ?? null, alertas };
  }

  // Ausentismo en un rango: solicitudes APROBADAS, incapacidades vigentes y suspensiones no anuladas.
  // Los días se recortan al rango pedido (calendario); los permisos por horas también traen las horas.
  async function ausentismo(req, { desde, hasta, sede }) {
    if (!fechaValida(desde) || !fechaValida(hasta) || hasta < desde) throw invalido('Revise el rango de fechas.', { desde: 'Elija un rango válido.' });
    if (diasEntre(desde, hasta) > 400) throw invalido('El rango puede ser de máximo 400 días.', { hasta: 'Máximo 400 días.' });
    const colab = (q) => q.join('colaboradores as c', 'c.id', 'x.colaborador_id').leftJoin('sedes as se', 'se.id', 'c.sede_id')
      .modify((qq) => (sede ? qq.where('c.sede_id', sede) : qq))
      .where('x.fecha_inicio', '<=', hasta).where('x.fecha_fin', '>=', desde);
    const sel = ['c.cedula', 'c.nombre', 'se.nombre as sede', 'c.cargo', 'x.fecha_inicio', 'x.fecha_fin'];
    const [sol, inc, sus] = await Promise.all([
      colab(db('solicitudes as x')).where('x.estado', 'APROBADA').select(...sel, 'x.tipo', 'x.subtipo', 'x.datos'),
      ctx.servicioIncapacidades ? colab(db('incapacidades as x')).whereIn('x.estado', ['REGISTRADA', 'VALIDADA']).select(...sel, 'x.tipo', 'x.estado') : [],
      colab(db('suspensiones as x')).whereNull('x.anulada_en').select(...sel),
    ]);
    const filas = [];
    const recorte = (f) => {
      const ini = f.fecha_inicio > desde ? f.fecha_inicio : desde;
      const fin = f.fecha_fin < hasta ? f.fecha_fin : hasta;
      return { ini, fin, dias: diasEntre(ini, fin) };
    };
    const ETQ = { PERMISO: 'Permiso', VACACIONES: 'Vacaciones', LICENCIA: 'Licencia' };
    for (const s of sol) {
      const r = recorte(s);
      const datos = s.datos ? JSON.parse(s.datos) : {};
      // Permisos de un solo día: cuentan en horas; de varios días, en días. Licencias de tipo sensible
      // (p. ej. maternidad) se muestran solo como "Licencia".
      const porHoras = s.tipo === 'PERMISO' && s.fecha_inicio === s.fecha_fin;
      const detalle = s.tipo === 'VACACIONES' ? 'Disfrute' : datos.sensible ? 'Reservado' : s.subtipo ?? '';
      filas.push({ ...base(s), tipo: ETQ[s.tipo] ?? s.tipo, detalle, ...r, horas: porHoras ? datos.horas ?? null : null, remunerada: s.tipo === 'LICENCIA' ? datos.remunerada !== false : true });
    }
    for (const i of inc) filas.push({ ...base(i), tipo: 'Incapacidad', detalle: i.tipo === 'IRL' ? 'Laboral' : 'General', ...recorte(i), horas: null, remunerada: true });
    for (const s of sus) filas.push({ ...base(s), tipo: 'Suspensión', detalle: '', ...recorte(s), horas: null, remunerada: false });
    filas.sort((a, b) => a.sede?.localeCompare(b.sede ?? '') || a.nombre.localeCompare(b.nombre) || a.ini.localeCompare(b.ini));
    const totales = new Map();
    for (const f of filas) {
      const k = JSON.stringify([f.sede ?? 'Sin sede', f.tipo]);
      const t = totales.get(k) ?? { dias: 0, horas: 0 };
      if (f.horas) t.horas = Math.round((t.horas + Number(f.horas)) * 100) / 100;
      else t.dias += f.dias;
      totales.set(k, t);
    }
    await auditar(req, { accion: 'VER_AUSENTISMO', entidad: 'reporte', detalle: { desde, hasta, sede: sede ?? null, filas: filas.length } });
    return {
      desde, hasta, filas,
      totales: [...totales].map(([k, t]) => ({ sede: JSON.parse(k)[0], tipo: JSON.parse(k)[1], ...t })),
    };
  }
  const base = (x) => ({ cedula: x.cedula, nombre: x.nombre, sede: x.sede, cargo: x.cargo });

  function ausentismoCsv(r) {
    return aCsv(
      ['Sede', 'Cédula', 'Nombre', 'Cargo', 'Tipo', 'Detalle', 'Desde', 'Hasta', 'Días en el rango', 'Horas (permisos)', 'Remunerada'],
      // Decimales con coma (Excel en español)
      r.filas.map((f) => [f.sede ?? '', f.cedula, f.nombre, f.cargo ?? '', f.tipo, f.detalle, f.ini, f.fin, f.horas ? '' : f.dias, f.horas ? String(f.horas).replace('.', ',') : '', f.remunerada ? 'Sí' : 'No']),
    );
  }

  // Auditoría con filtros: actor (cédula), entidad, acción, rango de fechas. Paginada.
  async function auditoria(req, { actor, entidad, accion, desde, hasta, pagina = 1 }) {
    const porPagina = 50;
    if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && hasta < desde)) {
      throw invalido('Revise el rango de fechas.', { desde: 'Elija un rango de fechas válido.' });
    }
    const q = db('auditoria as a').leftJoin('usuarios as u', 'u.id', 'a.actor_id');
    if (actor) q.where('u.cedula', actor);
    if (entidad) q.where('a.entidad', entidad);
    if (accion) q.where('a.accion', accion);
    if (desde) q.where('a.creado_en', '>=', `${desde}T05:00:00.000Z`); // 00:00 en Colombia
    if (hasta) q.where('a.creado_en', '<', `${sumarDias(hasta, 1)}T05:00:00.000Z`);
    const total = Number((await q.clone().count({ n: '*' }))[0].n);
    const filas = await q.orderBy('a.id', 'desc').limit(porPagina).offset((pagina - 1) * porPagina)
      .select('a.id', 'a.creado_en', 'a.accion', 'a.entidad', 'a.entidad_id', 'a.detalle', 'a.ip', 'u.nombre as actor', 'u.cedula as actor_cedula');
    const opciones = {
      entidades: (await db('auditoria').distinct('entidad').orderBy('entidad')).map((x) => x.entidad),
      acciones: (await db('auditoria').distinct('accion').orderBy('accion')).map((x) => x.accion),
    };
    if (pagina === 1) await auditar(req, { accion: 'VER_AUDITORIA', entidad: 'auditoria', detalle: { actor: actor ?? null, entidad: entidad ?? null, accion: accion ?? null, desde: desde ?? null, hasta: hasta ?? null, pagina } });
    return {
      total, pagina, porPagina, opciones,
      registros: filas.map((f) => ({
        id: f.id, fecha: f.creado_en, accion: f.accion, entidad: f.entidad, entidadId: f.entidad_id, ip: f.ip,
        actor: f.actor ? { nombre: f.actor, cedula: f.actor_cedula } : null,
        detalle: (() => { try { return f.detalle ? JSON.parse(f.detalle) : null; } catch { return null; } })(),
      })),
    };
  }

  return { resumen, ausentismo, ausentismoCsv, auditoria };
}
