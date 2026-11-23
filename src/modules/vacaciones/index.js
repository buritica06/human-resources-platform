// Módulo M4 – Vacaciones. Requiere el módulo "solicitudes" (motor y flujo).
// Rutas propias: saldo, simulación (días hábiles, regreso y validaciones) y registro del saldo al
// corte (admincontable). Crear, enviar, aprobar y cancelar van por las rutas genéricas del motor.
import { z } from 'zod';
import { validar, noEncontrado } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioVacaciones } from './servicio.js';
import { crearTipoVacaciones } from './tipo.js';
import { hoyBogota, sumarDias } from './calendario.js';

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const esquemaCorte = z.object({
  fecha_corte: z.string().max(10),
  // Número o texto numérico (con punto o coma decimal); vacío, null o booleanos se rechazan
  dias: z.union([z.number(), z.string().trim().regex(/^-?\d+([.,]\d{1,2})?$/)], { error: 'Escriba los días (hasta dos decimales).' })
    .transform((v) => (typeof v === 'number' ? v : Number(v.replace(',', '.')))),
  observacion: z.string().max(300),
});

export default {
  nombre: 'vacaciones',
  inicializar(ctx) {
    ctx.servicioVacaciones = crearServicioVacaciones(ctx);
    ctx.tiposSolicitud.set('VACACIONES', crearTipoVacaciones(ctx.servicioVacaciones));
  },
  api(router, ctx) {
    const svc = ctx.servicioVacaciones;
    const sesion = autenticado();
    const colaboradorPropio = (req) => ctx.db('colaboradores').where({ cedula: req.usuario.cedula }).first();

    // Colaborador dentro del alcance de quien consulta (el propio; admin todos; director sus sedes)
    async function colaboradorEnAlcance(req, id) {
      const c = await ctx.db('colaboradores').where({ id }).first();
      let ok = false;
      if (c) {
        if (c.cedula === req.usuario.cedula || req.usuario.rol === ROLES.ADMIN) ok = true;
        else if (req.usuario.rol === ROLES.DIRECTOR) ok = (await ctx.servicioSolicitudes.motor.sedesDirector(req.usuario.id)).includes(c.sede_id);
      }
      if (!ok) {
        await ctx.auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'colaborador', entidadId: id, detalle: { recurso: 'vacaciones' } });
        throw noEncontrado('No encontramos ese colaborador.');
      }
      return c;
    }

    // Opciones del formulario: reglas vigentes y festivos del próximo año (para el calendario)
    router.get('/vacaciones/opciones', sesion, async (_req, res) => {
      const p = await svc.parametros();
      const hoy = hoyBogota();
      const { mapa } = await svc.festivosDesde(Number(hoy.slice(0, 4)));
      const hasta = sumarDias(hoy, 400);
      res.json({
        hoy, sabadoHabil: p.sabadoHabil, pctCompensacion: p.pctCompensacion, diasPorAnio: p.diasAnio,
        festivos: [...mapa].filter(([f]) => f >= hoy && f <= hasta).map(([fecha, nombre]) => ({ fecha, nombre })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      });
    });

    router.get('/me/vacaciones/saldo', sesion, async (req, res) => {
      const c = await colaboradorPropio(req);
      if (!c) return res.json({ sinExpediente: true });
      res.json(await svc.saldo(c));
    });

    // Simulación: mismas validaciones que al crear, sin guardar nada
    router.post('/vacaciones/simular', sesion, async (req, res) => {
      const c = await colaboradorPropio(req);
      if (!c) throw noEncontrado('Su cuenta no tiene expediente de colaborador.');
      res.json((await svc.planear(c, req.body ?? {})).plan);
    });

    // Saldo e historial de cortes de un colaborador (expediente)
    router.get('/colaboradores/:id/vacaciones', sesion, async (req, res) => {
      const c = await colaboradorEnAlcance(req, validar(esquemaId, req.params).id);

      if (c.cedula !== req.usuario.cedula) await ctx.auditar(req, { accion: 'VER_VACACIONES', entidad: 'colaborador', entidadId: c.id });
      let saldo = await svc.saldo(c);
      // El director ve solo lo necesario para aprobar: el desglose revelaría suspensiones o licencias no remuneradas
      if (req.usuario.rol === ROLES.DIRECTOR && c.cedula !== req.usuario.cedula && saldo.registrado) {
        saldo = { registrado: true, disponibles: saldo.disponibles, enTramite: saldo.enTramite, paraSolicitar: saldo.paraSolicitar, resumido: true };
      }
      res.json({ saldo, cortes: req.usuario.rol === ROLES.ADMIN ? await svc.cortes(c.id) : [], puedeRegistrar: req.usuario.rol === ROLES.ADMIN });
    });

    router.post('/colaboradores/:id/vacaciones/corte', sesion, rol(ROLES.ADMIN), async (req, res) => {
      const { id } = validar(esquemaId, req.params);
      await svc.registrarCorte(req, id, validar(esquemaCorte, req.body));
      const c = await ctx.db('colaboradores').where({ id }).first();
      res.status(201).json({ saldo: await svc.saldo(c), cortes: await svc.cortes(id) });
    });
  },
  paginas: { '/vacaciones': 'vacaciones.html', '/vacaciones/nueva': 'nueva.html' },
  menu: [{ texto: 'Mis vacaciones', href: '/vacaciones', icono: 'sombrilla', orden: 31 }],
  widgetsInicio: [{ script: '/m/vacaciones/widget-inicio.js', orden: 4 }],
  pestanasExpediente: [{ clave: 'vacaciones', script: '/m/vacaciones/pestana-expediente.js' }],
};
