// Regresión de los hallazgos de la revisión independiente de M5 (incapacidades).
import '../helpers/entorno.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { FESTIVOS } from '../../seeds/datos-iniciales.js';
import { hoyBogota, primerHabilDesde, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1;
const hoy = hoyBogota();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const SECRETO = 'TRASTORNO DEPRESIVO';

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
});
after(() => env.cerrar());

async function registrar(c, campos = {}, archivo = { buffer: PDF, nombre: 'cert.pdf' }) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/incapacidades').set('X-CSRF-Token', t);
  for (const [k, v] of Object.entries({ tipo: 'IGE', entidad: 'Sura', diagnostico: SECRETO, ...campos })) r = r.field(k, String(v));
  if (archivo) r = r.attach('soporte', archivo.buffer, archivo.nombre);
  return r;
}

test('correos de incapacidad: genéricos, sin nombre, fechas, diagnóstico ni motivo', async () => {
  env.ctx.mailer.enviados.length = 0;
  const r = await registrar(colab1, { fecha_inicio: sumarDias(hoy, -40), fecha_fin: sumarDias(hoy, -39) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await admin.post(`/incapacidades/${r.body.id}/devolver`, {
    motivo: `Falta la firma del médico tratante de ${SECRETO}`,
    estadoEsperado: 'REGISTRADA',
  });
  assert.ok(env.ctx.mailer.enviados.length >= 2);
  for (const m of env.ctx.mailer.enviados) {
    const texto = `${m.asunto} ${m.texto}`;
    assert.ok(!texto.includes(SECRETO) && !texto.includes('PEREZ') && !texto.includes('/20'), `correo con datos: ${texto}`);
  }
  // Tampoco en las notificaciones de la campana
  const notifs = await env.ctx.db('notificaciones').select('titulo', 'mensaje');
  assert.ok(!JSON.stringify(notifs).includes(SECRETO), 'el motivo no va en la notificación');
});

test('el PDF inválido se informa junto con los demás errores (un solo intento)', async () => {
  const r = await registrar(colab1, { entidad: '', fecha_inicio: hoy, fecha_fin: hoy }, { buffer: Buffer.from('no pdf'), nombre: 'x.pdf' });
  assert.equal(r.status, 400);
  assert.ok(r.body.error.campos.entidad && r.body.error.campos.soporte);
});

test('una solicitud en trámite no se puede aprobar si luego se registró una incapacidad en esas fechas', async () => {
  const d = primerHabilDesde(sumarDias(hoy, 20), { festivos: new Map(FESTIVOS), sabadoHabil: true });
  const t = (await colab1.get('/auth/csrf')).body.csrf;
  const s = await colab1.agente
    .post('/api/v1/solicitudes')
    .set('X-CSRF-Token', t)
    .field('tipo', 'VACACIONES')
    .field('fecha_inicio', d)
    .field('dias', '2')
    .field('dias_compensar', '0');
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const inc = await registrar(colab1, { fecha_inicio: d, fecha_fin: d });
  assert.equal(inc.status, 201, JSON.stringify(inc.body));
  const a = await director.post(`/solicitudes/${s.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
  assert.equal(a.status, 400);
  assert.match(a.body.error.mensaje, /otra ausencia/, 'al director no se le dice qué ausencia es');
});

test('prórroga: mismo tipo; anulada no cuenta para cruces ni la ve el director', async () => {
  const base = await registrar(colab1, { fecha_inicio: sumarDias(hoy, -30), fecha_fin: sumarDias(hoy, -28) });
  assert.equal(base.status, 201);
  const p = await registrar(colab1, {
    tipo: 'IRL',
    entidad: 'ARL Demo',
    fecha_inicio: sumarDias(hoy, -27),
    fecha_fin: sumarDias(hoy, -26),
    prorroga_de: base.body.id,
  });
  assert.match(p.body.error.campos.tipo, /mismo tipo/);
  // El admin anula una ajena: motivo obligatorio
  assert.equal((await admin.post(`/incapacidades/${base.body.id}/anular`, {})).status, 400);
  const an = await admin.post(`/incapacidades/${base.body.id}/anular`, { motivo: 'Registrada por error' });
  assert.equal(an.body.estado, 'ANULADA');
  assert.equal((await admin.post(`/incapacidades/${base.body.id}/anular`, { motivo: 'Otra vez' })).status, 409);
  const lista = (await director.get('/incapacidades')).body.incapacidades;
  assert.ok(!lista.some((i) => i.fechaInicio === sumarDias(hoy, -30)), 'el director no ve las anuladas');
  // Las mismas fechas ya se pueden registrar de nuevo
  assert.equal((await registrar(colab1, { fecha_inicio: sumarDias(hoy, -30), fecha_fin: sumarDias(hoy, -28) })).status, 201);
});

test('al director solo nombre y sede del colaborador (sin id ni cargo)', async () => {
  const lista = (await director.get('/incapacidades')).body.incapacidades;
  assert.ok(lista.length);
  for (const i of lista) assert.deepEqual(Object.keys(i.colaborador).sort(), ['nombre', 'sede']);
});

test('conteo de pendientes para Inicio: solo admin y sin auditar lectura', async () => {
  const antes = Number((await env.ctx.db('auditoria').where({ accion: 'VER_INCAPACIDADES' }).count({ n: '*' }))[0].n);
  const r = await admin.get('/incapacidades/pendientes');
  assert.equal(typeof r.body.pendientes, 'number');
  assert.equal(Number((await env.ctx.db('auditoria').where({ accion: 'VER_INCAPACIDADES' }).count({ n: '*' }))[0].n), antes);
  assert.equal((await director.get('/incapacidades/pendientes')).status, 403);
});
