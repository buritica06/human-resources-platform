import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { crearEntorno, cliente, comoUsuario, CED } from '../helpers/app.js';

const FIX = path.resolve(import.meta.dirname, '..', 'fixtures');
let env;
let admin;
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
});
after(() => env.cerrar());

const idDe = async (cedula) => (await env.ctx.db('usuarios').where({ cedula }).first()).id;

describe('control de acceso (validado en el servidor)', () => {
  const rutas = [
    ['get', '/usuarios'],
    ['get', '/sedes'],
    ['post', '/usuarios', { cedula: '5000000001', nombre: 'INTRUSO PRUEBA' }],
    ['patch', '/usuarios/1', { activo: false }],
    ['post', '/usuarios/1/reset-clave', {}],
  ];

  test('anónimo → 401 en todas las rutas de administración', async () => {
    for (const [m, ruta] of rutas) {
      const r = m === 'get' ? await request(env.app).get(`/api/v1${ruta}`) : await cliente(env.app)[m](ruta, {});
      assert.equal(r.status, 401, `${m} ${ruta}`);
    }
  });

  for (const [rol, ced] of [['colaborador', CED.colab1], ['director', CED.director]]) {
    test(`${rol} → 403 en todas las rutas de administración`, async () => {
      const c = await comoUsuario(env.app, ced);
      for (const [m, ruta, cuerpo] of rutas) {
        const r = m === 'get' ? await c.get(ruta) : await c[m](ruta, cuerpo);
        assert.equal(r.status, 403, `${rol}: ${m} ${ruta}`);
      }
      assert.equal(await env.ctx.db('usuarios').where({ cedula: '5000000001' }).first(), undefined);
      // Archivo mínimo: el servidor rechaza antes de leer el cuerpo y un archivo grande
      // provocaría un ECONNRESET en el cliente de pruebas (no en el navegador).
      const t = (await c.get('/auth/csrf')).body.csrf;
      const subida = await c.agente.post('/api/v1/usuarios/carga-masiva').set('X-CSRF-Token', t)
        .attach('archivo', Buffer.from('PK'), 'x.xlsx');
      assert.equal(subida.status, 403);
    });
  }

  test('el menú depende del rol', async () => {
    const colab = await comoUsuario(env.app, CED.colab1);
    const menuColab = (await colab.get('/auth/me')).body.menu.map((m) => m.href);
    assert.ok(!menuColab.includes('/usuarios'));
    const menuAdmin = (await admin.get('/auth/me')).body.menu.map((m) => m.href);
    assert.ok(menuAdmin.includes('/usuarios'));
  });
});

