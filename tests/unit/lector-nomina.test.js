// Casos borde del lector de la hoja NOMINA (hallazgos de la revisión de M2).
// Los libros se arman en memoria con el mismo generador del libro ficticio.
import '../helpers/entorno.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { leerLibro } from '../../src/core/excel.js';
import { leerHojaNomina } from '../../src/modules/nomina/lector.js';
import { hojaNomina } from '../../scripts/generar-nomina-ficticia.js';

const EMP = 'EMPLEADOR DEMO A C.C 900.000.001';
const fila = (ced, nombre, ...v) => [ced, nombre, 15, 1750905, ...(v.length ? v : [875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0])];

async function leer(opciones, retocar) {
  const libro = new ExcelJS.Workbook();
  const h = hojaNomina(libro, 'NOMINA NOV 1-15', { inicio: '2026-11-01', fin: '2026-11-15', ...opciones });
  retocar?.(h);
  const releido = await leerLibro(Buffer.from(await libro.xlsx.writeBuffer()));
  return leerHojaNomina(releido, 'NOMINA NOV 1-15');
}
const textoErrores = (r) => r.errores.map((e) => e.mensaje).join(' | ');

test('cédula con letras en medio de la tabla → ERROR (no corta la tabla ni descarta filas)', async () => {
  const r = await leer({
    tablas: [
      {
        empleador: EMP,
        sede: 'COMPRAVENTA SEDE NORTE',
        filas: [
          fila(1000000003, 'UNO PRUEBA'),
          fila('CC 1000000002', 'DOS PRUEBA'),
          fila(1000000004, 'TRES PRUEBA'),
          fila(1000000001, 'CUATRO PRUEBA'),
        ],
      },
    ],
  });
  assert.equal(r.errores.length, 1);
  assert.match(textoErrores(r), /DOS PRUEBA.*cédula.*no es válida/);
  assert.equal(r.registros.length, 3, 'las filas siguientes se siguen leyendo');
});

test('cédula numérica con decimales o demasiado corta → ERROR', async () => {
  const r = await leer({
    tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000002.5, 'DECIMAL PRUEBA'), fila(123, 'CORTA PRUEBA')] }],
  });
  assert.equal(r.errores.length, 2);
});

test('encabezado con otra palabra en la columna A → ERROR (el bloque no se ignora en silencio)', async () => {
  const r = await leer({ tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] }] }, (h) => {
    h.getCell('A7').value = 'IDENTIFICACION';
  });
  assert.match(textoErrores(r), /se esperaba "CÉDULA"/);
});

test('devengado negativo → ERROR (no se muestra como positivo)', async () => {
  const r = await leer({
    tablas: [
      {
        empleador: EMP,
        sede: 'COMPRAVENTA SEDE NORTE',
        filas: [fila(1000000003, 'UNO PRUEBA', 875452.5, -20005, 124547.5, 0, 0, -35000, -35000, 0)],
      },
    ],
  });
  assert.match(textoErrores(r), /Recargo nocturno.*negativo/);
  assert.equal(r.registros.length, 0);
});

test('celda con error de Excel (#N/A) → ERROR, no cero', async () => {
  const r = await leer({ tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] }] }, (h) => {
    h.getCell('F9').value = { error: '#N/A' };
  });
  assert.match(textoErrores(r), /no es un número/);
});

test('fechas imposibles en S1/T1 → ERROR', async () => {
  for (const [s1, t1] of [
    ['2026-02-30', '2026-03-10'],
    ['45/13/2026', '2026-11-15'],
    ['2026-11-99', '2026-11-15'],
  ]) {
    const r = await leer({ tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] }] }, (h) => {
      h.getCell('S1').value = s1;
      h.getCell('T1').value = t1;
    });
    assert.match(textoErrores(r), /fechas válidas|no son válidas/, `${s1} / ${t1}`);
  }
});

test('la sede no se hereda de otro bloque; sin título queda vacía (se usará la del expediente)', async () => {
  const r = await leer({
    tablas: [
      { empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] },
      { empleador: EMP, sede: 'SEDE RIO', filas: [fila(1000000004, 'DOS PRUEBA')] },
      { empleador: EMP, sede: null, filas: [fila(1000000002, 'TRES PRUEBA')] },
    ],
  });
  assert.equal(r.errores.length, 0, textoErrores(r));
  const sede = (c) => r.registros.find((x) => x.cedula === c).sede;
  assert.equal(sede('1000000003'), 'COMPRAVENTA SEDE NORTE');
  assert.equal(sede('1000000004'), 'SEDE RIO');
  assert.equal(sede('1000000002'), null);
});

test('extras: fila que solo trae el neto → "pago adicional" sin desglose inventado; con texto en una columna → ERROR', async () => {
  const base = { tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] }] };
  let r = await leer({ ...base, ext: [[1000000003, 'UNO PRUEBA', 1750905, '', '', 2, '', 116727]] });
  assert.equal(r.errores.length, 0, textoErrores(r));
  const adic = r.registros[0].adicionales;
  assert.deepEqual(
    adic.map((a) => [a.concepto, a.valor]),
    [['ADICIONAL_NETO', 116727]],
  );
  assert.deepEqual(adic[0].detalle, [{ etiqueta: 'Jornadas extra', cantidad: 2, unidad: 'jornadas' }]);
  r = await leer({ ...base, ext: [[1000000003, 'UNO PRUEBA', 1750905, 'ver nota', '', 2, '', 116727]] });
  assert.match(textoErrores(r), /no coincide con el neto/);
});

test('quien solo aparece en extras no hereda el empleador del último bloque', async () => {
  const r = await leer({
    tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA')] }],
    ext: [[1000000004, 'SOLO EXTRAS', 1750905, 10000, 0, 0, 0, 10000]],
  });
  const x = r.registros.find((y) => y.cedula === '1000000004');
  assert.equal(x.nomina, undefined);
  assert.equal(x.empleador, null);
  assert.equal(x.sede, null);
});

test('fila en cero → advertencia; tabla sin colaboradores → ERROR', async () => {
  let r = await leer({
    tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [fila(1000000003, 'UNO PRUEBA', 0, 0, 0, 0, 0, 0, 0, 0)] }],
  });
  assert.equal(r.errores.length, 0);
  assert.match(r.advertencias.map((a) => a.mensaje).join(' '), /todos los valores en cero/);
  r = await leer({ tablas: [{ empleador: EMP, sede: 'COMPRAVENTA SEDE NORTE', filas: [] }] });
  assert.match(textoErrores(r), /ningún colaborador/);
});

test('los mensajes enmascaran la cédula', async () => {
  const r = await leer({
    tablas: [
      {
        empleador: EMP,
        sede: 'COMPRAVENTA SEDE NORTE',
        filas: [fila(1000000003, 'UNO PRUEBA', 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0, 1)],
      },
    ],
  });
  assert.match(textoErrores(r), /\*\*\*0003/);
  assert.doesNotMatch(textoErrores(r), /1000000003/);
});
