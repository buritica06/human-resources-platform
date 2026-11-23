// Pruebas de regresión de los hallazgos de la revisión independiente de M0.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, cliente, comoUsuario, CED, CLAVE_DEMO, tokenDeEnlace } from '../helpers/app.js';
import { cargarConfig } from '../../src/core/config.js';

let env;
before(async () => {
  env = await crearEntorno();
});
after(() => env.cerrar());

const usuario = (cedula) => env.ctx.db('usuarios').where({ cedula }).first();

describe('hallazgo 2 – bloqueo con intentos en paralelo', () => {
  test('10 intentos fallidos simultáneos bloquean la cuenta', async () => {
    const intentos = Array.from({ length: 10 }, () => cliente(env.app).login(CED.colab2, 'ClaveErrada123'));
    const r = await Promise.all(intentos);
    assert.ok(r.every((x) => x.status === 401));
    const u = await usuario(CED.colab2);
    assert.ok(u.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.now(), 'la cuenta debe quedar bloqueada');
    assert.equal((await cliente(env.app).login(CED.colab2, CLAVE_DEMO)).status, 401);
    await env.ctx.db('usuarios').where({ id: u.id }).update({ bloqueado_hasta: null, intentos_fallidos: 0 });
  });
});

describe('hallazgo 1 – el límite por IP no cuenta los ingresos exitosos', () => {
  test('muchos ingresos correctos desde la misma IP no generan 429', async () => {
    const e2 = await crearEntorno({ limites: { login: 3 } });
    try {
      for (let i = 0; i < 6; i++) assert.equal((await cliente(e2.app).login(CED.colab1)).status, 200);
      for (let i = 0; i < 3; i++) assert.equal((await cliente(e2.app).login('9999999999', 'x')).status, 401);
      assert.equal((await cliente(e2.app).login(CED.colab1)).status, 429, 'tras 3 fallos sí se limita');
    } finally {
      await e2.cerrar();
    }
  });

  test('la recuperación sí cuenta todas las peticiones (siempre responde 200)', async () => {
    const e2 = await crearEntorno({ limites: { recuperar: 2 } });
    try {
      const c = cliente(e2.app);
      await c.post('/auth/recuperar', { cedula: '9999999999' });
      await c.post('/auth/recuperar', { cedula: '9999999999' });
      assert.equal((await c.post('/auth/recuperar', { cedula: '9999999999' })).status, 429);
    } finally {
      await e2.cerrar();
    }
  });
});

describe('hallazgo 4 – configuración de producción', () => {
  test('APP_URL https sin NODE_ENV=production no arranca', () => {
    const previo = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      assert.throws(() => cargarConfig({ env: 'development', produccion: false, appUrl: 'https://th.example.com' }), /NODE_ENV/);
    } finally {
      process.env.NODE_ENV = previo;
    }
  });

  test('en producción: APP_URL debe ser https pública y la base PostgreSQL', () => {
    const base = { env: 'production', produccion: true, claveCifrado: 'b'.repeat(64), correo: { transporte: 'smtp' } };
    assert.throws(() => cargarConfig({ ...base, appUrl: 'http://localhost:3000' }), /https/);
    assert.throws(() => cargarConfig({ ...base, appUrl: 'https://th.example.com', db: { client: 'sqlite' } }), /PostgreSQL/);
    assert.ok(cargarConfig({ ...base, appUrl: 'https://th.example.com', db: { client: 'pg', url: 'postgres://x' } }));
  });

  test('en producción: cookie __Host-, Secure, HttpOnly y cabecera HSTS', async () => {
    const prod = await crearEntorno({
      config: {
        produccion: true,
        appUrl: 'https://th.example.com',
        correo: { transporte: 'smtp', remitente: 'x <x@example.com>', smtp: { host: 'localhost', port: 25 } },
      },
    });
    try {
      const c = cliente(prod.app);
      const csrf = await c.agente.get('/api/v1/auth/csrf');
      assert.match(csrf.headers['set-cookie'][0], /^__Host-th_csrf=.*; Secure/);
      const r = await c.agente
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', csrf.body.csrf)
        .set('Cookie', csrf.headers['set-cookie'][0].split(';')[0])
        .send({ cedula: CED.colab1, clave: CLAVE_DEMO });
      assert.equal(r.status, 200);
      const sid = r.headers['set-cookie'].find((x) => x.startsWith('__Host-th_sid='));
      assert.ok(sid, 'cookie con prefijo __Host-');
      assert.match(sid, /Secure/);
      assert.match(sid, /HttpOnly/);
      assert.match(r.headers['strict-transport-security'], /max-age=/);
    } finally {
      await prod.cerrar();
    }
  });
});