describe('gestión de usuarios (admincontable)', () => {
  test('lista con búsqueda y filtros; la búsqueda escapa comodines', async () => {
    let r = await admin.get('/usuarios');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 4);
    assert.ok(r.body.usuarios.every((u) => !('password_hash' in u)));
    r = await admin.get('/usuarios?q=perez');
    assert.equal(r.body.total, 1);
    r = await admin.get('/usuarios?rol=DIRECTOR');
    assert.equal(r.body.usuarios[0].cedula, CED.director);
    r = await admin.get('/usuarios?q=%25');
    assert.equal(r.body.total, 0);
    r = await admin.get('/usuarios?rol=HACKER');
    assert.equal(r.status, 400);
  });

  test('crear: valida datos, rechaza duplicados y sedes en no directores', async () => {
    let r = await admin.post('/usuarios', { cedula: '12ab', nombre: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.cedula && r.body.error.campos.nombre);
    r = await admin.post('/usuarios', { cedula: CED.colab1, nombre: 'DUPLICADO PRUEBA' });
    assert.equal(r.status, 409);
    const sedes = (await admin.get('/sedes')).body.sedes;
    assert.equal(sedes.length, 9);
    r = await admin.post('/usuarios', { cedula: '5000000002', nombre: 'COLAB CON SEDES', sedes: [sedes[0].id] });
    assert.equal(r.status, 400);
    r = await admin.post('/usuarios', { cedula: '5000000003', nombre: 'DIRECTORA NUEVA PRUEBA', rol: 'DIRECTOR', sedes: [sedes[0].id, sedes[4].id] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.usuario.sedes.sort(), [sedes[0].id, sedes[4].id].sort());
    r = await admin.post('/usuarios', { cedula: '5000000004', nombre: 'SEDE INEXISTENTE', rol: 'DIRECTOR', sedes: [9999] });
    assert.equal(r.status, 400);
  });

  test('<script> en el nombre se rechaza', async () => {
    const r = await admin.post('/usuarios', { cedula: '5000000009', nombre: '<script>alert(1)</script>' });
    assert.equal(r.status, 400);
  });

  test('desactivar un usuario cierra sus sesiones; no puede desactivarse a sí mismo', async () => {
    const colab = await comoUsuario(env.app, CED.colab2);
    const id = await idDe(CED.colab2);
    let r = await admin.patch(`/usuarios/${id}`, { activo: false });
    assert.equal(r.status, 200);
    assert.equal(r.body.activo, false);
    assert.equal((await colab.get('/auth/me')).status, 401);
    assert.equal((await cliente(env.app).login(CED.colab2)).status, 401);
    r = await admin.patch(`/usuarios/${id}`, { activo: true });
    assert.equal(r.body.activo, true);
    r = await admin.patch(`/usuarios/${await idDe(CED.admin)}`, { activo: false });
    assert.equal(r.status, 400);
    r = await admin.patch(`/usuarios/${await idDe(CED.admin)}`, { rol: 'COLABORADOR' });
    assert.equal(r.status, 400);
  });

  test('debe quedar al menos un admincontable activo', async () => {
    const r1 = await admin.post('/usuarios', { cedula: '5000000010', nombre: 'SEGUNDO ADMIN PRUEBA', rol: 'ADMIN' });
    const id2 = r1.body.usuario.id;
    // Se puede degradar al segundo admin porque queda el primero
    assert.equal((await admin.patch(`/usuarios/${id2}`, { rol: 'COLABORADOR' })).status, 200);
  });

  test('cambiar el rol cierra las sesiones del usuario afectado y se audita antes/después', async () => {
    const dir = await comoUsuario(env.app, CED.director);
    const id = await idDe(CED.director);
    const r = await admin.patch(`/usuarios/${id}`, { rol: 'COLABORADOR' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sedes, [], 'al dejar de ser director pierde sus sedes');
    assert.equal((await dir.get('/auth/me')).status, 401);
    const aud = await env.ctx.db('auditoria').where({ accion: 'EDITAR', entidad_id: String(id) }).orderBy('id', 'desc').first();
    const det = JSON.parse(aud.detalle);
    assert.equal(det.antes.rol, 'DIRECTOR');
    assert.equal(det.despues.rol, 'COLABORADOR');
    assert.equal(aud.actor_id, await idDe(CED.admin));
  });

  test('restablecer clave: genera temporal, desbloquea y obliga a primer ingreso', async () => {
    const id = await idDe(CED.colab1);
    await env.ctx.db('usuarios').where({ id }).update({ bloqueado_hasta: new Date(Date.now() + 600_000).toISOString() });
    const r = await admin.post(`/usuarios/${id}/reset-clave`, {});
    assert.equal(r.status, 200);
    const l = await cliente(env.app).login(CED.colab1, r.body.claveTemporal);
    assert.equal(l.status, 200);
    assert.equal(l.body.primerIngreso, true);
  });

  test('id inexistente → 404; id no numérico → 400', async () => {
    assert.equal((await admin.get('/usuarios/99999')).status, 404);
    assert.equal((await admin.get('/usuarios/abc')).status, 400);
  });

  test('ver el detalle de un usuario queda en la auditoría', async () => {
    const id = await idDe(CED.colab1);
    await admin.get(`/usuarios/${id}`);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER', entidad: 'usuario', entidad_id: String(id) }).first());
  });
});

describe('carga masiva desde la hoja EMPLEADOS', () => {
  test('vista previa: cuenta nuevos, retirados y no crea nada', async () => {
    const antes = Number((await env.ctx.db('usuarios').count({ n: '*' }))[0].n);
    const r = await admin.subir('/usuarios/carga-masiva', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'false' });
    assert.equal(r.status, 200);
    assert.equal(r.body.confirmado, false);
    assert.equal(r.body.nuevos.length, 6);
    assert.equal(r.body.omitidosRetirados, 1);
    assert.equal(r.body.errores.length, 0);
    assert.equal(Number((await env.ctx.db('usuarios').count({ n: '*' }))[0].n), antes);
  });

  test('archivo con errores: se reportan y no se puede confirmar', async () => {
    const r = await admin.subir('/usuarios/carga-masiva', path.join(FIX, 'empleados-con-errores.xlsx'), { confirmar: 'false' });
    assert.equal(r.body.errores.length, 4);
    const c = await admin.subir('/usuarios/carga-masiva', path.join(FIX, 'empleados-con-errores.xlsx'), { confirmar: 'true' });
    assert.equal(c.status, 400);
    assert.equal(await env.ctx.db('usuarios').where({ cedula: '2000000001' }).first(), undefined, 'no se crea nada parcial');
  });

  test('confirmar: crea todos en una transacción con clave temporal y primer ingreso obligatorio', async () => {
    const r = await admin.subir('/usuarios/carga-masiva', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true' });
    assert.equal(r.status, 200);
    assert.equal(r.body.creados.length, 6);
    const uno = r.body.creados[0];
    const l = await cliente(env.app).login(uno.cedula, uno.claveTemporal);
    assert.equal(l.body.primerIngreso, true);
    const aud = await env.ctx.db('auditoria').where({ accion: 'CARGA_MASIVA' }).first();
    assert.doesNotMatch(aud.detalle, new RegExp(uno.claveTemporal));
    // Segunda vez: ya no hay nuevos
    const otra = await admin.subir('/usuarios/carga-masiva', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true' });
    assert.equal(otra.status, 400);
  });

  test('rechaza archivos que no son Excel aunque tengan extensión .xlsx', async () => {
    const tmp = path.join(FIX, '..', 'falso.tmp.xlsx');
    fs.writeFileSync(tmp, '%PDF-1.4 esto no es un excel');
    try {
      const r = await admin.subir('/usuarios/carga-masiva', tmp);
      assert.equal(r.status, 400);
      assert.match(r.body.error.mensaje, /no es un libro de Excel/);
    } finally {
      fs.rmSync(tmp);
    }
    const sinArchivo = await admin.post('/usuarios/carga-masiva', {});
    assert.equal(sinArchivo.status, 400);
  });
});
