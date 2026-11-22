// Motor de solicitudes con flujo de aprobación configurable.
//
// Estados: BORRADOR → (pasos del flujo, p. ej. PENDIENTE_DIRECTOR → PENDIENTE_CONTABLE) →
//          APROBADA | RECHAZADA | CANCELADA
// Reglas:
// - Los pasos vienen de la tabla `flujos` (versión activa del tipo); cada solicitud queda atada a
//   la versión con la que se envió. Cada rol aparece una sola vez en un flujo.
// - Solo actúa en un paso quien tenga SU rol (el director, solo en sus sedes) y nadie actúa en dos
//   pasos de la misma solicitud. Nadie aprueba lo propio, EXCEPTO el admincontable en el paso
//   contable (decisión del negocio, 2026-11-22: el admincontable aprueba sus propias solicitudes;
//   queda marcado como autoaprobación en el historial y la auditoría).
// - Si un paso de DIRECTOR no tiene director disponible (la sede no tiene, o es el propio
//   solicitante), el paso se OMITE automáticamente y queda en el historial.
// - Si un paso de ADMIN no tiene ningún admincontable activo, la solicitud no se puede enviar.
// - Quien aprueba o rechaza indica el estado que estaba viendo: si cambió, 409.
// - Las notificaciones van DESPUÉS del commit y un fallo en ellas no cambia el resultado.
import { ErrorApp, conflicto, invalido, noEncontrado, prohibido } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { log } from '../../core/logger.js';

