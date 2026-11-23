import '../helpers/entorno.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { crearEntorno } from '../helpers/app.js';
import { crearParametros } from '../../src/core/parametros.js';
import { leerLibro, leerEmpleados } from '../../src/modules/usuarios/excel.js';
import { primerNombre } from '../../src/modules/auth/service.js';

const FIX = path.resolve(import.meta.dirname, '..', 'fixtures');
let env;
before(async () => {
  env = await crearEntorno();
});
after(() => env.cerrar());

test('parámetros: devuelve el valor vigente según la fecha (Ley 2466 gradual)', async () => {
  const p = crearParametros(env.ctx.db);
  assert.equal(await p.valor('F_DOM', '2026-08-01'), 0.9);
  assert.equal(await p.valor('F_DOM', '2027-06-30'), 0.9);
  assert.equal(await p.valor('F_DOM', '2027-07-01'), 1.0);
  assert.equal(await p.valor('SMMLV', '2026-11-21'), 1750905);
  assert.equal(await p.valor('SABADO_HABIL'), true);
  await assert.rejects(() => p.valor('F_DOM', '2026-06-30'), /no configurado/);
  await assert.rejects(() => p.valor('NO_EXISTE'), /no configurado/);
});

test('festivos 2026–2027 cargados (18 por año)', async () => {
  const filas = await env.ctx.db('festivos').select('anio').count({ n: '*' }).groupBy('anio');
  assert.deepEqual(
    filas.map((f) => [f.anio, Number(f.n)]),
    [
      [2026, 18],
      [2027, 18],
    ],
  );
});

test('lector EMPLEADOS: libro ficticio válido', async () => {
  const libro = await leerLibro(fs.readFileSync(path.join(FIX, 'empleados-ficticio.xlsx')));
  const { filas, errores } = leerEmpleados(libro);
  assert.equal(errores.length, 0);
  assert.equal(filas.length, 8);
  assert.equal(filas.filter((f) => f.estado === 'ACTIVO').length, 7);
  assert.deepEqual(filas[0], { fila: 5, cedula: '2000000001', nombre: 'ACOSTA BELTRAN CAMILO ANDRES', estado: 'ACTIVO' });
});

test('lector EMPLEADOS: detecta cédulas repetidas/no numéricas y nombres inválidos', async () => {
  const libro = await leerLibro(fs.readFileSync(path.join(FIX, 'empleados-con-errores.xlsx')));
  const { filas, errores } = leerEmpleados(libro);
  assert.equal(filas.length, 4);
  assert.equal(errores.length, 4);
  assert.match(errores[0].mensaje, /repetida/);
  assert.match(errores[1].mensaje, /no numéricos/);
  assert.match(errores[2].mensaje, /caracteres no permitidos/, 'fórmula en el nombre');
  assert.match(errores[3].mensaje, /demasiado largo/, 'nombre de más de 150 caracteres');
  const decimal = filas.find((f) => f.nombre.startsWith('PEÑA'));
  assert.equal(decimal.cedula, '30000000', '"30000000.0" no debe convertirse en 300000000');
});

test('lector: rechaza archivos que no son Excel o sin hoja EMPLEADOS', async () => {
  await assert.rejects(() => leerLibro(Buffer.from('%PDF-1.4 falso')), /no es un libro de Excel/);
  await assert.rejects(() => leerLibro(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), /No se pudo leer/);
  const libro = await leerLibro(fs.readFileSync(path.join(FIX, 'sin-hoja-empleados.xlsx')));
  assert.throws(() => leerEmpleados(libro), /EMPLEADOS/);
});

test('saludo: toma el primer nombre del formato APELLIDOS NOMBRES', () => {
  assert.equal(primerNombre('PEREZ GOMEZ ANA MARIA'), 'Ana');
  assert.equal(primerNombre('RIVAS JIMENEZ MARISOL'), 'Marisol');
  assert.equal(primerNombre('ADMIN'), 'Admin');
});
