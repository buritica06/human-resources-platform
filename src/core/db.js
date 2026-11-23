// Conexión a base de datos con Knex: SQLite en local, PostgreSQL en producción.
import fs from 'node:fs';
import path from 'node:path';
import knexFactory from 'knex';

export const DIR_MIGRACIONES = path.resolve(import.meta.dirname, '..', '..', 'migrations');

export function crearDb(cfgDb) {
  if (cfgDb.client === 'pg') {
    return knexFactory({
      client: 'pg',
      connection: cfgDb.url,
      compileSqlOnError: false, // los mensajes de error no incluyen los valores (datos personales)
      // schema: opcional (las pruebas con PostgreSQL usan un esquema temporal por entorno)
      ...(cfgDb.schema ? { searchPath: [cfgDb.schema] } : {}),
      pool: { min: 0, max: 10 },
    });
  }
  fs.mkdirSync(path.dirname(cfgDb.filename), { recursive: true });
  return knexFactory({
    client: 'better-sqlite3',
    connection: { filename: cfgDb.filename },
    compileSqlOnError: false,
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done();
      },
    },
  });
}

export async function migrar(db) {
  return db.migrate.latest({ directory: DIR_MIGRACIONES, loadExtensions: ['.js'] });
}

// Fecha/hora ISO en UTC para guardar en la BD (portátil entre motores)
export const ahora = () => new Date().toISOString();