export const FINALES = ['APROBADA', 'RECHAZADA', 'CANCELADA'];
export const ETIQUETAS_ESTADO = { BORRADOR: 'Borrador', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' };
const ROLES_PASO = ['DIRECTOR', 'ADMIN'];
const OMITIDO = 'La sede no tiene un director disponible para aprobar; este paso se omite y pasa al siguiente.';

export function crearMotor(ctx) {
  const { db, auditar, notificaciones } = ctx;
  const esPg = () => db.client.config.client === 'pg';

  // Ejecuta notificaciones sin que un fallo afecte la respuesta (ya se guardó el cambio)
  async function seguro(descripcion, fn) {
    try {
      await fn();
    } catch (e) {
      log.error(`Falló ${descripcion}`, { error: e.message });
    }
  }

  // ---------- flujos ----------
  async function flujoActivo(tipo, trx = db) {
    const f = await trx('flujos').where({ tipo, activo: true }).orderBy('version', 'desc').first();
    if (!f) throw new ErrorApp(500, 'SIN_FLUJO', `No hay un flujo de aprobación configurado para ${tipo}.`);
    return { ...f, pasos: JSON.parse(f.pasos) };
  }
  const cacheFlujos = new Map(); // las versiones de flujo son inmutables
  async function flujoPorId(id, trx = db) {
    if (!id) return null;
    if (!cacheFlujos.has(id)) {
      const f = await trx('flujos').where({ id }).first();
      if (!f) return null;
      cacheFlujos.set(id, { ...f, pasos: JSON.parse(f.pasos) });
    }
    return cacheFlujos.get(id);
  }

  // Nueva versión del flujo (las solicitudes en curso siguen con la suya)
  async function configurarFlujo(req, tipo, pasos) {
    if (!ctx.tiposSolicitud.has(tipo)) throw noEncontrado('Ese tipo de solicitud no existe.');
    if (!Array.isArray(pasos) || pasos.length < 1 || pasos.length > ROLES_PASO.length) throw invalido('El flujo debe tener uno o dos pasos.');
    const roles = pasos.map((p) => p.rol);
    if (roles.some((r) => !ROLES_PASO.includes(r))) throw invalido('Cada paso debe ser DIRECTOR o ADMIN.');
    if (new Set(roles).size !== roles.length) throw invalido('Cada rol puede aparecer una sola vez en el flujo (separación de funciones).');
    const normalizados = pasos.map((p) => ({
      rol: p.rol,
      estado: p.rol === 'ADMIN' ? 'PENDIENTE_CONTABLE' : 'PENDIENTE_DIRECTOR',
      etiqueta: String(p.etiqueta ?? '').trim().slice(0, 40) || (p.rol === 'ADMIN' ? 'Pendiente contable' : 'Pendiente director'),
    }));
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

  // ---------- personas ----------
  const colaboradorDe = (req) => db('colaboradores').where({ cedula: req.usuario.cedula }).first();
  const sedesDirector = async (usuarioId, trx = db) => (await trx('director_sedes').where({ usuario_id: usuarioId }).select('sede_id')).map((r) => r.sede_id);
  const usuarioDe = async (cedula) => (await db('usuarios').where({ cedula }).first('id'))?.id;

  // Quiénes pueden atender un paso de esta solicitud (el director, sin el solicitante; en el paso
  // contable, cualquier admincontable activo, incluido el solicitante si lo es)
  async function aprobadoresDe(s, paso, trx = db) {
    if (paso.rol === 'ADMIN') {
      return (await trx('usuarios').where({ rol: 'ADMIN', activo: true }).select('id')).map((u) => u.id);
    }
    if (!s.sede_id) return [];
    return (await trx('usuarios as u').join('director_sedes as d', 'd.usuario_id', 'u.id')
      .where({ 'u.rol': 'DIRECTOR', 'u.activo': true, 'd.sede_id': s.sede_id }).whereNot('u.cedula', s.cedula).select('u.id')).map((u) => u.id);
  }

  async function cargar(id, trx = db) {
    const s = await trx('solicitudes as s').join('colaboradores as c', 'c.id', 's.colaborador_id')
      .where('s.id', id).select('s.*', 'c.cedula', 'c.nombre as colaborador_nombre', 'c.sede_id', 'c.cargo').first();
    if (!s) return null;
    s.flujo = await flujoPorId(s.flujo_id, trx);
    s.datos = s.datos ? JSON.parse(s.datos) : {};
    return s;
  }

  // ¿Puede VER la solicitud? La propia siempre; un BORRADOR solo su dueño; el admin todas las
  // enviadas; el director las enviadas de sus sedes.
  async function puedeVer(req, s) {
    if (s.cedula === req.usuario.cedula) return true;
    if (s.estado === 'BORRADOR') return false;
    if (req.usuario.rol === 'ADMIN') return true;
    if (req.usuario.rol === 'DIRECTOR') return (await sedesDirector(req.usuario.id)).includes(s.sede_id);
    return false;
  }

  // ¿Puede ACTUAR en el paso actual? Su rol, su alcance, no actuó en otro paso y no es suya
  // (salvo el admincontable en el paso contable).
  const esAutoaprobacion = (req, s) => s.cedula === req.usuario.cedula && req.usuario.rol === 'ADMIN' && s.flujo?.pasos[s.paso_actual]?.rol === 'ADMIN';
  async function puedeActuar(req, s, trx = db) {
    if (!s.flujo || s.paso_actual === null || s.paso_actual === undefined || FINALES.includes(s.estado)) return false;
    const paso = s.flujo.pasos[s.paso_actual];
    if (!paso || req.usuario.rol !== paso.rol) return false;
    if (s.cedula === req.usuario.cedula && !esAutoaprobacion(req, s)) return false;
    if (paso.rol === 'DIRECTOR' && !(await sedesDirector(req.usuario.id, trx)).includes(s.sede_id)) return false;
    const yaActuo = await trx('solicitud_eventos').where({ solicitud_id: s.id, actor_id: req.usuario.id, accion: 'APROBAR' }).first('id');
    return !yaActuo;
  }

  async function cargarConAlcance(req, id) {
    const s = await cargar(id);
    if (!s || !(await puedeVer(req, s))) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'solicitud', entidadId: id });
      throw noEncontrado('No encontramos esa solicitud.');
    }
    return s;
  }

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
    const todos = [solicitante, ...(await db('usuarios').where({ rol: 'ADMIN', activo: true }).pluck('id')), ...(aprobadores ?? [])];
    notificaciones.avisar(todos, { tipo: 'solicitud', id: s.id });
  }

  // ---------- transiciones ----------
  // Actualización condicionada: solo si sigue en el estado y paso esperados (evita carreras)
  async function transicion(trx, s, { hacia, paso, accion, actorId, comentario, extra = {} }) {
    const t = ahora();
    const desde = s.estado;
    const q = trx('solicitudes').where({ id: s.id, estado: desde });
    if (s.paso_actual === null || s.paso_actual === undefined) q.whereNull('paso_actual');
    else q.where({ paso_actual: s.paso_actual });
    const n = await q.update({ estado: hacia, paso_actual: paso, actualizado_en: t, ...(FINALES.includes(hacia) ? { resuelto_en: t } : {}), ...extra });
    if (n !== 1) throw conflicto('La solicitud cambió mientras tanto. Recargue la página para ver su estado actual.');
    await trx('solicitud_eventos').insert({ solicitud_id: s.id, actor_id: actorId, accion, estado_desde: desde, estado_hasta: hacia, comentario: comentario?.slice(0, 500) ?? null, creado_en: t });
    s.estado = hacia;
    s.paso_actual = paso;
  }

  // Entra al paso i; omite los pasos de DIRECTOR sin director disponible.
  async function entrarEnPaso(trx, s, i) {
    let actual = i;
    while (actual < s.flujo.pasos.length) {
      const paso = s.flujo.pasos[actual];
      if (paso.rol !== 'DIRECTOR' || (await aprobadoresDe(s, paso, trx)).length) break;
      const siguiente = actual + 1;
      if (siguiente >= s.flujo.pasos.length) throw invalido('No hay quién apruebe esta solicitud. Comuníquese con el área contable.');
      await transicion(trx, s, { hacia: s.flujo.pasos[siguiente].estado, paso: siguiente, accion: 'OMITIR', actorId: null, comentario: OMITIDO });
      actual = siguiente;
    }
    return actual;
  }

  // Antes de enviar: todo paso de ADMIN debe tener al menos un admincontable activo
  async function verificarAprobadores(trx, s) {
    for (const paso of s.flujo.pasos) {
      if (paso.rol === 'ADMIN' && !(await aprobadoresDe(s, paso, trx)).length) {
        throw invalido('No hay ningún usuario del área contable activo que pueda aprobar la solicitud. Comuníquese con el administrador del sistema.');
      }
    }
  }

  async function enviar(req, id, { trx: trxExterna } = {}) {
    const ejecutar = async (trx) => {
      const s = await cargar(id, trx);
      if (!s || s.cedula !== req.usuario.cedula) throw noEncontrado('No encontramos esa solicitud.');
      if (s.estado !== 'BORRADOR') throw conflicto('Solo se puede enviar una solicitud en borrador.');
      // En PostgreSQL, bloquea al colaborador: dos envíos simultáneos no pueden saltarse la
      // validación de cruce (en SQLite las escrituras ya son secuenciales).
      if (esPg()) await trx('colaboradores').where({ id: s.colaborador_id }).forUpdate().first('id');
      await ctx.tiposSolicitud.get(s.tipo).revalidarAlEnviar?.(ctx, s, trx);
      await validarSinCruce(trx, s);
      s.flujo = await flujoActivo(s.tipo, trx);
      await verificarAprobadores(trx, s);
      await transicion(trx, s, { hacia: s.flujo.pasos[0].estado, paso: 0, accion: 'ENVIAR', actorId: req.usuario.id, extra: { flujo_id: s.flujo.id, enviado_en: ahora() } });
      await entrarEnPaso(trx, s, 0);
      return s;
    };
    return trxExterna ? ejecutar(trxExterna) : db.transaction(ejecutar);
  }

  // Tras el commit: auditoría y notificaciones del envío
  async function despuesDeEnviar(req, s) {
    await auditar(req, { accion: 'ENVIAR', entidad: 'solicitud', entidadId: s.id, detalle: { tipo: s.tipo } });
    await seguro('la notificación del envío', async () => {
      const s2 = await cargar(s.id);
      await notificarCambio(s2, {
        titulo: `Su solicitud de ${ctx.tiposSolicitud.get(s2.tipo).etiqueta.toLowerCase()} fue enviada`,
        mensaje: `Quedó en estado "${etiquetaEstado(s2)}".`,
        aprobadores: await aprobadoresDe(s2, s2.flujo.pasos[s2.paso_actual]),
      });
    });
  }

  function verificarEstadoEsperado(s, estadoEsperado) {
    if (!estadoEsperado || estadoEsperado !== s.estado) {
      throw conflicto(`La solicitud ya no está en el estado que usted veía (ahora: "${etiquetaEstado(s)}"). Recargue la página.`);
    }
  }

  async function motivoNoPuede(req, s) {
    if (FINALES.includes(s.estado)) return 'Esta solicitud ya no está pendiente.';
    if (s.cedula === req.usuario.cedula && req.usuario.rol !== 'ADMIN') return 'No puede aprobar ni rechazar su propia solicitud; si ya no la necesita, cancélela.';
    const yaActuo = await db('solicitud_eventos').where({ solicitud_id: s.id, actor_id: req.usuario.id, accion: 'APROBAR' }).first('id');
    if (yaActuo) return 'Usted ya aprobó un paso de esta solicitud; el siguiente lo debe atender otra persona.';
    return 'Este paso le corresponde a otro rol.';
  }

  async function aprobar(req, id, { comentario, estadoEsperado }) {
    const s = await cargarConAlcance(req, id);
    verificarEstadoEsperado(s, estadoEsperado);
    if (!(await puedeActuar(req, s))) throw prohibido(await motivoNoPuede(req, s));
    const pasoAprobado = s.paso_actual;
    const auto = esAutoaprobacion(req, s);
    await db.transaction(async (trx) => {
      const siguiente = s.paso_actual + 1;
      const final = siguiente >= s.flujo.pasos.length;
      const nota = auto ? ['Autoaprobación del área contable', comentario].filter(Boolean).join(': ') : comentario;
      await transicion(trx, s, { hacia: final ? 'APROBADA' : s.flujo.pasos[siguiente].estado, paso: final ? null : siguiente, accion: 'APROBAR', actorId: req.usuario.id, comentario: nota });
      if (!final) await entrarEnPaso(trx, s, siguiente);
      // Efecto del tipo al aprobarse (p. ej. registro en el expediente): en la MISMA transacción
      if (s.estado === 'APROBADA') await ctx.tiposSolicitud.get(s.tipo).alAprobar?.(ctx, s, trx);
    });
    await auditar(req, { accion: 'APROBAR', entidad: 'solicitud', entidadId: id, detalle: { paso: pasoAprobado, hacia: s.estado, ...(auto ? { autoaprobacion: true } : {}) } });
    await seguro('la notificación de la aprobación', async () => {
      const s2 = await cargar(id);
      const etiqueta = ctx.tiposSolicitud.get(s2.tipo).etiqueta.toLowerCase();
      const final = s2.estado === 'APROBADA';
      await notificarCambio(s2, {
        titulo: final ? `Su solicitud de ${etiqueta} fue APROBADA` : `Su solicitud de ${etiqueta} avanzó`,
        mensaje: final ? 'Quedó registrada en su expediente.' : `Ahora está en "${etiquetaEstado(s2)}".`,
        aprobadores: final ? null : await aprobadoresDe(s2, s2.flujo.pasos[s2.paso_actual]),
      });
    });
    return detalle(req, id);
  }

  async function rechazar(req, id, { motivo, estadoEsperado }) {
    const s = await cargarConAlcance(req, id);
    verificarEstadoEsperado(s, estadoEsperado);
    if (!(await puedeActuar(req, s))) throw prohibido(await motivoNoPuede(req, s));
    const paso = s.paso_actual;
    if (esAutoaprobacion(req, s)) throw prohibido('Si ya no necesita su solicitud, cancélela en lugar de rechazarla.');
    await db.transaction((trx) => transicion(trx, s, { hacia: 'RECHAZADA', paso: null, accion: 'RECHAZAR', actorId: req.usuario.id, comentario: motivo }));
    await auditar(req, { accion: 'RECHAZAR', entidad: 'solicitud', entidadId: id, detalle: { paso } });
    await seguro('la notificación del rechazo', async () => notificarCambio(await cargar(id), {
      titulo: `Su solicitud de ${ctx.tiposSolicitud.get(s.tipo).etiqueta.toLowerCase()} fue RECHAZADA`,
      mensaje: `Motivo: ${motivo}`,
    }));
    return detalle(req, id);
  }

  async function cancelar(req, id, motivo) {
    const s = await cargarConAlcance(req, id);
    if (s.cedula !== req.usuario.cedula) throw prohibido('Solo quien hizo la solicitud puede cancelarla.');
    if (FINALES.includes(s.estado)) throw conflicto('Esta solicitud ya terminó; no se puede cancelar.');
    const estabaEnTramite = s.estado !== 'BORRADOR';
    const pasoPendiente = estabaEnTramite ? s.flujo.pasos[s.paso_actual] : null;
    await db.transaction((trx) => transicion(trx, s, { hacia: 'CANCELADA', paso: null, accion: 'CANCELAR', actorId: req.usuario.id, comentario: motivo }));
    await auditar(req, { accion: 'CANCELAR', entidad: 'solicitud', entidadId: id });
    if (estabaEnTramite) {
      await seguro('la notificación de la cancelación', async () => {
        const s2 = await cargar(id);
        const etiqueta = ctx.tiposSolicitud.get(s.tipo).etiqueta.toLowerCase();
        await notificaciones.notificar(await aprobadoresDe(s2, pasoPendiente), {
          titulo: `${s.colaborador_nombre} canceló su solicitud de ${etiqueta}`, enlace: `/solicitudes/ver?id=${id}`,
        });
        await notificarCambio(s2, { titulo: `Su solicitud de ${etiqueta} quedó CANCELADA`, mensaje: motivo ? `Motivo: ${motivo}` : undefined });
      });
    }
    return detalle(req, id);
  }

  // ---------- cruce con otras ausencias ----------
  // Rango [desde, hasta) en milisegundos; sin hora = día completo. Fechas y horas locales
  // (Colombia) comparadas entre sí: la zona horaria no influye.
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
    // Estado de cada paso a partir del historial (también en rechazadas y canceladas)
    const RESULTADO = { APROBAR: 'HECHO', OMITIR: 'OMITIDO', RECHAZAR: 'RECHAZADO', CANCELAR: 'CANCELADO' };
    const estadoPaso = (p, i) => {
      const ev = [...eventos].reverse().find((e) => e.estado_desde === p.estado && RESULTADO[e.accion]);
      if (ev) return RESULTADO[ev.accion];
      return s.paso_actual === i ? 'ACTUAL' : 'PENDIENTE';
    };
    const actuar = await puedeActuar(req, s);
    return {
      ...presentar(s),
      pasos: pasos.map((p, i) => ({ etiqueta: p.etiqueta, rol: p.rol, estado: estadoPaso(p, i) })),
      eventos: eventos.map((e) => ({ ...e, estadoDesdeEtiqueta: e.estado_desde ? etiquetaEstado(s, e.estado_desde) : null, estadoHastaEtiqueta: etiquetaEstado(s, e.estado_hasta) })),
      acciones: {
        enviar: propia && s.estado === 'BORRADOR',
        cancelar: propia && !FINALES.includes(s.estado),
        aprobar: actuar,
        rechazar: actuar && !esAutoaprobacion(req, s),
      },
    };
  }

  async function lista(filtro) {
    const filas = await db('solicitudes as s').join('colaboradores as c', 'c.id', 's.colaborador_id')
      .modify(filtro).orderBy('s.id', 'desc').limit(200)
      .select('s.*', 'c.cedula', 'c.nombre as colaborador_nombre', 'c.sede_id', 'c.cargo');
    for (const f of filas) {
      f.flujo = await flujoPorId(f.flujo_id);
      f.datos = f.datos ? JSON.parse(f.datos) : {};
    }
    return filas;
  }

  async function mias(req, { tipo, estado }) {
    const c = await colaboradorDe(req);
    if (!c) return { solicitudes: [], sinExpediente: true };
    return {
      solicitudes: (await lista((q) => {
        q.where('s.colaborador_id', c.id);
        if (tipo) q.where('s.tipo', tipo);
        if (estado === 'EN_CURSO') q.whereNotIn('s.estado', FINALES);
        else if (estado) q.where('s.estado', estado);
      })).map(presentar),
    };
  }

  // Bandeja: solicitudes cuyo paso actual puede atender este usuario (misma regla que puedeActuar)
  async function bandeja(req, { tipo }) {
    const filas = await lista((q) => {
      q.whereNotNull('s.paso_actual').whereNotIn('s.estado', [...FINALES, 'BORRADOR']);
      if (req.usuario.rol !== 'ADMIN') q.whereNot('c.cedula', req.usuario.cedula);
      if (tipo) q.where('s.tipo', tipo);
    });
    const sedes = req.usuario.rol === 'DIRECTOR' ? await sedesDirector(req.usuario.id) : [];
    const yaActuo = new Set(await db('solicitud_eventos').where({ actor_id: req.usuario.id, accion: 'APROBAR' }).whereIn('solicitud_id', filas.map((f) => f.id)).pluck('solicitud_id'));
    return filas.filter((f) => {
      const paso = f.flujo?.pasos[f.paso_actual];
      if (!paso || paso.rol !== req.usuario.rol || yaActuo.has(f.id)) return false;
      return paso.rol !== 'DIRECTOR' || sedes.includes(f.sede_id);
    }).map(presentar);
  }

  async function deColaborador(req, colaboradorId, { tipo }) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c) throw noEncontrado('No encontramos ese colaborador.');
    if (req.usuario.rol === 'DIRECTOR' && c.cedula !== req.usuario.cedula && !(await sedesDirector(req.usuario.id)).includes(c.sede_id)) throw noEncontrado('No encontramos ese colaborador.');
    if (req.usuario.rol === 'COLABORADOR' && c.cedula !== req.usuario.cedula) throw noEncontrado('No encontramos ese colaborador.');
    await auditar(req, { accion: 'VER_SOLICITUDES', entidad: 'colaborador', entidadId: colaboradorId, detalle: { tipo } });
    return (await lista((q) => {
      q.where('s.colaborador_id', colaboradorId).whereNot('s.estado', 'BORRADOR');
      if (tipo) q.where('s.tipo', tipo);
    })).map(presentar);
  }

  return {
    flujoActivo, configurarFlujo, colaboradorDe, cargar, cargarConAlcance, puedeVer, validarSinCruce,
    enviar, despuesDeEnviar, aprobar, rechazar, cancelar, detalle, mias, bandeja, deColaborador, presentar, sedesDirector,
  };
}
