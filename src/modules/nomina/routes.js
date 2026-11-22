// Rutas de nómina y volantes.
//  /nomina/*                 → solo admincontable (cargar, revisar, publicar, anular)
//  /me/volantes*, /volantes/* → el colaborador (solo los suyos publicados) y el admincontable
import multer from 'multer';
import { z } from 'zod';
import { validar, invalido } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioNomina } from './service.js';
import { pdfVolante } from './pdf.js';

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const esquemaAnio = z.object({ anio: z.coerce.number().int().min(2000).max(2100).optional() });
const esquemaAnular = z.object({ motivo: z.string({ error: 'Escriba el motivo.' }).trim().min(5, 'Explique el motivo (mínimo 5 caracteres).').max(300) });

export function montarRutasNomina(router, ctx) {
  const svc = crearServicioNomina(ctx);
  const sesion = autenticado();
  const soloAdmin = [sesion, rol(ROLES.ADMIN)];
  const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 10 } }).single('archivo');
  const archivoExcel = (req) => {
    if (!req.file) throw invalido('Adjunte el libro de nómina (.xlsx o .xlsm).', { archivo: 'Adjunte el archivo.' });
    if (!/\.(xlsx|xlsm)$/i.test(req.file.originalname)) throw invalido('El archivo debe ser .xlsx o .xlsm.', { archivo: 'Formato no permitido.' });
    return req.file.buffer;
  };

  // Paso 1: lista las hojas NOMINA del libro
  router.post('/nomina/hojas', ...soloAdmin, subir, async (req, res) => res.json(await svc.hojas(archivoExcel(req))));
  // Paso 2: valida y, si todo está bien, deja el periodo en BORRADOR
  router.post('/nomina/cargas', ...soloAdmin, subir, async (req, res) => {
    const buffer = archivoExcel(req);
    const hoja = String(req.body?.hoja ?? '').slice(0, 60);
    if (!hoja) throw invalido('Elija la hoja de la quincena.', { hoja: 'Elija una hoja.' });
    res.json(await svc.cargar(req, buffer, {
      hoja, huella: String(req.body?.huella ?? ''), nombreArchivo: req.file.originalname,
      crearExpedientes: req.body?.crearExpedientes === 'true',
    }));
  });
  router.get('/nomina/periodos', ...soloAdmin, async (req, res) => res.json(await svc.periodos(validar(esquemaAnio, req.query))));
  router.get('/nomina/periodos/:id', ...soloAdmin, async (req, res) => res.json(await svc.periodo(req, validar(esquemaId, req.params).id)));
  router.post('/nomina/periodos/:id/publicar', ...soloAdmin, async (req, res) => res.json(await svc.publicar(req, validar(esquemaId, req.params).id)));
  router.post('/nomina/periodos/:id/anular', ...soloAdmin, async (req, res) =>
    res.json(await svc.anular(req, validar(esquemaId, req.params).id, validar(esquemaAnular, req.body).motivo)));
  router.delete('/nomina/periodos/:id', ...soloAdmin, async (req, res) => {
    await svc.eliminarBorrador(req, validar(esquemaId, req.params).id);
    res.status(204).end();
  });
  router.get('/nomina/colaboradores/:id/volantes', ...soloAdmin, async (req, res) =>
    res.json(await svc.volantesDeColaborador(req, validar(esquemaId, req.params).id, validar(esquemaAnio, req.query))));

  router.get('/me/volantes', sesion, async (req, res) => res.json(await svc.misVolantes(req, validar(esquemaAnio, req.query))));
  router.get('/me/volantes/ultimo', sesion, async (req, res) => res.json(await svc.ultimoVolante(req)));
  router.get('/volantes/:id', sesion, async (req, res) => res.json(await svc.verVolante(req, validar(esquemaId, req.params).id)));
  router.get('/volantes/:id/pdf', sesion, async (req, res) => {
    const v = await svc.datosPdf(req, validar(esquemaId, req.params).id);
    const pdf = await pdfVolante(v);
    const nombre = `volante-${v.periodo.inicio}-${v.periodo.fin}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.descargar === '1' ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  });
}
