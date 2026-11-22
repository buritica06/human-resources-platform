// Módulo M2 – Nómina y volantes de pago
import { montarRutasNomina } from './routes.js';

export default {
  nombre: 'nomina',
  api: montarRutasNomina,
  paginas: {
    '/volantes': 'volantes.html',
    '/volantes/ver': 'volante.html',
    '/nomina': 'nomina.html',
    '/nomina/periodo': 'periodo.html',
  },
  menu: [
    { texto: 'Mis volantes', href: '/volantes', icono: 'recibo', orden: 20 },
    { texto: 'Nómina', href: '/nomina', icono: 'subir', roles: ['ADMIN'], orden: 60 },
  ],
  // Tarjeta en Inicio y pestaña "Nómina" del expediente
  widgetsInicio: [{ script: '/m/nomina/widget-inicio.js', orden: 10 }],
  pestanasExpediente: [{ clave: 'nomina', script: '/m/nomina/pestana-expediente.js' }],
};
