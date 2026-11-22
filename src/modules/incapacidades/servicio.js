// Incapacidades (M5). Datos de salud (Ley 1581 de 2012):
// - El colaborador registra las suyas (PDF obligatorio, diagnóstico opcional y cifrado) y las ve completas.
// - El admincontable ve todo, revisa (valida o devuelve con motivo) y puede registrar a nombre de otro.
// - El director ve SOLO nombre, fechas y días de las de sus sedes: nunca tipo, entidad,
//   diagnóstico, número de certificado ni el PDF. Esto se arma en el servidor (presentarParaDirector).
// - Cada lectura del detalle (y por tanto del diagnóstico) y de listas ajenas queda auditada.
// - No se calcula ningún valor de nómina: la liquidación la hace el área contable en el archivo.
import { ErrorApp, conflicto, invalido, noEncontrado, prohibido } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { log } from '../../core/logger.js';
import { revisarPdf } from '../../core/documentos.js';
import { fechaValida, hoyBogota, sumarDias } from '../vacaciones/calendario.js';

export const TIPOS = {
  IGE: { etiqueta: 'Enfermedad general', entidad: 'EPS' },
  IRL: { etiqueta: 'Accidente o enfermedad laboral', entidad: 'ARL' },
};
export const ESTADOS = { REGISTRADA: 'En revisión', VALIDADA: 'Validada', DEVUELTA: 'Devuelta', ANULADA: 'Anulada' };
const VIGENTES = ['REGISTRADA', 'VALIDADA']; // cuentan como ausencia (cruces, prórrogas)
const CORREO_GENERICO = { asunto: 'Novedad en incapacidades', texto: 'Tiene una novedad sobre incapacidades. Por protección de sus datos de salud, ingrese a la plataforma para verla.' };
const fechaTexto = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const limpiar = (s, max) => String(s ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function crearServicioIncapacidades(ctx) {
  const { db, auditar, cifrador, documentos, notificaciones } = ctx;

  async function seguro(descripcion, fn) {
    try {
      await fn();
    } catch (e) {
      log.error(`Falló ${descripcion}`, { error: e.message });
    }
  }

  async function parametros() {
    const p = {
      maxDias: Number(await ctx.params.valor('INC_MAX_DIAS')),
      diasAtras: Number(await ctx.params.valor('INC_REGISTRO_MAX_DIAS_ATRAS')),
      maxMb: Number(await ctx.params.valor('UPLOAD_MAX_MB')),
    };
    for (const [k, v] of Object.entries(p)) if (!Number.isFinite(v) || v <= 0) throw new Error(`Parámetro mal configurado (${k})`);
    return p;
  }

  const sedesDirector = async (usuarioId) => (await db('director_sedes').where({ usuario_id: usuarioId }).pluck('sede_id'));
  const colaboradorPropio = (req) => db('colaboradores').where({ cedula: req.usuario.cedula }).first();

  // Incapacidades vigentes que se cruzan con un rango (para el motor de solicitudes y aquí)
  async function cruces(trx, colaboradorId, desde, hasta, excluirId = null) {
    return trx('incapacidades').where({ colaborador_id: colaboradorId }).whereIn('estado', VIGENTES)
      .where('fecha_inicio', '<=', hasta).where('fecha_fin', '>=', desde)
      .modify((q) => (excluirId ? q.whereNot('id', excluirId) : q))
      .select('id', 'fecha_inicio', 'fecha_fin');
  }

  function descifrarDiagnostico(fila) {
    if (!fila.diagnostico_cifrado) return null;
    try {
      return cifrador.descifrar(fila.diagnostico_cifrado);
    } catch (e) {
      log.error('No se pudo descifrar un diagnóstico', { incapacidad: fila.id, error: e.message });
      return '(no se pudo leer)';
    }
  }

  // ---------- presentación según quién mira ----------
  function presentarCompleta(f) {
    return {
      id: f.id, tipo: f.tipo, tipoEtiqueta: TIPOS[f.tipo]?.etiqueta ?? f.tipo, entidad: f.entidad,
      fechaInicio: f.fecha_inicio, fechaFin: f.fecha_fin, dias: f.dias, prorrogaDe: f.prorroga_de,
      numeroCertificado: f.numero_certificado, documentoId: f.documento_id,
      estado: f.estado, estadoEtiqueta: ESTADOS[f.estado], motivoEstado: f.motivo_estado,
      colaborador: { id: f.colaborador_id, nombre: f.colaborador_nombre, cedula: f.cedula, cargo: f.cargo, sede: f.sede },
      creadoEn: f.creado_en, revisadoEn: f.revisado_en,
    };
  }
  // Director: SOLO fechas (y quién, para saber que no vendrá)
  const presentarParaDirector = (f) => ({
    colaborador: { nombre: f.colaborador_nombre, sede: f.sede },
    fechaInicio: f.fecha_inicio, fechaFin: f.fecha_fin, dias: f.dias,
  });

  const base = () => db('incapacidades as i').join('colaboradores as c', 'c.id', 'i.colaborador_id')
    .leftJoin('sedes as s', 's.id', 'c.sede_id')
    .select('i.*', 'c.nombre as colaborador_nombre', 'c.cedula', 'c.cargo', 'c.sede_id', 's.nombre as sede');

  // ---------- registrar ----------
  // body: tipo, entidad, fecha_inicio, fecha_fin, numero_certificado?, diagnostico?, prorroga_de?, colaborador_id? (solo admin)
  async function registrar(req, body, archivo) {
    let colaborador;
    if (body.colaborador_id && req.usuario.rol !== 'ADMIN') {
      // Intento de registrar a nombre de otro sin ser admincontable: se rechaza y queda rastro
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'colaborador', entidadId: Number(body.colaborador_id) || null, detalle: { recurso: 'registrar incapacidad' } });
      throw prohibido('Solo el área contable puede registrar incapacidades a nombre de otra persona.');
    }
    if (body.colaborador_id) {
      colaborador = await db('colaboradores').where({ id: Number(body.colaborador_id) }).first();
      if (!colaborador) throw noEncontrado('No encontramos ese colaborador.');
    } else {
      colaborador = await colaboradorPropio(req);
      if (!colaborador) throw new ErrorApp(404, 'SIN_EXPEDIENTE', 'Su cuenta no tiene expediente de colaborador; no puede registrar incapacidades.');
    }
    if (colaborador.estado !== 'ACTIVO') throw invalido('El expediente está como retirado; no se pueden registrar incapacidades.');
    const p = await parametros(); // fuera de la transacción

    const e = {};
    const tipo = String(body.tipo ?? '').toUpperCase();
    if (!TIPOS[tipo]) e.tipo = 'Elija el tipo de incapacidad.';
    const entidad = limpiar(body.entidad, 80);
    if (entidad.length < 2) e.entidad = 'Escriba la EPS o ARL que expidió la incapacidad.';
    const fi = String(body.fecha_inicio ?? '');
    const ff = String(body.fecha_fin ?? '');
    const hoy = hoyBogota();
    if (!fechaValida(fi)) e.fecha_inicio = 'Escriba una fecha válida.';
    if (!fechaValida(ff)) e.fecha_fin = 'Escriba una fecha válida.';
    if (!e.fecha_inicio && !e.fecha_fin) {
      if (ff < fi) e.fecha_fin = 'La fecha final no puede ser anterior a la inicial.';
      else if (diasEntre(fi, ff) > p.maxDias) e.fecha_fin = `Un certificado puede cubrir máximo ${p.maxDias} días. Si es más largo, regístrelo como prórrogas.`;
      if (fi > sumarDias(hoy, 30)) e.fecha_inicio = 'La incapacidad no puede empezar más de 30 días en el futuro.';
      else if (fi < sumarDias(hoy, -p.diasAtras) && req.usuario.rol !== 'ADMIN') e.fecha_inicio = `Solo se pueden registrar incapacidades de los últimos ${p.diasAtras} días. Para una más antigua, comuníquese con el área contable.`;
    }
    const numero = limpiar(body.numero_certificado, 40);
    const diagnostico = limpiar(body.diagnostico, 200);
    if (!archivo) e.soporte = 'Adjunte el certificado de incapacidad en PDF.';
    else {
      // El PDF se revisa junto con los demás datos (todos los errores en un solo intento)
      const errorPdf = revisarPdf(archivo.buffer, p.maxMb);
      if (errorPdf) e.soporte = errorPdf;
    }
    if (Object.keys(e).length) throw invalido(e.soporte && Object.keys(e).length === 1 ? e.soporte : 'Revise los datos marcados.', e);

    let clave = null;
    let id;
    let prorrogaDe = null;
    try {
      await db.transaction(async (trx) => {
        if (db.client.config.client === 'pg') await trx('colaboradores').where({ id: colaborador.id }).forUpdate().first('id');
        if (body.prorroga_de) {
          // Dentro de la transacción: la anterior no puede anularse mientras tanto
          const anterior = await trx('incapacidades').where({ id: Number(body.prorroga_de), colaborador_id: colaborador.id }).whereIn('estado', VIGENTES).first();
          if (!anterior) throw invalido('Revise los datos marcados.', { prorroga_de: 'No encontramos la incapacidad que se prorroga.' });
          if (anterior.tipo !== tipo) throw invalido('Revise los datos marcados.', { tipo: `Una prórroga debe ser del mismo tipo que la anterior (${TIPOS[anterior.tipo].etiqueta.toLowerCase()}).` });
          if (sumarDias(anterior.fecha_fin, 1) !== fi) {
            throw invalido('Revise los datos marcados.', { fecha_inicio: `Una prórroga debe empezar el día siguiente al fin de la anterior (${fechaTexto(sumarDias(anterior.fecha_fin, 1))}).` });
          }
          prorrogaDe = anterior.id;
        }
        const [c] = await cruces(trx, colaborador.id, fi, ff);
        if (c) throw invalido('Revise los datos marcados.', { fecha_inicio: `Se cruza con otra incapacidad registrada (${fechaTexto(c.fecha_inicio)} a ${fechaTexto(c.fecha_fin)}).` });
        // Tampoco sobre una suspensión (M8): el área contable debe anularla o ajustarla primero
        const [sus] = ctx.servicioSuspensiones ? await ctx.servicioSuspensiones.cruces(trx, colaborador.id, fi, ff) : [];
        if (sus) throw invalido('Revise los datos marcados.', { fecha_inicio: `Se cruza con una suspensión registrada (${fechaTexto(sus.fecha_inicio)} a ${fechaTexto(sus.fecha_fin)}). Comuníquese con el área contable.` });
        const doc = await documentos.guardar(trx, req, {
          buffer: archivo.buffer, nombreOriginal: archivo.originalname, colaboradorId: colaborador.id,
          categoria: 'INCAPACIDAD', sensible: true, maxMb: p.maxMb,
        });
        clave = doc.clave;
        const t = ahora();
        const [fila] = await trx('incapacidades').insert({
          colaborador_id: colaborador.id, tipo, entidad, fecha_inicio: fi, fecha_fin: ff, dias: diasEntre(fi, ff),
          prorroga_de: prorrogaDe, numero_certificado: numero || null,
          diagnostico_cifrado: diagnostico ? cifrador.cifrar(diagnostico) : null,
          documento_id: doc.id, estado: 'REGISTRADA', registrado_por: req.usuario.id, creado_en: t, actualizado_en: t,
        }).returning('id');
        id = typeof fila === 'object' ? fila.id : fila;
      });
    } catch (err) {
      if (clave) await documentos.descartar(clave).catch((e2) => log.error('No se pudo borrar un archivo huérfano', { error: e2.message }));
      throw err;
    }
    await auditar(req, { accion: 'REGISTRAR_INCAPACIDAD', entidad: 'incapacidad', entidadId: id, detalle: { tipo, dias: diasEntre(fi, ff), conDiagnostico: !!diagnostico, aNombreDe: colaborador.cedula !== req.usuario.cedula } });
    await seguro('la notificación de la incapacidad', async () => {
      const admins = await db('usuarios').where({ rol: 'ADMIN', activo: true }).whereNot({ id: req.usuario.id }).pluck('id');
      const enlace = `/incapacidades/ver?id=${id}`;
      const cuando = `del ${fechaTexto(fi)} al ${fechaTexto(ff)} (${diasEntre(fi, ff)} día(s))`;
      // Por correo (buzón externo) solo un aviso genérico: el detalle queda en la plataforma
      await notificaciones.notificar(admins, { titulo: `Nueva incapacidad por revisar: ${colaborador.nombre}`, mensaje: `Incapacidad ${cuando}.`, enlace, correoGenerico: CORREO_GENERICO });
      // Al director solo las fechas: sabe que la persona no vendrá, nada más
      const directores = await db('usuarios as u').join('director_sedes as d', 'd.usuario_id', 'u.id')
        .where({ 'u.rol': 'DIRECTOR', 'u.activo': true, 'd.sede_id': colaborador.sede_id }).whereNot('u.cedula', colaborador.cedula).pluck('u.id');
      await notificaciones.notificar(directores, { titulo: `${colaborador.nombre} estará incapacitado(a)`, mensaje: `Ausencia por incapacidad ${cuando}.`, enlace: '/incapacidades/equipo', correoGenerico: CORREO_GENERICO });
      const propio = await db('usuarios').where({ cedula: colaborador.cedula }).first('id');
      if (propio && propio.id !== req.usuario.id) {
        await notificaciones.notificar([propio.id], { titulo: 'El área contable registró una incapacidad a su nombre', mensaje: `Incapacidad ${cuando}.`, enlace, correoGenerico: CORREO_GENERICO });
      }
    });
    return detalle(req, id);
  }

  // ---------- consultar ----------
  async function cargarConAlcance(req, id) {
    const f = await base().where('i.id', id).first();
    // Detalle: solo el dueño y el admincontable (el director usa la lista con fechas)
    if (!f || !(f.cedula === req.usuario.cedula || req.usuario.rol === 'ADMIN')) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'incapacidad', entidadId: id });
      throw noEncontrado('No encontramos esa incapacidad.');
    }
    return f;
  }

  async function detalle(req, id) {
    const f = await cargarConAlcance(req, id);
    const propia = f.cedula === req.usuario.cedula;
    await auditar(req, { accion: 'VER_INCAPACIDAD', entidad: 'incapacidad', entidadId: id, detalle: { conDiagnostico: !!f.diagnostico_cifrado, propia } });
    const r = { ...presentarCompleta(f), diagnostico: descifrarDiagnostico(f), propia };
    // Para el área contable: otras ausencias en esas fechas (la incapacidad interrumpe vacaciones)
    if (req.usuario.rol === 'ADMIN') {
      r.crucesSolicitudes = await db('solicitudes').where({ colaborador_id: f.colaborador_id })
        .whereNotIn('estado', ['BORRADOR', 'RECHAZADA', 'CANCELADA', 'ANULADA'])
        .where('fecha_inicio', '<=', f.fecha_fin).where('fecha_fin', '>=', f.fecha_inicio)
        .select('id', 'tipo', 'subtipo', 'estado', 'fecha_inicio as fechaInicio', 'fecha_fin as fechaFin');
    }
    r.acciones = {
      validar: req.usuario.rol === 'ADMIN' && f.estado === 'REGISTRADA',
      devolver: req.usuario.rol === 'ADMIN' && f.estado === 'REGISTRADA',
      anular: f.estado !== 'ANULADA' && (req.usuario.rol === 'ADMIN' || (propia && f.estado === 'REGISTRADA')),
    };
    return r;
  }

  async function mias(req) {
    const c = await colaboradorPropio(req);
    if (!c) return { incapacidades: [], sinExpediente: true };
    return { incapacidades: (await base().where('i.colaborador_id', c.id).orderBy('i.fecha_inicio', 'desc')).map(presentarCompleta) };
  }

  // Lista del equipo: director (solo fechas, sus sedes, sin anuladas ni devueltas) o admin (todo, sin diagnóstico)
  async function equipo(req, { estado, desde, hasta }) {
    const q = base().orderBy('i.fecha_inicio', 'desc').limit(500);
    if (desde) q.where('i.fecha_fin', '>=', desde);
    if (hasta) q.where('i.fecha_inicio', '<=', hasta);
    if (req.usuario.rol === 'DIRECTOR') {
      q.whereIn('c.sede_id', await sedesDirector(req.usuario.id)).whereIn('i.estado', VIGENTES);
      const filas = await q;
      await auditar(req, { accion: 'VER_INCAPACIDADES', entidad: 'incapacidad', detalle: { alcance: 'sedes', n: filas.length } });
      return { soloFechas: true, incapacidades: filas.map(presentarParaDirector) };
    }
    if (estado) q.where('i.estado', estado);
    const filas = await q;
    await auditar(req, { accion: 'VER_INCAPACIDADES', entidad: 'incapacidad', detalle: { alcance: 'todas', estado, n: filas.length } });
    return { soloFechas: false, incapacidades: filas.map(presentarCompleta) };
  }

  // Pestaña del expediente
  async function deColaborador(req, colaboradorId) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    let ok = false;
    let soloFechas = false;
    if (c) {
      if (c.cedula === req.usuario.cedula || req.usuario.rol === 'ADMIN') ok = true;
      else if (req.usuario.rol === 'DIRECTOR') ok = soloFechas = (await sedesDirector(req.usuario.id)).includes(c.sede_id);
    }
    if (!ok) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'colaborador', entidadId: colaboradorId, detalle: { recurso: 'incapacidades' } });
      throw noEncontrado('No encontramos ese colaborador.');
    }
    const q = base().where('i.colaborador_id', c.id).orderBy('i.fecha_inicio', 'desc');
    if (soloFechas) q.whereIn('i.estado', VIGENTES);
    const filas = await q;
    if (c.cedula !== req.usuario.cedula) await auditar(req, { accion: 'VER_INCAPACIDADES', entidad: 'colaborador', entidadId: c.id });
    return { soloFechas, incapacidades: filas.map(soloFechas ? presentarParaDirector : presentarCompleta) };
  }

  // Para el formulario: incapacidades propias (o del colaborador, si es admin) que se pueden prorrogar
  async function opciones(req, colaboradorId) {
    const p = await parametros();
    let c = await colaboradorPropio(req);
    if (colaboradorId && req.usuario.rol === 'ADMIN') c = await db('colaboradores').where({ id: colaboradorId }).first();
    const prorrogables = c ? await db('incapacidades').where({ colaborador_id: c.id }).whereIn('estado', VIGENTES)
      .where('fecha_fin', '>=', sumarDias(hoyBogota(), -p.diasAtras)).orderBy('fecha_fin', 'desc').limit(10)
      .select('id', 'tipo', 'fecha_inicio as fechaInicio', 'fecha_fin as fechaFin') : [];
    return {
      tipos: Object.entries(TIPOS).map(([codigo, t]) => ({ codigo, ...t })),
      eps: c?.eps ?? null, maxDias: p.maxDias, diasAtras: p.diasAtras, maxMb: p.maxMb, hoy: hoyBogota(),
      prorrogables, sinExpediente: !c,
    };
  }

  // ---------- revisar ----------
  async function cambiarEstado(req, id, { hacia, motivo, desde, estadoEsperado }) {
    const f = await cargarConAlcance(req, id);
    if (estadoEsperado && estadoEsperado !== f.estado) throw conflicto(`La incapacidad ya no está como "${ESTADOS[f.estado]}". Recargue la página.`);
    if (!desde.includes(f.estado)) throw conflicto(`No se puede pasar de "${ESTADOS[f.estado]}" a "${ESTADOS[hacia]}".`);
    const n = await db('incapacidades').where({ id, estado: f.estado }).update({
      estado: hacia, motivo_estado: motivo ?? null, revisado_por: req.usuario.id, revisado_en: ahora(), actualizado_en: ahora(),
    });
    if (n !== 1) throw conflicto('La incapacidad cambió mientras tanto. Recargue la página.');
    await auditar(req, { accion: `INCAPACIDAD_${hacia}`, entidad: 'incapacidad', entidadId: id, detalle: { desde: f.estado } });
    await seguro('la notificación del cambio de incapacidad', async () => {
      const u = await db('usuarios').where({ cedula: f.cedula }).first('id');
      if (u && u.id !== req.usuario.id) {
        const titulos = { VALIDADA: 'Su incapacidad fue validada', DEVUELTA: 'Su incapacidad fue devuelta: revise el motivo', ANULADA: 'Su incapacidad fue anulada' };
        // El motivo (texto libre, puede mencionar la salud) no va en la notificación ni en el correo:
        // se lee en la plataforma, con sesión.
        await notificaciones.notificar([u.id], {
          titulo: titulos[hacia], enlace: `/incapacidades/ver?id=${id}`, correoGenerico: CORREO_GENERICO,
          mensaje: `Incapacidad del ${fechaTexto(f.fecha_inicio)} al ${fechaTexto(f.fecha_fin)}.${motivo ? ' Vea el motivo en la plataforma.' : ''}`,
        });
      }
      // Si se anula una que el director ya conocía, se le avisa que esa ausencia ya no aplica (solo fechas)
      if (hacia === 'ANULADA' && VIGENTES.includes(f.estado)) {
        const directores = await db('usuarios as u').join('director_sedes as d', 'd.usuario_id', 'u.id')
          .where({ 'u.rol': 'DIRECTOR', 'u.activo': true, 'd.sede_id': f.sede_id }).whereNot('u.cedula', f.cedula).pluck('u.id');
        await notificaciones.notificar(directores, {
          titulo: `Se retiró una ausencia por incapacidad de ${f.colaborador_nombre}`, mensaje: `Del ${fechaTexto(f.fecha_inicio)} al ${fechaTexto(f.fecha_fin)}.`,
          enlace: '/incapacidades/equipo', correoGenerico: CORREO_GENERICO,
        });
      }
      notificaciones.avisar([u?.id, req.usuario.id], { tipo: 'incapacidad', id });
    });
    return detalle(req, id);
  }

  const validar = (req, id, { estadoEsperado }) => {
    if (req.usuario.rol !== 'ADMIN') throw prohibido();
    return cambiarEstado(req, id, { hacia: 'VALIDADA', desde: ['REGISTRADA'], estadoEsperado });
  };
  const devolver = (req, id, { motivo, estadoEsperado }) => {
    if (req.usuario.rol !== 'ADMIN') throw prohibido();
    return cambiarEstado(req, id, { hacia: 'DEVUELTA', motivo, desde: ['REGISTRADA'], estadoEsperado });
  };
  async function anular(req, id, { motivo }) {
    const f = await cargarConAlcance(req, id);
    if (req.usuario.rol !== 'ADMIN' && f.estado !== 'REGISTRADA') throw prohibido('Solo puede anular una incapacidad mientras está en revisión. Comuníquese con el área contable.');
    // El área contable anula registros ajenos o ya revisados: debe dejar el motivo
    if (req.usuario.rol === 'ADMIN' && f.cedula !== req.usuario.cedula && String(motivo ?? '').trim().length < 5) {
      throw invalido('Escriba el motivo de la anulación.', { motivo: 'Explique el motivo (mínimo 5 caracteres).' });
    }
    return cambiarEstado(req, id, { hacia: 'ANULADA', motivo, desde: req.usuario.rol === 'ADMIN' ? ['REGISTRADA', 'VALIDADA', 'DEVUELTA'] : ['REGISTRADA'] });
  }

  // Conteo para la tarjeta de Inicio del área contable (no expone datos: no se audita)
  const pendientes = async () => Number((await db('incapacidades').where({ estado: 'REGISTRADA' }).count({ n: '*' }))[0].n);

  return { parametros, cruces, registrar, detalle, mias, equipo, deColaborador, opciones, validar, devolver, anular, pendientes };
}
