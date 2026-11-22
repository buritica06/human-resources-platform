// Regresión de los hallazgos de la revisión independiente de M8 (panel del admincontable).
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
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  colab1 = await comoUsuario(env.app, CED.colab1);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
});
after(() => env.cerrar());
const programar = (clave, datos) => admin.post(`/parametros/${clave}/versiones`, { motivo: 'Prueba de revisión', ...datos });

test('la fecha por defecto de los parámetros es la de Colombia, no la UTC', async () => {
  const real = Date.now;
  // 20:00 en Bogotá del 31/12/2026 = 01:00 UTC del 01/01/2027: el SMMLV 2026 aún rige
  Date.now = () => Date.parse('2027-01-01T01:00:00Z');
  try {
    env.ctx.params.invalidar();
    assert.equal(await env.ctx.params.valor('SMMLV'), 1750905);
  } finally {
    Date.now = real;
    env.ctx.params.invalidar();
  }
});

test('validación: enteros, rangos de nómina y campos auto-editables permitidos', async () => {
  assert.match((await programar('LOGIN_MAX_INTENTOS', { valor: 2.5, desde: hoy })).body.error.campos.valor, /entero/);
  assert.match((await programar('HORAS_MES', { valor: 0, desde: hoy })).body.error.campos.valor, /entre 1/);
  assert.match((await programar('HORA_NOCHE_INI', { valor: 99, desde: hoy })).body.error.campos.valor, /entre 0 y 23/);
  const r = await programar('CAMPOS_EDITABLES_COLABORADOR', { valor: ['celular', 'salario_base', 'numero_cuenta'], desde: hoy });
  assert.match(r.body.error.campos.valor, /salario_base, numero_cuenta/);
  assert.match((await programar('LISTA_TIPOS_PERMISO_SENSIBLES', { valor: ['INVENTADO'], desde: hoy })).body.error.campos.valor, /No son tipos de permiso/);
});

test('no se dejan huecos: tras una versión con fin, la siguiente empieza el día después', async () => {
  // SMMLV 2026 termina el 2026-12-31
  const r = await programar('SMMLV', { valor: 1900000, desde: '2027-02-01' });
  assert.match(r.body.error.campos.desde, /2027-01-01/);
  assert.equal((await programar('SMMLV', { valor: 1900000, desde: '2027-01-01' })).status, 201);
});

test('una versión que empieza hoy y se creó hoy se puede corregir (borrar)', async () => {
  const r = await programar('PERMISO_MAX_DIAS', { valor: 4, desde: hoy });
  assert.equal(r.status, 201);
  const v = r.body.versiones.find((x) => x.desde === hoy);
  const del = await admin.agente.delete(`/api/v1/parametros/versiones/${v.id}`).set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  env.ctx.params.invalidar();
  assert.equal(await env.ctx.params.valor('PERMISO_MAX_DIAS'), 3);
});

test('al programar con la norma, se quita la marca VERIFICAR', async () => {
  const r = await programar('VAC_COMPENSACION_MAX_PCT', { valor: 50, desde: sumarDias(hoy, 1), motivo: 'Confirmado con asesor laboral' });
  assert.equal(r.status, 201);
  const prog = r.body.versiones.find((x) => x.estado === 'PROGRAMADA');
  assert.ok(!/VERIFICAR/.test(prog.descripcion));
});

test('alerta de parámetros por vencer sin versión siguiente', async () => {
  const alertas = (await admin.get('/admin/resumen')).body.alertas.map((a) => a.texto).join(' ');
  if (hoy >= '2026-11-01' && hoy <= '2026-12-31') assert.match(alertas, /AUX_TRANSP/);
});

test('una incapacidad no se registra sobre una suspensión', async () => {
  assert.equal((await admin.post(`/colaboradores/${idColab1}/suspensiones`, { fecha_inicio: sumarDias(hoy, -5), fecha_fin: sumarDias(hoy, -4), motivo: 'Suspensión de prueba' })).status, 201);
  const t = (await colab1.get('/auth/csrf')).body.csrf;
  const r = await colab1.agente.post('/api/v1/incapacidades').set('X-CSRF-Token', t)
    .field('tipo', 'IGE').field('entidad', 'Sura').field('fecha_inicio', sumarDias(hoy, -4)).field('fecha_fin', sumarDias(hoy, -3)).attach('soporte', PDF, 'c.pdf');
  assert.equal(r.status, 400);
  assert.match(r.body.error.campos.fecha_inicio, /suspensión/);
});

test('ausentismo: permisos de un día en horas, de varios días en días; licencia sensible reservada', async () => {
  const tk = async (c) => (await c.get('/auth/csrf')).body.csrf;
  const d1 = sumarDias(hoy, 3);
  const p = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'PERMISO').field('subtipo', 'DILIGENCIA PERSONAL')
    .field('fecha_inicio', d1).field('hora_inicio', '08:00').field('fecha_fin', d1).field('hora_fin', '09:30').field('motivo', 'Trámite personal');
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const m = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'LICENCIA').field('subtipo', 'MATERNIDAD')
    .field('fecha_inicio', sumarDias(hoy, 10)).field('fecha_fin', sumarDias(hoy, 12)).field('motivo', 'Licencia de prueba').attach('soporte', PDF, 's.pdf');
  assert.equal(m.status, 201, JSON.stringify(m.body));
  // Aprobación directa en la BD (el flujo ya se probó en otras pruebas)
  await env.ctx.db('solicitudes').whereIn('id', [p.body.id, m.body.id]).update({ estado: 'APROBADA', paso_actual: null });
  const r = (await admin.get(`/reportes/ausentismo?desde=${hoy}&hasta=${sumarDias(hoy, 20)}`)).body;
  const permiso = r.filas.find((f) => f.tipo === 'Permiso');
  assert.equal(permiso.horas, 1.5);
  const lic = r.filas.find((f) => f.tipo === 'Licencia');
  assert.equal(lic.detalle, 'Reservado');
  const tp = r.totales.find((t) => t.tipo === 'Permiso');
  assert.equal(tp.horas, 1.5);
});

test('auditoría: fechas inválidas o invertidas → 400; página máxima', async () => {
  assert.equal((await admin.get('/auditoria?hasta=2026-13-01')).status, 400);
  assert.equal((await admin.get(`/auditoria?desde=${hoy}&hasta=${sumarDias(hoy, -1)}`)).status, 400);
  assert.equal((await admin.get('/auditoria?pagina=1001')).status, 400);
});

test('suspensiones: anular dos veces → 409; la consulta ajena queda auditada', async () => {
  const s = (await admin.get(`/colaboradores/${idColab1}/suspensiones`)).body.suspensiones[0];
  assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER_SUSPENSIONES', entidad_id: String(idColab1) }).first());
  assert.equal((await admin.post(`/suspensiones/${s.id}/anular`, { motivo: 'Corrección de fechas' })).status, 200);
  assert.equal((await admin.post(`/suspensiones/${s.id}/anular`, { motivo: 'Otra vez' })).status, 409);
});
