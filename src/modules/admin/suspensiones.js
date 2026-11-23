// Suspensiones (M8): las registra y anula el área contable. Las ve el propio colaborador y el
// admincontable (es información disciplinaria: el director no la ve). Efectos:
// - No pueden cruzarse con permisos, vacaciones, licencias, incapacidades ni otra suspensión.
// - Sus días no cuentan como laborados para causar vacaciones (hook ctx.diasNoLaborados).
import { conflicto, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { log } from '../../core/logger.js';
import { fechaValida, hoyBogota, sumarDias } from '../vacaciones/calendario.js';

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const fechaTexto = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

export function crearServicioSuspensiones(ctx) {
  const { db, auditar } = ctx;

  // Vigentes que se cruzan con un rango (para el motor, incapacidades y aquí)
  const cruces = (trx, colaboradorId, desde, hasta, excluirId = null) =>
    trx('suspensiones')
      .where({ colaborador_id: colaboradorId })
      .whereNull('anulada_en')
      .where('fecha_inicio', '<=', hasta)
      .where('fecha_fin', '>=', desde)
      .modify((q) => (excluirId ? q.whereNot('id', excluirId) : q))
      .select('id', 'fecha_inicio', 'fecha_fin');

  const presentar = (s) => ({
    id: s.id,
    fechaInicio: s.fecha_inicio,
    fechaFin: s.fecha_fin,
    dias: s.dias,
    motivo: s.motivo,
    creadoEn: s.creado_en,
    anulada: !!s.anulada_en,
    anuladaEn: s.anulada_en,
    motivoAnulacion: s.motivo_anulacion,
  });

  async function registrar(req, colaboradorId, { fecha_inicio: fi, fecha_fin: ff, motivo }) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c) throw noEncontrado('No encontramos ese colaborador.');
    const e = {};
    if (!fechaValida(fi)) e.fecha_inicio = 'Escriba una fecha válida.';
    if (!fechaValida(ff)) e.fecha_fin = 'Escriba una fecha válida.';
    if (!e.fecha_inicio && !e.fecha_fin) {
      if (ff < fi) e.fecha_fin = 'La fecha final no puede ser anterior a la inicial.';
      else if (diasEntre(fi, ff) > 60) e.fecha_fin = 'Una suspensión no puede pasar de 60 días (CST art. 112).';
      else if (fi > sumarDias(hoyBogota(), 90)) e.fecha_inicio = 'Máximo 90 días hacia adelante.';
      else if (c.fecha_ingreso && fi < c.fecha_ingreso) e.fecha_inicio = 'No puede ser anterior al ingreso.';
    }
    const m = String(motivo ?? '')
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (m.length < 5) e.motivo = 'Explique el motivo (mínimo 5 caracteres).';
    if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);
    let id;
    await db.transaction(async (trx) => {
      if (db.client.config.client === 'pg') await trx('colaboradores').where({ id: c.id }).forUpdate().first('id');
      const [s] = await cruces(trx, c.id, fi, ff);
      if (s)
        throw invalido('Revise los datos marcados.', {
          fecha_inicio: `Se cruza con otra suspensión (${fechaTexto(s.fecha_inicio)} a ${fechaTexto(s.fecha_fin)}).`,
        });
      const otra = await trx('solicitudes')
        .where({ colaborador_id: c.id })
        .whereNotIn('estado', ['BORRADOR', 'RECHAZADA', 'CANCELADA', 'ANULADA'])
        .where('fecha_inicio', '<=', ff)
        .where('fecha_fin', '>=', fi)
        .first('tipo', 'fecha_inicio', 'fecha_fin', 'estado');
      if (otra)
        throw invalido('Revise los datos marcados.', {
          fecha_inicio: `Se cruza con una solicitud de ${ctx.tiposSolicitud.get(otra.tipo)?.etiqueta.toLowerCase() ?? otra.tipo} (${fechaTexto(otra.fecha_inicio)} a ${fechaTexto(otra.fecha_fin)}). Anúlela o recházela primero.`,
        });
      const inc = ctx.servicioIncapacidades ? (await ctx.servicioIncapacidades.cruces(trx, c.id, fi, ff))[0] : null;
      if (inc)
        throw invalido('Revise los datos marcados.', {
          fecha_inicio: `Se cruza con una incapacidad (${fechaTexto(inc.fecha_inicio)} a ${fechaTexto(inc.fecha_fin)}).`,
        });
      const [fila] = await trx('suspensiones')
        .insert({
          colaborador_id: c.id,
          fecha_inicio: fi,
          fecha_fin: ff,
          dias: diasEntre(fi, ff),
          motivo: m.slice(0, 500),
          registrado_por: req.usuario.id,
          creado_en: ahora(),
        })
        .returning('id');
      id = typeof fila === 'object' ? fila.id : fila;
    });
    await auditar(req, {
      accion: 'REGISTRAR_SUSPENSION',
      entidad: 'suspension',
      entidadId: id,
      detalle: { colaborador: c.id, dias: diasEntre(fi, ff) },
    });
    try {
      const u = await db('usuarios').where({ cedula: c.cedula }).first('id');
      if (u)
        await ctx.notificaciones.notificar([u.id], {
          titulo: 'Se registró una suspensión en su expediente',
          mensaje: `Del ${fechaTexto(fi)} al ${fechaTexto(ff)}. Vea el detalle en su expediente.`,
          enlace: '/expediente',
          correoGenerico: {
            asunto: 'Novedad en su expediente',
            texto: 'Hay una novedad en su expediente. Ingrese a la plataforma para verla.',
          },
        });
    } catch (err) {
      log.error('Falló la notificación de la suspensión', { error: err.message });
    }
    return presentar(await db('suspensiones').where({ id }).first());
  }

  async function anular(req, id, motivo) {
    const s = await db('suspensiones').where({ id }).first();
    if (!s) throw noEncontrado('No encontramos esa suspensión.');
    if (s.anulada_en) throw conflicto('Esa suspensión ya estaba anulada.');
    const n = await db('suspensiones')
      .where({ id })
      .whereNull('anulada_en')
      .update({ anulada_en: ahora(), anulada_por: req.usuario.id, motivo_anulacion: motivo });
    if (n !== 1) throw conflicto('Esa suspensión ya estaba anulada.');
    await auditar(req, { accion: 'ANULAR_SUSPENSION', entidad: 'suspension', entidadId: id });
    return presentar(await db('suspensiones').where({ id }).first());
  }

  // El propio colaborador o el admincontable
  async function deColaborador(req, colaboradorId) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c || !(c.cedula === req.usuario.cedula || req.usuario.rol === 'ADMIN')) {
      await auditar(req, {
        accion: 'ACCESO_DENEGADO',
        entidad: 'colaborador',
        entidadId: colaboradorId,
        detalle: { recurso: 'suspensiones' },
      });
      throw noEncontrado('No encontramos ese colaborador.');
    }
    if (c.cedula !== req.usuario.cedula) await auditar(req, { accion: 'VER_SUSPENSIONES', entidad: 'colaborador', entidadId: c.id });
    return (await db('suspensiones').where({ colaborador_id: c.id }).orderBy('fecha_inicio', 'desc')).map(presentar);
  }

  // Para vacaciones: periodos no laborados
  const noLaborados = async (trx, colaboradorId, desde, hasta) =>
    (await cruces(trx, colaboradorId, desde, hasta)).map((s) => ({ desde: s.fecha_inicio, hasta: s.fecha_fin }));

  return { cruces, registrar, anular, deColaborador, noLaborados };
}
