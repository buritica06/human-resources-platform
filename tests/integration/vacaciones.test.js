// M4 – Vacaciones: saldo, simulación, validaciones, flujo y alcance.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { FESTIVOS } from '../../seeds/datos-iniciales.js';
import { dias360, finDeDisfrute, hoyBogota, primerHabilDesde, siguienteHabil, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1; // SEDE NORTE (sede del director), saldo demo 8,5 al 01/01/2026
let colab2; // SEDE RIO
let idColab1;
let idColab2;
const op = { festivos: new Map(FESTIVOS), sabadoHabil: true };
const hoy = hoyBogota();
const habil = (n) => primerHabilDesde(sumarDias(hoy, n), op);

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

async function pedir(c, campos = {}) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  for (const [k, v] of Object.entries({ tipo: 'VACACIONES', fecha_inicio: habil(10), dias: '3', dias_compensar: '0', ...campos })) {
    if (v !== undefined) r = r.field(k, String(v));
  }
  return r;
}
const esperado = (fechaCorte, diasAlCorte) => Math.round((diasAlCorte + ((dias360(fechaCorte, hoy) + 1) * 15) / 360) * 100) / 100;

describe('saldo', () => {
  test('saldo propio: al corte + causado desde el corte (DAYS360 + 1) × 15 / 360', async () => {
    const r = await colab1.get('/me/vacaciones/saldo');
    assert.equal(r.status, 200);
    assert.equal(r.body.registrado, true);
    assert.equal(r.body.fechaCorte, '2026-01-01');
    assert.equal(r.body.diasLaborados, dias360('2026-01-01', hoy) + 1);
    assert.equal(r.body.disponibles, esperado('2026-01-01', 8.5));
    assert.equal(r.body.paraSolicitar, r.body.disponibles);
  });

  test('opciones: reglas vigentes y festivos próximos', async () => {
    const r = await colab1.get('/vacaciones/opciones');
    assert.equal(r.body.pctCompensacion, 50);
    assert.equal(r.body.sabadoHabil, true);
    assert.ok(r.body.festivos.every((f) => f.fecha >= hoy));
  });
});

describe('simulación y validaciones', () => {
  test('calcula fin y regreso con domingos y festivos', async () => {
    const fi = habil(10);
    const r = await colab1.post('/vacaciones/simular', { fecha_inicio: fi, dias: 5, dias_compensar: 0 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ff = finDeDisfrute(fi, 5, op);
    assert.equal(r.body.fechaFin, ff);
    assert.equal(r.body.regreso, siguienteHabil(ff, op));
    assert.equal(r.body.maxCompensar, 5);
  });

  test('inicio en día no hábil: dice por qué y sugiere el siguiente', async () => {
    let domingo = sumarDias(hoy, 7);
    while (new Date(`${domingo}T00:00:00Z`).getUTCDay() !== 0) domingo = sumarDias(domingo, 1);
    const r = await colab1.post('/vacaciones/simular', { fecha_inicio: domingo, dias: 2 });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.fecha_inicio, /domingo/);
    assert.match(r.body.error.campos.fecha_inicio, /Puede empezar el/);
  });

  test('fecha pasada, días inválidos y texto → errores por campo', async () => {
    const r = await colab1.post('/vacaciones/simular', { fecha_inicio: sumarDias(hoy, -3), dias: 0, dias_compensar: -1 });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.fecha_inicio && r.body.error.campos.dias && r.body.error.campos.dias_compensar);
    assert.equal((await colab1.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: 2.5 })).status, 400);
    assert.equal((await colab1.post('/vacaciones/simular', { fecha_inicio: '2026-02-30', dias: 2 })).status, 400);
  });

  test('compensación en dinero: máximo 50 % de los días de la solicitud', async () => {
    let r = await colab1.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: 2, dias_compensar: 3 });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.dias_compensar, /50 %/);
    r = await colab1.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: 3, dias_compensar: 3 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.saldoDespues, Math.round((r.body.saldoAntes - 6) * 100) / 100);
  });

  test('no permite superar el saldo', async () => {
    const saldo = (await colab1.get('/me/vacaciones/saldo')).body.paraSolicitar;
    const r = await colab1.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: Math.floor(saldo) + 1 });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.dias, /Solo tiene/);
  });

  test('si faltan los festivos de un año del rango, no calcula (mensaje claro)', async () => {
    const respaldo = await env.ctx.db('festivos').where({ anio: 2027 });
    await env.ctx.db('festivos').where({ anio: 2027 }).del();
    try {
      // un rango que cruza el año: empieza el último hábil de 2026 y dura 3 días
      const fi = primerHabilDesde('2026-12-30', op) < hoy ? habil(1) : primerHabilDesde('2026-12-30', op);
      const r = await colab1.post('/vacaciones/simular', { fecha_inicio: fi, dias: 3 });
      if (fi.startsWith('2026')) {
        assert.equal(r.status, 400);
        assert.match(r.body.error.mensaje, /festivos de 2027/);
      }
    } finally {
      await env.ctx.db('festivos').insert(respaldo);
    }
  });
});

