// Regresión de la revisión final (cierre): visibilidad del director en listados, documentos, saldo
// resumido, mensajes de cruce genéricos y validación de entradas.
import '../helpers/entorno.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { hoyBogota, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1;
let idColab1;
const hoy = hoyBogota();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
});
after(() => env.cerrar());

const tk = async (c) => (await c.get('/auth/csrf')).body.csrf;

test('motivo de solicitudes sensibles reservado para el director también en bandeja y expediente', async () => {
  const m = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'LICENCIA').field('subtipo', 'MATERNIDAD')
    .field('fecha_inicio', sumarDias(hoy, 50)).field('fecha_fin', sumarDias(hoy, 55)).field('motivo', 'Control por preeclampsia').attach('soporte', PDF, 's.pdf');
  assert.equal(m.status, 201, JSON.stringify(m.body));
  const p = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'PERMISO').field('subtipo', 'CITA MÉDICA')
    .field('fecha_inicio', sumarDias(hoy, 3)).field('hora_inicio', '08:00').field('fecha_fin', sumarDias(hoy, 3)).field('hora_fin', '10:00').field('motivo', 'Control de cardiología');
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const bandeja = JSON.stringify((await director.get('/aprobaciones')).body);
  const exp = JSON.stringify((await director.get(`/colaboradores/${idColab1}/solicitudes`)).body);
  for (const texto of [bandeja, exp]) {
    assert.ok(!texto.includes('preeclampsia') && !texto.includes('cardiología'), 'el director no ve motivos de salud');
  }
  assert.match(JSON.stringify((await admin.get(`/colaboradores/${idColab1}/solicitudes`)).body), /preeclampsia/, 'el admin sí');
  assert.match(JSON.stringify((await colab1.get('/me/solicitudes')).body), /preeclampsia/, 'la dueña sí');
});

test('el director no descarga soportes de borradores', async () => {
  const b = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'PERMISO').field('subtipo', 'DILIGENCIA PERSONAL')
    .field('fecha_inicio', sumarDias(hoy, 7)).field('hora_inicio', '08:00').field('fecha_fin', sumarDias(hoy, 7)).field('hora_fin', '09:00').field('motivo', 'Trámite en notaría')
    .field('enviar', 'false').attach('soporte', PDF, 'b.pdf');
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal((await director.get(`/documentos/${b.body.documentoId}`)).status, 404);
  await colab1.post(`/solicitudes/${b.body.id}/enviar`, {});
  assert.equal((await director.get(`/documentos/${b.body.documentoId}`)).status, 200, 'enviada y no sensible: sí');
});

test('el director ve el saldo de vacaciones resumido (sin desglose de días no laborados)', async () => {
  const s = (await director.get(`/colaboradores/${idColab1}/vacaciones`)).body.saldo;
  assert.equal(s.resumido, true);
  assert.equal(s.diasNoLaborados, undefined);
  assert.ok(typeof s.paraSolicitar === 'number');
  assert.ok((await admin.get(`/colaboradores/${idColab1}/vacaciones`)).body.saldo.diasLaborados >= 0);
});

test('al aprobar, el director recibe un mensaje de cruce genérico (no revela suspensiones)', async () => {
  const d = sumarDias(hoy, 20);
  const p = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', await tk(colab1)).field('tipo', 'PERMISO').field('subtipo', 'DILIGENCIA PERSONAL')
    .field('fecha_inicio', d).field('hora_inicio', '08:00').field('fecha_fin', d).field('hora_fin', '09:00').field('motivo', 'Trámite en el banco');
  assert.equal(p.status, 201);
  await env.ctx.db('suspensiones').insert({ colaborador_id: idColab1, fecha_inicio: d, fecha_fin: d, dias: 1, motivo: 'Prueba', creado_en: new Date().toISOString() });
  const a = await director.post(`/solicitudes/${p.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
  assert.equal(a.status, 400);
  assert.doesNotMatch(a.body.error.mensaje, /suspensi/);
  assert.match(a.body.error.mensaje, /otra ausencia/);
});

test('entradas no numéricas → 400 (no 500)', async () => {
  const r = await admin.agente.post('/api/v1/incapacidades').set('X-CSRF-Token', await tk(admin)).field('colaborador_id', 'abc')
    .field('tipo', 'IGE').field('entidad', 'Sura').field('fecha_inicio', hoy).field('fecha_fin', hoy).attach('soporte', PDF, 'c.pdf');
  assert.equal(r.status, 400);
});
