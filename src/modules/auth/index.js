// Módulo M0 – Autenticación y cuenta
import { montarRutasAuth } from './routes.js';

export default {
  nombre: 'auth',
  api: montarRutasAuth,
  paginas: {
    '/login': 'login.html',
    '/recuperar': 'recuperar.html',
    '/restablecer': 'restablecer.html',
    '/bienvenida': 'bienvenida.html',
    '/verificar-correo': 'verificar-correo.html',
    '/cuenta': 'cuenta.html',
  },
  menu: [
    { texto: 'Inicio', href: '/inicio', icono: 'inicio', orden: 0 },
    { texto: 'Mi cuenta', href: '/cuenta', icono: 'llave', orden: 90 },
  ],
};
