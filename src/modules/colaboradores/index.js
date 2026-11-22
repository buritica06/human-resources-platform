// Módulo M1 – Expediente del colaborador (hoja de vida)
import { montarRutasColaboradores } from './routes.js';

export default {
  nombre: 'colaboradores',
  api: montarRutasColaboradores,
  paginas: {
    '/expediente': 'expediente.html',
    '/colaboradores': 'colaboradores.html',
    '/colaboradores/ver': 'expediente.html',
  },
  menu: [
    { texto: 'Mi expediente', href: '/expediente', icono: 'documento', orden: 10 },
    { texto: 'Colaboradores', href: '/colaboradores', icono: 'usuarios', roles: ['ADMIN', 'DIRECTOR'], orden: 70 },
  ],
};
