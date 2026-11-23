import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearEntorno, cliente, comoUsuario, CED, CLAVE_DEMO, tokenDeEnlace } from '../helpers/app.js';
import { sha256 } from '../../src/core/security/cripto.js';

let env;
before(async () => {
  env = await crearEntorno();
});
after(() => env.cerrar());

const MSG_GENERICO = /Cédula o contraseña incorrectas/;

describe('ingreso', () => {
  test('ingreso correcto: cookie HttpOnly + SameSite y token CSRF', async () => {
    const c = cliente(env.app);
    const r = await c.login(CED.colab1);
    assert.equal(r.status, 200);
    assert.equal(r.body.primerIngreso, false);
    assert.ok(r.body.csrf);
    const cookie = r.headers['set-cookie'].find((x) => x.startsWith('th_sid='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const me = await c.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.usuario.rol, 'COLABORADOR');
    assert.equal(me.body.usuario.cedula, undefined, 'la cédula no se expone en /me');
  });

  test('mismo mensaje genérico para clave errada y cédula inexistente', async () => {
    const a = await cliente(env.app).login(CED.colab2, 'ClaveErrada123');
    const b = await cliente(env.app).login('9999999999', 'ClaveErrada123');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.mensaje, b.body.error.mensaje);
    assert.match(a.body.error.mensaje, MSG_GENERICO);
    await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).update({ intentos_fallidos: 0 });
  });

  test('cédula con puntos se normaliza; entrada inválida da error por campo', async () => {
    const ok = await cliente(env.app).login('1.000.000.003');
    assert.equal(ok.status, 200);
    const mal = await cliente(env.app).login('abc', '');
    assert.equal(mal.status, 400);
    assert.ok(mal.body.error.campos.cedula);
    assert.ok(mal.body.error.campos.clave);
  });

  test('bloqueo tras 5 intentos fallidos, aunque luego la clave sea correcta', async () => {
    const c = cliente(env.app);
    for (let i = 0; i < 5; i++) assert.equal((await c.login(CED.colab2, 'ClaveErrada123')).status, 401);
    const conCorrecta = await c.login(CED.colab2, CLAVE_DEMO);
    assert.equal(conCorrecta.status, 401);
    assert.match(conCorrecta.body.error.mensaje, MSG_GENERICO);
    const u = await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).first();
    assert.ok(Date.parse(u.bloqueado_hasta) > Date.now());
    const aud = await env.ctx
      .db('auditoria')
      .where({ accion: 'BLOQUEO', entidad_id: String(u.id) })
      .first();
    assert.ok(aud);
    // Al vencer el bloqueo vuelve a funcionar
    await env.ctx
      .db('usuarios')
      .where({ id: u.id })
      .update({ bloqueado_hasta: new Date(Date.now() - 1000).toISOString() });
    assert.equal((await c.login(CED.colab2)).status, 200);
  });

  test('usuario inactivo no puede ingresar', async () => {
    await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).update({ activo: false });
    const r = await cliente(env.app).login(CED.colab2);
    assert.equal(r.status, 401);
    await env.ctx.db('usuarios').where({ cedula: CED.colab2 }).update({ activo: true });
  });

  test('límite de intentos por IP devuelve 429', async () => {
    const e2 = await crearEntorno({ limites: { login: 3 } });
    try {
      const c = cliente(e2.app);
      for (let i = 0; i < 3; i++) await c.login('9999999999', 'x');
      const r = await c.login('9999999999', 'x');
      assert.equal(r.status, 429);
      assert.match(r.body.error.mensaje, /Demasiados intentos/);
    } finally {
      await e2.cerrar();
    }
  });
});

