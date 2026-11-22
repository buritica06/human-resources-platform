// Punto de entrada: carga configuración, aplica migraciones pendientes y levanta el servidor.
import { cargarConfig } from './core/config.js';
import { crearContexto, crearApp } from './core/app.js';
import { migrar } from './core/db.js';
import { log } from './core/logger.js';
import { sembrarBase } from '../seeds/sembrar.js';

const cfg = cargarConfig();
const ctx = crearContexto(cfg);
await migrar(ctx.db);
// Parámetros y festivos nuevos de cada versión (idempotente; no toca datos de personas).
await sembrarBase(ctx.db);
const app = crearApp(ctx);

const servidor = app.listen(cfg.puerto, () => {
  log.info('Servidor iniciado', { url: cfg.appUrl, entorno: cfg.env, modulos: ctx.modulos.map((m) => m.nombre) });
});

// Limpieza periódica de sesiones vencidas
setInterval(async () => {
  try {
    await ctx.db('sesiones').where('expira_absoluta', '<', new Date().toISOString()).del();
  } catch (e) {
    log.warn('No se pudo limpiar sesiones', { error: e.message });
  }
}, 30 * 60_000).unref();

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    servidor.close(() => ctx.db.destroy().then(() => process.exit(0)));
  });
}
