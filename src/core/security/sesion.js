// Sesiones en servidor (tabla `sesiones`), cookie HttpOnly, CSRF por token sincronizado,
// expiración por inactividad y absoluta, y middlewares de autorización por rol.
import { ahora } from '../db.js';
import { noAutenticado, prohibido, ErrorApp } from '../errors.js';
import { tokenAleatorio, sha256, igualesSeguro } from './cripto.js';

const DURACION_ABSOLUTA_H = 8;
const RENOVAR_CADA_MS = 30_000;
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function nombresCookies(cfg) {
  // El prefijo __Host- exige Secure, Path=/ y sin Domain: solo en producción (HTTPS).
  return cfg.produccion
    ? { sesion: '__Host-th_sid', csrf: '__Host-th_csrf' }
    : { sesion: 'th_sid', csrf: 'th_csrf' };
}

export function leerCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    if (!(k in out)) {
      try {
        out[k] = decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        /* cookie mal formada: se ignora */
      }
    }
  }
  return out;
}

function opcionesCookie(cfg, maxAgeMs) {
  return { httpOnly: true, secure: cfg.produccion, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

export function crearSesiones(ctx) {
  const { db, cfg, params } = ctx;
  const nombres = nombresCookies(cfg);

  async function crear(req, res, usuario) {
    const token = tokenAleatorio(32);
    const csrf = tokenAleatorio(24);
    const t = new Date();
    await db('sesiones').insert({
      id_hash: sha256(token),
      usuario_id: usuario.id,
      csrf,
      creada_en: t.toISOString(),
      ultimo_uso: t.toISOString(),
      expira_absoluta: new Date(t.getTime() + DURACION_ABSOLUTA_H * 3600_000).toISOString(),
      ip: req.ip?.slice(0, 64),
      user_agent: req.get('user-agent')?.slice(0, 255),
    });
    res.cookie(nombres.sesion, token, opcionesCookie(cfg, DURACION_ABSOLUTA_H * 3600_000));
    res.clearCookie(nombres.csrf, { path: '/' });
    return csrf;
  }

  async function destruir(req, res) {
    const token = leerCookies(req)[nombres.sesion];
    if (token) await db('sesiones').where({ id_hash: sha256(token) }).del();
    res.clearCookie(nombres.sesion, { path: '/' });
  }

  const cerrarTodas = (usuarioId, exceptoHash = null) => {
    const q = db('sesiones').where({ usuario_id: usuarioId });
    if (exceptoHash) q.whereNot({ id_hash: exceptoHash });
    return q.del();
  };

  // Carga req.sesion y req.usuario si la cookie es válida. No exige sesión.
  async function cargar(req, res, next) {
    const token = leerCookies(req)[nombres.sesion];
    if (!token) return next();
    const idHash = sha256(token);
    const s = await db('sesiones').where({ id_hash: idHash }).first();
    if (!s) {
      res.clearCookie(nombres.sesion, { path: '/' });
      return next();
    }
    const now = Date.now();
    const minInactividad = Number(await params.valor('SESION_INACTIVIDAD_MIN'));
    const inactiva = now - Date.parse(s.ultimo_uso) > minInactividad * 60_000;
    const vencida = now > Date.parse(s.expira_absoluta);
    const u = await db('usuarios').where({ id: s.usuario_id }).first();
    if (inactiva || vencida || !u || !u.activo) {
      await db('sesiones').where({ id_hash: idHash }).del();
      res.clearCookie(nombres.sesion, { path: '/' });
      req.sesionExpirada = true;
      return next();
    }
    // La consulta de estado de sesión (polling del cliente) no cuenta como actividad.
    const sinRenovar = req.get('x-sin-renovar') === '1';
    if (!sinRenovar && now - Date.parse(s.ultimo_uso) > RENOVAR_CADA_MS) {
      await db('sesiones').where({ id_hash: idHash }).update({ ultimo_uso: ahora() });
      s.ultimo_uso = new Date(now).toISOString();
    }
    req.sesion = { ...s, idHash, minInactividad };
    req.usuario = {
      id: u.id,
      cedula: u.cedula,
      nombre: u.nombre,
      rol: u.rol,
      debeCambiarClave: !!u.debe_cambiar_clave,
      correo: u.correo,
      correoVerificado: !!u.correo_verificado_en,
    };
    req.usuario.cuentaLista = !req.usuario.debeCambiarClave && req.usuario.correoVerificado;
    next();
  }

  // Token CSRF para clientes sin sesión (login, recuperación): doble envío con cookie HttpOnly.
  function tokenCsrf(req, res) {
    if (req.sesion) return req.sesion.csrf;
    let t = leerCookies(req)[nombres.csrf];
    if (!t || t.length < 20) {
      t = tokenAleatorio(24);
      res.cookie(nombres.csrf, t, opcionesCookie(cfg, 2 * 3600_000));
    }
    return t;
  }

  function verificarCsrf(req, _res, next) {
    if (METODOS_SEGUROS.has(req.method)) return next();
    // Defensa adicional: si el navegador envía Origin, debe ser el de la app.
    const origen = req.get('origin');
    if (origen && origen !== new URL(cfg.appUrl).origin) {
      return next(new ErrorApp(403, 'CSRF', 'Solicitud no permitida desde otro sitio.'));
    }
    const enviado = req.get('x-csrf-token');
    const esperado = req.sesion ? req.sesion.csrf : leerCookies(req)[nombres.csrf];
    if (!igualesSeguro(enviado, esperado)) {
      return next(new ErrorApp(403, 'CSRF', 'La página estaba desactualizada. Recargue e intente de nuevo.'));
    }
    next();
  }

  return { crear, destruir, cerrarTodas, cargar, tokenCsrf, verificarCsrf, nombres };
}

// ---- Autorización -------------------------------------------------------------

// Exige sesión. Por defecto exige además que la cuenta haya completado el primer ingreso
// (clave cambiada y correo verificado); las rutas de ese proceso usan { onboarding: true }.
export function autenticado({ onboarding = false } = {}) {
  return (req, _res, next) => {
    if (!req.usuario) {
      const e = noAutenticado(req.sesionExpirada ? 'Su sesión se cerró por inactividad. Ingrese de nuevo.' : undefined);
      return next(e);
    }
    if (!onboarding && !req.usuario.cuentaLista) {
      return next(new ErrorApp(403, 'PRIMER_INGRESO', 'Antes de continuar debe cambiar su contraseña y verificar su correo.'));
    }
    next();
  };
}

export function rol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) return next(noAutenticado());
    if (!roles.includes(req.usuario.rol)) return next(prohibido());
    next();
  };
}

export const ROLES = Object.freeze({ COLABORADOR: 'COLABORADOR', DIRECTOR: 'DIRECTOR', ADMIN: 'ADMIN' });
