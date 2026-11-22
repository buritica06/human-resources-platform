// M5 – Incapacidades: registro con PDF, cifrado del diagnóstico, visibilidad por rol y auditoría.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { hoyBogota, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1; // SEDE NORTE (sede del director)
let colab2; // SEDE RIO
let idColab1;
let idColab2;
const hoy = hoyBogota();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const DIAG = 'J06.9 Infección aguda de vías respiratorias';

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  colab2 = await comoUsuario(env.app, CED.colab2);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
  idColab2 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab2 }).first()).id;
});
after(() => env.cerrar());

async function registrar(c, campos = {}, archivo = { buffer: PDF, nombre: 'certificado.pdf' }) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/incapacidades').set('X-CSRF-Token', t);
  const datos = { tipo: 'IGE', entidad: 'Sura', fecha_inicio: sumarDias(hoy, -2), fecha_fin: sumarDias(hoy, 1), diagnostico: DIAG, numero_certificado: 'CERT-001', ...campos };
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) r = r.field(k, String(v));
  if (archivo) r = r.attach('soporte', archivo.buffer, archivo.nombre);
  return r;
}

let id;
describe('registro', () => {
  test('validaciones: tipo, entidad, fechas, PDF obligatorio', async () => {
    let r = await registrar(colab1, { tipo: 'XX', entidad: '', fecha_fin: sumarDias(hoy, -5) });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.tipo && r.body.error.campos.entidad && r.body.error.campos.fecha_fin);
    r = await registrar(colab1, {}, null);
    assert.match(r.body.error.campos.soporte, /PDF/);
    r = await registrar(colab1, { fecha_inicio: sumarDias(hoy, -90), fecha_fin: sumarDias(hoy, -88) });
    assert.match(r.body.error.campos.fecha_inicio, /últimos 60 días/);
    r = await registrar(colab1, { fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 200) });
    assert.match(r.body.error.campos.fecha_fin, /máximo 180/);
  });

  test('archivo no PDF renombrado a .pdf, > 5 MB o con extensión distinta → rechazado; nada se guarda', async () => {
    let r = await registrar(colab1, {}, { buffer: Buffer.from('MZ ejecutable disfrazado'), nombre: 'cert.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /no es un PDF válido/);
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5.5 * 1024 * 1024, 32), Buffer.from('\n%%EOF')]);
    r = await registrar(colab1, {}, { buffer: grande, nombre: 'grande.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /supera 5 MB/);
    r = await registrar(colab1, {}, { buffer: PDF, nombre: 'cert.png' });
    assert.equal(r.status, 400);
    assert.equal(Number((await env.ctx.db('incapacidades').count({ n: '*' }))[0].n), 0);
    assert.equal(Number((await env.ctx.db('documentos').count({ n: '*' }))[0].n), 0);
  });

  test('registro correcto: días calendario, diagnóstico cifrado en la BD, PDF sensible, avisos', async () => {
    const r = await registrar(colab1);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    assert.equal(r.body.dias, 4);
    assert.equal(r.body.estado, 'REGISTRADA');
    assert.equal(r.body.diagnostico, DIAG, 'el dueño lo ve');
    const fila = await env.ctx.db('incapacidades').where({ id }).first();
    assert.ok(fila.diagnostico_cifrado && !fila.diagnostico_cifrado.includes('J06'), 'cifrado en reposo');
    assert.equal(Boolean((await env.ctx.db('documentos').where({ id: fila.documento_id }).first()).sensible), true);
    // Notificaciones: admin con enlace; director solo fechas (sin diagnóstico ni tipo)
    const u = async (ced) => (await env.ctx.db('usuarios').where({ cedula: ced }).first()).id;
    const nDir = await env.ctx.db('notificaciones').where({ usuario_id: await u(CED.director) }).orderBy('id', 'desc').first();
    assert.match(nDir.titulo, /incapacitado/);
    assert.ok(!JSON.stringify(nDir).includes('J06') && !/general|EPS|Sura/i.test(`${nDir.mensaje}`));
    assert.ok(await env.ctx.db('notificaciones').where({ usuario_id: await u(CED.admin) }).first());
    assert.ok(!env.ctx.mailer.enviados.some((m) => m.texto.includes('J06')), 'el diagnóstico nunca va por correo');
  });

  test('no se cruza con otra incapacidad; una prórroga debe ser continua', async () => {
    let r = await registrar(colab1, { fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 3) });
    assert.match(r.body.error.campos.fecha_inicio, /Se cruza/);
    r = await registrar(colab1, { fecha_inicio: sumarDias(hoy, 4), fecha_fin: sumarDias(hoy, 6), prorroga_de: id });
    assert.match(r.body.error.campos.fecha_inicio, /día siguiente/);
    r = await registrar(colab1, { fecha_inicio: sumarDias(hoy, 2), fecha_fin: sumarDias(hoy, 5), prorroga_de: id, diagnostico: '' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.prorrogaDe, id);
    assert.equal(r.body.diagnostico, null);
  });

  test('una solicitud de permiso o vacaciones no puede cruzarse con una incapacidad', async () => {
    const t = (await colab1.get('/auth/csrf')).body.csrf;
    const r = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t)
      .field('tipo', 'PERMISO').field('subtipo', 'DILIGENCIA PERSONAL').field('fecha_inicio', hoy).field('hora_inicio', '08:00')
      .field('fecha_fin', hoy).field('hora_fin', '10:00').field('motivo', 'Trámite personal');
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /incapacidad/);
  });
});

