// Módulo M0 – Gestión de usuarios (admincontable)
import { montarRutasUsuarios } from './routes.js';

export default {
  nombre: 'usuarios',
  api: montarRutasUsuarios,
  paginas: { '/usuarios': 'usuarios.html' },
  menu: [{ texto: 'Usuarios', href: '/usuarios', icono: 'usuarios', roles: ['ADMIN'], orden: 80 }],
};
