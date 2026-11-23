import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';

let env;
let admin;
let director;
let colab1; // SEDE NORTE (sede del director)
let colab2; // SEDE RIO (fuera del alcance del director)
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  colab2 = await comoUsuario(env.app, CED.colab2);
});
after(() => env.cerrar());

const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const dia = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

async function pedir(c, campos = {}, archivo = null) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  const datos = {
    tipo: 'PERMISO',
    subtipo: 'CITA MÉDICA',
    fecha_inicio: dia(2),
    hora_inicio: '08:00',
    fecha_fin: dia(2),
    hora_fin: '10:00',
    motivo: 'Control médico anual',
    ...campos,
  };
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) r = r.field(k, v);
  if (archivo) r = r.attach('soporte', archivo.buffer, archivo.nombre);
  return r;
}
const ultimaNotif = async (cedula) => {
  const u = await env.ctx.db('usuarios').where({ cedula }).first();
  return env.ctx.db('notificaciones').where({ usuario_id: u.id }).orderBy('id', 'desc').first();
};

describe('crear y validar', () => {
  test('validaciones con mensajes por campo', async () => {
    let r = await pedir(colab1, { subtipo: 'VACACIONES', hora_inicio: '25:00', motivo: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.subtipo && r.body.error.campos.hora_inicio && r.body.error.campos.motivo);
    r = await pedir(colab1, { hora_fin: '07:00' });
    assert.match(r.body.error.campos.hora_fin, /posterior/);
    r = await pedir(colab1, { fecha_fin: dia(6) });
    assert.match(r.body.error.campos.fecha_fin, /máximo 3/);
    r = await pedir(colab1, { fecha_inicio: dia(-40), fecha_fin: dia(-40) });
    assert.match(r.body.error.campos.fecha_inicio, /30 días/);
  });

  test('soporte: solo PDF real, sin contenido activo y hasta 5 MB', async () => {
    let r = await pedir(colab1, {}, { buffer: Buffer.from('no soy un pdf'), nombre: 'falso.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /no es un PDF válido/);
    r = await pedir(
      colab1,
      {},
      { buffer: Buffer.from('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n%%EOF'), nombre: 'malo.pdf' },
    );
    assert.match(r.body.error.mensaje, /contenido activo/);
    r = await pedir(colab1, {}, { buffer: PDF, nombre: 'foto.jpg' });
    assert.equal(r.status, 400);
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5.5 * 1024 * 1024, 32), Buffer.from('\n%%EOF')]);
    r = await pedir(colab1, {}, { buffer: grande, nombre: 'grande.pdf' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /supera 5 MB/);
    assert.equal(Number((await env.ctx.db('documentos').count({ n: '*' }))[0].n), 0, 'nada se guardó');
  });

  test('un usuario sin expediente no puede pedir permisos', async () => {
    const r = await admin.post('/usuarios', { cedula: '8000000001', nombre: 'SIN EXPEDIENTE DOS' });
    await env.ctx
      .db('usuarios')
      .where({ cedula: '8000000001' })
      .update({ debe_cambiar_clave: false, correo_verificado_en: new Date().toISOString(), correo: 'z@example.com' });
    const c = await comoUsuario(env.app, '8000000001', r.body.claveTemporal);
    const p = await pedir(c);
    assert.equal(p.status, 404);
    assert.equal(p.body.error.codigo, 'SIN_EXPEDIENTE');
  });
});

describe('flujo completo: colaborador → director → admincontable', () => {
  let id;
  test('crear y enviar: queda "Pendiente director", con soporte guardado fuera de lo público, y notifica', async () => {
    const r = await pedir(colab1, {}, { buffer: PDF, nombre: 'cita.pdf' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    assert.equal(r.body.estado, 'PENDIENTE_DIRECTOR');
    assert.equal(r.body.estadoEtiqueta, 'Pendiente director');
    assert.deepEqual(
      r.body.pasos.map((p) => p.estado),
      ['ACTUAL', 'PENDIENTE'],
    );
    assert.equal(r.body.acciones.cancelar, true);
    assert.equal(r.body.acciones.aprobar, false, 'nadie aprueba la propia');
    const doc = await env.ctx.db('documentos').where({ id: r.body.documentoId }).first();
    assert.match(doc.storage_key, /^[0-9a-f]{2}\/[0-9a-f-]{36}\.pdf$/);
    assert.equal((await request(env.app).get(`/uploads/${doc.storage_key}`)).status, 404, 'no se sirve como estático');
    assert.match((await ultimaNotif(CED.director)).titulo, /Por aprobar: Permiso de PEREZ GOMEZ ANA MARIA/);
    assert.match((await ultimaNotif(CED.colab1)).titulo, /fue enviada/);
    assert.ok(
      env.ctx.mailer.enviados.some((m) => m.para === 'usuario02@example.com'),
      'correo al director',
    );
  });

  test('cruce con otra solicitud en trámite → rechazo', async () => {
    const r = await pedir(colab1, { hora_inicio: '09:00', hora_fin: '11:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /Se cruza/);
  });

  test('el paso del director no lo atiende el admin; el colaborador no aprueba (tampoco lo propio)', async () => {
    assert.equal(
      (await admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status,
      403,
      'separación de funciones',
    );
    assert.equal(
      (await colab2.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status,
      403,
      'rol colaborador',
    );
    assert.equal((await colab1.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 403);
  });

  test('bandeja del director: la ve; rechazar sin motivo → 400', async () => {
    const b = await director.get('/aprobaciones');
    assert.deepEqual(
      b.body.solicitudes.map((s) => s.id),
      [id],
    );
    assert.equal((await director.get('/aprobaciones/resumen')).body.pendientes, 1);
    assert.equal((await director.post(`/solicitudes/${id}/rechazar`, {})).status, 400);
    assert.equal((await director.post(`/solicitudes/${id}/rechazar`, { motivo: 'no' })).status, 400);
  });

  test('director aprueba → "Pendiente contable"; el director ya no puede actuar', async () => {
    const r = await director.post(`/solicitudes/${id}/aprobar`, { comentario: 'De acuerdo', estadoEsperado: 'PENDIENTE_DIRECTOR' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.estado, 'PENDIENTE_CONTABLE');
    assert.equal((await director.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).status, 403);
    assert.match((await ultimaNotif(CED.admin)).titulo, /Por aprobar/);
    assert.match((await ultimaNotif(CED.colab1)).titulo, /avanzó/);
  });

  test('admincontable da la aprobación final → APROBADA, con historial completo', async () => {
    const r = await admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' });
    assert.equal(r.body.estado, 'APROBADA');
    assert.deepEqual(
      r.body.eventos.map((e) => e.accion),
      ['CREAR', 'ENVIAR', 'APROBAR', 'APROBAR'],
    );
    assert.equal(r.body.eventos[2].comentario, 'De acuerdo');
    assert.deepEqual(
      r.body.pasos.map((p) => p.estado),
      ['HECHO', 'HECHO'],
    );
    assert.equal(r.body.acciones.cancelar, false);
    assert.match((await ultimaNotif(CED.colab1)).titulo, /APROBADA/);
    assert.equal((await admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'APROBADA' })).status, 403, 'ya no está pendiente');
    assert.equal((await colab1.post(`/solicitudes/${id}/cancelar`, {})).status, 409);
  });

  test('queda en el expediente (pestaña Permisos) y el director la ve; fuera de su sede no', async () => {
    const idColab = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
    const r = await director.get(`/colaboradores/${idColab}/solicitudes?tipo=PERMISO`);
    assert.equal(r.body.solicitudes[0].estado, 'APROBADA');
    const idColab2 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab2 }).first()).id;
    assert.equal((await director.get(`/colaboradores/${idColab2}/solicitudes`)).status, 404);
  });
});

describe('alcance, rechazo, cancelación y documentos', () => {
  let idRio;
  test('solicitud de otra sede: el director no la ve (404) ni en su bandeja; el admin sí', async () => {
    const r = await pedir(
      colab2,
      { subtipo: 'DILIGENCIA PERSONAL', fecha_inicio: dia(3), fecha_fin: dia(3) },
      { buffer: PDF, nombre: 'soporte.pdf' },
    );
    idRio = r.body.id;
    assert.equal((await director.get(`/solicitudes/${idRio}`)).status, 404);
    assert.equal((await director.post(`/solicitudes/${idRio}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).status, 404);
    assert.ok(!(await director.get('/aprobaciones')).body.solicitudes.some((s) => s.id === idRio));
    assert.equal(r.body.estado, 'PENDIENTE_CONTABLE', 'la sede no tiene director: el paso se omite');
    assert.equal(r.body.pasos[0].estado, 'OMITIDO');
    assert.ok(r.body.eventos.some((e) => e.accion === 'OMITIR'));
    assert.ok((await admin.get('/aprobaciones')).body.solicitudes.some((s) => s.id === idRio));
    assert.equal((await colab1.get(`/solicitudes/${idRio}`)).status, 404, 'otro colaborador tampoco');
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'ACCESO_DENEGADO', entidad: 'solicitud' }).first());
  });

  test('documentos: el dueño y el admin lo descargan; el director de otra sede y otro colaborador no', async () => {
    const s = await env.ctx.db('solicitudes').where({ id: idRio }).first();
    for (const [c, esperado] of [
      [colab2, 200],
      [admin, 200],
      [director, 404],
      [colab1, 404],
    ]) {
      const r = await c.agente.get(`/api/v1/documentos/${s.documento_id}`);
      assert.equal(r.status, esperado);
    }
    const ok = await colab2.agente
      .get(`/api/v1/documentos/${s.documento_id}`)
      .buffer(true)
      .parse((res, cb) => {
        const p = [];
        res.on('data', (d) => p.push(d));
        res.on('end', () => cb(null, Buffer.concat(p)));
      });
    assert.equal(ok.headers['content-type'], 'application/pdf');
    assert.match(ok.headers['content-disposition'], /^attachment/);
    assert.ok(ok.body.equals(PDF));
  });

  test('el admin rechaza con motivo; el colaborador lo ve', async () => {
    const r = await admin.post(`/solicitudes/${idRio}/rechazar`, {
      motivo: 'Coincide con el inventario mensual',
      estadoEsperado: 'PENDIENTE_CONTABLE',
    });
    assert.equal(r.body.estado, 'RECHAZADA');
    assert.match((await ultimaNotif(CED.colab2)).mensaje, /inventario mensual/);
  });

  test('cancelar una pendiente; solo el dueño; queda CANCELADA', async () => {
    const r = await pedir(colab2, { fecha_inicio: dia(5), fecha_fin: dia(5) });
    assert.equal((await admin.post(`/solicitudes/${r.body.id}/cancelar`, {})).status, 403);
    const c = await colab2.post(`/solicitudes/${r.body.id}/cancelar`, { motivo: 'Ya no lo necesito' });
    assert.equal(c.body.estado, 'CANCELADA');
    assert.equal((await admin.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'CANCELADA' })).status, 403);
  });

  test('borrador: se guarda sin enviar y luego se envía', async () => {
    const r = await pedir(colab2, { fecha_inicio: dia(8), fecha_fin: dia(8), enviar: 'false' });
    assert.equal(r.body.estado, 'BORRADOR');
    assert.ok(!(await admin.get('/aprobaciones')).body.solicitudes.some((s) => s.id === r.body.id), 'un borrador no llega a la bandeja');
    const e = await colab2.post(`/solicitudes/${r.body.id}/enviar`, {});
    assert.equal(e.body.estado, 'PENDIENTE_CONTABLE', 'sede sin director');
  });

  test('mis solicitudes: filtro en curso', async () => {
    const r = await colab2.get('/me/solicitudes?tipo=PERMISO&estado=EN_CURSO');
    assert.ok(r.body.solicitudes.every((s) => !s.final));
    assert.equal(r.body.solicitudes.length, 1);
  });
});

describe('flujo configurable y notificaciones', () => {
  test('cambiar el flujo (solo admin) a un único paso contable cambia el comportamiento sin tocar código', async () => {
    assert.equal(
      (
        await director.agente
          .put('/api/v1/flujos/PERMISO')
          .set('X-CSRF-Token', (await director.get('/auth/csrf')).body.csrf)
          .send({ pasos: [{ rol: 'ADMIN' }] })
      ).status,
      403,
    );
    const t = (await admin.get('/auth/csrf')).body.csrf;
    const r = await admin.agente
      .put('/api/v1/flujos/PERMISO')
      .set('X-CSRF-Token', t)
      .send({ pasos: [{ rol: 'ADMIN', etiqueta: 'Revisión contable' }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.version, 2);
    const p = await pedir(colab1, { fecha_inicio: dia(10), fecha_fin: dia(10) });
    assert.equal(p.body.estado, 'PENDIENTE_CONTABLE');
    assert.equal(p.body.estadoEtiqueta, 'Revisión contable');
    const a = await admin.post(`/solicitudes/${p.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' });
    assert.equal(a.body.estado, 'APROBADA', 'un solo paso');
    // La que ya estaba en curso sigue con su versión (la 1)
    const enCurso = (await colab2.get('/me/solicitudes?estado=EN_CURSO')).body.solicitudes[0];
    const fila = await env.ctx
      .db('solicitudes as s')
      .join('flujos as f', 'f.id', 's.flujo_id')
      .where('s.id', enCurso.id)
      .first('f.version');
    assert.equal(fila.version, 1);
    // Restaurar
    await admin.agente
      .put('/api/v1/flujos/PERMISO')
      .set('X-CSRF-Token', t)
      .send({ pasos: [{ rol: 'DIRECTOR' }, { rol: 'ADMIN' }] });
  });

  test('notificaciones: solo las propias, marcar leídas', async () => {
    const r = await colab1.get('/notificaciones');
    assert.ok(r.body.notificaciones.length >= 3);
    const res = await colab1.get('/notificaciones/resumen');
    assert.ok(res.body.noLeidas >= 1);
    const ajena = (
      await env.ctx
        .db('notificaciones')
        .where({ usuario_id: (await env.ctx.db('usuarios').where({ cedula: CED.director }).first()).id })
        .first()
    ).id;
    await colab1.post('/notificaciones/leer', { ids: [ajena] });
    assert.equal((await env.ctx.db('notificaciones').where({ id: ajena }).first()).leida, 0, 'no puede marcar ajenas');
    await colab1.post('/notificaciones/leer', { todas: true });
    assert.equal((await colab1.get('/notificaciones/resumen')).body.noLeidas, 0);
  });

  test('tiempo real: el flujo de eventos entrega el aviso al aprobador', async () => {
    const servidor = env.app.listen(0);
    try {
      const puerto = servidor.address().port;
      const t = (await director.get('/auth/csrf')).body.csrf;
      const cookie = director.sid ? `th_sid=${director.sid}` : '';
      void t;
      const controlador = new AbortController();
      const resp = await fetch(`http://127.0.0.1:${puerto}/api/v1/eventos`, { headers: { Cookie: cookie }, signal: controlador.signal });
      assert.equal(resp.status, 200);
      assert.match(resp.headers.get('content-type'), /text\/event-stream/);
      const lector = resp.body.getReader();
      const recibido = (async () => {
        let txt = '';
        while (!txt.includes('event: cambio')) txt += new TextDecoder().decode((await lector.read()).value);
        return txt;
      })();
      await pedir(colab1, { fecha_inicio: dia(12), fecha_fin: dia(12) });
      const txt = await Promise.race([recibido, new Promise((_, no) => setTimeout(() => no(new Error('sin evento')), 3000))]);
      assert.match(txt, /"tipo":"notificacion"/);
      controlador.abort();
    } finally {
      servidor.close();
    }
  });
});
