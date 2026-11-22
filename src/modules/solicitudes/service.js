// Creación de solicitudes (con soporte PDF opcional) y acceso a documentos.
import { ErrorApp, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { crearMotor } from './motor.js';

export function crearServicioSolicitudes(ctx) {
  const { db, auditar, documentos } = ctx;
  const motor = crearMotor(ctx);

  // body: campos del formulario (texto); archivo: { buffer, originalname } o null
  async function crear(req, tipo, body, archivo, { enviar = true } = {}) {
    const handler = ctx.tiposSolicitud.get(tipo);
    if (!handler) throw noEncontrado('Ese tipo de solicitud no está disponible.');
    const colaborador = await motor.colaboradorDe(req);
    if (!colaborador) throw new ErrorApp(404, 'SIN_EXPEDIENTE', 'Su cuenta no tiene expediente de colaborador; no puede hacer solicitudes.');
    if (colaborador.estado !== 'ACTIVO') throw invalido('Su expediente está como retirado; no puede hacer solicitudes.');
    const campos = await handler.validar(ctx, { colaborador, body });
    if (handler.soporteObligatorio && !archivo) throw invalido('Adjunte el soporte en PDF.', { soporte: 'Adjunte el soporte en PDF.' });

    // Sensible = dato de salud (Ley 1581): solo lo ven el colaborador y el admincontable.
    // Se calcula ANTES de la transacción (consulta parámetros con otra conexión).
    const sensible = typeof handler.documentoSensible === 'function'
      ? !!(await handler.documentoSensible(ctx, campos)) : !!handler.documentoSensible;
    const maxMb = Number(await ctx.params.valor('UPLOAD_MAX_MB'));
    const previo = enviar && handler.prepararEnvio ? await handler.prepararEnvio(ctx, campos) : null;
    let archivoGuardado = null;
    let id;
    let enviada = null;
    try {
      await db.transaction(async (trx) => {
        let documentoId = null;
        if (archivo) {
          const doc = await documentos.guardar(trx, req, {
            buffer: archivo.buffer, nombreOriginal: archivo.originalname, colaboradorId: colaborador.id,
            categoria: handler.categoriaDocumento, sensible, maxMb,
          });
          archivoGuardado = doc.clave;
          documentoId = doc.id;
        }
        const t = ahora();
        const [fila] = await trx('solicitudes').insert({
          tipo, colaborador_id: colaborador.id, estado: 'BORRADOR', documento_id: documentoId,
          subtipo: campos.subtipo ?? null, fecha_inicio: campos.fecha_inicio, hora_inicio: campos.hora_inicio ?? null,
          fecha_fin: campos.fecha_fin, hora_fin: campos.hora_fin ?? null, dias_habiles: campos.dias_habiles ?? null,
          dias_compensar: campos.dias_compensar ?? null, motivo: campos.motivo ?? null,
          datos: campos.datos ? JSON.stringify(campos.datos) : null, creado_en: t, actualizado_en: t,
        }).returning('id');
        id = typeof fila === 'object' ? fila.id : fila;
        await trx('solicitud_eventos').insert({ solicitud_id: id, actor_id: req.usuario.id, accion: 'CREAR', estado_desde: null, estado_hasta: 'BORRADOR', creado_en: t });
        if (enviar) enviada = await motor.enviar(req, id, { trx, previo });
      });
    } catch (e) {
      if (archivoGuardado) await documentos.descartar(archivoGuardado);
      throw e;
    }
    await auditar(req, { accion: 'CREAR', entidad: 'solicitud', entidadId: id, detalle: { tipo, conSoporte: !!archivo } });
    if (enviada) await motor.despuesDeEnviar(req, enviada);
    return motor.detalle(req, id);
  }

  // Documento: lo ven el dueño, el admincontable y, si NO es sensible, el director de su sede.
  async function documento(req, id) {
    const doc = await documentos.porId(id);
    let permitido = false;
    if (doc) {
      const c = await db('colaboradores').where({ id: doc.colaborador_id }).first();
      if (req.usuario.rol === 'ADMIN' || c?.cedula === req.usuario.cedula) permitido = true;
      else if (req.usuario.rol === 'DIRECTOR' && !doc.sensible) permitido = (await motor.sedesDirector(req.usuario.id)).includes(c?.sede_id);
    }
    if (!permitido) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'documento', entidadId: id });
      throw noEncontrado('No encontramos ese documento.');
    }
    await auditar(req, { accion: 'DESCARGAR', entidad: 'documento', entidadId: id, detalle: { categoria: doc.categoria } });
    return { doc, contenido: await documentos.leer(doc) };
  }

  return { motor, crear, documento };
}
