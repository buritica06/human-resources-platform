// Construcción de la aplicación Express: seguridad, sesión, módulos, páginas y errores.
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { crearDb } from './db.js';
import { crearParametros } from './parametros.js';
import { crearAuditoria } from './audit.js';
import { crearMailer } from './mailer.js';
import { crearCifrador } from './security/cripto.js';
import { crearSesiones } from './security/sesion.js';
import { crearTokens } from './security/tokens.js';
import { modulosActivos } from './modules.js';
import { crearAlmacenamiento } from './storage/index.js';
import { crearDocumentos } from './documentos.js';
import { crearNotificaciones } from './notificaciones.js';
import { ErrorApp } from './errors.js';
import { log } from './logger.js';

const DIR_PUBLICO = path.resolve(import.meta.dirname, '..', 'public');
const DIR_VISTAS_CORE = path.resolve(import.meta.dirname, 'views');
const DIR_MODULOS = path.resolve(import.meta.dirname, '..', 'modules');

// Contexto compartido que reciben todos los módulos.
export function crearContexto(cfg, { db } = {}) {
  const ctx = { cfg };
  ctx.db = db ?? crearDb(cfg.db);
  ctx.params = crearParametros(ctx.db);
  ctx.auditar = crearAuditoria(ctx.db);
  ctx.mailer = crearMailer(cfg);
  ctx.cifrador = crearCifrador(cfg.claveCifrado);
  ctx.tokens = crearTokens(ctx.db);
  ctx.sesiones = crearSesiones(ctx);
  ctx.almacenamiento = crearAlmacenamiento(cfg);
  ctx.documentos = crearDocumentos(ctx);
  ctx.notificaciones = crearNotificaciones(ctx);
  ctx.tiposSolicitud = new Map(); // los registran los módulos (permisos, vacaciones, licencias)
  ctx.ausenciasExtra = []; // búsquedas de otras ausencias para evitar cruces (p. ej. incapacidades)
  ctx.diasNoLaborados = []; // periodos que no cuentan para causar vacaciones (p. ej. suspensiones)
  ctx.validadoresParametros = new Map(); // clave → (valor) => mensaje de error | null (panel M8)
  ctx.modulos = modulosActivos(cfg);
  // Intentos FALLIDOS por IP en la ventana (los exitosos no cuentan).
  ctx.limites = { login: 30, recuperar: 10, ventanaMs: 15 * 60_000 };
  // Gancho de inicio de cada módulo (antes de montar rutas): p. ej. registrar un tipo de solicitud
  for (const m of ctx.modulos) m.inicializar?.(ctx);
  return ctx;
}

export function crearApp(ctx) {
  const { cfg } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': cfg.produccion ? [] : null,
        },
      },
      strictTransportSecurity: cfg.produccion,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Archivos estáticos comunes (CSS, JS, imágenes) y de cada módulo.
  app.use('/static', express.static(DIR_PUBLICO, { maxAge: cfg.produccion ? '1d' : 0, index: false }));
  for (const m of ctx.modulos) {
    app.use(`/m/${m.nombre}`, express.static(path.join(DIR_MODULOS, m.nombre, 'views'), { index: false, extensions: [] }));
  }

  // API
  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(ctx.sesiones.cargar);
  api.use(ctx.sesiones.verificarCsrf);
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  for (const m of ctx.modulos) m.api?.(api, ctx);
  api.use((_req, _res, next) => next(new ErrorApp(404, 'NO_ENCONTRADO', 'Ruta no encontrada.')));
  app.use('/api/v1', api);

  // Páginas HTML (los datos siempre llegan por la API con control de acceso).
  const enviarPagina = (archivo) => (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(archivo);
  };
  app.get('/', (_req, res) => res.redirect('/inicio'));
  app.get('/inicio', enviarPagina(path.join(DIR_VISTAS_CORE, 'inicio.html')));
  for (const m of ctx.modulos) {
    for (const [ruta, archivo] of Object.entries(m.paginas ?? {})) {
      app.get(ruta, enviarPagina(path.join(DIR_MODULOS, m.nombre, 'views', archivo)));
    }
  }
  app.use((_req, res) => res.status(404).sendFile(path.join(DIR_VISTAS_CORE, '404.html')));

  // Manejo de errores: mensajes claros al usuario, sin filtrar detalles internos.
  app.use((err, req, res, _next) => {
    let e = err;
    if (err instanceof multer.MulterError) {
      e = new ErrorApp(400, 'ARCHIVO_INVALIDO', err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido.' : 'No se pudo recibir el archivo.');
    } else if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      e = new ErrorApp(400, 'DATOS_INVALIDOS', 'La solicitud no tiene un formato válido.');
    }
    if (!(e instanceof ErrorApp)) {
      log.error('Error no controlado', { ruta: req.path, metodo: req.method, error: err?.message, stack: cfg.produccion ? undefined : err?.stack });
      e = new ErrorApp(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado. Intente de nuevo en unos minutos.');
    }
    res.status(e.status).json({ error: { codigo: e.codigo, mensaje: e.message, ...(e.campos ? { campos: e.campos } : {}) } });
  });

  return app;
}
