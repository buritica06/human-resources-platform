// Salvaguarda: el repositorio nunca debe contener archivos de nómina reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..', '..');
const IGNORAR = new Set(['node_modules', '.git', 'data', 'uploads', 'backups']);
const PERMITIDOS = new Set(['empleados-ficticio.xlsx', 'empleados-con-errores.xlsx', 'sin-hoja-empleados.xlsx', 'parametros-malos.xlsx', 'empleados-variantes.xlsx']);

function recorrer(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, out);
    else out.push(p);
  }
  return out;
}

test('no hay libros de Excel fuera de los ficticios de tests/fixtures', () => {
  const excel = recorrer(RAIZ).filter((p) => /\.(xls|xlsx|xlsm|xlsb)$/i.test(p));
  const indebidos = excel.filter(
    (p) => !(path.dirname(p) === path.join(RAIZ, 'tests', 'fixtures') && PERMITIDOS.has(path.basename(p))),
  );
  assert.deepEqual(indebidos, []);
});

test('.gitignore excluye .env, datos locales y libros de Excel', () => {
  const gi = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
  for (const patron of ['.env', 'data/', 'uploads/', '*.xlsm', '*.xlsx', '*.xls']) {
    assert.ok(gi.split(/\r?\n/).includes(patron), `falta ${patron}`);
  }
});
