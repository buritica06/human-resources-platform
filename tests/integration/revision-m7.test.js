// Regresión de los hallazgos de la revisión independiente de M7 (certificados).
import '../helpers/entorno.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { hoyBogota, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let colab1;
let idColab1;
const hoy = hoyBogota();

before(async () => {
  env = await crearEntorno({ limites: { emitirCertificado: 1000 } });
  admin = await comoUsuario(env.app, CED.admin);
  colab1 = await comoUsuario(env.app, CED.colab1);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
});
after(() => env.cerrar());

const cambiar = (datos) => env.ctx.db('colaboradores').where({ id: idColab1 }).update(datos);
const contenido = async (id) => JSON.parse((await env.ctx.db('certificados').where({ id }).first()).contenido);
const ORIGINAL = { estado: 'ACTIVO', fecha_retiro: null, tipo_contrato: 'INDEFINIDO', fecha_fin_contrato: null, salario_base: 1750905 };

test('retirado sin fecha de retiro → no se emite (no diría "labora")', async () => {
  await cambiar({ estado: 'RETIRADO', fecha_retiro: null });
  try {
    const r = await admin.post(`/colaboradores/${idColab1}/certificados/laboral`, { conSalario: false });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /fecha de retiro/);
  } finally {
    await cambiar(ORIGINAL);
  }
});

test('retiro con fecha futura: todavía "labora"', async () => {
  await cambiar({ estado: 'RETIRADO', fecha_retiro: sumarDias(hoy, 10) });
  try {
    const r = await admin.post(`/colaboradores/${idColab1}/certificados/laboral`, { conSalario: false });
    assert.equal(r.status, 201);
    assert.equal((await contenido(r.body.id)).fechaRetiro, null);
  } finally {
    await cambiar(ORIGINAL);
  }
});

test('contrato fijo: exige fecha de fin y no certifica uno vencido; con fecha vigente la imprime', async () => {
  await cambiar({ tipo_contrato: 'FIJO', fecha_fin_contrato: null });
  try {
    let r = await colab1.post('/me/certificados/laboral', { conSalario: false });
    assert.match(r.body.error.mensaje, /fecha de fin/);
    await cambiar({ fecha_fin_contrato: sumarDias(hoy, -1) });
    r = await colab1.post('/me/certificados/laboral', { conSalario: false });
    assert.match(r.body.error.mensaje, /vencido/);
    await cambiar({ fecha_fin_contrato: sumarDias(hoy, 90) });
    r = await colab1.post('/me/certificados/laboral', { conSalario: false });
    assert.equal(r.status, 201);
    const c = await contenido(r.body.id);
    assert.equal(c.contrato, 'con contrato a término fijo');
    assert.equal(c.fechaFinContrato, sumarDias(hoy, 90));
  } finally {
    await cambiar(ORIGINAL);
  }
});

test('salario con centavos: el número y las letras usan el mismo valor entero', async () => {
  await cambiar({ salario_base: 3500000.5 });
  try {
    const r = await colab1.post('/me/certificados/laboral', { conSalario: true });
    const c = await contenido(r.body.id);
    assert.equal(c.salario, 3500001);
    assert.equal(c.salarioLetras, 'TRES MILLONES QUINIENTOS MIL UN PESOS M/CTE');
  } finally {
    await cambiar(ORIGINAL);
  }
});

test('anulado: el colaborador recibe 410; el admin lo descarga marcado', async () => {
  const r = await colab1.post('/me/certificados/laboral', { conSalario: false });
  await admin.post(`/certificados/${r.body.id}/anular`, { motivo: 'Datos desactualizados' });
  assert.equal((await colab1.get(`/certificados/${r.body.id}/pdf`)).status, 410);
  assert.equal((await admin.get(`/certificados/${r.body.id}/pdf`)).status, 200);
});

test('integridad: si el contenido guardado se altera, no se entrega', async () => {
  const r = await colab1.post('/me/certificados/laboral', { conSalario: true });
  const fila = await env.ctx.db('certificados').where({ id: r.body.id }).first();
  await env.ctx.db('certificados').where({ id: r.body.id }).update({ contenido: fila.contenido.replace('1750905', '9750905') });
  assert.equal((await colab1.get(`/certificados/${r.body.id}/pdf`)).status, 500);
});

test('destinatario solo con alfabeto latino (Helvetica no tiene otros)', async () => {
  assert.equal((await colab1.post('/me/certificados/laboral', { conSalario: false, dirigidoA: 'Банк' })).status, 400);
  assert.equal((await colab1.post('/me/certificados/laboral', { conSalario: false, dirigidoA: 'Cooperativa Señor & Cía.' })).status, 201);
});

test('límite de emisión por usuario', async () => {
  const e = await crearEntorno({ limites: { emitirCertificado: 2 } });
  try {
    const c = await comoUsuario(e.app, CED.colab1);
    assert.equal((await c.post('/me/certificados/laboral', { conSalario: false })).status, 201);
    assert.equal((await c.post('/me/certificados/laboral', { conSalario: false })).status, 201);
    assert.equal((await c.post('/me/certificados/laboral', { conSalario: false })).status, 429);
  } finally {
    await e.cerrar();
  }
});

test('POST sin token CSRF → 403', async () => {
  const r = await colab1.agente.post('/api/v1/me/certificados/laboral').send({ conSalario: false });
  assert.equal(r.status, 403);
});
