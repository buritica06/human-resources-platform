// Rutas /api/v1/auth/*
import { rateLimit } from 'express-rate-limit';
import { validar } from '../../core/errors.js';
import { autenticado } from '../../core/security/sesion.js';
import { menuPara } from '../../core/modules.js';
import { crearServicioAuth, primerNombre } from './service.js';
import * as v from './validators.js';

export function montarRutasAuth(router, ctx) {
  const svc = crearServicioAuth(ctx);
  const limitar = (max) =>
    rateLimit({
      windowMs: ctx.limites.ventanaMs,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' } }),
    });

  router.get('/auth/csrf', (req, res) => res.json({ csrf: ctx.sesiones.tokenCsrf(req, res) }));

  router.post('/auth/login', limitar(ctx.limites.login), async (req, res) => {
    const datos = validar(v.esquemaLogin, req.body);
    const r = await svc.login(req, res, datos);
    res.json(r);
  });

  router.post('/auth/logout', async (req, res) => {
    if (req.usuario) await ctx.auditar(req, { accion: 'LOGOUT', entidad: 'usuario', entidadId: req.usuario.id });
    await ctx.sesiones.destruir(req, res);
    res.status(204).end();
  });

  // Estado de la sesión y de la cuenta (lo usa el shell de todas las páginas).
  router.get('/auth/me', autenticado({ onboarding: true }), async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: {
        nombre: u.nombre,
        saludo: primerNombre(u.nombre),
        rol: u.rol,
        correo: u.correo,
        correoVerificado: u.correoVerificado,
        debeCambiarClave: u.debeCambiarClave,
        cuentaLista: u.cuentaLista,
      },
      csrf: req.sesion.csrf,
      inactividadMin: req.sesion.minInactividad,
      menu: u.cuentaLista ? menuPara(ctx.modulos, u.rol) : [],
    });
  });

  router.post('/auth/cambiar-clave', autenticado({ onboarding: true }), async (req, res) => {
    await svc.cambiarClave(req, validar(v.esquemaCambiarClave, req.body));
    res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  });

  router.post('/auth/correo', autenticado({ onboarding: true }), limitar(ctx.limites.recuperar), async (req, res) => {
    if (req.usuario.debeCambiarClave) {
      return res.status(403).json({ error: { codigo: 'PRIMER_INGRESO', mensaje: 'Primero cambie su contraseña temporal.' } });
    }
    await svc.registrarCorreo(req, validar(v.esquemaCorreo, req.body));
    res.json({ ok: true, mensaje: 'Le enviamos un enlace de confirmación. Revise su correo (también la carpeta de spam).' });
  });

  router.post('/auth/verificar-correo', async (req, res) => {
    await svc.verificarCorreo(req, validar(v.esquemaToken, req.body));
    res.json({ ok: true, mensaje: 'Correo confirmado.' });
  });

  router.post('/auth/recuperar', limitar(ctx.limites.recuperar), async (req, res) => {
    await svc.solicitarRecuperacion(req, validar(v.esquemaRecuperar, req.body));
    res.json({
      ok: true,
      mensaje: 'Si la cédula está registrada y tiene un correo confirmado, le enviamos un enlace para crear una nueva contraseña.',
    });
  });

  router.post('/auth/restablecer', limitar(ctx.limites.recuperar), async (req, res) => {
    await svc.restablecer(req, validar(v.esquemaRestablecer, req.body));
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Ya puede ingresar.' });
  });
}
