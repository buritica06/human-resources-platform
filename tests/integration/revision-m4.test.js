// Regresión de los hallazgos de la revisión independiente de M4 (vacaciones).
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
let idColab1;
let idAdmin;
const op = { festivos: new Map(FESTIVOS), sabadoHabil: true };
const hoy = hoyBogota();
const habil = (n) => primerHabilDesde(sumarDias(hoy, n), op);

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
  idAdmin = (await env.ctx.db('colaboradores').where({ cedula: CED.admin }).first()).id;
});
after(() => env.cerrar());

async function pedir(c, campos = {}) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  for (const [k, v] of Object.entries({ tipo: 'VACACIONES', fecha_inicio: habil(10), dias: '3', ...campos })) r = r.field(k, String(v));
  return r;
}
const corte = (id, datos) =>
  admin.post(`/colaboradores/${id}/vacaciones/corte`, { observacion: 'Saldo de prueba de la revisión', ...datos });

test('saldos con dos decimales que no son exactos en binario (1,15 · 4,35 · 0,57) se aceptan', async () => {
  for (const dias of [1.15, 4.35, 0.57, 2.3, '12,35']) {
    const r = await corte(idColab1, { fecha_corte: '2026-02-01', dias });
    assert.equal(r.status, 201, `${dias}: ${JSON.stringify(r.body)}`);
  }
  assert.equal(
    Number((await env.ctx.db('saldos_vacaciones').where({ colaborador_id: idColab1 }).orderBy('id', 'desc').first()).dias_al_corte),
    12.35,
  );
  assert.equal((await corte(idColab1, { fecha_corte: '2026-02-01', dias: 1.155 })).status, 400, 'tres decimales');
});

test('días vacíos, nulos o booleanos se rechazan (no se registran como 0)', async () => {
  for (const dias of ['', null, true, 'abc'])
    assert.equal((await corte(idColab1, { fecha_corte: '2026-02-01', dias })).status, 400, String(dias));
});

test('un corte con fecha anterior al vigente se rechaza (no tendría efecto)', async () => {
  const r = await corte(idColab1, { fecha_corte: '2026-01-15', dias: 3 });
  assert.equal(r.status, 400);
  assert.match(r.body.error.campos.fecha_corte, /Ya hay un saldo al 01\/02\/2026/);
});

test('el admincontable que registra su propio saldo queda marcado como autorregistro', async () => {
  assert.equal((await corte(idAdmin, { fecha_corte: '2026-03-01', dias: 5 })).status, 201);
  const a = await env.ctx
    .db('auditoria')
    .where({ accion: 'REGISTRAR_SALDO_VACACIONES', entidad_id: String(idAdmin) })
    .orderBy('id', 'desc')
    .first();
  assert.match(a.detalle, /autoregistro/);
});

test('consultar el saldo de otro colaborador queda auditado', async () => {
  assert.equal((await director.get(`/colaboradores/${idColab1}/vacaciones`)).status, 200);
  assert.ok(
    await env.ctx
      .db('auditoria')
      .where({ accion: 'VER_VACACIONES', entidad_id: String(idColab1) })
      .first(),
  );
});

test('la simulación ya avisa si se cruza con otra ausencia', async () => {
  const r = await pedir(colab1, { fecha_inicio: habil(20), dias: 2 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = await colab1.post('/vacaciones/simular', { fecha_inicio: habil(20), dias: 1 });
  assert.equal(s.status, 400);
  assert.match(s.body.error.mensaje, /cruza/);
  await colab1.post(`/solicitudes/${r.body.id}/cancelar`, {});
});

test('aprobar revalida el saldo: si bajó mientras estaba en trámite → 409 y no se aprueba', async () => {
  await corte(idColab1, { fecha_corte: hoy, dias: 6 });
  const r = await pedir(colab1, { fecha_inicio: habil(30), dias: 5 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await corte(idColab1, { fecha_corte: hoy, dias: 1 });
  const a = await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
  assert.equal(a.status, 409);
  assert.match(a.body.error.mensaje, /ya no alcanza/);
  assert.equal((await colab1.get(`/solicitudes/${r.body.id}`)).body.estado, 'PENDIENTE_DIRECTOR');
  // corregido el saldo, se puede aprobar
  await corte(idColab1, { fecha_corte: hoy, dias: 6 });
  assert.equal((await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 200);
});

test('un borrador de alguien que se retiró no se puede enviar', async () => {
  const b = await pedir(colab1, { fecha_inicio: habil(60), dias: 1, enviar: 'false' });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ estado: 'RETIRADO' });
  try {
    const e = await colab1.post(`/solicitudes/${b.body.id}/enviar`, {});
    assert.equal(e.status, 400);
    assert.match(e.body.error.mensaje, /retirado/);
  } finally {
    await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ estado: 'ACTIVO' });
  }
});

test('un parámetro mal configurado no desactiva las validaciones (falla con error)', async () => {
  await env.ctx
    .db('parametros')
    .where({ clave: 'VAC_COMPENSACION_MAX_PCT' })
    .update({ valor: JSON.stringify('50%') });
  env.ctx.params.invalidar();
  try {
    const r = await colab1.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: 1, dias_compensar: 50 });
    assert.equal(r.status, 500);
  } finally {
    await env.ctx
      .db('parametros')
      .where({ clave: 'VAC_COMPENSACION_MAX_PCT' })
      .update({ valor: JSON.stringify(50) });
    env.ctx.params.invalidar();
  }
});

test('enviar dentro de una transacción externa sin "previo" falla explícitamente (no se bloquea)', async () => {
  const tipo = env.ctx.tiposSolicitud.get('VACACIONES');
  await assert.rejects(() => tipo.revalidarAlEnviar(env.ctx, { colaborador_id: idColab1 }, env.ctx.db, null), /requiere "previo"/);
});
