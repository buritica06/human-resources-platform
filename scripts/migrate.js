// Aplica las migraciones pendientes.
import { cargarConfig } from '../src/core/config.js';
import { crearDb, migrar } from '../src/core/db.js';

const cfg = cargarConfig();
const db = crearDb(cfg.db);
const [lote, archivos] = await migrar(db);
console.log(archivos.length ? `Migraciones aplicadas (lote ${lote}): ${archivos.join(', ')}` : 'La base de datos ya está al día.');
await db.destroy();