describe('visibilidad (Ley 1581)', () => {
  test('el director recibe SOLO nombre, fechas y días (verificado en el JSON)', async () => {
    const r = await director.get('/incapacidades');
    assert.equal(r.status, 200);
    assert.equal(r.body.soloFechas, true);
    assert.ok(r.body.incapacidades.length >= 1);
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['J06', 'diagnostico', 'tipo', 'entidad', 'Sura', 'CERT-001', 'documentoId', 'numeroCertificado', 'cedula', CED.colab1]) {
      assert.ok(!texto.includes(prohibido), `no debe incluir "${prohibido}"`);
    }
    assert.deepEqual(Object.keys(r.body.incapacidades[0]).sort(), ['colaborador', 'dias', 'fechaFin', 'fechaInicio']);
    const p = await director.get(`/colaboradores/${idColab1}/incapacidades`);
    assert.equal(p.body.soloFechas, true);
    assert.ok(!JSON.stringify(p.body).includes('J06') && !JSON.stringify(p.body).includes('Sura'));
  });

  test('el director no ve el detalle, ni el PDF, ni otras sedes', async () => {
    assert.equal((await director.get(`/incapacidades/${id}`)).status, 404);
    const docId = (await env.ctx.db('incapacidades').where({ id }).first()).documento_id;
    assert.equal((await director.get(`/documentos/${docId}`)).status, 404);
    assert.equal((await director.get(`/colaboradores/${idColab2}/incapacidades`)).status, 404);
  });

  test('otro colaborador no ve nada; el colaborador no accede a la lista del equipo', async () => {
    assert.equal((await colab2.get(`/incapacidades/${id}`)).status, 404);
    assert.equal((await colab2.get(`/colaboradores/${idColab1}/incapacidades`)).status, 404);
    assert.equal((await colab2.get('/incapacidades')).status, 403);
    const docId = (await env.ctx.db('incapacidades').where({ id }).first()).documento_id;
    assert.equal((await colab2.get(`/documentos/${docId}`)).status, 404);
    assert.deepEqual((await colab2.get('/me/incapacidades')).body.incapacidades, []);
  });

  test('el admincontable ve todo; cada lectura del detalle (diagnóstico) y del PDF se audita', async () => {
    const antes = Number((await env.ctx.db('auditoria').where({ accion: 'VER_INCAPACIDAD', entidad_id: String(id) }).count({ n: '*' }))[0].n);
    const r = await admin.get(`/incapacidades/${id}`);
    assert.equal(r.body.diagnostico, DIAG);
    assert.equal(r.body.acciones.validar, true);
    const despues = Number((await env.ctx.db('auditoria').where({ accion: 'VER_INCAPACIDAD', entidad_id: String(id) }).count({ n: '*' }))[0].n);
    assert.equal(despues, antes + 1);
    const aud = await env.ctx.db('auditoria').where({ accion: 'VER_INCAPACIDAD', entidad_id: String(id) }).orderBy('id', 'desc').first();
    assert.ok(!String(aud.detalle).includes('J06'), 'la auditoría no guarda el diagnóstico');
    const docId = (await env.ctx.db('incapacidades').where({ id }).first()).documento_id;
    assert.equal((await admin.get(`/documentos/${docId}`)).status, 200);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'DESCARGAR', entidad: 'documento', entidad_id: String(docId) }).first());
    const lista = await admin.get('/incapacidades?estado=REGISTRADA');
    assert.equal(lista.body.soloFechas, false);
    assert.ok(!JSON.stringify(lista.body).includes('J06'), 'la lista no trae diagnósticos');
  });
});

describe('revisión del área contable', () => {
  test('devolver exige motivo; validar con estado esperado; el colaborador recibe aviso', async () => {
    assert.equal((await director.post(`/incapacidades/${id}/validar`, { estadoEsperado: 'REGISTRADA' })).status, 403);
    assert.equal((await admin.post(`/incapacidades/${id}/devolver`, { motivo: 'x', estadoEsperado: 'REGISTRADA' })).status, 400);
    assert.equal((await admin.post(`/incapacidades/${id}/validar`, { estadoEsperado: 'VALIDADA' })).status, 409);
    const r = await admin.post(`/incapacidades/${id}/validar`, { estadoEsperado: 'REGISTRADA' });
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'VALIDADA');
    assert.equal((await colab1.get(`/incapacidades/${id}`)).body.acciones.anular, false, 'validada: el colaborador ya no la anula');
    assert.equal((await colab1.post(`/incapacidades/${id}/anular`, {})).status, 403);
  });

  test('el colaborador puede anular la suya mientras está en revisión; el admin registra a nombre de otro', async () => {
    const r = await registrar(colab2, { fecha_inicio: sumarDias(hoy, -10), fecha_fin: sumarDias(hoy, -9) });
    assert.equal(r.status, 201);
    assert.equal((await colab2.post(`/incapacidades/${r.body.id}/anular`, { motivo: 'Subí el archivo equivocado' })).body.estado, 'ANULADA');
    const a = await registrar(admin, { colaborador_id: idColab2, fecha_inicio: sumarDias(hoy, -100), fecha_fin: sumarDias(hoy, -98) });
    assert.equal(a.status, 201, 'el admin puede registrar fechas antiguas');
    assert.equal(a.body.colaborador.id, idColab2);
    // un colaborador no puede registrar a nombre de otro: 403 y queda auditado
    const c = await registrar(colab2, { colaborador_id: idColab1, fecha_inicio: sumarDias(hoy, -20), fecha_fin: sumarDias(hoy, -20) });
    assert.equal(c.status, 403);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'ACCESO_DENEGADO', entidad: 'colaborador', entidad_id: String(idColab1) }).first());
  });
});
