// Rutas /api/v1/usuarios/* y /api/v1/sedes (solo admincontable)
import multer from 'multer';
import { validar, invalido } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioUsuarios } from './service.js';
import * as v from './validators.js';

const MAX_EXCEL_MB = 15;

export function montarRutasUsuarios(router, ctx) {
  const svc = crearServicioUsuarios(ctx);
  const soloAdmin = [autenticado(), rol(ROLES.ADMIN)];
  const subirExcel = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_EXCEL_MB * 1024 * 1024, files: 1, fields: 5 },
  }).single('archivo');

  router.get('/sedes', ...soloAdmin, async (_req, res) => res.json({ sedes: await svc.listarSedes() }));

  router.get('/usuarios', ...soloAdmin, async (req, res) => {
    res.json(await svc.listar(validar(v.esquemaListar, req.query)));
  });

  router.post('/usuarios', ...soloAdmin, async (req, res) => {
    res.status(201).json(await svc.crear(req, validar(v.esquemaCrear, req.body)));
  });

  router.post('/usuarios/carga-masiva', ...soloAdmin, subirExcel, async (req, res) => {
    if (!req.file) throw invalido('Adjunte el libro de nómina (.xlsx o .xlsm).', { archivo: 'Adjunte el archivo.' });
    if (!/\.(xlsx|xlsm)$/i.test(req.file.originalname)) {
      throw invalido('El archivo debe ser .xlsx o .xlsm.', { archivo: 'Formato no permitido.' });
    }
    const confirmar = req.body?.confirmar === 'true';
    res.json(await svc.cargaMasiva(req, req.file.buffer, confirmar));
  });

  router.get('/usuarios/:id', ...soloAdmin, async (req, res) => {
    const { id } = validar(v.esquemaId, req.params);
    await ctx.auditar(req, { accion: 'VER', entidad: 'usuario', entidadId: id });
    res.json(await svc.detalle(id));
  });

  router.patch('/usuarios/:id', ...soloAdmin, async (req, res) => {
    const { id } = validar(v.esquemaId, req.params);
    res.json(await svc.actualizar(req, id, validar(v.esquemaActualizar, req.body)));
  });

  router.post('/usuarios/:id/reset-clave', ...soloAdmin, async (req, res) => {
    const { id } = validar(v.esquemaId, req.params);
    res.json(await svc.restablecerClave(req, id));
  });
}
