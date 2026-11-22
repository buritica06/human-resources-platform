// Módulo M5 – Incapacidades (dato de salud, Ley 1581). Requiere "solicitudes" (documentos y
// cruce de ausencias) y "colaboradores". Ver reglas de visibilidad en servicio.js.
import multer from 'multer';
import { z } from 'zod';
import { invalido, validar } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioIncapacidades } from './servicio.js';

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const esquemaEquipo = z.object({ estado: z.enum(['REGISTRADA', 'VALIDADA', 'DEVUELTA', 'ANULADA']).optional(), desde: fecha, hasta: fecha });
const estadoEsperado = z.string({ error: 'Falta el estado; recargue la página.' }).max(20);
const esquemaValidar = z.object({ estadoEsperado });
const esquemaDevolver = z.object({ motivo: z.string({ error: 'Escriba el motivo.' }).trim().min(5, 'Explique el motivo (mínimo 5 caracteres). El colaborador lo verá.').max(500), estadoEsperado });
const esquemaAnular = z.object({ motivo: z.string().trim().max(500).optional() });

export default {
  nombre: 'incapacidades',
  inicializar(ctx) {
    ctx.servicioIncapacidades = crearServicioIncapacidades(ctx);
    // Las solicitudes (permisos, vacaciones, licencias) no pueden cruzarse con una incapacidad vigente
    ctx.ausenciasExtra.push(async (trx, colaboradorId, desde, hasta) =>
      (await ctx.servicioIncapacidades.cruces(trx, colaboradorId, desde, hasta)).map((c) => ({ ...c, etiqueta: 'una incapacidad registrada' })));
  },
  api(router, ctx) {
    const svc = ctx.servicioIncapacidades;
    const sesion = autenticado();
    const subirPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 20, fieldSize: 2000 } }).single('soporte');

    router.get('/incapacidades/opciones', sesion, async (req, res) => {
      const id = req.query.colaborador ? validar(esquemaId, { id: req.query.colaborador }).id : null;
      res.json(await svc.opciones(req, id));
    });
    router.post('/incapacidades', sesion, subirPdf, async (req, res) => {
      if (req.file && !/\.pdf$/i.test(req.file.originalname)) throw invalido('El certificado debe ser un PDF.', { soporte: 'Solo se aceptan archivos PDF.' });
      res.status(201).json(await svc.registrar(req, req.body ?? {}, req.file ?? null));
    });
    router.get('/me/incapacidades', sesion, async (req, res) => res.json(await svc.mias(req)));
    router.get('/incapacidades/pendientes', sesion, rol(ROLES.ADMIN), async (_req, res) => res.json({ pendientes: await svc.pendientes() }));
    router.get('/incapacidades', sesion, rol(ROLES.DIRECTOR, ROLES.ADMIN), async (req, res) => res.json(await svc.equipo(req, validar(esquemaEquipo, req.query))));
    router.get('/incapacidades/:id', sesion, async (req, res) => res.json(await svc.detalle(req, validar(esquemaId, req.params).id)));
    router.post('/incapacidades/:id/validar', sesion, rol(ROLES.ADMIN), async (req, res) =>
      res.json(await svc.validar(req, validar(esquemaId, req.params).id, validar(esquemaValidar, req.body))));
    router.post('/incapacidades/:id/devolver', sesion, rol(ROLES.ADMIN), async (req, res) =>
      res.json(await svc.devolver(req, validar(esquemaId, req.params).id, validar(esquemaDevolver, req.body))));
    router.post('/incapacidades/:id/anular', sesion, async (req, res) =>
      res.json(await svc.anular(req, validar(esquemaId, req.params).id, validar(esquemaAnular, req.body))));
    router.get('/colaboradores/:id/incapacidades', sesion, async (req, res) => res.json(await svc.deColaborador(req, validar(esquemaId, req.params).id)));
  },
  paginas: {
    '/incapacidades': 'incapacidades.html',
    '/incapacidades/nueva': 'nueva.html',
    '/incapacidades/ver': 'detalle.html',
    '/incapacidades/equipo': 'equipo.html',
  },
  menu: [
    { texto: 'Mis incapacidades', href: '/incapacidades', icono: 'salud', orden: 32 },
    { texto: 'Incapacidades del equipo', href: '/incapacidades/equipo', icono: 'salud', roles: ['DIRECTOR', 'ADMIN'], orden: 52 },
  ],
  widgetsInicio: [{ script: '/m/incapacidades/widget-inicio.js', orden: 6 }],
  pestanasExpediente: [{ clave: 'incapacidades', script: '/m/incapacidades/pestana-expediente.js' }],
};
