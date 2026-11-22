// M6 – Licencias: tipos parametrizables, días según unidad, soporte por tipo, mismo flujo y efecto
// de las no remuneradas en el saldo de vacaciones.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { FESTIVOS } from '../../seeds/datos-iniciales.js';
import { contarHabiles, dias360, hoyBogota, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1;
let colab2;
let idColab1;
const hoy = hoyBogota();
const op = { festivos: new Map(FESTIVOS), sabadoHabil: true };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  colab2 = await comoUsuario(env.app, CED.colab2);
  idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
});
after(() => env.cerrar());

async function pedir(c, campos = {}, archivo = null) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  const datos = { tipo: 'LICENCIA', subtipo: 'CALAMIDAD DOMÉSTICA', fecha_inicio: sumarDias(hoy, 10), fecha_fin: sumarDias(hoy, 11), motivo: 'Inundación en la vivienda', ...campos };
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) r = r.field(k, String(v));
  if (archivo) r = r.attach('soporte', archivo, 'soporte.pdf');
  return r;
}

describe('validaciones por tipo (parámetro LISTA_TIPOS_LICENCIA)', () => {
  test('opciones: tipos con unidad, máximo y soporte', async () => {
    const r = await colab1.get('/licencias/opciones');
    const luto = r.body.tipos.find((t) => t.nombre === 'LUTO');
    assert.deepEqual([luto.unidad, luto.diasMax, luto.soporteObligatorio], ['habiles', 5, true]);
  });

  test('luto: 5 días HÁBILES (sin domingos ni festivos) y soporte obligatorio', async () => {
    // Del 23/12/2026 al 30/12/2026: Navidad y un domingo no cuentan → 6 hábiles (> 5)
    let r = await colab1.post('/licencias/calcular', { subtipo: 'LUTO', fecha_inicio: '2026-12-23', fecha_fin: '2026-12-30' });
    if (hoy <= '2026-12-23' || hoy > sumarDias('2026-12-23', 30)) {
      assert.equal(r.status, 400);
      assert.match(r.body.error.campos.fecha_fin, /máximo 5 día\(s\) hábiles/);
    }
    const fi = sumarDias(hoy, 3);
    let ff = fi;
    while (contarHabiles(fi, ff, op) < 5) ff = sumarDias(ff, 1);
    r = await colab1.post('/licencias/calcular', { subtipo: 'LUTO', fecha_inicio: fi, fecha_fin: ff });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.dias, r.body.unidad], [5, 'habiles']);
    r = await pedir(colab1, { subtipo: 'LUTO', fecha_inicio: fi, fecha_fin: ff });
    assert.equal(r.status, 400);
    assert.match(r.body.error.campos.soporte, /PDF/);
  });

  test('maternidad: días calendario, máximo 126; soporte sensible (el director no lo ve)', async () => {
    let r = await colab1.post('/licencias/calcular', { subtipo: 'MATERNIDAD', fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 126) });
    assert.match(r.body.error.campos.fecha_fin, /máximo 126/);
    r = await pedir(colab1, { subtipo: 'MATERNIDAD', fecha_inicio: sumarDias(hoy, 2), fecha_fin: sumarDias(hoy, 127), motivo: 'Licencia de maternidad' }, PDF);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.datos.dias, r.body.datos.unidad, r.body.datos.remunerada], [126, 'calendario', true]);
    assert.equal((await director.get(`/documentos/${r.body.documentoId}`)).status, 404, 'soporte sensible');
    assert.equal((await admin.get(`/documentos/${r.body.documentoId}`)).status, 200);
    await colab1.post(`/solicitudes/${r.body.id}/cancelar`, {});
  });

  test('tipo inexistente, fechas invertidas o muy antiguas → errores por campo', async () => {
    const r = await pedir(colab1, { subtipo: 'VACACIONES PAGAS', fecha_inicio: sumarDias(hoy, 5), fecha_fin: sumarDias(hoy, 4), motivo: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.subtipo && r.body.error.campos.motivo);
    const r2 = await pedir(colab1, { fecha_inicio: sumarDias(hoy, -40), fecha_fin: sumarDias(hoy, -39) });
    assert.match(r2.body.error.campos.fecha_inicio, /últimos 30 días/);
  });
});

describe('flujo (mismo motor) y alcance', () => {
  let id;
  test('calamidad sin soporte: se envía, pasa por director y contable, y avisa', async () => {
    const r = await pedir(colab1);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    assert.equal(r.body.estado, 'PENDIENTE_DIRECTOR');
    assert.equal(r.body.tipoEtiqueta, 'Licencia');
    assert.ok((await director.get('/aprobaciones')).body.solicitudes.some((s) => s.id === id));
    assert.equal((await director.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' })).status, 200);
    assert.equal((await admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' })).body.estado, 'APROBADA');
  });

  test('aparece en la pestaña Licencias del expediente; otro colaborador no la ve', async () => {
    const r = await director.get(`/colaboradores/${idColab1}/solicitudes?tipo=LICENCIA`);
    assert.ok(r.body.solicitudes.some((s) => s.id === id));
    assert.equal((await colab2.get(`/solicitudes/${id}`)).status, 404);
    assert.equal((await colab2.get(`/colaboradores/${idColab1}/solicitudes?tipo=LICENCIA`)).status, 404);
  });

  test('no se cruza con otras ausencias', async () => {
    const r = await pedir(colab1, { subtipo: 'NO REMUNERADA', fecha_inicio: sumarDias(hoy, 11), fecha_fin: sumarDias(hoy, 12) });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /cruza/);
  });
});

describe('efecto en vacaciones', () => {
  test('una licencia no remunerada aprobada resta sus días de los laborados (causa menos vacaciones)', async () => {
    const antes = (await colab1.get('/me/vacaciones/saldo')).body;
    // Registrada por el admin con fechas pasadas (dentro del periodo ya laborado)
    const fi = sumarDias(hoy, -20);
    const ff = sumarDias(hoy, -11); // 10 días calendario
    await env.ctx.db('parametros').where({ clave: 'LIC_REGISTRO_MAX_DIAS_ATRAS' }).update({ valor: '60' });
    env.ctx.params.invalidar();
    const r = await pedir(colab1, { subtipo: 'NO REMUNERADA', fecha_inicio: fi, fecha_fin: ff, motivo: 'Viaje personal' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.datos.remunerada, false);
    await director.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
    await admin.post(`/solicitudes/${r.body.id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' });
    const despues = (await colab1.get('/me/vacaciones/saldo')).body;
    const n = dias360(fi, ff) + 1; // misma base que el total de días laborados
    assert.equal(despues.diasNoLaborados, n);
    assert.equal(despues.diasLaborados, antes.diasLaborados - n);
    assert.equal(despues.causadosDesdeCorte, Math.round(((antes.diasLaborados - n) * 15) / 360 * 100) / 100);
  });

  test('una licencia remunerada (calamidad) no resta días', async () => {
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.diasNoLaborados, dias360(sumarDias(hoy, -20), sumarDias(hoy, -11)) + 1, 'solo cuenta la no remunerada');
  });
});