describe('hallazgos 9 y 10 – sesiones y recuperación', () => {
  test('volver a ingresar en el mismo navegador elimina la sesión anterior en el servidor', async () => {
    const c = cliente(env.app);
    await c.login(CED.colab1);
    await c.login(CED.colab1);
    const u = await usuario(CED.colab1);
    const antes = Number((await env.ctx.db('sesiones').where({ usuario_id: u.id }).count({ n: '*' }))[0].n);
    await c.login(CED.colab1);
    const despues = Number((await env.ctx.db('sesiones').where({ usuario_id: u.id }).count({ n: '*' }))[0].n);
    assert.equal(despues, antes, 'el reingreso no acumula sesiones');
  });

  test('/me informa los segundos que le quedan a la sesión', async () => {
    const c = await comoUsuario(env.app, CED.colab1);
    const me = await c.get('/auth/me');
    assert.ok(me.body.restanteSeg > 14 * 60 && me.body.restanteSeg <= 15 * 60);
  });

  test('restablecer por el admin anula los enlaces de recuperación pendientes', async () => {
    env.ctx.mailer.enviados.length = 0;
    await cliente(env.app).post('/auth/recuperar', { cedula: CED.colab1 });
    const token = tokenDeEnlace(env.ctx.mailer.enviados.at(-1).enlace);
    const admin = await comoUsuario(env.app, CED.admin);
    await admin.post(`/usuarios/${(await usuario(CED.colab1)).id}/reset-clave`, {});
    const r = await cliente(env.app).post('/auth/restablecer', { token, nueva: 'Saltarse2026x', confirmacion: 'Saltarse2026x' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.codigo, 'TOKEN_INVALIDO');
  });

  test('restablecer no acepta la contraseña anterior ni cuentas inactivas', async () => {
    // colab2 tiene clave actual CLAVE_DEMO; se cambia una vez para que CLAVE_DEMO pase a ser la anterior
    const c = await comoUsuario(env.app, CED.colab2);
    await c.post('/auth/cambiar-clave', { actual: CLAVE_DEMO, nueva: 'Actual2026clave', confirmacion: 'Actual2026clave' });
    env.ctx.mailer.enviados.length = 0;
    await cliente(env.app).post('/auth/recuperar', { cedula: CED.colab2 });
    const token = tokenDeEnlace(env.ctx.mailer.enviados.at(-1).enlace);
    const anon = cliente(env.app);
    const anterior = await anon.post('/auth/restablecer', { token, nueva: CLAVE_DEMO, confirmacion: CLAVE_DEMO });
    assert.equal(anterior.status, 400);
    assert.match(anterior.body.error.campos.nueva, /anteriores/);
    await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).update({ activo: false });
    const inactivo = await anon.post('/auth/restablecer', { token, nueva: 'Otra2026clavex', confirmacion: 'Otra2026clavex' });
    assert.equal(inactivo.status, 400);
    await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).update({ activo: true });
  });
});

describe('hallazgos 12 y CSRF multipart', () => {
  test('la búsqueda encuentra nombres con Ñ y tildes sin importar mayúsculas', async () => {
    const admin = await comoUsuario(env.app, CED.admin);
    await admin.post('/usuarios', { cedula: '6000000001', nombre: 'Peña Ñústez María' });
    const r = await admin.get(`/usuarios?q=${encodeURIComponent('peña ñúste')}`);
    assert.equal(r.body.total, 1);
  });

  test('subida multipart sin token CSRF → 403', async () => {
    const admin = await comoUsuario(env.app, CED.admin);
    const r = await admin.agente.post('/api/v1/usuarios/carga-masiva').attach('archivo', Buffer.from('PK'), 'x.xlsx');
    assert.equal(r.status, 403);
    assert.equal(r.body.error.codigo, 'CSRF');
  });
});
