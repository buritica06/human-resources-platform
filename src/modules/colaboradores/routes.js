// Rutas del expediente.
//  /me/expediente*          → el propio colaborador
//  /colaboradores*          → admincontable (todo) y director (solo sus sedes, solo lectura)
import multer from 'multer';
import { validar, invalido } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioColaboradores } from './service.js';
import { crearImportador } from './importacion.js';
import * as v from './validators.js';

export function montarRutasColaboradores(router, ctx) {
  const svc = crearServicioColaboradores(ctx);
  const importador = crearImportador(ctx, svc);
  const sesion = autenticado();
  const gestion = [sesion, rol(ROLES.ADMIN, ROLES.DIRECTOR)];
  const soloAdmin = [sesion, rol(ROLES.ADMIN)];
  const subirExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5 } }).single(
    'archivo',
  );

  router.get('/me/expediente', sesion, async (req, res) => res.json(await svc.miExpediente(req)));
  router.patch('/me/expediente', sesion, async (req, res) => res.json(await svc.actualizarMio(req, validar(v.esquemaCuerpo, req.body))));
  router.get('/me/expediente/historial', sesion, async (req, res) => res.json(await svc.miHistorial(req)));

  router.get('/colaboradores', ...gestion, async (req, res) => res.json(await svc.listar(req, validar(v.esquemaListar, req.query))));
  router.post('/colaboradores', ...gestion, async (req, res) =>
    res.status(201).json(await svc.crear(req, validar(v.esquemaCuerpo, req.body))),
  );
  router.get('/colaboradores/opciones', ...gestion, async (req, res) => res.json(await svc.opciones(req)));
  router.get('/colaboradores/catalogos', ...gestion, async (_req, res) => res.json(await svc.listarCatalogos()));
  router.post('/colaboradores/catalogos/:clave/items', ...gestion, async (req, res) =>
    res
      .status(201)
      .json(
        await svc.agregarCatalogoItem(
          req,
          validar(v.esquemaClaveCatalogo, req.params).clave,
          validar(v.esquemaItemCatalogo, req.body).valor,
        ),
      ),
  );
  router.patch('/colaboradores/catalogos/:clave/items', ...gestion, async (req, res) => {
    const { clave } = validar(v.esquemaClaveCatalogo, req.params);
    const { anterior, nuevo } = validar(v.esquemaEditarItemCatalogo, req.body);
    res.json(await svc.editarCatalogoItem(req, clave, anterior, nuevo));
  });
  router.delete('/colaboradores/catalogos/:clave/items', ...gestion, async (req, res) =>
    res.json(
      await svc.eliminarCatalogoItem(
        req,
        validar(v.esquemaClaveCatalogo, req.params).clave,
        validar(v.esquemaItemCatalogo, req.body).valor,
      ),
    ),
  );

  router.post('/colaboradores/importar', ...soloAdmin, subirExcel, async (req, res) => {
    if (!req.file) throw invalido('Adjunte el libro de nómina (.xlsx o .xlsm).', { archivo: 'Adjunte el archivo.' });
    if (!/\.(xlsx|xlsm)$/i.test(req.file.originalname))
      throw invalido('El archivo debe ser .xlsx o .xlsm.', { archivo: 'Formato no permitido.' });
    const r =
      req.body?.confirmar === 'true'
        ? await importador.confirmar(req, req.file.buffer, String(req.body?.huella ?? ''))
        : await importador.vistaPrevia(req.file.buffer);
    res.json(r);
  });

  router.get('/colaboradores/:id', ...gestion, async (req, res) => res.json(await svc.detalle(req, validar(v.esquemaId, req.params).id)));
  router.patch('/colaboradores/:id', ...gestion, async (req, res) =>
    res.json(await svc.actualizar(req, validar(v.esquemaId, req.params).id, validar(v.esquemaCuerpo, req.body))),
  );
  router.delete('/colaboradores/:id', ...gestion, async (req, res) =>
    res.json(await svc.eliminar(req, validar(v.esquemaId, req.params).id)),
  );
  router.get('/colaboradores/:id/historial', ...gestion, async (req, res) =>
    res.json(await svc.historial(req, validar(v.esquemaId, req.params).id)),
  );
  router.get('/colaboradores/:id/cuenta', ...gestion, async (req, res) =>
    res.json(await svc.revelarCuenta(req, validar(v.esquemaId, req.params).id)),
  );
}
