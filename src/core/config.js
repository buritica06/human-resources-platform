// Configuración desde variables de entorno. Sin secretos en el código.
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..', '..');

if (fs.existsSync(path.join(RAIZ, '.env')) && process.env.NODE_ENV !== 'test') {
  process.loadEnvFile(path.join(RAIZ, '.env'));
}

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
    claveCifrado: leer('DATA_ENCRYPTION_KEY', ''),
    modulos: leer('MODULES_ENABLED', 'auth,usuarios')
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

  if (cfg.produccion) {
    if (!/^[0-9a-f]{64}$/i.test(cfg.claveCifrado)) {
      throw new Error('DATA_ENCRYPTION_KEY debe ser 64 caracteres hex en producción.');
    }
    if (cfg.correo.transporte !== 'smtp') {
      throw new Error('En producción MAIL_TRANSPORT debe ser smtp.');
    }
  }
  return cfg;
}
