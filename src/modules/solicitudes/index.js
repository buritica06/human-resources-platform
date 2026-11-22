// Módulo M3 – Motor de solicitudes y aprobaciones (lo usan permisos, vacaciones y licencias)
import { montarRutasSolicitudes } from './routes.js';

export default {
  nombre: 'solicitudes',
  api: montarRutasSolicitudes,
  paginas: {
    '/solicitudes/ver': 'solicitud.html',
    '/aprobaciones': 'aprobaciones.html',
  },
  menu: [{ texto: 'Aprobaciones', href: '/aprobaciones', icono: 'ok', roles: ['DIRECTOR', 'ADMIN'], orden: 50 }],
  widgetsInicio: [{ script: '/m/solicitudes/widget-inicio.js', orden: 5 }],
};