describe('CSRF, cabeceras y sesión', () => {
  test('POST sin token o con token falso → 403', async () => {
    const sinToken = await request(env.app).post('/api/v1/auth/login').send({ cedula: CED.colab1, clave: CLAVE_DEMO });
    assert.equal(sinToken.status, 403);
    assert.equal(sinToken.body.error.codigo, 'CSRF');
    const c = await comoUsuario(env.app, CED.colab1);
    const falso = await c.agente.post('/api/v1/auth/logout').set('X-CSRF-Token', 'token-falso-de-prueba-123456');
    assert.equal(falso.status, 403);
  });

  test('Origin de otro sitio → 403', async () => {
    const c = cliente(env.app);
    const { body } = await c.get('/auth/csrf');
    const r = await c.agente
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', body.csrf)
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ cedula: CED.colab1, clave: CLAVE_DEMO });
    assert.equal(r.status, 403);
  });

  test('cabeceras de seguridad y sin x-powered-by', async () => {
    const r = await request(env.app).get('/login');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-powered-by'], undefined);
    const api = await request(env.app).get('/api/v1/auth/csrf');
    assert.equal(api.headers['cache-control'], 'no-store');
  });

  test('sin sesión → 401; ruta inexistente → 404 JSON', async () => {
    assert.equal((await request(env.app).get('/api/v1/auth/me')).status, 401);
    const r = await request(env.app).get('/api/v1/no-existe');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.codigo, 'NO_ENCONTRADO');
  });

  test('cierre por inactividad (15 min) elimina la sesión', async () => {
    const c = await comoUsuario(env.app, CED.colab1);
    const hash = sha256(c.sid);
    await env.ctx
      .db('sesiones')
      .where({ id_hash: hash })
      .update({ ultimo_uso: new Date(Date.now() - 16 * 60_000).toISOString() });
    const r = await c.get('/auth/me');
    assert.equal(r.status, 401);
    assert.match(r.body.error.mensaje, /inactividad/);
    assert.equal(await env.ctx.db('sesiones').where({ id_hash: hash }).first(), undefined);
  });

  test('la consulta con X-Sin-Renovar no cuenta como actividad', async () => {
    const c = await comoUsuario(env.app, CED.colab1);
    const hash = sha256(c.sid);
    const antes = new Date(Date.now() - 5 * 60_000).toISOString();
    await env.ctx.db('sesiones').where({ id_hash: hash }).update({ ultimo_uso: antes });
    await c.agente.get('/api/v1/auth/me').set('X-Sin-Renovar', '1');
    assert.equal((await env.ctx.db('sesiones').where({ id_hash: hash }).first()).ultimo_uso, antes);
    await c.get('/auth/me');
    assert.notEqual((await env.ctx.db('sesiones').where({ id_hash: hash }).first()).ultimo_uso, antes);
  });

  test('vencimiento absoluto de la sesión', async () => {
    const c = await comoUsuario(env.app, CED.colab1);
    await env.ctx
      .db('sesiones')
      .where({ id_hash: sha256(c.sid) })
      .update({ expira_absoluta: new Date(Date.now() - 1).toISOString() });
    assert.equal((await c.get('/auth/me')).status, 401);
  });

  test('cerrar sesión invalida la cookie en el servidor', async () => {
    const c = await comoUsuario(env.app, CED.colab1);
    assert.equal((await c.post('/auth/logout')).status, 204);
    assert.equal((await c.get('/auth/me')).status, 401);
  });
});

