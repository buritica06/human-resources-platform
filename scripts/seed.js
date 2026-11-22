// Siembra parámetros y festivos. Fuera de producción agrega organización y usuarios
// FICTICIOS cuya contraseña se toma de SEED_PASSWORD (por defecto, la de README).
import { cargarConfig } from '../src/core/config.js';
import { crearDb, migrar } from '../src/core/db.js';
import { sembrarBase, sembrarDemo, USUARIOS_DEMO } from '../seeds/sembrar.js';

const cfg = cargarConfig();
const db = crearDb(cfg.db);
await migrar(db);
await sembrarBase(db);
console.log('Parámetros y festivos cargados.');
// Usuarios demo (clave publicada en README) SOLO en desarrollo local.
if (!cfg.produccion && cfg.esLocal) {
  await sembrarDemo(db, { clave: process.env.SEED_PASSWORD || 'Demo2026clave' });
  console.log('Datos ficticios de desarrollo cargados. Usuarios demo (cédula / rol):');
  for (const u of USUARIOS_DEMO) console.log(`  ${u.cedula}  ${u.rol}`);
  console.log('La contraseña de los usuarios demo está en README.md (o en SEED_PASSWORD).');
} else {
  console.log('Entorno no local: no se crean usuarios demo. Cree el primer admincontable con: npm run crear-admin');
}
await db.destroy();
