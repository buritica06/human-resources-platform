// M7 – Certificados laborales: emisión con datos vigentes, PDF, código de verificación, verificación
// pública sin datos personales, alcance y auditoría.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, cliente, CED } from '../helpers/app.js';

let env;
let admin;
let director;
let colab1;
let colab2;
let idColab1;
let idColab2;

before(async () => {
  env = await crearEntorno({ limites: { verificar: 1000 } });
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  colab2 = await comoUsuario(env.app, CED.colab2);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
  idColab2 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab2 }).first()).id;
});
after(() => env.cerrar());

const pdfDe = (c, id) => c.agente.get(`/api/v1/certificados/${id}/pdf`).buffer(true).parse((res, cb) => {
  const partes = [];
  res.on('data', (d) => partes.push(d));
  res.on('end', () => cb(null, Buffer.concat(partes)));
});

let conSalario;
let sinSalario;
describe('emisión', () => {
  test('sin salario: código con formato, PDF válido, contenido sin salario', async () => {
    const r = await colab1.post('/me/certificados/laboral', { conSalario: false });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.codigo, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    sinSalario = r.body;
    const fila = await env.ctx.db('certificados').where({ id: r.body.id }).first();
    const c = JSON.parse(fila.contenido);
    assert.equal(c.salario, null);
    assert.equal(c.dirigidoA, 'A QUIEN INTERESE');
    assert.equal(c.fechaIngreso, '2023-03-01');
    const pdf = await pdfDe(colab1, r.body.id);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  });

  test('con salario: salario básico del expediente y en letras (sin recalcular)', async () => {
    const r = await colab1.post('/me/certificados/laboral', { conSalario: true, dirigidoA: 'BANCO DEMO S.A.' });
    assert.equal(r.status, 201);
    conSalario = r.body;
    const c = JSON.parse((await env.ctx.db('certificados').where({ id: r.body.id }).first()).contenido);
    assert.equal(c.salario, 1750905);
    assert.equal(c.salarioLetras, 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS M/CTE');
    assert.equal(c.dirigidoA, 'BANCO DEMO S.A.');
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'EMITIR_CERTIFICADO', entidad_id: String(r.body.id) }).first());
  });

  test('validaciones: conSalario obligatorio, dirigidoA con caracteres raros', async () => {
    assert.equal((await colab1.post('/me/certificados/laboral', {})).status, 400);
    assert.equal((await colab1.post('/me/certificados/laboral', { conSalario: false, dirigidoA: '<script>' })).status, 400);
  });

  test('si al expediente le falta un dato, se explica cuál', async () => {
    await env.ctx.db('colaboradores').where({ id: idColab2 }).update({ cargo: null });
    try {
      const r = await colab2.post('/me/certificados/laboral', { conSalario: false });
      assert.equal(r.status, 400);
      assert.match(r.body.error.mensaje, /cargo/);
    } finally {
      await env.ctx.db('colaboradores').where({ id: idColab2 }).update({ cargo: 'AUXILIAR' });
    }
  });

  test('el PDF se vuelve a descargar con el mismo contenido aunque el expediente cambie', async () => {
    await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ salario_base: 2000000 });
    try {
      const k = await env.ctx.db('certificados').where({ id: conSalario.id }).first();
      assert.equal(JSON.parse(k.contenido).salario, 1750905);
      assert.equal((await pdfDe(colab1, conSalario.id)).status, 200);
    } finally {
      await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ salario_base: 1750905 });
    }
  });
});

describe('alcance', () => {
  test('otro colaborador y el director no descargan ni listan; el admin sí', async () => {
    assert.equal((await pdfDe(colab2, conSalario.id)).status, 404);
    assert.equal((await pdfDe(director, conSalario.id)).status, 404);
    assert.equal((await pdfDe(admin, conSalario.id)).status, 200);
    assert.equal((await colab2.get(`/colaboradores/${idColab1}/certificados`)).status, 404);
    assert.equal((await director.get(`/colaboradores/${idColab1}/certificados`)).status, 404);
    assert.equal((await admin.get(`/colaboradores/${idColab1}/certificados`)).body.certificados.length, 2);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'ACCESO_DENEGADO', entidad: 'certificado' }).first());
  });

  test('solo el admin emite a nombre de otro, también de un retirado ("laboró… hasta")', async () => {
    assert.equal((await director.post(`/colaboradores/${idColab1}/certificados/laboral`, { conSalario: false })).status, 403);
    await env.ctx.db('colaboradores').where({ id: idColab2 }).update({ estado: 'RETIRADO', fecha_retiro: '2026-10-31' });
    try {
      const r = await admin.post(`/colaboradores/${idColab2}/certificados/laboral`, { conSalario: true });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const c = JSON.parse((await env.ctx.db('certificados').where({ id: r.body.id }).first()).contenido);
      assert.equal(c.fechaRetiro, '2026-10-31');
    } finally {
      await env.ctx.db('colaboradores').where({ id: idColab2 }).update({ estado: 'ACTIVO', fecha_retiro: null });
    }
  });
});

describe('verificación pública', () => {
  test('sin sesión: válido con tipo y fecha, SIN datos personales', async () => {
    const anonimo = cliente(env.app);
    const r = await anonimo.get(`/certificados/verificar/${conSalario.codigo.toLowerCase().replaceAll('-', '')}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.valido, true);
    assert.equal(r.body.tipo, 'Certificado laboral');
    assert.match(r.body.emitidoEn, /^\d{4}-\d{2}-\d{2}$/);
    const texto = JSON.stringify(r.body);
    for (const dato of ['PEREZ', CED.colab1, '1750905', 'EMPLEADOR', 'BANCO', 'AUXILIAR']) assert.ok(!texto.includes(dato), dato);
    assert.deepEqual(Object.keys(r.body).sort(), ['emitidoEn', 'tipo', 'valido']);
  });

  test('código inexistente o mal formado → no válido', async () => {
    const anonimo = cliente(env.app);
    assert.equal((await anonimo.get('/certificados/verificar/AAAA-AAAA-AAAA')).body.valido, false);
    assert.match((await anonimo.get('/certificados/verificar/xx')).body.motivo, /formato/);
  });

  test('anulado por el admin → la verificación lo dice; ya no se ofrece para descargar', async () => {
    assert.equal((await colab1.post(`/certificados/${sinSalario.id}/anular`, { motivo: 'Lo pedí mal' })).status, 403);
    assert.equal((await admin.post(`/certificados/${sinSalario.id}/anular`, { motivo: 'x' })).status, 400);
    assert.equal((await admin.post(`/certificados/${sinSalario.id}/anular`, { motivo: 'Emitido con datos desactualizados' })).status, 200);
    assert.equal((await admin.post(`/certificados/${sinSalario.id}/anular`, { motivo: 'Otra vez anulado' })).status, 409);
    const v = await cliente(env.app).get(`/certificados/verificar/${sinSalario.codigo}`);
    assert.equal(v.body.valido, false);
    assert.equal(v.body.anulado, true);
    assert.equal((await colab1.get('/me/certificados')).body.certificados.find((k) => k.id === sinSalario.id).anulado, true);
  });

  test('límite de consultas a la verificación pública', async () => {
    const e = await crearEntorno({ limites: { verificar: 3 } });
    try {
      const a = cliente(e.app);
      for (let i = 0; i < 3; i++) assert.equal((await a.get('/certificados/verificar/AAAA-AAAA-AAAA')).status, 200);
      assert.equal((await a.get('/certificados/verificar/AAAA-AAAA-AAAA')).status, 429);
    } finally {
      await e.cerrar();
    }
  });
});
