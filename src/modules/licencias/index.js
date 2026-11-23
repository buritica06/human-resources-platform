// Módulo M6 – Licencias. Reutiliza el motor de solicitudes (mismo flujo, estados, notificaciones,
// cruces y documentos); aquí solo van el tipo y las opciones del formulario.
import { autenticado } from '../../core/security/sesion.js';
import { crearTipoLicencia, diasAtrasLicencia, listaLicenciasValida, tiposLicencia } from './tipo.js';
import { hoyBogota } from '../vacaciones/calendario.js';

export default {
  nombre: 'licencias',
  inicializar(ctx) {
    ctx.tiposSolicitud.set('LICENCIA', crearTipoLicencia());
    ctx.validadoresParametros.set('LISTA_TIPOS_LICENCIA', (v) =>
      listaLicenciasValida(v)
        ? null
        : 'Cada tipo necesita: nombre único, código, unidad (calendario u hábiles), diasMax (entero hasta 366 o null) y remunerada, soporteObligatorio, sensible y descuentaVacaciones como true o false.',
    );
  },
  api(router, ctx) {
    router.get('/licencias/opciones', autenticado(), async (_req, res) => {
      const tipos = (await tiposLicencia(ctx)).map((t) => ({
        nombre: t.nombre,
        unidad: t.unidad,
        diasMax: t.diasMax,
        remunerada: !!t.remunerada,
        soporteObligatorio: !!t.soporteObligatorio,
        sensible: !!t.sensible,
      }));
      res.json({
        tipos,
        hoy: hoyBogota(),
        maxMb: Number(await ctx.params.valor('UPLOAD_MAX_MB')),
        diasAtras: await diasAtrasLicencia(ctx),
      });
    });
    // Cálculo en vivo de los días (mismas reglas que al crear; no guarda nada)
    router.post('/licencias/calcular', autenticado(), async (req, res) => {
      const b = req.body ?? {};
      const campos = await ctx.tiposSolicitud
        .get('LICENCIA')
        .validar(ctx, { body: { subtipo: b.subtipo, fecha_inicio: b.fecha_inicio, fecha_fin: b.fecha_fin, motivo: 'cálculo en vivo' } });
      res.json({ dias: campos.datos.dias, unidad: campos.datos.unidad, remunerada: campos.datos.remunerada });
    });
  },
  paginas: { '/licencias': 'licencias.html', '/licencias/nueva': 'nueva.html' },
  menu: [{ texto: 'Mis licencias', href: '/licencias', icono: 'calendario', orden: 33 }],
  // Pestaña Licencias: las solicitudes de licencia y, si el panel (M8) está activo, las suspensiones
  pestanasExpediente: [{ clave: 'licencias', script: '/m/licencias/pestana-expediente.js' }],
};
