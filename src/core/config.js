// Configuración desde variables de entorno. Sin secretos en el código.
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..', '..');

if (fs.existsSync(path.join(RAIZ, '.env')) && process.env.NODE_ENV !== 'test') {
  process.loadEnvFile(path.join(RAIZ, '.env'));
}

const CLAVE_DESARROLLO = '6465736172726f6c6c6f2d736f6c6f2d6c6f63616c2d6e6f2d75736172000000';

function leer(nombre, porDefecto) {
  const v = process.env[nombre];
  return v === undefined || v === '' ? porDefecto : v;
}

export function cargarConfig(overrides = {}) {
  const env = leer('NODE_ENV', 'development');
  const cfg = {
    raiz: RAIZ,
    env,
    produccion: env === 'production',
    puerto: Number(leer('PORT', 3000)),
    appUrl: leer('APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
    db: {
      client: leer('DB_CLIENT', 'sqlite'),
      filename: path.resolve(RAIZ, leer('DB_FILENAME', './data/th.sqlite')),
      url: leer('DATABASE_URL', ''),
    },
    // Ver abajo: sin clave, solo en desarrollo/pruebas locales se usa una clave fija.
    claveCifrado: leer('DATA_ENCRYPTION_KEY', ''),
    modulos: leer('MODULES_ENABLED', 'auth,usuarios,colaboradores,nomina,notificaciones,solicitudes,permisos,vacaciones,incapacidades,licencias,certificados')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    correo: {
      transporte: leer('MAIL_TRANSPORT', 'console'),
      remitente: leer('MAIL_FROM', 'Talento Humano <no-responder@example.com>'),
      dir: path.resolve(RAIZ, 'data', 'correos'),
      smtp: {
        host: leer('SMTP_HOST', ''),
        port: Number(leer('SMTP_PORT', 587)),
        secure: leer('SMTP_SECURE', 'false') === 'true',
        user: leer('SMTP_USER', ''),
        pass: leer('SMTP_PASS', ''),
      },
    },
    almacenamiento: {
      driver: leer('STORAGE_DRIVER', 'local'),
      dir: path.resolve(RAIZ, leer('STORAGE_DIR', './uploads')),
    },
    trustProxy: Number(leer('TRUST_PROXY', 0)),
    ...overrides,
  };

  // Salvaguarda: un servidor publicado (https) sin NODE_ENV=production arrancaría con
  // cookies sin Secure, sin HSTS y con usuarios demo. Se impide.
  if (!cfg.produccion && cfg.env !== 'test' && cfg.appUrl.startsWith('https://')) {
    throw new Error('APP_URL usa https pero NODE_ENV no es "production". Configure NODE_ENV=production.');
  }
  cfg.esLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(cfg.appUrl);

  // Clave fija de cifrado SOLO para datos ficticios en desarrollo o pruebas en localhost.
  // En cualquier otro caso, sin DATA_ENCRYPTION_KEY la app no puede cifrar (falla al guardar
  // datos sensibles) y en producción ni siquiera arranca.
  if (!cfg.claveCifrado && !cfg.produccion && ['development', 'test'].includes(cfg.env) && cfg.esLocal) {
    cfg.claveCifrado = CLAVE_DESARROLLO;
    cfg.claveDesarrollo = true;
  }

  if (cfg.produccion) {
    if (!/^[0-9a-f]{64}$/i.test(cfg.claveCifrado) || cfg.claveCifrado === CLAVE_DESARROLLO) {
      throw new Error('DATA_ENCRYPTION_KEY debe ser 64 caracteres hex en producción.');
    }
    if (cfg.correo.transporte !== 'smtp') {
      throw new Error('En producción MAIL_TRANSPORT debe ser smtp.');
    }
  }
  return cfg;
}
