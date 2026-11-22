// Motor de solicitudes con flujo de aprobación configurable.
//
// Estados: BORRADOR → (pasos del flujo, p. ej. PENDIENTE_DIRECTOR → PENDIENTE_CONTABLE) →
//          APROBADA | RECHAZADA | CANCELADA
// - Los pasos vienen de la tabla `flujos` (versión activa del tipo). Cada solicitud queda atada a
//   la versión con la que se envió.
// - Puede actuar en un paso: quien tenga el rol del paso (el director, solo en sus sedes) o el
//   admincontable (superusuario). Nadie aprueba ni rechaza su propia solicitud.
// - Rechazar exige motivo. Cada transición es una actualización condicionada (sin carreras),
//   queda en solicitud_eventos y en la auditoría, y notifica (campana, tiempo real y correo).
import { ErrorApp, conflicto, invalido, noEncontrado, prohibido } from '../../core/errors.js';
import { ahora } from '../../core/db.js';

export const FINALES = ['APROBADA', 'RECHAZADA', 'CANCELADA'];
export const ETIQUETAS_ESTADO = { BORRADOR: 'Borrador', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' };
const ROLES_PASO = ['DIRECTOR', 'ADMIN'];

export function crearMotor(ctx) {
  const { db, auditar, notificaciones } = ctx;

  // ---------- flujos ----------
  async function flujoActivo(tipo, trx = db) {
    const f = await trx('flujos').where({ tipo, activo: true }).orderBy('version', 'desc').first();
    if (!f) throw new ErrorApp(500, 'SIN_FLUJO', `No hay un flujo de aprobación configurado para ${tipo}.`);
    return { ...f, pasos: JSON.parse(f.pasos) };
  }
  const flujoPorId = async (id, trx = db) => {
    const f = await trx('flujos').where({ id }).first();
    return f && { ...f, pasos: JSON.parse(f.pasos) };
  };

  // Nueva versión del flujo (las solicitudes en curso siguen con la suya)
  async function configurarFlujo(req, tipo, pasos) {
    if (!ctx.tiposSolicitud.has(tipo)) throw noEncontrado('Ese tipo de solicitud no existe.');
    if (!Array.isArray(pasos) || pasos.length < 1 || pasos.length > 4) throw invalido('El flujo debe tener entre 1 y 4 pasos.');
    const usados = {};
    const normalizados = pasos.map((p, i) => {
      if (!ROLES_PASO.includes(p.rol)) throw invalido(`Paso ${i + 1}: el rol debe ser DIRECTOR o ADMIN.`);
      usados[p.rol] = (usados[p.rol] ?? 0) + 1;
      const base = p.rol === 'ADMIN' ? 'PENDIENTE_CONTABLE' : 'PENDIENTE_DIRECTOR';
      const etiqueta = String(p.etiqueta ?? '').trim().slice(0, 40) || (p.rol === 'ADMIN' ? 'Pendiente contable' : 'Pendiente director');
      return { rol: p.rol, estado: usados[p.rol] > 1 ? `${base}_${usados[p.rol]}` : base, etiqueta };
    });
    const version = await db.transaction(async (trx) => {
      const ultima = await trx('flujos').where({ tipo }).max({ v: 'version' }).first();
      const v = Number(ultima?.v ?? 0) + 1;
      await trx('flujos').where({ tipo }).update({ activo: false });
      await trx('flujos').insert({ tipo, version: v, pasos: JSON.stringify(normalizados), activo: true, creado_por: req.usuario.id, creado_en: ahora() });
      return v;
    });
    await auditar(req, { accion: 'CONFIGURAR_FLUJO', entidad: 'flujo', entidadId: tipo, detalle: { version, pasos: normalizados } });
    return { tipo, version, pasos: normalizados };
  }

  // ---------- alcance ----------
  const colaboradorDe = (req) => db('colaboradores').where({ cedula: req.usuario.cedula }).first();
  const sedesDirector = async (usuarioId) => (await db('director_sedes').where({ usuario_id: usuarioId }).select('sede_id')).map((r) => r.sede_id);

  async function cargar(id, trx = db) {
    const s = await trx('solicitudes as s').join('colaboradores as c', 'c.id', 's.colaborador_id')
      .where('s.id', id).select('s.*', 'c.cedula', 'c.nombre as colaborador_nombre', 'c.sede_id', 'c.cargo').first();
    if (!s) return null;
    s.flujo = s.flujo_id ? await flujoPorId(s.flujo_id, trx) : null;
    s.datos = s.datos ? JSON.parse(s.datos) : {};
    return s;
  }

  // ¿Puede este usuario VER la solicitud? (propia, admin, o director de la sede)
  async function puedeVer(req, s) {
    if (req.usuario.rol === 'ADMIN') return true;
    if (s.cedula === req.usuario.cedula) return true;
    if (req.usuario.rol === 'DIRECTOR') return (await sedesDirector(req.usuario.id)).includes(s.sede_id);
    return false;
  }

  // ¿Puede ACTUAR en el paso actual?
  async function puedeActuar(req, s) {
    if (!s.flujo || s.paso_actual === null || s.paso_actual === undefined) return false;
    if (s.cedula === req.usuario.cedula) return false; // nunca sobre la propia
    const paso = s.flujo.pasos[s.paso_actual];
    if (req.usuario.rol === 'ADMIN') return true;
    if (req.usuario.rol === 'DIRECTOR' && paso.rol === 'DIRECTOR') return (await sedesDirector(req.usuario.id)).includes(s.sede_id);
    return false;
  }

  async function cargarConAlcance(req, id) {
    const s = await cargar(id);
    if (!s || !(await puedeVer(req, s))) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'solicitud', entidadId: id });
      throw noEncontrado('No encontramos esa solicitud.');
    }
    return s;
  }

  // ---------- destinatarios ----------
  async function aprobadoresDe(s, paso) {
    const admins = (await db('usuarios').where({ rol: 'ADMIN', activo: true }).select('id', 'cedula'));
    if (paso.rol === 'ADMIN') return admins.filter((u) => u.cedula !== s.cedula).map((u) => u.id);
    const directores = await db('usuarios as u').join('director_sedes as d', 'd.usuario_id', 'u.id')
      .where({ 'u.rol': 'DIRECTOR', 'u.activo': true, 'd.sede_id': s.sede_id ?? -1 }).select('u.id', 'u.cedula');
    const validos = directores.filter((u) => u.cedula !== s.cedula).map((u) => u.id);
    // Sin director para la sede (o es el propio solicitante): el admincontable puede actuar
    return validos.length ? validos : admins.filter((u) => u.cedula !== s.cedula).map((u) => u.id);
  }
  const usuarioDe = async (cedula) => (await db('usuarios').where({ cedula }).first('id'))?.id;

  function etiquetaEstado(s, estado = s.estado) {
    if (ETIQUETAS_ESTADO[estado]) return ETIQUETAS_ESTADO[estado];
    return s.flujo?.pasos.find((p) => p.estado === estado)?.etiqueta ?? estado;
  }

  async function notificarCambio(s, { titulo, mensaje, alSolicitante = true, aprobadores = null }) {
    const tipo = ctx.tiposSolicitud.get(s.tipo);
    const enlace = `/solicitudes/ver?id=${s.id}`;
    const solicitante = await usuarioDe(s.cedula);
    if (alSolicitante && solicitante) await notificaciones.notificar([solicitante], { titulo, mensaje, enlace });
    if (aprobadores?.length) {
      await notificaciones.notificar(aprobadores, {
        titulo: `Por aprobar: ${tipo?.etiqueta ?? s.tipo} de ${s.colaborador_nombre}`,
        mensaje: `${tipo?.resumen?.(s) ?? ''}`.trim() || undefined,
        enlace,
      });
    }
    // Refresco en vivo de listas para todos los involucrados
    const todos = [solicitante, ...(await db('usuarios').where({ rol: 'ADMIN', activo: true }).pluck('id')), ...(aprobadores ?? [])];
    notificaciones.avisar(todos, { tipo: 'solicitud', id: s.id });
  }

  // ---------- transiciones ----------
  // Actualización condicionada: solo si sigue en el estado y paso esperados (evita carreras)
  async function transicion(trx, s, { desde, hacia, paso, accion, actorId, comentario, extra = {} }) {
    const t = ahora();
    const q = trx('solicitudes').where({ id: s.id, estado: desde });
    if (s.paso_actual === null || s.paso_actual === undefined) q.whereNull('paso_actual');
    else q.where({ paso_actual: s.paso_actual });
    const n = await q.update({ estado: hacia, paso_actual: paso, actualizado_en: t, ...(FINALES.includes(hacia) ? { resuelto_en: t } : {}), ...extra });
    if (n !== 1) throw conflicto('La solicitud cambió mientras tanto. Recargue la página para ver su estado actual.');
    await trx('solicitud_eventos').insert({ solicitud_id: s.id, actor_id: actorId, accion, estado_desde: desde, estado_hasta: hacia, comentario: comentario?.slice(0, 500) ?? null, creado_en: t });
  }

  async function enviar(req, id, { trx: trxExterna } = {}) {
    const ejecutar = async (trx) => {
      const s = await cargar(id, trx);
      if (!s || s.cedula !== req.usuario.cedula) throw noEncontrado('No encontramos esa solicitud.');
      if (s.estado !== 'BORRADOR') throw conflicto('Solo se puede enviar una solicitud en borrador.');
      const tipo = ctx.tiposSolicitud.get(s.tipo);
      await tipo.revalidarAlEnviar?.(ctx, s, trx); // p. ej. que siga sin cruzarse con otras ausencias
      await validarSinCruce(trx, s);
      const flujo = await flujoActivo(s.tipo, trx);
      s.flujo = flujo;
      await transicion(trx, s, { desde: 'BORRADOR', hacia: flujo.pasos[0].estado, paso: 0, accion: 'ENVIAR', actorId: req.usuario.id, extra: { flujo_id: flujo.id, enviado_en: ahora() } });
      s.estado = flujo.pasos[0].estado;
      s.paso_actual = 0;
      return s;
    };
    const s = trxExterna ? await ejecutar(trxExterna) : await db.transaction(ejecutar);
    return s;
  }

  // Tras el commit: auditoría y notificaciones del envío
  async function despuesDeEnviar(req, s) {
    await auditar(req, { accion: 'ENVIAR', entidad: 'solicitud', entidadId: s.id, detalle: { tipo: s.tipo } });
    const s2 = await cargar(s.id);
    await notificarCambio(s2, {
      titulo: `Su solicitud de ${ctx.tiposSolicitud.get(s2.tipo).etiqueta.toLowerCase()} fue enviada`,
      mensaje: `Quedó en estado "${etiquetaEstado(s2)}".`,
      aprobadores: await aprobadoresDe(s2, s2.flujo.pasos[0]),
    });
  }

  async function aprobar(req, id, comentario) {
    const s = await cargarConAlcance(req, id);
    if (!(await puedeActuar(req, s))) {
      if (s.cedula === req.usuario.cedula) throw prohibido('No puede aprobar su propia solicitud.');
      throw prohibido(FINALES.includes(s.estado) || s.estado === 'BORRADOR' ? 'Esta solicitud no está pendiente de aprobación.' : 'Este paso le corresponde a otro rol.');
    }
    const siguiente = s.paso_actual + 1;
    const final = siguiente >= s.flujo.pasos.length;
    const hacia = final ? 'APROBADA' : s.flujo.pasos[siguiente].estado;
    await db.transaction((trx) => transicion(trx, s, { desde: s.estado, hacia, paso: final ? null : siguiente, accion: 'APROBAR', actorId: req.usuario.id, comentario }));
    await auditar(req, { accion: 'APROBAR', entidad: 'solicitud', entidadId: id, detalle: { paso: s.paso_actual, hacia } });
    const s2 = await cargar(id);
    const etiqueta = ctx.tiposSolicitud.get(s.tipo).etiqueta.toLowerCase();
    await notificarCambio(s2, {
      titulo: final ? `Su solicitud de ${etiqueta} fue APROBADA` : `Su solicitud de ${etiqueta} avanzó`,
      mensaje: final ? 'Quedó registrada en su expediente.' : `Ahora está en "${etiquetaEstado(s2)}".`,
      aprobadores: final ? null : await aprobadoresDe(s2, s2.flujo.pasos[siguiente]),
    });
    if (final) await ctx.tiposSolicitud.get(s.tipo).alAprobar?.(ctx, s2);
    return detalle(req, id);
  }

  async function rechazar(req, id, motivo) {
    const s = await cargarConAlcance(req, id);
    if (!(await puedeActuar(req, s))) {
      if (s.cedula === req.usuario.cedula) throw prohibido('No puede rechazar su propia solicitud; si ya no la necesita, cancélela.');
      throw prohibido('Esta solicitud no está pendiente de su aprobación.');
    }
    await db.transaction((trx) => transicion(trx, s, { desde: s.estado, hacia: 'RECHAZADA', paso: null, accion: 'RECHAZAR', actorId: req.usuario.id, comentario: motivo }));
    await auditar(req, { accion: 'RECHAZAR', entidad: 'solicitud', entidadId: id, detalle: { paso: s.paso_actual } });
    await notificarCambio(await cargar(id), {
      titulo: `Su solicitud de ${ctx.tiposSolicitud.get(s.tipo).etiqueta.toLowerCase()} fue RECHAZADA`,
      mensaje: `Motivo: ${motivo}`,
    });
    return detalle(req, id);
  }

  async function cancelar(req, id, motivo) {
    const s = await cargarConAlcance(req, id);
    if (s.cedula !== req.usuario.cedula) throw prohibido('Solo quien hizo la solicitud puede cancelarla.');
    if (FINALES.includes(s.estado)) throw conflicto('Esta solicitud ya terminó; no se puede cancelar.');
    await db.transaction((trx) => transicion(trx, s, { desde: s.estado, hacia: 'CANCELADA', paso: null, accion: 'CANCELAR', actorId: req.usuario.id, comentario: motivo }));
    await auditar(req, { accion: 'CANCELAR', entidad: 'solicitud', entidadId: id });
    if (s.estado !== 'BORRADOR') {
      const s2 = await cargar(id);
      await notificaciones.notificar(await aprobadoresDe(s2, s.flujo.pasos[s.paso_actual]), {
        titulo: `${s.colaborador_nombre} canceló su solicitud de ${ctx.tiposSolicitud.get(s.tipo).etiqueta.toLowerCase()}`,
        enlace: `/solicitudes/ver?id=${id}`,
        correo: false,
      });
      notificaciones.avisar([await usuarioDe(s.cedula)], { tipo: 'solicitud', id });
    }
    return detalle(req, id);
  }

  // ---------- cruce con otras ausencias ----------
  // Rango [desde, hasta) en minutos desde época; sin hora = día completo
  const rango = (x) => {
    const ini = Date.parse(`${x.fecha_inicio}T${x.hora_inicio ?? '00:00'}:00Z`);
    const fin = x.hora_fin ? Date.parse(`${x.fecha_fin}T${x.hora_fin}:00Z`) : Date.parse(`${x.fecha_fin}T00:00:00Z`) + 86_400_000;
    return [ini, fin];
  };
  async function validarSinCruce(trx, s) {
    const [a1, a2] = rango(s);
    const otras = await trx('solicitudes').where({ colaborador_id: s.colaborador_id }).whereNot({ id: s.id ?? -1 })
      .whereNotIn('estado', ['BORRADOR', 'RECHAZADA', 'CANCELADA'])
      .where('fecha_inicio', '<=', s.fecha_fin).where('fecha_fin', '>=', s.fecha_inicio);
    for (const o of otras) {
      const [b1, b2] = rango(o);
      if (a1 < b2 && b1 < a2) {
        const t = ctx.tiposSolicitud.get(o.tipo)?.etiqueta ?? o.tipo;
        throw invalido(`Se cruza con otra solicitud de ${t.toLowerCase()} (${o.fecha_inicio}${o.fecha_inicio !== o.fecha_fin ? ` a ${o.fecha_fin}` : ''}) que está ${o.estado === 'APROBADA' ? 'aprobada' : 'en trámite'}.`, { fecha_inicio: 'Las fechas se cruzan con otra solicitud.' });
      }
    }
  }

  // ---------- consulta ----------
  function presentar(s) {
    const tipo = ctx.tiposSolicitud.get(s.tipo);
    return {
      id: s.id, tipo: s.tipo, tipoEtiqueta: tipo?.etiqueta ?? s.tipo, subtipo: s.subtipo,
      estado: s.estado, estadoEtiqueta: etiquetaEstado(s), final: FINALES.includes(s.estado),
      colaborador: { nombre: s.colaborador_nombre, cedula: s.cedula, cargo: s.cargo },
      fechaInicio: s.fecha_inicio, horaInicio: s.hora_inicio, fechaFin: s.fecha_fin, horaFin: s.hora_fin,
      diasHabiles: s.dias_habiles === null || s.dias_habiles === undefined ? null : Number(s.dias_habiles),
      diasCompensar: s.dias_compensar === null || s.dias_compensar === undefined ? null : Number(s.dias_compensar),
      motivo: s.motivo, documentoId: s.documento_id, datos: s.datos,
      resumen: tipo?.resumen?.(s) ?? null,
      creadoEn: s.creado_en, enviadoEn: s.enviado_en, resueltoEn: s.resuelto_en,
    };
  }

  async function detalle(req, id) {
    const s = await cargarConAlcance(req, id);
    const eventos = await db('solicitud_eventos as e').leftJoin('usuarios as u', 'u.id', 'e.actor_id')
      .where('e.solicitud_id', id).orderBy('e.id').select('e.accion', 'e.estado_desde', 'e.estado_hasta', 'e.comentario', 'e.creado_en', 'u.nombre as actor');
    const pasos = (s.flujo ?? (s.estado === 'BORRADOR' ? await flujoActivo(s.tipo).catch(() => null) : null))?.pasos ?? [];
    const propia = s.cedula === req.usuario.cedula;
    return {
      ...presentar(s),
      pasos: pasos.map((p, i) => ({
        etiqueta: p.etiqueta, rol: p.rol,
        estado: s.estado === 'APROBADA' || (s.paso_actual !== null && i < s.paso_actual) ? 'HECHO' : s.paso_actual === i ? 'ACTUAL' : 'PENDIENTE',
      })),
      eventos: eventos.map((e) => ({ ...e, estadoDesdeEtiqueta: e.estado_desde ? etiquetaEstado(s, e.estado_desde) : null, estadoHastaEtiqueta: etiquetaEstado(s, e.estado_hasta) })),
      acciones: {
        enviar: propia && s.estado === 'BORRADOR',
        cancelar: propia && !FINALES.includes(s.estado),
        aprobar: await puedeActuar(req, s),
        rechazar: await puedeActuar(req, s),
      },
    };
  }

  async function lista(filtro) {
    const filas = await db('solicitudes as s').join('colaboradores as c', 'c.id', 's.colaborador_id')
      .modify(filtro).orderBy('s.id', 'desc').limit(200)
      .select('s.*', 'c.cedula', 'c.nombre as colaborador_nombre', 'c.sede_id', 'c.cargo');
    const flujos = new Map();
    for (const f of filas) {
      if (f.flujo_id && !flujos.has(f.flujo_id)) flujos.set(f.flujo_id, await flujoPorId(f.flujo_id));
      f.flujo = flujos.get(f.flujo_id) ?? null;
      f.datos = f.datos ? JSON.parse(f.datos) : {};
    }
    return filas.map(presentar);
  }

  async function mias(req, { tipo, estado }) {
    const c = await colaboradorDe(req);
    if (!c) return { solicitudes: [], sinExpediente: true };
    return {
      solicitudes: await lista((q) => {
        q.where('s.colaborador_id', c.id);
        if (tipo) q.where('s.tipo', tipo);
        if (estado === 'EN_CURSO') q.whereNotIn('s.estado', FINALES);
        else if (estado) q.where('s.estado', estado);
      }),
    };
  }

  // Bandeja: solicitudes cuyo paso actual puede atender este usuario
  async function bandeja(req, { tipo }) {
    const pendientes = await lista((q) => {
      q.whereNotNull('s.paso_actual').whereNotIn('s.estado', [...FINALES, 'BORRADOR']).whereNot('c.cedula', req.usuario.cedula);
      if (tipo) q.where('s.tipo', tipo);
    });
    if (req.usuario.rol === 'ADMIN') return pendientes;
    const sedes = await sedesDirector(req.usuario.id);
    const filas = await db('solicitudes as s').join('colaboradores as c', 'c.id', 's.colaborador_id').whereIn('s.id', pendientes.map((p) => p.id)).select('s.id', 'c.sede_id', 's.flujo_id', 's.paso_actual');
    const permitidos = new Set();
    for (const f of filas) {
      const flujo = await flujoPorId(f.flujo_id);
      if (flujo?.pasos[f.paso_actual]?.rol === 'DIRECTOR' && sedes.includes(f.sede_id)) permitidos.add(f.id);
    }
    return pendientes.filter((p) => permitidos.has(p.id));
  }

  async function deColaborador(req, colaboradorId, { tipo }) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c) throw noEncontrado('No encontramos ese colaborador.');
    if (req.usuario.rol === 'DIRECTOR' && !(await sedesDirector(req.usuario.id)).includes(c.sede_id)) throw noEncontrado('No encontramos ese colaborador.');
    if (req.usuario.rol === 'COLABORADOR' && c.cedula !== req.usuario.cedula) throw noEncontrado('No encontramos ese colaborador.');
    await auditar(req, { accion: 'VER_SOLICITUDES', entidad: 'colaborador', entidadId: colaboradorId, detalle: { tipo } });
    return lista((q) => {
      q.where('s.colaborador_id', colaboradorId).whereNot('s.estado', 'BORRADOR');
      if (tipo) q.where('s.tipo', tipo);
    });
  }

  return {
    flujoActivo, configurarFlujo, colaboradorDe, cargar, cargarConAlcance, puedeVer, validarSinCruce,
    enviar, despuesDeEnviar, aprobar, rechazar, cancelar, detalle, mias, bandeja, deColaborador, presentar, sedesDirector,
  };
}
