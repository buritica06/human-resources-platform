// Números en letras para certificados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enteroALetras, fechaLarga, pesosALetras } from '../../src/modules/certificados/letras.js';

test('enteros en letras', () => {
  const casos = {
    0: 'CERO',
    1: 'UNO',
    15: 'QUINCE',
    21: 'VEINTIUNO',
    30: 'TREINTA',
    31: 'TREINTA Y UNO',
    100: 'CIEN',
    101: 'CIENTO UNO',
    500: 'QUINIENTOS',
    1000: 'MIL',
    1001: 'MIL UNO',
    2021: 'DOS MIL VEINTIUNO',
    21000: 'VEINTIÚN MIL',
    100000: 'CIEN MIL',
    1000000: 'UN MILLÓN',
    1750905: 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO',
    2000000: 'DOS MILLONES',
    21000000: 'VEINTIÚN MILLONES',
    1000000000: 'MIL MILLONES',
    3500000: 'TRES MILLONES QUINIENTOS MIL',
  };
  for (const [n, txt] of Object.entries(casos)) assert.equal(enteroALetras(Number(n)), txt, n);
  assert.throws(() => enteroALetras(-1));
  assert.throws(() => enteroALetras(1.5));
});

test('pesos en letras', () => {
  assert.equal(pesosALetras(1750905), 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS M/CTE');
  assert.equal(pesosALetras(1000000), 'UN MILLÓN DE PESOS M/CTE');
  assert.equal(pesosALetras(3000000), 'TRES MILLONES DE PESOS M/CTE');
  assert.equal(pesosALetras(1), 'UN PESO M/CTE');
  const casos = {
    1000001: 'UN MILLÓN UN PESOS M/CTE',
    2001000: 'DOS MILLONES MIL PESOS M/CTE',
    100000000: 'CIEN MILLONES DE PESOS M/CTE',
    101000000: 'CIENTO UN MILLONES DE PESOS M/CTE',
    1001000000: 'MIL UN MILLONES DE PESOS M/CTE',
    2000000000: 'DOS MIL MILLONES DE PESOS M/CTE',
    31: 'TREINTA Y UN PESOS M/CTE',
    101: 'CIENTO UN PESOS M/CTE',
  };
  for (const [n, txt] of Object.entries(casos)) assert.equal(pesosALetras(Number(n)), txt, n);
  assert.equal(pesosALetras(1750921), 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS VEINTIÚN PESOS M/CTE');
});

test('fecha larga', () => {
  assert.equal(fechaLarga('2026-11-22'), '22 de noviembre de 2026');
  assert.equal(fechaLarga('2023-03-01'), '1 de marzo de 2023');
});
