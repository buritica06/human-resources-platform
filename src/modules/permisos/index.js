// Módulo M3 – Solicitud de permisos. Requiere el módulo "solicitudes" (motor y flujo).
import { tipoPermiso } from './tipo.js';
import { autenticado } from '../../core/security/sesion.js';

export default {
  nombre: 'permisos',
  inicializar(ctx) {
    ctx.tiposSolicitud.set('PERMISO', tipoPermiso);
  },
  api(router, ctx) {
    // Opciones del formulario (tipos de permiso y duración máxima)
    router.get('/permisos/opciones', autenticado(), async (_req, res) =>
      res.json({ tipos: await ctx.params.valor('LISTA_TIPOS_PERMISO'), maxDias: Number(await ctx.params.valor('PERMISO_MAX_DIAS')), maxMb: Number(await ctx.params.valor('UPLOAD_MAX_MB')) }));
  },
  paginas: { '/permisos': 'permisos.html', '/permisos/nuevo': 'nuevo.html' },
  menu: [{ texto: 'Mis permisos', href: '/permisos', icono: 'reloj', orden: 30 }],
  pestanasExpediente: [{ clave: 'permisos', script: '/m/solicitudes/pestana-expediente.js' }],
};