describe('flujo', () => {
  let id;
  test('crear y enviar: queda pendiente, guarda fin, regreso y saldo; el saldo queda reservado', async () => {
    const antes = (await colab1.get('/me/vacaciones/saldo')).body;
    const fi = habil(14);
    const r = await pedir(colab1, { fecha_inicio: fi, dias: 3, dias_compensar: 1, motivo: 'Viaje familiar' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    assert.equal(r.body.estado, 'PENDIENTE_DIRECTOR');
    assert.equal(r.body.diasHabiles, 3);
    assert.equal(r.body.diasCompensar, 1);
    assert.equal(r.body.fechaFin, finDeDisfrute(fi, 3, op));
    assert.equal(r.body.datos.regreso, siguienteHabil(r.body.fechaFin, op));
    assert.equal(r.body.datos.saldoAlEnviar, antes.paraSolicitar);
    const despues = (await colab1.get('/me/vacaciones/saldo')).body;
    assert.equal(despues.enTramite, 4);
    assert.equal(despues.paraSolicitar, Math.round((antes.paraSolicitar - 4) * 100) / 100);
    assert.equal(despues.disponibles, antes.disponibles, 'aún no se descuenta: solo se reserva');
  });

  test('otra solicitud que se cruza o que excede lo que queda → 400', async () => {
    const r1 = await pedir(colab1, { fecha_inicio: habil(14), dias: 1 });
    assert.equal(r1.status, 400);
    assert.match(r1.body.error.mensaje, /cruza/);
    const resto = (await colab1.get('/me/vacaciones/saldo')).body.paraSolicitar;
    const r2 = await pedir(colab1, { fecha_inicio: habil(60), dias: Math.floor(resto) + 1 });
    assert.equal(r2.status, 400);
  });

  test('director y admincontable aprueban; al aprobarse se descuenta del saldo', async () => {
    const antes = (await colab1.get('/me/vacaciones/saldo')).body;
    assert.equal((await director.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 200);
    assert.equal((await admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).status, 200);
    const s = (await colab1.get('/me/vacaciones/saldo')).body;
    assert.equal(s.disfrutados, 3);
    assert.equal(s.compensados, 1);
    assert.equal(s.enTramite, 0);
    assert.equal(s.disponibles, Math.round((antes.disponibles - 4) * 100) / 100);
    assert.equal(s.paraSolicitar, antes.paraSolicitar, 'lo reservado pasa a descontado');
  });

  test('un borrador se revalida al enviarlo (si el saldo bajó, no pasa)', async () => {
    const b = await pedir(colab1, { fecha_inicio: habil(40), dias: 2, enviar: 'false' });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.estado, 'BORRADOR');
    assert.equal(
      (
        await admin.post(`/colaboradores/${idColab1}/vacaciones/corte`, {
          fecha_corte: hoy,
          dias: 1,
          observacion: 'Ajuste por revisión de soportes',
        })
      ).status,
      201,
    );
    const e = await colab1.post(`/solicitudes/${b.body.id}/enviar`, {});
    assert.equal(e.status, 400);
    assert.match(e.body.error.campos.dias, /Solo tiene/);
    assert.equal((await colab1.get(`/solicitudes/${b.body.id}`)).body.estado, 'BORRADOR');
  });

  test('cancelar libera lo reservado', async () => {
    await admin.post(`/colaboradores/${idColab1}/vacaciones/corte`, {
      fecha_corte: hoy,
      dias: 10,
      observacion: 'Corrección del ajuste anterior',
    });
    const r = await pedir(colab1, { fecha_inicio: habil(50), dias: 2 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.enTramite, 2);
    await colab1.post(`/solicitudes/${r.body.id}/cancelar`, {});
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.enTramite, 0);
  });
});

describe('saldo al corte (admincontable) y alcance', () => {
  test('sin saldo registrado no se puede solicitar (mensaje claro)', async () => {
    await env.ctx.db('saldos_vacaciones').where({ colaborador_id: idColab2 }).del();
    assert.equal((await colab2.get('/me/vacaciones/saldo')).body.registrado, false);
    const r = await colab2.post('/vacaciones/simular', { fecha_inicio: habil(10), dias: 1 });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /no ha registrado su saldo/);
  });

  test('solo el admincontable registra el saldo; validaciones; queda auditado', async () => {
    const datos = { fecha_corte: '2026-06-30', dias: 4.25, observacion: 'Saldo según liquidación de junio' };
    assert.equal((await colab2.post(`/colaboradores/${idColab2}/vacaciones/corte`, datos)).status, 403);
    assert.equal((await director.post(`/colaboradores/${idColab1}/vacaciones/corte`, datos)).status, 403);
    let r = await admin.post(`/colaboradores/${idColab2}/vacaciones/corte`, { ...datos, fecha_corte: sumarDias(hoy, 5), observacion: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.fecha_corte && r.body.error.campos.observacion);
    r = await admin.post(`/colaboradores/${idColab2}/vacaciones/corte`, { ...datos, fecha_corte: '2020-01-01' });
    assert.match(r.body.error.campos.fecha_corte, /ingreso/);
    r = await admin.post(`/colaboradores/${idColab2}/vacaciones/corte`, datos);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.saldo.disponibles, esperado('2026-06-30', 4.25));
    assert.equal(r.body.cortes[0].registradoPor, 'ADMIN DEMO CONTABLE');
    assert.ok(
      await env.ctx
        .db('auditoria')
        .where({ accion: 'REGISTRAR_SALDO_VACACIONES', entidad_id: String(idColab2) })
        .first(),
    );
  });

  test('alcance: el director no ve otra sede; un colaborador no ve a otro; el propio sin historial de cortes', async () => {
    assert.equal((await director.get(`/colaboradores/${idColab2}/vacaciones`)).status, 404);
    assert.equal((await director.get(`/colaboradores/${idColab1}/vacaciones`)).status, 200);
    assert.equal((await colab1.get(`/colaboradores/${idColab2}/vacaciones`)).status, 404);
    const propio = await colab1.get(`/colaboradores/${idColab1}/vacaciones`);
    assert.equal(propio.status, 200);
    assert.deepEqual(propio.body.cortes, []);
    assert.equal(propio.body.puedeRegistrar, false);
    assert.equal((await admin.get(`/colaboradores/${idColab2}/vacaciones`)).body.puedeRegistrar, true);
  });

  test('sin sesión → 401', async () => {
    const { cliente } = await import('../helpers/app.js');
    assert.equal((await cliente(env.app).get('/me/vacaciones/saldo')).status, 401);
  });
});
