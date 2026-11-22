// Rutas genéricas de solicitudes (todos los tipos), bandeja de aprobaciones, flujos y documentos.
import multer from 'multer';
import { z } from 'zod';
import { validar, invalido } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioSolicitudes } from './service.js';

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const esquemaTipo = z.object({ tipo: z.enum(['PERMISO', 'VACACIONES', 'LICENCIA']).optional() });
const esquemaMias = z.object({
  tipo: z.enum(['PERMISO', 'VACACIONES', 'LICENCIA']).optional(),
  estado: z.enum(['EN_CURSO', 'BORRADOR', 'APROBADA', 'RECHAZADA', 'CANCELADA']).optional(),
});
// estadoEsperado: el estado que veía quien aprueba/rechaza; si cambió, 409 (evita aprobar otro paso)
const estadoEsperado = z.string({ error: 'Falta el estado de la solicitud; recargue la página.' }).max(40);
const esquemaComentario = z.object({ comentario: z.string().trim().max(500).optional(), estadoEsperado });
const esquemaRechazo = z.object({ motivo: z.string({ error: 'Escriba el motivo del rechazo.' }).trim().min(5, 'Explique el motivo del rechazo (mínimo 5 caracteres).').max(500), estadoEsperado });
const esquemaCancelar = z.object({ motivo: z.string().trim().max(500).optional() });
const esquemaFlujo = z.object({ pasos: z.array(z.object({ rol: z.enum(['DIRECTOR', 'ADMIN']), etiqueta: z.string().max(40).optional() })).min(1).max(2) });

export function montarRutasSolicitudes(router, ctx) {
  const svc = crearServicioSolicitudes(ctx);
  const { motor } = svc;
  ctx.servicioSolicitudes = svc; // lo usan los módulos de cada tipo
  const sesion = autenticado();
  const aprobadores = [sesion, rol(ROLES.DIRECTOR, ROLES.ADMIN)];
  // Tope técnico de 25 MB; el límite real (parámetro UPLOAD_MAX_MB) lo aplica revisarPdf con un mensaje claro
  const subirPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 30, fieldSize: 5000 } }).single('soporte');

  // Crear (multipart: campos del tipo + "soporte" PDF opcional + "enviar")
  router.post('/solicitudes', sesion, subirPdf, async (req, res) => {
    const tipo = String(req.body?.tipo ?? '');
    if (req.file && !/\.pdf$/i.test(req.file.originalname)) throw invalido('El soporte debe ser un PDF.', { soporte: 'Solo se aceptan archivos PDF.' });
    const r = await svc.crear(req, tipo, req.body ?? {}, req.file ?? null, { enviar: req.body?.enviar !== 'false' });
    res.status(201).json(r);
  });

  // Tipos activos (según los módulos habilitados): botones de Inicio
  router.get('/solicitudes/tipos', sesion, (_req, res) => res.json({
    tipos: [...ctx.tiposSolicitud.values()].map((t) => ({ tipo: t.tipo, etiqueta: t.etiqueta, rutaLista: t.rutaLista, rutaNueva: t.rutaNueva, icono: t.icono, accion: t.accion ?? `Solicitar ${t.etiqueta.toLowerCase()}` })),
  }));
  // Pasos del flujo vigente (para explicar al colaborador por dónde pasará su solicitud)
  router.get('/solicitudes/flujo/:tipo', sesion, async (req, res) => {
    const { tipo } = validar(z.object({ tipo: z.enum(['PERMISO', 'VACACIONES', 'LICENCIA']) }), req.params);
    res.json({ pasos: (await motor.flujoActivo(tipo)).pasos.map((p) => p.etiqueta) });
  });
  router.get('/me/solicitudes', sesion, async (req, res) => res.json(await motor.mias(req, validar(esquemaMias, req.query))));
  router.get('/solicitudes/:id', sesion, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const d = await motor.detalle(req, id);
    await ctx.auditar(req, { accion: 'VER', entidad: 'solicitud', entidadId: id });
    res.json(d);
  });
  router.post('/solicitudes/:id/enviar', sesion, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const s = await motor.enviar(req, id);
    await motor.despuesDeEnviar(req, s);
    res.json(await motor.detalle(req, id));
  });
  router.post('/solicitudes/:id/cancelar', sesion, async (req, res) =>
    res.json(await motor.cancelar(req, validar(esquemaId, req.params).id, validar(esquemaCancelar, req.body).motivo)));
  router.post('/solicitudes/:id/aprobar', ...aprobadores, async (req, res) =>
    res.json(await motor.aprobar(req, validar(esquemaId, req.params).id, validar(esquemaComentario, req.body))));
  router.post('/solicitudes/:id/rechazar', ...aprobadores, async (req, res) =>
    res.json(await motor.rechazar(req, validar(esquemaId, req.params).id, validar(esquemaRechazo, req.body))));

  // Bandeja de aprobaciones
  router.get('/aprobaciones', ...aprobadores, async (req, res) => res.json({ solicitudes: await motor.bandeja(req, validar(esquemaTipo, req.query)) }));
  router.get('/aprobaciones/resumen', ...aprobadores, async (req, res) => res.json({ pendientes: (await motor.bandeja(req, {})).length }));

  // Solicitudes de un colaborador (pestañas del expediente)
  router.get('/colaboradores/:id/solicitudes', sesion, async (req, res) =>
    res.json({ solicitudes: await motor.deColaborador(req, validar(esquemaId, req.params).id, validar(esquemaTipo, req.query)) }));

  // Flujos (configuración)
  router.get('/flujos/:tipo', sesion, rol(ROLES.ADMIN), async (req, res) => {
    const { tipo } = validar(z.object({ tipo: z.enum(['PERMISO', 'VACACIONES', 'LICENCIA']) }), req.params);
    const f = await motor.flujoActivo(tipo);
    res.json({ tipo, version: f.version, pasos: f.pasos });
  });
  router.put('/flujos/:tipo', sesion, rol(ROLES.ADMIN), async (req, res) => {
    const { tipo } = validar(z.object({ tipo: z.enum(['PERMISO', 'VACACIONES', 'LICENCIA']) }), req.params);
    res.json(await motor.configurarFlujo(req, tipo, validar(esquemaFlujo, req.body).pasos));
  });

  // Documentos (PDF): descarga con control de acceso; ?ver=1 para abrir en el navegador
  router.get('/documentos/:id', sesion, async (req, res) => {
    const { doc, contenido } = await svc.documento(req, validar(esquemaId, req.params).id);
    const nombre = `documento-${doc.id}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.ver === '1' ? 'inline' : 'attachment'}; filename="${nombre}"`,
      'Content-Length': contenido.length,
    });
    res.end(contenido);
  });
}
