// Crea el primer admincontable (útil en producción, donde no hay usuarios demo).
// Uso: npm run crear-admin -- <cedula> "<APELLIDOS NOMBRES>"
// Muestra la contraseña temporal UNA sola vez; en el primer ingreso se obliga a cambiarla.
import { cargarConfig } from '../src/core/config.js';
import { crearDb, migrar, ahora } from '../src/core/db.js';
import { hashClave, generarClaveTemporal } from '../src/core/security/claves.js';

const [cedula, nombre] = process.argv.slice(2);
if (!/^\d{5,12}$/.test(cedula ?? '') || !nombre || nombre.trim().length < 3) {
  console.error('Uso: npm run crear-admin -- <cedula> "<APELLIDOS NOMBRES>"');
  process.exit(1);
}
const cfg = cargarConfig();
const db = crearDb(cfg.db);
await migrar(db);
if (await db('usuarios').where({ cedula }).first()) {
  console.error('Ya existe un usuario con esa cédula.');
  await db.destroy();
  process.exit(1);
}
const clave = generarClaveTemporal();
const t = ahora();
await db('usuarios').insert({
  cedula, nombre: nombre.trim().toUpperCase(), rol: 'ADMIN', password_hash: await hashClave(clave),
  debe_cambiar_clave: true, clave_temporal_expira: new Date(Date.now() + 72 * 3600_000).toISOString(),
  creado_en: t, actualizado_en: t,
});
console.log(`Admincontable creado. Contraseña temporal (vence en 72 h, cópiela ahora): ${clave}`);
await db.destroy();
