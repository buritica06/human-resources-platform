// Copia de seguridad de la base de datos con rotación.
// SQLite: copia en caliente con la API de respaldo. PostgreSQL: pg_dump (formato custom).
// Uso: npm run backup  (variables: BACKUP_DIR=./backups, BACKUP_KEEP=14)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { cargarConfig } from '../src/core/config.js';

const cfg = cargarConfig();
const dir = path.resolve(cfg.raiz, process.env.BACKUP_DIR || './backups');
const conservar = Number(process.env.BACKUP_KEEP || 14);
fs.mkdirSync(dir, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, '-');

let destino;
if (cfg.db.client === 'pg') {
  destino = path.join(dir, `th-${sello}.dump`);
  const r = spawnSync('pg_dump', ['--format=custom', `--file=${destino}`, cfg.db.url], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('pg_dump falló. Verifique que esté instalado y que DATABASE_URL sea correcta.');
    process.exit(1);
  }
} else {
  destino = path.join(dir, `th-${sello}.sqlite`);
  const db = new Database(cfg.db.filename, { readonly: true, fileMustExist: true });
  await db.backup(destino);
  db.close();
}
console.log(`Copia creada: ${destino}`);

// Rotación: conserva las N más recientes
const copias = fs
  .readdirSync(dir)
  .filter((f) => /^th-.*\.(sqlite|dump)$/.test(f))
  .sort()
  .reverse();
for (const viejo of copias.slice(conservar)) fs.rmSync(path.join(dir, viejo));
