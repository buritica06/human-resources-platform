import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import request from 'supertest';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';

const FIX = path.resolve(import.meta.dirname, '..', 'fixtures');
let env;
let admin;
let director;
let colab1;
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
});
after(() => env.cerrar());

const idColab = async (cedula) => (await env.ctx.db('colaboradores').where({ cedula }).first()).id;
const fila = (cedula) => env.ctx.db('colaboradores').where({ cedula }).first();

describe('Mi expediente (colaborador)', () => {
  test('ve sus datos, la cuenta enmascarada, qué puede editar y las 7 pestañas', async () => {
    const r = await colab1.get('/me/expediente');
    assert.equal(r.status, 200);
    assert.equal(r.body.colaborador.cedula, CED.colab1);
    assert.equal(r.body.colaborador.datos.numero_cuenta, '•••• 8901');
    assert.equal(r.body.colaborador.datos.salario_base, 1750905);
    const editable = Object.fromEntries(r.body.campos.map((c) => [c.clave, c.editable]));
    assert.equal(editable.celular, true);
    assert.equal(editable.salario_base, false);
    assert.equal(editable.cedula, false);
    assert.deepEqual(r.body.pestanas.map((p) => p.titulo), ['Datos', 'Nómina', 'Permisos', 'Vacaciones', 'Incapacidades', 'Licencias', 'Documentos']);
    assert.ok(r.body.campos.find((c) => c.clave === 'eps').opciones.includes('Sura'));
  });

  test('edita sus datos permitidos y queda en el historial', async () => {
    const r = await colab1.patch('/me/expediente', { celular: '310 555 1234', direccion: 'Calle 10 # 5-20', estado_civil: 'casado(a)' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.cambiados.sort(), ['celular', 'direccion', 'estado_civil']);
    const f = await fila(CED.colab1);
    assert.equal(f.celular, '3105551234');
    assert.equal(f.estado_civil, 'CASADO(A)');
    const h = await colab1.get('/me/expediente/historial');
    const cel = h.body.cambios.find((c) => c.campo === 'celular');
    assert.equal(cel.origen, 'COLABORADOR');
    assert.equal(cel.nuevo, '3105551234');
    assert.equal(cel.actor, 'PEREZ GOMEZ ANA MARIA');
  });

  test('el servidor rechaza campos no editables (y no aplica nada parcial)', async () => {
    const antes = await fila(CED.colab1);
    const r = await colab1.patch('/me/expediente', { celular: '3000000000', salario_base: 9999999, cargo: 'GERENTE' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.codigo, 'CAMPO_NO_EDITABLE');
    assert.ok(r.body.error.campos.salario_base && r.body.error.campos.cargo);
    const despues = await fila(CED.colab1);
    assert.equal(despues.celular, antes.celular);
    assert.equal(Number(despues.salario_base), 1750905);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'EDICION_DENEGADA' }).first());
  });

  test('valida formatos con mensajes por campo', async () => {
    const r = await colab1.patch('/me/expediente', { celular: '12345', estado_civil: 'COMPLICADO' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.celular, /10 dígitos/);
    assert.match(r.body.error.campos.estado_civil, /lista/);
  });

  test('sin cambios reales no se registra historial', async () => {
    const n = (await env.ctx.db('expediente_cambios').count({ n: '*' }))[0].n;
    const r = await colab1.patch('/me/expediente', { celular: '3105551234' });
    assert.deepEqual(r.body.cambiados, []);
    assert.equal((await env.ctx.db('expediente_cambios').count({ n: '*' }))[0].n, n);
  });

  test('los campos editables son parametrizables', async () => {
    assert.equal((await colab1.patch('/me/expediente', { nacionalidad: 'Colombiana' })).status, 403);
    await env.ctx.db('parametros').where({ clave: 'CAMPOS_EDITABLES_COLABORADOR' })
      .update({ valor: JSON.stringify(['celular', 'direccion', 'barrio', 'ciudad_residencia', 'estado_civil', 'nacionalidad', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono']) });
    env.ctx.params.invalidar();
    assert.equal((await colab1.patch('/me/expediente', { nacionalidad: 'Colombiana' })).status, 200);
  });

  test('un usuario sin expediente recibe un mensaje claro', async () => {
    const r = await admin.post('/usuarios', { cedula: '7000000001', nombre: 'SIN EXPEDIENTE PRUEBA' });
    await env.ctx.db('usuarios').where({ cedula: '7000000001' }).update({ debe_cambiar_clave: false, correo: 'x@example.com', correo_verificado_en: new Date().toISOString() });
    const c = await comoUsuario(env.app, '7000000001', r.body.claveTemporal);
    const e = await c.get('/me/expediente');
    assert.equal(e.status, 404);
    assert.equal(e.body.error.codigo, 'SIN_EXPEDIENTE');
  });
});

describe('alcance: nadie ve datos fuera de su alcance', () => {
  test('anónimo 401; colaborador 403 en la gestión de expedientes', async () => {
    assert.equal((await request(env.app).get('/api/v1/me/expediente')).status, 401);
    const otro = await idColab(CED.colab2);
    for (const ruta of ['/colaboradores', `/colaboradores/${otro}`, `/colaboradores/${otro}/historial`, `/colaboradores/${otro}/cuenta`, '/colaboradores/opciones']) {
      assert.equal((await colab1.get(ruta)).status, 403, ruta);
    }
    assert.equal((await colab1.patch(`/colaboradores/${otro}`, { cargo: 'X' })).status, 403);
  });

  test('director: lista solo sus sedes y recibe 404 fuera de ellas', async () => {
    const r = await director.get('/colaboradores');
    const cedulas = r.body.colaboradores.map((c) => c.cedula).sort();
    assert.deepEqual(cedulas, [CED.director, CED.colab1].sort());
    const fuera = await director.get(`/colaboradores/${await idColab(CED.colab2)}`);
    assert.equal(fuera.status, 404);
    assert.equal((await director.get(`/colaboradores/${await idColab(CED.colab2)}/historial`)).status, 404);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'ACCESO_DENEGADO' }).first());
    const filtroFuera = await director.get(`/colaboradores?sede=${(await fila(CED.colab2)).sede_id}`);
    assert.equal(filtroFuera.body.total, 0, 'filtrar por una sede ajena no la expone');
  });

  test('director: ve el expediente de su sede SIN datos de pago y no puede editar', async () => {
    const id = await idColab(CED.colab1);
    const r = await director.get(`/colaboradores/${id}`);
    assert.equal(r.status, 200);
    for (const k of ['banco', 'tipo_cuenta', 'numero_cuenta']) assert.ok(!(k in r.body.colaborador.datos), k);
    assert.ok(r.body.campos.every((c) => !c.editable));
    assert.ok(!r.body.campos.some((c) => c.clave === 'numero_cuenta'));
    assert.equal((await director.patch(`/colaboradores/${id}`, { cargo: 'X' })).status, 403);
    assert.equal((await director.get(`/colaboradores/${id}/cuenta`)).status, 403);
    const opciones = await director.get('/colaboradores/opciones');
    assert.deepEqual(opciones.body.sedes.map((s) => s.nombre).sort(), ['SEDE NORTE', 'SEDE SUR']);
  });

  test('director: el historial no muestra cambios de datos de pago', async () => {
    const id = await idColab(CED.colab1);
    await admin.patch(`/colaboradores/${id}`, { numero_cuenta: '55556666777' });
    const h = await director.get(`/colaboradores/${id}/historial`);
    assert.ok(!h.body.cambios.some((c) => c.campo === 'numero_cuenta'));
    const hAdmin = await admin.get(`/colaboradores/${id}/historial`);
    assert.ok(hAdmin.body.cambios.some((c) => c.campo === 'numero_cuenta'));
  });
});

describe('admincontable', () => {
  test('lista todos con filtros', async () => {
    const r = await admin.get('/colaboradores');
    assert.equal(r.body.total, 4);
    assert.equal((await admin.get('/colaboradores?q=ramirez')).body.total, 1);
    assert.equal((await admin.get('/colaboradores?estado=RETIRADO')).body.total, 0);
    assert.equal((await admin.get('/colaboradores?estado=OTRO')).status, 400);
  });

  test('edita cualquier dato; reglas entre campos; historial con nombres legibles', async () => {
    const id = await idColab(CED.colab2);
    let r = await admin.patch(`/colaboradores/${id}`, { salario_base: '2.000.000', cargo: 'cajero' });
    assert.equal(r.status, 200);
    assert.equal(r.body.colaborador.datos.salario_base, 2000000);
    assert.equal(r.body.colaborador.datos.cargo, 'CAJERO');
    const sedes = (await admin.get('/colaboradores/opciones')).body.sedes;
    const sedeOtroEmpleador = sedes.find((s) => s.empleador === 'EMPLEADOR DEMO A');
    r = await admin.patch(`/colaboradores/${id}`, { sede_id: sedeOtroEmpleador.id });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.sede_id, /no pertenece/);
    r = await admin.patch(`/colaboradores/${id}`, { estado: 'RETIRADO' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.fecha_retiro);
    r = await admin.patch(`/colaboradores/${id}`, { empleador_id: (await env.ctx.db('empleadores').where({ clave: 'EMP_A' }).first()).id, sede_id: sedeOtroEmpleador.id });
    assert.equal(r.status, 200);
    const h = await admin.get(`/colaboradores/${id}/historial`);
    const cambioSede = h.body.cambios.find((c) => c.campo === 'sede_id');
    assert.equal(cambioSede.anterior, 'SEDE RIO');
    assert.equal(cambioSede.origen, 'ADMIN');
    r = await admin.patch(`/colaboradores/${id}`, { cedula: '1' });
    assert.equal(r.status, 400, 'la cédula no se edita');
  });

  test('número de cuenta: cifrado en la BD, enmascarado en el historial y visible solo a pedido (auditado)', async () => {
    const id = await idColab(CED.colab2);
    await admin.patch(`/colaboradores/${id}`, { numero_cuenta: '11112222333' });
    const f = await fila(CED.colab2);
    assert.doesNotMatch(f.numero_cuenta_cifrado, /11112222333/);
    const h = await admin.get(`/colaboradores/${id}/historial`);
    const c = h.body.cambios.find((x) => x.campo === 'numero_cuenta');
    assert.equal(c.nuevo, '•••• 2333');
    const r = await admin.get(`/colaboradores/${id}/cuenta`);
    assert.equal(r.body.numeroCuenta, '11112222333');
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER_CUENTA', entidad_id: String(id) }).first());
    assert.equal((await admin.patch(`/colaboradores/${id}`, { numero_cuenta: '12-AB' })).status, 400);
  });

  test('ver un expediente queda auditado', async () => {
    const id = await idColab(CED.colab1);
    await admin.get(`/colaboradores/${id}`);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER', entidad: 'colaborador', entidad_id: String(id) }).first());
  });
});

describe('importación desde el libro de nómina', () => {
  test('colaborador y director no pueden importar', async () => {
    for (const c of [colab1, director]) {
      const t = (await c.get('/auth/csrf')).body.csrf;
      const r = await c.agente.post('/api/v1/colaboradores/importar').set('X-CSRF-Token', t).attach('archivo', Buffer.from('PK'), 'x.xlsx');
      assert.equal(r.status, 403);
    }
  });

  test('vista previa: nuevos, organización nueva y nada escrito', async () => {
    const r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'false' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.confirmado, false);
    assert.equal(r.body.nuevos.length, 8);
    assert.deepEqual(r.body.empleadoresNuevos, ['EMP_D']);
    assert.deepEqual(r.body.sedesNuevas, ['SEDE NUEVA (EMP_D)']);
    assert.equal(r.body.errores.length, 0);
    assert.equal(await fila('2000000001'), undefined);
    assert.equal(await env.ctx.db('empleadores').where({ clave: 'EMP_D' }).first(), undefined);
  });

  test('archivo con errores: se reportan por fila y no se escribe nada', async () => {
    const r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-con-errores.xlsx'), { confirmar: 'false' });
    assert.ok(r.body.errores.length >= 4, JSON.stringify(r.body.errores));
    const c = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-con-errores.xlsx'), { confirmar: 'true' });
    assert.equal(c.status, 400);
    assert.equal(await fila('2000000002'), undefined);
  });

  test('confirmar: crea expedientes y organización, cuenta cifrada, historial de alta', async () => {
    const r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.creados, 8);
    const f = await fila('2000000001');
    assert.equal(f.nombre, 'ACOSTA BELTRAN CAMILO ANDRES');
    assert.equal(f.fecha_ingreso, '2021-03-01');
    assert.equal(Number(f.salario_base), 1800000);
    assert.equal(f.afp, 'Porvenir');
    assert.ok(f.numero_cuenta_cifrado && !/^\d+$/.test(f.numero_cuenta_cifrado));
    const ret = await fila('2000000007');
    assert.equal(ret.estado, 'RETIRADO');
    assert.equal(ret.fecha_retiro, '2026-06-30');
    const nueva = await fila('2000000008');
    const sede = await env.ctx.db('sedes').where({ id: nueva.sede_id }).first();
    assert.equal(sede.nombre, 'SEDE NUEVA');
    assert.ok(await env.ctx.db('expediente_cambios').where({ colaborador_id: f.id, campo: '_alta', origen: 'IMPORTACION' }).first());
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'IMPORTAR_EXPEDIENTES' }).first());
  });

  test('reimportar: sin cambios; respeta los datos que mantiene el colaborador; detecta cambios del admin', async () => {
    let r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'false' });
    assert.equal(r.body.nuevos.length, 0);
    assert.equal(r.body.actualizar.length, 0, JSON.stringify(r.body.actualizar));
    assert.equal(r.body.sinCambios, 8);
    // El colaborador cambió su celular; el admin cambió el salario en la plataforma
    await env.ctx.db('colaboradores').where({ cedula: '2000000002' }).update({ celular: '3209998877', salario_base: 1900000 });
    r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true' });
    assert.deepEqual(r.body.actualizar.map((a) => a.cedula), ['2000000002']);
    assert.deepEqual(r.body.actualizar[0].campos, ['Salario base mensual']);
    const f = await fila('2000000002');
    assert.equal(f.celular, '3209998877', 'el Excel no pisa el celular que actualizó el colaborador');
    assert.equal(Number(f.salario_base), 1750905);
  });
});
