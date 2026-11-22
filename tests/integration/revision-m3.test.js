// Regresión de los hallazgos de la revisión independiente de M3 (motor de solicitudes y permisos).
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';

let env;
let admin;
let director;
let colab1; // SEDE NORTE (sede del director)
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
});
after(() => env.cerrar());

const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const dia = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
let desfase = 0; // cada solicitud en un día distinto, para no traslaparse

async function pedir(c, campos = {}, archivo = null) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  const d = dia(2 + (desfase++ % 25));
  const datos = { tipo: 'PERMISO', subtipo: 'DILIGENCIA PERSONAL', fecha_inicio: d, hora_inicio: '08:00', fecha_fin: d, hora_fin: '10:00', motivo: 'Trámite en el banco', ...campos };
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) r = r.field(k, v);
  if (archivo) r = r.attach('soporte', archivo.buffer, archivo.nombre);
  return r;
}

describe('separación de funciones', () => {
  test('el único admincontable no puede enviar una solicitud propia: mensaje claro', async () => {
    const r = await pedir(admin);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.mensaje, /nadie aprueba la propia/);
    assert.equal(Number((await env.ctx.db('solicitudes').whereNot('estado', 'BORRADOR').count({ n: '*' }))[0].n), 0);
  });

  test('la solicitud propia del director salta su paso y va al área contable', async () => {
    const r = await pedir(director);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const s = (await director.get(`/solicitudes/${r.body.id}`)).body;
    assert.equal(s.estado, 'PENDIENTE_CONTABLE');
    assert.equal(s.pasos[0].estado, 'OMITIDO');
    assert.equal(s.acciones.aprobar, false, 'no aprueba lo propio');
    assert.equal((await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).status, 403);
    assert.equal((await admin.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).status, 200);
  });

  test('un flujo con roles repetidos o más de dos pasos se rechaza', async () => {
    const t = (await admin.get('/auth/csrf')).body.csrf;
    const put = (pasos) => admin.agente.put('/api/v1/flujos/PERMISO').set('X-CSRF-Token', t).send({ pasos });
    assert.equal((await put([{ rol: 'ADMIN' }, { rol: 'ADMIN' }])).status, 400);
    assert.equal((await put([{ rol: 'DIRECTOR' }, { rol: 'ADMIN' }, { rol: 'ADMIN' }])).status, 400);
    assert.equal((await put([])).status, 400);
  });
});

describe('concurrencia y robustez', () => {
  test('aprobar con un estado distinto al que veía el usuario → 409; sin estado → 400', async () => {
    const r = await pedir(colab1);
    assert.equal((await director.post(`/solicitudes/${r.body.id}/aprobar`, {})).status, 400);
    const c = await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' });
    assert.equal(c.status, 409);
    assert.match(c.body.error.mensaje, /Recargue/);
    assert.equal((await director.post(`/solicitudes/${r.body.id}/rechazar`, { motivo: 'No procede ahora', estadoEsperado: 'APROBADA' })).status, 409);
    assert.equal((await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 200);
  });

  test('si falla la notificación, la aprobación igual queda hecha (200)', async () => {
    const r = await pedir(colab1);
    const original = env.ctx.notificaciones.notificar;
    env.ctx.notificaciones.notificar = async () => {
      throw new Error('SMTP caído (simulado)');
    };
    try {
      const a = await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
      assert.equal(a.status, 200, JSON.stringify(a.body));
    } finally {
      env.ctx.notificaciones.notificar = original;
    }
    assert.equal((await colab1.get(`/solicitudes/${r.body.id}`)).body.estado, 'PENDIENTE_CONTABLE');
  });

  test('el rechazo queda marcado en el paso donde ocurrió', async () => {
    const r = await pedir(colab1);
    assert.equal((await director.post(`/solicitudes/${r.body.id}/rechazar`, { motivo: 'Cruce con inventario', estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 200);
    const s = (await colab1.get(`/solicitudes/${r.body.id}`)).body;
    assert.deepEqual(s.pasos.map((p) => p.estado), ['RECHAZADO', 'PENDIENTE']);
  });
});

describe('privacidad', () => {
  test('el director no ve borradores ajenos', async () => {
    const r = await pedir(colab1, { enviar: 'false' });
    assert.equal(r.status, 201);
    assert.equal((await director.get(`/solicitudes/${r.body.id}`)).status, 404);
    assert.ok(!(await director.get('/aprobaciones')).body.solicitudes.some((s) => s.id === r.body.id));
    assert.equal((await colab1.get(`/solicitudes/${r.body.id}`)).status, 200);
  });

  test('soporte de cita médica (dato de salud): el director no lo descarga; otro tipo sí', async () => {
    const sensible = await pedir(colab1, { subtipo: 'CITA MÉDICA' }, { buffer: PDF, nombre: 'cita.pdf' });
    const normal = await pedir(colab1, {}, { buffer: PDF, nombre: 'banco.pdf' });
    const docSens = (await colab1.get(`/solicitudes/${sensible.body.id}`)).body.documentoId;
    const docNormal = (await colab1.get(`/solicitudes/${normal.body.id}`)).body.documentoId;
    assert.equal((await director.get(`/documentos/${docSens}`)).status, 404);
    assert.equal((await director.get(`/documentos/${docNormal}`)).status, 200);
    assert.equal((await admin.get(`/documentos/${docSens}`)).status, 200);
    assert.equal((await colab1.get(`/documentos/${docSens}`)).status, 200);
  });
});

describe('revisión de PDF', () => {
  test('contenido activo escondido con escapes #xx se detecta', async () => {
    const r = await pedir(colab1, {}, { buffer: Buffer.from('%PDF-1.4\n<< /OpenAction << /S /J#61vaScript /J#53 (app.alert(1)) >> >>\n%%EOF'), nombre: 'oculto.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /contenido activo/);
  });

  test('un HTML con "%PDF" más adelante no pasa como PDF', async () => {
    const r = await pedir(colab1, {}, { buffer: Buffer.from('<html><script>alert(1)</script>\n%PDF-1.4\n%%EOF'), nombre: 'disfrazado.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /no es un PDF válido/);
  });

  test('el límite de tamaño sale del parámetro UPLOAD_MAX_MB (10 MB acepta 7 MB)', async () => {
    await env.ctx.db('parametros').where({ clave: 'UPLOAD_MAX_MB' }).update({ valor: JSON.stringify(10) });
    env.ctx.params.invalidar();
    try {
      const siete = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(7 * 1024 * 1024, 32), Buffer.from('\n%%EOF')]);
      const r = await pedir(colab1, {}, { buffer: siete, nombre: 'grande.pdf' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally {
      await env.ctx.db('parametros').where({ clave: 'UPLOAD_MAX_MB' }).update({ valor: JSON.stringify(5) });
      env.ctx.params.invalidar();
    }
  });
});
