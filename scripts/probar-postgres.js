// Corre TODAS las pruebas contra PostgreSQL (cada entorno de prueba crea y borra su propio esquema).
// Uso:  set TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/th_pruebas  &&  npm run test:pg
// La base debe existir y el usuario debe poder crear esquemas. No use la base de producción.
import { spawnSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('Falta TEST_DATABASE_URL (p. ej. postgres://usuario:clave@localhost:5432/th_pruebas).');
  process.exit(2);
}
if (/prod/i.test(url)) {
  console.error('Por seguridad, TEST_DATABASE_URL no puede apuntar a una base cuyo nombre contenga "prod".');
  process.exit(2);
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=120000', 'tests/**/*.test.js'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
