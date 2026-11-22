import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import request from 'supertest';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';

const LIBRO = path.resolve(import.meta.dirname, '..', 'fixtures', 'nomina-ficticia.xlsx');
let env;
let admin;
let colab1;
let colab2;
let director;
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  colab1 = await comoUsuario(env.app, CED.colab1);
  colab2 = await comoUsuario(env.app, CED.colab2);
  director = await comoUsuario(env.app, CED.director);
});
after(() => env.cerrar());

async function hojas() {
  const r = await admin.subir('/nomina/hojas', LIBRO);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function cargar(hoja, extra = {}) {
  const { huella } = await hojas();
  return admin.subir('/nomina/cargas', LIBRO, { hoja, huella, ...extra });
}
const contar = async (tabla) => Number((await env.ctx.db(tabla).count({ n: '*' }))[0].n);
let periodoNov;
let volanteColab1;

describe('carga y validación', () => {
  test('lista las hojas NOMINA con sus fechas', async () => {
    const r = await hojas();
    assert.equal(r.hojas.length, 6);
    const nov = r.hojas.find((h) => h.nombre === 'NOMINA NOV 1-15');
    assert.deepEqual([nov.inicio, nov.fin, nov.estadoEnPlataforma], ['2026-11-01', '2026-11-15', null]);
    assert.equal(r.hojas.find((h) => h.nombre === 'NOMINA SEP 1-15').inicio, null);
  });

  test('descuadre: reporte con el detalle y nada guardado', async () => {
    const r = await cargar('NOMINA OCT 1-15');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.match(r.body.errores[0].mensaje, /devengado .* no coincide|pero el neto de la hoja es 999999/);
    assert.equal(await contar('periodos_nomina'), 0);
  });

  test('encabezado no reconocido y hoja sin fechas → errores claros', async () => {
    let r = await cargar('NOMINA SEP 16-30');
    assert.equal(r.body.ok, false);
    assert.match(r.body.errores[0].mensaje, /BONIFICACION/);
    r = await cargar('NOMINA SEP 1-15');
    assert.match(r.body.errores[0].mensaje, /S1 y T1/);
    assert.equal(await contar('periodos_nomina'), 0);
  });

  test('cédula sin expediente: bloquea; con permiso explícito crea el expediente básico (RETIRADO)', async () => {
    let r = await cargar('NOMINA OCT 16-31');
    assert.equal(r.body.ok, false);
    assert.deepEqual(r.body.faltantes.map((f) => f.cedula), ['3000000099']);
    assert.equal(await contar('periodos_nomina'), 0);
    r = await cargar('NOMINA OCT 16-31', { crearExpedientes: 'true' });
    assert.equal(r.body.ok, true, JSON.stringify(r.body.errores));
    const c = await env.ctx.db('colaboradores').where({ cedula: '3000000099' }).first();
    assert.equal(c.estado, 'RETIRADO');
    assert.ok(await env.ctx.db('expediente_cambios').where({ colaborador_id: c.id, campo: '_alta' }).first());
  });

  test('el archivo debe ser el mismo que se listó (huella)', async () => {
    const r = await admin.subir('/nomina/cargas', LIBRO, { hoja: 'NOMINA NOV 1-15', huella: 'x'.repeat(64) });
    assert.equal(r.status, 400);
  });

  test('quincena válida: borrador con totales, volantes y solo los conceptos que tiene cada uno', async () => {
    const r = await cargar('NOMINA NOV 1-15');
    assert.equal(r.body.ok, true, JSON.stringify(r.body.errores));
    assert.equal(r.body.colaboradores, 4, 'incluye la cédula guardada como texto con puntos');
    assert.ok(r.body.advertencias.some((a) => /no es de nómina ni de extras/.test(a.mensaje)), 'la tabla de vacaciones se avisa');
    periodoNov = r.body.periodoId;
    const p = await env.ctx.db('periodos_nomina').where({ id: periodoNov }).first();
    assert.equal(p.estado, 'BORRADOR');
    assert.equal(Number(p.total_adicional), 126727);
    const v = await env.ctx.db('volantes').where({ periodo_id: periodoNov, cedula: CED.colab1 }).first();
    volanteColab1 = v.id;
    assert.equal(Number(v.neto), 897776);
    assert.equal(v.empleador, 'EMPLEADOR DEMO A');
    assert.equal(v.empleador_documento, '900000001');
    const lineas = await env.ctx.db('volante_lineas').where({ volante_id: v.id }).orderBy('orden');
    assert.deepEqual(lineas.map((l) => l.concepto), ['SALARIO', 'RECARGO_NOCTURNO', 'AUX_TRANSPORTE', 'HORAS_EXTRAS', 'SALUD', 'PENSION', 'PRESTAMO', 'RECARGO_NOC_APARTE', 'JORNADAS_EXTRA']);
    assert.ok(!lineas.some((l) => l.concepto === 'INCAPACIDAD'), 'no muestra conceptos en cero');
    assert.equal(Number(lineas.find((l) => l.concepto === 'AUX_TRANSPORTE').valor), 124547.5);
    const hx = lineas.find((l) => l.concepto === 'HORAS_EXTRAS');
    assert.deepEqual(JSON.parse(hx.detalle).map((d) => [d.etiqueta, d.cantidad]), [['Dominical / festivo', 2], ['Hora extra diurna', 4.5]]);
    assert.equal(Number(lineas.find((l) => l.concepto === 'RECARGO_NOCTURNO').cantidad), 3.5);
  });

  test('periodo que se cruza o duplicado publicado → rechazo', async () => {
    const r = await cargar('NOMINA NOV 10-20');
    assert.equal(r.body.ok, false);
    assert.match(r.body.errores.map((e) => e.mensaje).join(' '), /se cruza/);
  });

  test('recargar el mismo periodo en borrador lo reemplaza (no duplica)', async () => {
    const r = await cargar('NOMINA NOV 1-15');
    assert.equal(r.body.ok, true);
    assert.notEqual(r.body.periodoId, periodoNov);
    assert.equal(await env.ctx.db('periodos_nomina').where({ id: periodoNov }).first(), undefined);
    periodoNov = r.body.periodoId;
    volanteColab1 = (await env.ctx.db('volantes').where({ periodo_id: periodoNov, cedula: CED.colab1 }).first()).id;
    assert.equal(await env.ctx.db('periodos_nomina').where({ fecha_inicio: '2026-11-01' }).count({ n: '*' }).then((x) => Number(x[0].n)), 1);
  });
});

describe('borrador: nadie más que el admin lo ve', () => {
  test('el colaborador no ve volantes en borrador (ni por id ni en su lista)', async () => {
    assert.equal((await colab1.get(`/volantes/${volanteColab1}`)).status, 404);
    assert.equal((await colab1.get(`/volantes/${volanteColab1}/pdf`)).status, 404);
    assert.deepEqual((await colab1.get('/me/volantes')).body.volantes, []);
    assert.equal((await colab1.get('/me/volantes/ultimo')).body.volante, null);
  });

  test('el admin ve la vista previa del borrador', async () => {
    const r = await admin.get(`/nomina/periodos/${periodoNov}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.volantes.length, 4);
    const v = await admin.get(`/volantes/${volanteColab1}`);
    assert.equal(v.body.periodo.estado, 'BORRADOR');
  });
});

describe('publicación y consulta', () => {
  test('publicar hace visibles los volantes; publicar dos veces → 409', async () => {
    const r = await admin.post(`/nomina/periodos/${periodoNov}/publicar`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'PUBLICADO');
    assert.equal((await admin.post(`/nomina/periodos/${periodoNov}/publicar`, {})).status, 409);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'PUBLICAR', entidad_id: String(periodoNov) }).first());
  });

  test('el colaborador ve su volante detallado y su historial por año', async () => {
    const lista = await colab1.get('/me/volantes');
    assert.deepEqual(lista.body.anios, ['2026']);
    assert.equal(lista.body.volantes.length, 1, 'el de OCT 16-31 sigue en borrador');
    const v = await colab1.get(`/volantes/${volanteColab1}`);
    assert.equal(v.status, 200);
    assert.equal(v.body.neto, 897776);
    assert.equal(v.body.salarioBase, 1750905);
    assert.deepEqual(v.body.devengados.map((l) => l.concepto), ['SALARIO', 'RECARGO_NOCTURNO', 'AUX_TRANSPORTE', 'HORAS_EXTRAS']);
    assert.deepEqual(v.body.deducciones.map((l) => [l.concepto, l.valor]), [['SALUD', 37900], ['PENSION', 37900], ['PRESTAMO', 100000]]);
    assert.equal(v.body.adicionales.length, 2);
    assert.equal(v.body.observacion, 'PRUEBA OBSERVACION');
    assert.equal((await colab1.get('/me/volantes/ultimo')).body.volante.id, volanteColab1);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER', entidad: 'volante', entidad_id: String(volanteColab1) }).first());
  });

  test('un colaborador no ve el volante de otro (404) y el director no ve volantes', async () => {
    assert.equal((await colab2.get(`/volantes/${volanteColab1}`)).status, 404);
    assert.equal((await colab2.get(`/volantes/${volanteColab1}/pdf`)).status, 404);
    assert.equal((await director.get(`/volantes/${volanteColab1}`)).status, 404);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'ACCESO_DENEGADO', entidad: 'volante' }).first());
    const idColab1 = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
    for (const ruta of ['/nomina/periodos', `/nomina/periodos/${periodoNov}`, `/nomina/colaboradores/${idColab1}/volantes`]) {
      assert.equal((await director.get(ruta)).status, 403, ruta);
      assert.equal((await colab1.get(ruta)).status, 403, ruta);
    }
    assert.equal((await colab1.post(`/nomina/periodos/${periodoNov}/anular`, { motivo: 'intento indebido' })).status, 403);
    assert.equal((await request(env.app).get(`/api/v1/volantes/${volanteColab1}/pdf`)).status, 401);
  });

  test('PDF: es un PDF válido, con los mismos valores y auditado', async () => {
    const r = await colab1.agente.get(`/api/v1/volantes/${volanteColab1}/pdf?descargar=1`).buffer(true).parse((res, cb) => {
      const partes = [];
      res.on('data', (d) => partes.push(d));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/pdf');
    assert.match(r.headers['content-disposition'], /attachment; filename="volante-2026-11-01-2026-11-15\.pdf"/);
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
    assert.ok(r.body.length > 2000);
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'DESCARGAR', entidad_id: String(volanteColab1) }).first());
  });

  test('pestaña Nómina del expediente para el admin (incluye borradores)', async () => {
    const id = (await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first()).id;
    const r = await admin.get(`/nomina/colaboradores/${id}/volantes`);
    assert.deepEqual(r.body.volantes.map((v) => v.estado).sort(), ['BORRADOR', 'PUBLICADO']);
    const exp = await colab1.get('/me/expediente');
    assert.equal(exp.body.pestanas.find((p) => p.clave === 'nomina').activa, true);
  });

  test('Inicio recibe la tarjeta del módulo', async () => {
    const me = await colab1.get('/auth/me');
    assert.ok(me.body.widgets.includes('/m/nomina/widget-inicio.js'));
    assert.ok(me.body.menu.some((m) => m.href === '/volantes'));
    assert.ok(!me.body.menu.some((m) => m.href === '/nomina'));
  });
});

describe('anular y eliminar', () => {
  test('un borrador se elimina (no se anula); un publicado se anula (no se elimina)', async () => {
    const oct = (await env.ctx.db('periodos_nomina').where({ fecha_inicio: '2026-10-16' }).first()).id;
    assert.equal((await admin.post(`/nomina/periodos/${oct}/anular`, { motivo: 'no aplica aquí' })).status, 409);
    assert.equal((await admin.agente.delete(`/api/v1/nomina/periodos/${periodoNov}`).set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf)).status, 409);
    const t = (await admin.get('/auth/csrf')).body.csrf;
    assert.equal((await admin.agente.delete(`/api/v1/nomina/periodos/${oct}`).set('X-CSRF-Token', t)).status, 204);
    assert.equal(await contar('volantes'), 4, 'se borran los volantes del borrador');
  });

  test('anular exige motivo; oculta los volantes y permite volver a cargar el periodo', async () => {
    assert.equal((await admin.post(`/nomina/periodos/${periodoNov}/anular`, { motivo: 'x' })).status, 400);
    const r = await admin.post(`/nomina/periodos/${periodoNov}/anular`, { motivo: 'Error en el préstamo de un colaborador' });
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'ANULADO');
    assert.equal((await colab1.get(`/volantes/${volanteColab1}`)).status, 404);
    assert.deepEqual((await colab1.get('/me/volantes')).body.volantes, []);
    const otra = await cargar('NOMINA NOV 1-15');
    assert.equal(otra.body.ok, true, 'el periodo anulado no bloquea la nueva carga');
  });
});
