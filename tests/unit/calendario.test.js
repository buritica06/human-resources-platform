// Calendario laboral de vacaciones: mismas reglas que LIQ VACACIONES (DAYS360 + 1, WORKDAY.INTL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FESTIVOS } from '../../seeds/datos-iniciales.js';
import {
  contarHabiles,
  dias360,
  esHabil,
  fechaValida,
  finDeDisfrute,
  motivoNoHabil,
  primerHabilDesde,
  siguienteHabil,
} from '../../src/modules/vacaciones/calendario.js';

const festivos = new Map(FESTIVOS);
const conSabado = { festivos, sabadoHabil: true };
const sinSabado = { festivos, sabadoHabil: false };

test('días hábiles: domingo y festivos nunca; sábado según SABADO_HABIL', () => {
  assert.equal(motivoNoHabil('2026-11-22', conSabado), 'domingo');
  assert.equal(motivoNoHabil('2026-11-16', conSabado), 'festivo: Independencia de Cartagena');
  assert.equal(esHabil('2026-11-21', conSabado), true, 'sábado hábil');
  assert.equal(motivoNoHabil('2026-11-21', sinSabado), 'sábado');
  assert.equal(contarHabiles('2026-11-16', '2026-11-22', conSabado), 5, 'lun festivo … dom: mar–sáb');
  assert.equal(contarHabiles('2026-11-16', '2026-11-22', sinSabado), 4);
});

test('festivo en lunes: el disfrute lo salta y el regreso también', () => {
  // vie 09/01/2026, 3 días; lun 12/01 es Reyes Magos
  assert.equal(finDeDisfrute('2026-01-09', 3, conSabado), '2026-01-13'); // vie, sáb, mar
  assert.equal(siguienteHabil('2026-01-13', conSabado), '2026-01-14');
  assert.equal(finDeDisfrute('2026-01-09', 3, sinSabado), '2026-01-14'); // vie, mar, mié
  // termina el viernes antes del puente: regresa el martes
  assert.equal(siguienteHabil('2026-01-09', sinSabado), '2026-01-13');
});

test('cambio de año: Navidad, Año Nuevo y domingos', () => {
  // mié 30/12/2026, 4 días: 30, 31, (1 ene festivo), sáb 2, (dom 3), lun 4
  assert.equal(finDeDisfrute('2026-12-30', 4, conSabado), '2027-01-04');
  assert.equal(siguienteHabil('2027-01-04', conSabado), '2027-01-05');
  assert.equal(finDeDisfrute('2026-12-23', 15, conSabado), '2027-01-12', '15 días hábiles con Navidad, Año Nuevo y Reyes (11/01)');
  assert.equal(contarHabiles('2026-12-23', '2027-01-12', conSabado), 15);
});

test('primer hábil desde una fecha no hábil', () => {
  assert.equal(primerHabilDesde('2026-12-25', conSabado), '2026-12-26');
  assert.equal(primerHabilDesde('2026-12-25', sinSabado), '2026-12-28');
  assert.equal(primerHabilDesde('2026-12-28', sinSabado), '2026-12-28');
});

test('DAYS360 (método de EE. UU., como Excel)', () => {
  assert.equal(dias360('2026-01-01', '2026-12-31'), 360);
  assert.equal(dias360('2026-01-01', '2026-12-30'), 359);
  assert.equal(dias360('2026-01-15', '2026-01-31'), 16);
  assert.equal(dias360('2026-01-30', '2026-01-31'), 0);
  assert.equal(dias360('2026-01-31', '2026-02-28'), 28);
  assert.equal(dias360('2026-02-28', '2026-03-31'), 30, 'fin de febrero cuenta como 30');
  assert.equal(dias360('2026-03-01', '2026-03-01'), 0);
});

test('año bisiesto', () => {
  assert.equal(dias360('2024-02-28', '2024-03-01'), 3, '28/02/2024 no es fin de mes');
  assert.equal(dias360('2024-02-29', '2024-03-31'), 30);
  assert.equal(fechaValida('2024-02-29'), true);
  assert.equal(fechaValida('2026-02-29'), false);
  assert.equal(fechaValida('2026-13-01'), false);
  assert.equal(fechaValida('01/02/2026'), false);
});

test('n inválido', () => {
  assert.throws(() => finDeDisfrute('2026-01-09', 0, conSabado));
  assert.throws(() => finDeDisfrute('2026-01-09', 1.5, conSabado));
});