describe('primer ingreso', () => {
  let temporal;
  let c;

  test('el admin crea el usuario y recibe la clave temporal una vez', async () => {
    const admin = await comoUsuario(env.app, CED.admin);
    const r = await admin.post('/usuarios', { cedula: '3000000001', nombre: 'nuevo   prueba   uno', rol: 'ADMIN' });
    assert.equal(r.status, 201);
    assert.equal(r.body.usuario.nombre, 'NUEVO PRUEBA UNO');
    temporal = r.body.claveTemporal;
    assert.equal(temporal.length, 12);
    const fila = await env.ctx.db('usuarios').where({ cedula: '3000000001' }).first();
    assert.notEqual(fila.password_hash, temporal);
    const aud = await env.ctx
      .db('auditoria')
      .where({ accion: 'CREAR', entidad_id: String(fila.id) })
      .first();
    assert.doesNotMatch(aud.detalle, new RegExp(temporal));
  });

  test('con clave temporal solo puede usar el proceso de primer ingreso', async () => {
    c = cliente(env.app);
    const r = await c.login('3000000001', temporal);
    assert.equal(r.status, 200);
    assert.equal(r.body.primerIngreso, true);
    const me = await c.get('/auth/me');
    assert.equal(me.body.usuario.cuentaLista, false);
    assert.deepEqual(me.body.menu, []);
    const bloqueada = await c.get('/usuarios');
    assert.equal(bloqueada.status, 403);
    assert.equal(bloqueada.body.error.codigo, 'PRIMER_INGRESO');
    const correoAntes = await c.post('/auth/correo', { correo: 'nuevo@example.com' });
    assert.equal(correoAntes.status, 403);
  });

  test('cambio de clave: valida política, cédula, confirmación y clave actual', async () => {
    let r = await c.post('/auth/cambiar-clave', { actual: temporal, nueva: 'corta1', confirmacion: 'corta1' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.nueva);
    r = await c.post('/auth/cambiar-clave', { actual: temporal, nueva: 'Clave3000000001x', confirmacion: 'Clave3000000001x' });
    assert.match(r.body.error.campos.nueva, /cédula/);
    r = await c.post('/auth/cambiar-clave', { actual: temporal, nueva: 'NuevaClave2026', confirmacion: 'OtraClave2026' });
    assert.ok(r.body.error.campos.confirmacion);
    r = await c.post('/auth/cambiar-clave', { actual: 'incorrecta1234', nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    assert.ok(r.body.error.campos.actual);
    r = await c.post('/auth/cambiar-clave', { actual: temporal, nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    assert.equal(r.status, 200);
  });

  test('registro y verificación de correo por enlace (un solo uso)', async () => {
    env.ctx.mailer.enviados.length = 0;
    const malo = await c.post('/auth/correo', { correo: 'no-es-correo' });
    assert.equal(malo.status, 400);
    const r = await c.post('/auth/correo', { correo: 'Nuevo.Prueba@Example.com' });
    assert.equal(r.status, 200);
    const correo = env.ctx.mailer.enviados.at(-1);
    assert.equal(correo.para, 'nuevo.prueba@example.com');
    const token = tokenDeEnlace(correo.enlace);
    assert.ok(token);
    // El token no queda guardado en claro
    assert.equal(await env.ctx.db('tokens').where({ hash: token }).first(), undefined);
    const anon = cliente(env.app);
    assert.equal((await anon.post('/auth/verificar-correo', { token })).status, 200);
    assert.equal((await anon.post('/auth/verificar-correo', { token })).status, 400);
    const me = await c.get('/auth/me');
    assert.equal(me.body.usuario.cuentaLista, true);
    assert.equal(me.body.usuario.correo, 'nuevo.prueba@example.com');
    assert.ok(me.body.menu.length > 0);
    assert.equal((await c.get('/usuarios')).status, 200);
  });

  test('un enlace nuevo invalida el anterior; enlace vencido no sirve', async () => {
    env.ctx.mailer.enviados.length = 0;
    await c.post('/auth/correo', { correo: 'uno@example.com' });
    await c.post('/auth/correo', { correo: 'dos@example.com' });
    const [primero, segundo] = env.ctx.mailer.enviados.map((m) => tokenDeEnlace(m.enlace));
    const anon = cliente(env.app);
    assert.equal((await anon.post('/auth/verificar-correo', { token: primero })).status, 400);
    await env.ctx
      .db('tokens')
      .where({ hash: sha256(segundo) })
      .update({ expira_en: new Date(Date.now() - 1).toISOString() });
    assert.equal((await anon.post('/auth/verificar-correo', { token: segundo })).status, 400);
  });

  test('clave temporal vencida (72 h) no permite ingresar', async () => {
    const admin = await comoUsuario(env.app, CED.admin);
    const r = await admin.post('/usuarios', { cedula: '3000000002', nombre: 'TEMPORAL VENCIDA PRUEBA' });
    await env.ctx
      .db('usuarios')
      .where({ cedula: '3000000002' })
      .update({ clave_temporal_expira: new Date(Date.now() - 1000).toISOString() });
    const l = await cliente(env.app).login('3000000002', r.body.claveTemporal);
    assert.equal(l.status, 401);
    assert.equal(l.body.error.codigo, 'CLAVE_TEMPORAL_VENCIDA');
  });

  test('no se puede reutilizar la contraseña anterior; cambiar la clave cierra las otras sesiones', async () => {
    const otra = await comoUsuario(env.app, '3000000001', 'NuevaClave2026');
    let r = await c.post('/auth/cambiar-clave', { actual: 'NuevaClave2026', nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    assert.equal(r.status, 400);
    r = await c.post('/auth/cambiar-clave', { actual: 'NuevaClave2026', nueva: 'Segunda2026clave', confirmacion: 'Segunda2026clave' });
    assert.equal(r.status, 200);
    assert.equal((await c.get('/auth/me')).status, 200, 'la sesión actual sigue');
    assert.equal((await otra.get('/auth/me')).status, 401, 'la otra sesión se cerró');
    r = await c.post('/auth/cambiar-clave', { actual: 'Segunda2026clave', nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    assert.equal(r.status, 400, 'no puede volver a la anterior');
  });
});

describe('recuperación de contraseña', () => {
  test('responde igual exista o no la cédula, y solo envía correo a cuentas verificadas', async () => {
    env.ctx.mailer.enviados.length = 0;
    const anon = cliente(env.app);
    const a = await anon.post('/auth/recuperar', { cedula: '9999999999' });
    const b = await anon.post('/auth/recuperar', { cedula: CED.colab1 });
    assert.equal(a.status, 200);
    assert.equal(a.body.mensaje, b.body.mensaje);
    assert.equal(env.ctx.mailer.enviados.length, 1);
    assert.equal(env.ctx.mailer.enviados[0].para, 'usuario03@example.com');
  });

  test('restablecer: nueva clave funciona, la anterior no, cierra sesiones y desbloquea', async () => {
    const sesionVieja = await comoUsuario(env.app, CED.colab1);
    const token = tokenDeEnlace(env.ctx.mailer.enviados.at(-1).enlace);
    await env.ctx
      .db('usuarios')
      .where({ cedula: CED.colab1 })
      .update({ bloqueado_hasta: new Date(Date.now() + 600_000).toISOString() });
    const anon = cliente(env.app);
    const debil = await anon.post('/auth/restablecer', { token, nueva: 'debil', confirmacion: 'debil' });
    assert.equal(debil.status, 400);
    assert.ok(debil.body.error.campos.nueva);
    // Un error de política NO gasta el enlace: se puede reintentar con el mismo.
    const token2 = token;
    const ok = await anon.post('/auth/restablecer', { token: token2, nueva: 'Recuperada2026', confirmacion: 'Recuperada2026' });
    assert.equal(ok.status, 200);
    assert.equal((await sesionVieja.get('/auth/me')).status, 401);
    assert.equal((await cliente(env.app).login(CED.colab1, CLAVE_DEMO)).status, 401);
    assert.equal((await cliente(env.app).login(CED.colab1, 'Recuperada2026')).status, 200);
    assert.equal(
      (await anon.post('/auth/restablecer', { token: token2, nueva: 'OtraMas2026x', confirmacion: 'OtraMas2026x' })).status,
      400,
    );
  });
});
