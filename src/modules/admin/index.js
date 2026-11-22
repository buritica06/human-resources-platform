// Módulo M8 – Panel del admincontable: resumen y alertas, parámetros con vigencia, festivos, flujos
// (pantalla sobre /flujos del motor), suspensiones, reporte de ausentismo (+CSV) y auditoría.
// Todas las rutas son solo para ADMIN, salvo ver las propias suspensiones.
import { z } from 'zod';
import { validar } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioParametros } from './parametros.js';
import { crearServicioSuspensiones } from './suspensiones.js';
import { crearReportes } from './reportes.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const esquemaClave = z.object({ clave: z.string().regex(/^[A-Z0-9_]{2,60}$/) });
const esquemaProgramar = z.object({ valor: z.unknown(), desde: z.string().max(10), motivo: z.string().max(200) });
const esquemaAnio = z.object({ anio: z.coerce.number().int().min(2020).max(2100) });
const esquemaFestivos = z.object({ festivos: z.array(z.object({ fecha: z.string().max(10), nombre: z.string().max(120) })).max(40) });
const esquemaSuspension = z.object({ fecha_inicio: z.string().max(10), fecha_fin: z.string().max(10), motivo: z.string().max(500) });
const esquemaMotivo = z.object({ motivo: z.string({ error: 'Escriba el motivo.' }).trim().min(5, 'Explique el motivo (mínimo 5 caracteres).').max(300) });
const esquemaAusentismo = z.object({ desde: fecha, hasta: fecha, sede: z.coerce.number().int().positive().optional(), formato: z.enum(['json', 'csv']).optional() });
const esquemaAuditoria = z.object({
  actor: z.string().regex(/^\d{3,15}$/).optional(), entidad: z.string().max(40).optional(), accion: z.string().max(30).optional(),
  desde: fecha.optional(), hasta: fecha.optional(), pagina: z.coerce.number().int().min(1).max(1000).optional(),
});

export default {
  nombre: 'admin',
  inicializar(ctx) {
    ctx.servicioSuspensiones = crearServicioSuspensiones(ctx);
    ctx.ausenciasExtra.push(async (trx, colaboradorId, desde, hasta) =>
      (await ctx.servicioSuspensiones.cruces(trx, colaboradorId, desde, hasta)).map((s) => ({ ...s, etiqueta: 'una suspensión registrada' })));
    ctx.diasNoLaborados.push(ctx.servicioSuspensiones.noLaborados);
  },
  api(router, ctx) {
    const params = crearServicioParametros(ctx);
    const sus = ctx.servicioSuspensiones;
    const rep = crearReportes(ctx);
    const admin = [autenticado(), rol(ROLES.ADMIN)];

    router.get('/admin/resumen', ...admin, async (_req, res) => res.json(await rep.resumen()));

    router.get('/parametros', ...admin, async (_req, res) => res.json({ parametros: await params.listar() }));
    router.post('/parametros/:clave/versiones', ...admin, async (req, res) =>
      res.status(201).json(await params.programar(req, validar(esquemaClave, req.params).clave, validar(esquemaProgramar, req.body))));
    router.delete('/parametros/versiones/:id', ...admin, async (req, res) => res.json(await params.borrarProgramada(req, validar(esquemaId, req.params).id)));

    router.get('/festivos/:anio', ...admin, async (req, res) => res.json({ festivos: await params.festivos(validar(esquemaAnio, req.params).anio) }));
    router.put('/festivos/:anio', ...admin, async (req, res) =>
      res.json({ festivos: await params.guardarFestivos(req, validar(esquemaAnio, req.params).anio, validar(esquemaFestivos, req.body).festivos) }));

    router.get('/me/suspensiones', autenticado(), async (req, res) => {
      const c = await ctx.db('colaboradores').where({ cedula: req.usuario.cedula }).first('id');
      res.json({ suspensiones: c ? await sus.deColaborador(req, c.id) : [] });
    });
    router.get('/colaboradores/:id/suspensiones', autenticado(), async (req, res) => res.json({ suspensiones: await sus.deColaborador(req, validar(esquemaId, req.params).id) }));
    router.post('/colaboradores/:id/suspensiones', ...admin, async (req, res) =>
      res.status(201).json(await sus.registrar(req, validar(esquemaId, req.params).id, validar(esquemaSuspension, req.body))));
    router.post('/suspensiones/:id/anular', ...admin, async (req, res) =>
      res.json(await sus.anular(req, validar(esquemaId, req.params).id, validar(esquemaMotivo, req.body).motivo)));

    router.get('/reportes/ausentismo', ...admin, async (req, res) => {
      const q = validar(esquemaAusentismo, req.query);
      const r = await rep.ausentismo(req, q);
      if (q.formato === 'csv') {
        res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ausentismo-${q.desde}-a-${q.hasta}.csv"`, 'Cache-Control': 'no-store' });
        return res.send(rep.ausentismoCsv(r));
      }
      res.json(r);
    });
    router.get('/auditoria', ...admin, async (req, res) => res.json(await rep.auditoria(req, validar(esquemaAuditoria, req.query))));
  },
  paginas: {
    '/admin': 'panel.html',
    '/admin/parametros': 'parametros.html',
    '/admin/festivos': 'festivos.html',
    '/admin/flujos': 'flujos.html',
    '/admin/ausentismo': 'ausentismo.html',
    '/admin/auditoria': 'auditoria.html',
  },
  menu: [{ texto: 'Panel', href: '/admin', icono: 'inicio', roles: ['ADMIN'], orden: 2 }],

};
