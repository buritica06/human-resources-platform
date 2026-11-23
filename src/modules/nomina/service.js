// Nómina y volantes. Fuente de verdad: la hoja NOMINA cargada. La app valida y muestra;
// no recalcula. Flujo: cargar (valida; si todo está bien queda BORRADOR) → vista previa →
// PUBLICAR (los colaboradores ven sus volantes). Un periodo publicado se puede ANULAR.
import { conflicto, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { leerLibro } from '../../core/excel.js';
import { sha256 } from '../../core/security/cripto.js';
import { leerHojaNomina, listarHojas } from './lector.js';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function crearServicioNomina(ctx) {
  const { db, auditar } = ctx;

  // ---------- carga ----------
  async function hojas(buffer) {
    const libro = await leerLibro(buffer);
    const lista = listarHojas(libro);
    if (!lista.length) throw invalido('El libro no tiene hojas "NOMINA …".');
    const vigentes = await db('periodos_nomina').whereNot({ estado: 'ANULADO' }).select('fecha_inicio', 'fecha_fin', 'estado', 'id');
    return {
      huella: sha256(buffer),
      hojas: lista
        .map((h) => {
          const p = vigentes.find((x) => x.fecha_inicio === h.inicio && x.fecha_fin === h.fin);
          return { ...h, estadoEnPlataforma: p?.estado ?? null, periodoId: p?.id ?? null };
        })
        .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio))),
    };
  }

  // Valida la hoja contra la plataforma. No escribe nada.
  async function validar(libro, nombreHoja) {
    const r = leerHojaNomina(libro, nombreHoja);
    const errores = [...r.errores];
    const advertencias = [...r.advertencias];
    const faltantes = [];
    let reemplaza = null;
    if (r.periodo) {
      const cruzados = await db('periodos_nomina')
        .whereNot({ estado: 'ANULADO' })
        .where('fecha_inicio', '<=', r.periodo.fin)
        .where('fecha_fin', '>=', r.periodo.inicio);
      for (const p of cruzados) {
        if (p.fecha_inicio === r.periodo.inicio && p.fecha_fin === r.periodo.fin && p.estado === 'BORRADOR') reemplaza = p;
        else if (p.fecha_inicio === r.periodo.inicio && p.fecha_fin === r.periodo.fin) {
          errores.push({
            fila: null,
            mensaje: `Este periodo ya está publicado ("${p.nombre_hoja}"). Para volver a cargarlo, primero anúlelo.`,
          });
        } else {
          errores.push({ fila: null, mensaje: `El periodo se cruza con "${p.nombre_hoja}" (${p.fecha_inicio} a ${p.fecha_fin}).` });
        }
      }
    }
    // Cada cédula debe existir como colaborador
    const cedulas = r.registros.map((x) => x.cedula);
    const colabs = new Map(
      (
        await db('colaboradores as c')
          .leftJoin('sedes as s', 's.id', 'c.sede_id')
          .leftJoin('empleadores as e', 'e.id', 'c.empleador_id')
          .whereIn('c.cedula', cedulas.length ? cedulas : ['-'])
          .select(
            'c.id',
            'c.cedula',
            'c.cargo',
            'c.rango',
            'c.estado',
            'c.fecha_ingreso',
            's.nombre as sede_nombre',
            'e.razon_social as empleador_nombre',
            'e.documento as empleador_documento',
          )
      ).map((c) => [c.cedula, c]),
    );
    for (const x of r.registros) {
      if (!colabs.has(x.cedula)) faltantes.push({ fila: x.fila, cedula: x.cedula, nombre: x.nombre });
    }
    // Colaboradores activos que no aparecen (solo aviso)
    if (r.periodo) {
      const activos = await db('colaboradores')
        .where({ estado: 'ACTIVO' })
        .where((w) => w.whereNull('fecha_ingreso').orWhere('fecha_ingreso', '<=', r.periodo.fin))
        .select('cedula', 'nombre');
      const ausentes = activos.filter((a) => !cedulas.includes(a.cedula));
      if (ausentes.length) {
        advertencias.push({
          fila: null,
          mensaje: `${ausentes.length} colaborador(es) activo(s) no aparecen en esta nómina: ${ausentes
            .slice(0, 10)
            .map((a) => a.nombre)
            .join(', ')}${ausentes.length > 10 ? '…' : ''}.`,
        });
      }
      const nombreEsperado = `NOMINA ${MESES[Number(r.periodo.inicio.slice(5, 7)) - 1]} ${Number(r.periodo.inicio.slice(8))}-${Number(r.periodo.fin.slice(8))}`;
      if (nombreEsperado !== nombreHoja.trim().toUpperCase()) {
        advertencias.push({
          fila: 1,
          mensaje: `El nombre de la hoja ("${nombreHoja}") no coincide con sus fechas (S1/T1: ${r.periodo.inicio} a ${r.periodo.fin}). Se usan las fechas.`,
        });
      }
    }
    return { lectura: r, errores, advertencias, faltantes, colabs, reemplaza };
  }

  // Crea expedientes básicos (RETIRADO) para cédulas de la nómina que no tienen expediente.
  async function crearFaltantes(trx, req, faltantes, lectura, periodoId) {
    const t = ahora();
    const empleadores = await trx('empleadores').select('id', 'documento');
    const sedes = await trx('sedes').select('id', 'nombre', 'empleador_id');
    const creados = new Map();
    for (const f of faltantes) {
      const reg = lectura.registros.find((x) => x.cedula === f.cedula);
      const emp = empleadores.find((e) => e.documento && e.documento === reg.empleadorDocumento);
      const sede = reg.sede && sedes.find((s) => s.nombre.toUpperCase() === reg.sede.toUpperCase() && (!emp || s.empleador_id === emp.id));
      const [fila] = await trx('colaboradores')
        .insert({
          cedula: f.cedula,
          nombre: String(f.nombre).toUpperCase().slice(0, 150),
          estado: 'RETIRADO',
          empleador_id: emp?.id ?? sede?.empleador_id ?? null,
          sede_id: sede?.id ?? null,
          salario_base: reg.salarioBase ?? null,
          eps: reg.eps?.slice(0, 60) ?? null,
          afp: reg.afp?.slice(0, 60) ?? null,
          creado_por_periodo_id: periodoId,
          creado_en: t,
          actualizado_en: t,
        })
        .returning('id');
      const id = typeof fila === 'object' ? fila.id : fila;
      await trx('expediente_cambios').insert({
        colaborador_id: id,
        campo: '_alta',
        valor_anterior: null,
        valor_nuevo: `Expediente básico creado al cargar la nómina "${lectura.hoja}" (no estaba en la hoja EMPLEADOS); queda como RETIRADO`,
        origen: 'IMPORTACION',
        actor_id: req.usuario.id,
        creado_en: t,
      });
      creados.set(f.cedula, { id, cargo: null, rango: null, sede_nombre: sede?.nombre ?? null });
    }
    return creados;
  }

  // crearCedulas: cédulas que el admin confirmó UNA POR UNA como colaboradores retirados para
  // crearles un expediente básico. Cualquier otra cédula sin expediente bloquea (supuesto S6).
  async function cargar(req, buffer, { hoja, huella, nombreArchivo, crearCedulas = [] }) {
    if (!huella || huella !== sha256(buffer)) throw invalido('El archivo cambió desde que se eligió la hoja. Vuelva a subirlo.');
    const libro = await leerLibro(buffer);
    const v = await validar(libro, hoja);
    const bloquean = [...v.errores];
    const confirmadas = new Set(crearCedulas);
    const aCrear = v.faltantes.filter((f) => confirmadas.has(f.cedula));
    for (const f of v.faltantes.filter((x) => !confirmadas.has(x.cedula))) {
      bloquean.push({
        fila: f.fila,
        cedula: f.cedula,
        mensaje: `${f.nombre} (C.C. ***${f.cedula.slice(-4)}) no tiene expediente en la plataforma.`,
      });
    }
    const resumen = {
      hoja,
      periodo: v.lectura.periodo,
      colaboradores: v.lectura.registros.length,
      totales: v.lectura.totales,
      advertencias: v.advertencias,
      faltantes: v.faltantes,
      conDetalleHoras: v.lectura.conDetalleHoras,
    };
    if (bloquean.length) {
      await auditar(req, { accion: 'CARGA_NOMINA_RECHAZADA', entidad: 'periodo_nomina', detalle: { hoja, errores: bloquean.length } });
      return { ok: false, errores: bloquean, ...resumen };
    }

    const t = ahora();
    const r = v.lectura;
    let periodoId;
    const reemplazados = [];
    try {
      periodoId = await db.transaction(async (trx) => {
        // Se revalida DENTRO de la transacción: entre la validación y este punto otro admin pudo
        // publicar o cargar el mismo periodo.
        const vigentes = await trx('periodos_nomina')
          .whereNot({ estado: 'ANULADO' })
          .where('fecha_inicio', '<=', r.periodo.fin)
          .where('fecha_fin', '>=', r.periodo.inicio);
        for (const p of vigentes) {
          const mismo = p.fecha_inicio === r.periodo.inicio && p.fecha_fin === r.periodo.fin;
          if (!mismo || p.estado !== 'BORRADOR')
            throw conflicto(
              `El periodo cambió mientras se cargaba ("${p.nombre_hoja}" está ${p.estado.toLowerCase()}). Revise y vuelva a intentarlo.`,
            );
          // Solo se reemplaza si SIGUE siendo borrador (nunca se borra un periodo publicado)
          const borrados = await trx('periodos_nomina').where({ id: p.id, estado: 'BORRADOR' }).del();
          if (borrados !== 1) throw conflicto('El borrador anterior cambió mientras se cargaba. Vuelva a intentarlo.');
          reemplazados.push(p.id);
        }
        const [fila] = await trx('periodos_nomina')
          .insert({
            nombre_hoja: hoja.trim().slice(0, 60),
            fecha_inicio: r.periodo.inicio,
            fecha_fin: r.periodo.fin,
            estado: 'BORRADOR',
            colaboradores: r.registros.length,
            total_devengado: r.totales.devengado,
            total_deducido: r.totales.deducido,
            total_neto: r.totales.neto,
            total_adicional: r.totales.adicional,
            archivo_nombre: String(nombreArchivo ?? '').slice(0, 200),
            archivo_sha256: huella,
            advertencias: JSON.stringify(v.advertencias.slice(0, 200)),
            cargado_por: req.usuario.id,
            cargado_en: t,
          })
          .returning('id');
        const pid = typeof fila === 'object' ? fila.id : fila;
        // Los expedientes básicos que había creado el borrador reemplazado pasan a este
        if (reemplazados.length)
          await trx('colaboradores').whereIn('creado_por_periodo_id', reemplazados).update({ creado_por_periodo_id: pid });
        const nuevos = aCrear.length ? await crearFaltantes(trx, req, aCrear, r, pid) : new Map();
        for (const x of r.registros) {
          const c = v.colabs.get(x.cedula) ?? nuevos.get(x.cedula);
          // Empleador y sede: los de la hoja; si la fila no los trae (p. ej. solo está en extras),
          // los del expediente. Nunca se infieren de otro bloque.
          const [fv] = await trx('volantes')
            .insert({
              periodo_id: pid,
              colaborador_id: c.id,
              cedula: x.cedula,
              nombre: String(x.nombre).slice(0, 150),
              empleador: (x.empleador ?? c.empleador_nombre)?.slice(0, 150) ?? null,
              empleador_documento: (x.empleadorDocumento ?? c.empleador_documento)?.slice(0, 20) ?? null,
              sede: (x.sede ?? c.sede_nombre)?.slice(0, 120) ?? null,
              cargo: c.cargo ?? null,
              rango: c.rango ?? null,
              dias: x.dias ?? null,
              salario_base: x.salarioBase ?? null,
              total_devengado: x.devengado ?? 0,
              total_deducido: x.deducido ?? 0,
              neto: x.neto ?? 0,
              total_adicional: x.netoAdicional ?? 0,
              eps: x.eps?.slice(0, 60) ?? null,
              afp: x.afp?.slice(0, 60) ?? null,
              observacion: x.observacion ?? null,
              fila_origen: x.fila,
            })
            .returning('id');
          const vid = typeof fv === 'object' ? fv.id : fv;
          const lineas = [...(x.lineas ?? []), ...x.adicionales];
          if (lineas.length) {
            await trx('volante_lineas').insert(
              lineas.map((l) => ({
                volante_id: vid,
                concepto: l.concepto,
                tipo: l.tipo,
                etiqueta: l.etiqueta.slice(0, 80),
                cantidad: l.cantidad,
                unidad: l.unidad,
                valor: l.valor,
                detalle: l.detalle ? JSON.stringify(l.detalle) : null,
                orden: l.orden,
              })),
            );
          }
        }
        return pid;
      });
    } catch (e) {
      // Dos cargas simultáneas del mismo periodo: el índice único lo impide → 409, no 500
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === '23505')
        throw conflicto('Otra carga de este mismo periodo terminó primero. Recargue la página.');
      throw e;
    }
    await auditar(req, {
      accion: 'CARGA_NOMINA',
      entidad: 'periodo_nomina',
      entidadId: periodoId,
      detalle: { hoja, colaboradores: r.registros.length, expedientesCreados: aCrear.length, reemplazoBorrador: !!v.reemplaza },
    });
    return { ok: true, periodoId, errores: [], ...resumen };
  }

  // ---------- periodos ----------
  const presentarPeriodo = (p) => ({
    id: p.id,
    hoja: p.nombre_hoja,
    inicio: p.fecha_inicio,
    fin: p.fecha_fin,
    estado: p.estado,
    colaboradores: p.colaboradores,
    totalDevengado: num(p.total_devengado),
    totalDeducido: num(p.total_deducido),
    totalNeto: num(p.total_neto),
    totalAdicional: num(p.total_adicional),
    archivo: p.archivo_nombre,
    cargadoEn: p.cargado_en,
    publicadoEn: p.publicado_en,
    anuladoEn: p.anulado_en,
    motivoAnulacion: p.motivo_anulacion,
    advertencias: p.advertencias ? JSON.parse(p.advertencias) : [],
  });

  async function periodos({ anio }) {
    const q = db('periodos_nomina').orderBy('fecha_inicio', 'desc').orderBy('id', 'desc');
    if (anio) q.where('fecha_inicio', 'like', `${anio}-%`);
    return { periodos: (await q).map(presentarPeriodo) };
  }

  async function periodo(req, id) {
    const p = await db('periodos_nomina').where({ id }).first();
    if (!p) throw noEncontrado('El periodo no existe.');
    const volantes = await db('volantes')
      .where({ periodo_id: id })
      .orderBy(['empleador', 'sede', 'nombre'])
      .select(
        'id',
        'cedula',
        'nombre',
        'empleador',
        'sede',
        'dias',
        'total_devengado',
        'total_deducido',
        'neto',
        'total_adicional',
        'observacion',
      );
    await auditar(req, { accion: 'VER', entidad: 'periodo_nomina', entidadId: id });
    return {
      periodo: presentarPeriodo(p),
      volantes: volantes.map((x) => ({
        id: x.id,
        cedula: x.cedula,
        nombre: x.nombre,
        empleador: x.empleador,
        sede: x.sede,
        dias: num(x.dias),
        devengado: num(x.total_devengado),
        deducido: num(x.total_deducido),
        neto: num(x.neto),
        adicional: num(x.total_adicional),
        observacion: x.observacion,
      })),
    };
  }

  async function publicar(req, id) {
    const n = await db('periodos_nomina')
      .where({ id, estado: 'BORRADOR' })
      .update({ estado: 'PUBLICADO', publicado_por: req.usuario.id, publicado_en: ahora() });
    if (!n) {
      const p = await db('periodos_nomina').where({ id }).first();
      if (!p) throw noEncontrado('El periodo no existe.');
      throw conflicto(`Solo se puede publicar un borrador; este periodo está ${p.estado.toLowerCase()}.`);
    }
    await auditar(req, { accion: 'PUBLICAR', entidad: 'periodo_nomina', entidadId: id });
    return presentarPeriodo(await db('periodos_nomina').where({ id }).first());
  }

  async function anular(req, id, motivo) {
    const n = await db('periodos_nomina')
      .where({ id, estado: 'PUBLICADO' })
      .update({ estado: 'ANULADO', anulado_por: req.usuario.id, anulado_en: ahora(), motivo_anulacion: motivo });
    if (!n) {
      const p = await db('periodos_nomina').where({ id }).first();
      if (!p) throw noEncontrado('El periodo no existe.');
      throw conflicto('Solo se puede anular un periodo publicado. Un borrador se elimina.');
    }
    await auditar(req, { accion: 'ANULAR', entidad: 'periodo_nomina', entidadId: id, detalle: { motivo } });
    return presentarPeriodo(await db('periodos_nomina').where({ id }).first());
  }

  async function eliminarBorrador(req, id) {
    let expedientesBorrados = 0;
    await db.transaction(async (trx) => {
      const n = await trx('periodos_nomina').where({ id, estado: 'BORRADOR' }).del();
      if (!n) {
        const p = await trx('periodos_nomina').where({ id }).first();
        if (!p) throw noEncontrado('El periodo no existe.');
        throw conflicto('Solo se pueden eliminar borradores. Un periodo publicado se anula.');
      }
      // Los expedientes básicos que creó esta carga se eliminan si ya no tienen volantes
      // ni otros cambios (no deja "basura" por una cédula mal digitada).
      const creados = await trx('colaboradores').where({ creado_por_periodo_id: id }).select('id');
      // Tablas de otros módulos que pueden apuntar al expediente (si existen): si hay algo, se conserva
      const relacionadas = ['volantes', 'solicitudes', 'documentos', 'incapacidades', 'saldos_vacaciones', 'certificados', 'suspensiones'];
      const existentes = [];
      for (const tabla of relacionadas) if (await trx.schema.hasTable(tabla)) existentes.push(tabla);
      for (const { id: cid } of creados) {
        let referenciado = false;
        for (const tabla of existentes)
          if (!referenciado && (await trx(tabla).where({ colaborador_id: cid }).first('colaborador_id'))) referenciado = true;
        const otrosCambios = await trx('expediente_cambios').where({ colaborador_id: cid }).whereNot({ campo: '_alta' }).first('id');
        if (!referenciado && !otrosCambios) {
          await trx('colaboradores').where({ id: cid }).del();
          expedientesBorrados++;
        } else {
          await trx('colaboradores').where({ id: cid }).update({ creado_por_periodo_id: null });
        }
      }
    });
    await auditar(req, { accion: 'ELIMINAR', entidad: 'periodo_nomina', entidadId: id, detalle: { expedientesBorrados } });
  }

  // ---------- volantes ----------
  const colaboradorDe = (req) => db('colaboradores').where({ cedula: req.usuario.cedula }).first('id');

  function presentarVolante(v, p, lineas) {
    const L = lineas.map((l) => ({
      concepto: l.concepto,
      tipo: l.tipo,
      etiqueta: l.etiqueta,
      cantidad: num(l.cantidad),
      unidad: l.unidad,
      valor: num(l.valor),
      detalle: l.detalle ? JSON.parse(l.detalle) : null,
    }));
    return {
      id: v.id,
      periodo: { id: p.id, hoja: p.nombre_hoja, inicio: p.fecha_inicio, fin: p.fecha_fin, estado: p.estado },
      colaborador: { cedula: v.cedula, nombre: v.nombre, cargo: v.cargo, rango: v.rango, sede: v.sede, eps: v.eps, afp: v.afp },
      empleador: { nombre: v.empleador, documento: v.empleador_documento },
      dias: num(v.dias),
      salarioBase: num(v.salario_base),
      devengados: L.filter((l) => l.tipo === 'DEV'),
      deducciones: L.filter((l) => l.tipo === 'DED'),
      adicionales: L.filter((l) => l.tipo === 'ADICIONAL'),
      totalDevengado: num(v.total_devengado),
      totalDeducido: num(v.total_deducido),
      neto: num(v.neto),
      totalAdicional: num(v.total_adicional),
      observacion: v.observacion,
    };
  }

  // Carga un volante respetando el alcance: el colaborador solo ve los suyos PUBLICADOS;
  // el admincontable ve todos. Fuera de alcance → 404.
  async function volanteConAlcance(req, id) {
    const v = await db('volantes').where({ id }).first();
    const p = v && (await db('periodos_nomina').where({ id: v.periodo_id }).first());
    let permitido = false;
    if (v && req.usuario.rol === 'ADMIN') permitido = true;
    else if (v && p.estado === 'PUBLICADO') {
      const c = await colaboradorDe(req);
      permitido = !!c && c.id === v.colaborador_id;
    }
    if (!permitido) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'volante', entidadId: id });
      throw noEncontrado('No encontramos ese volante.');
    }
    const lineas = await db('volante_lineas').where({ volante_id: id }).orderBy(['orden', 'id']);
    return presentarVolante(v, p, lineas);
  }

  async function verVolante(req, id) {
    const v = await volanteConAlcance(req, id);
    await auditar(req, { accion: 'VER', entidad: 'volante', entidadId: id });
    return v;
  }

  async function listaVolantes(colaboradorId, { anio, soloPublicados }) {
    const q = db('volantes as v')
      .join('periodos_nomina as p', 'p.id', 'v.periodo_id')
      .where('v.colaborador_id', colaboradorId)
      .orderBy('p.fecha_inicio', 'desc')
      .select('v.id', 'v.neto', 'v.total_adicional', 'p.nombre_hoja', 'p.fecha_inicio', 'p.fecha_fin', 'p.estado');
    if (soloPublicados) q.where('p.estado', 'PUBLICADO');
    else q.whereNot('p.estado', 'ANULADO');
    const todos = await q;
    const anios = [...new Set(todos.map((x) => x.fecha_inicio.slice(0, 4)))].sort().reverse();
    const elegido = anio ? String(anio) : anios[0];
    return {
      anios,
      anio: elegido ?? null,
      volantes: todos
        .filter((x) => x.fecha_inicio.startsWith(elegido ?? ''))
        .map((x) => ({
          id: x.id,
          hoja: x.nombre_hoja,
          inicio: x.fecha_inicio,
          fin: x.fecha_fin,
          estado: x.estado,
          neto: num(x.neto),
          adicional: num(x.total_adicional),
        })),
    };
  }

  async function misVolantes(req, { anio }) {
    const c = await colaboradorDe(req);
    if (!c) return { anios: [], anio: null, volantes: [], sinExpediente: true };
    return listaVolantes(c.id, { anio, soloPublicados: true });
  }

  async function ultimoVolante(req) {
    const c = await colaboradorDe(req);
    if (!c) return { volante: null };
    const r = await listaVolantes(c.id, { soloPublicados: true });
    return { volante: r.volantes[0] ?? null };
  }

  async function volantesDeColaborador(req, colaboradorId, { anio }) {
    if (!(await db('colaboradores').where({ id: colaboradorId }).first('id'))) throw noEncontrado('No encontramos ese colaborador.');
    await auditar(req, { accion: 'VER_VOLANTES', entidad: 'colaborador', entidadId: colaboradorId });
    return listaVolantes(colaboradorId, { anio, soloPublicados: false });
  }

  async function datosPdf(req, id) {
    const v = await volanteConAlcance(req, id);
    await auditar(req, { accion: 'DESCARGAR', entidad: 'volante', entidadId: id });
    return v;
  }

  return {
    hojas,
    cargar,
    periodos,
    periodo,
    publicar,
    anular,
    eliminarBorrador,
    verVolante,
    misVolantes,
    ultimoVolante,
    volantesDeColaborador,
    datosPdf,
  };
}
