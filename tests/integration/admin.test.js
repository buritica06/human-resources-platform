// M8 – Panel del admincontable: parámetros con vigencia, festivos, flujos, anulación de aprobadas,
// suspensiones, ausentismo (+CSV), auditoría con filtros, resumen y acceso solo admin.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { FESTIVOS } from '../../seeds/datos-iniciales.js';
import { dias360, hoyBogota, primerHabilDesde, sumarDias } from '../../src/modules/vacaciones/calendario.js';

let env;
let admin;
let director;
let colab1;
let idColab1;
let idSedeNorte;
const hoy = hoyBogota();
const op = { festivos: new Map(FESTIVOS), sabadoHabil: true };

before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
  colab1 = await comoUsuario(env.app, CED.colab1);
  const c = await env.ctx.db('colaboradores').where({ cedula: CED.colab1 }).first();
  idColab1 = c.id;
  idSedeNorte = c.sede_id;
});
after(() => env.cerrar());

async function pedirVacaciones(c, fi, dias = 2) {
  const tk = (await c.get('/auth/csrf')).body.csrf;
  return c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', tk).field('tipo', 'VACACIONES').field('fecha_inicio', fi).field('dias', String(dias)).field('dias_compensar', '0');
}
async function aprobarTodo(id) {
  await director.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_DIRECTOR' });
  return admin.post(`/solicitudes/${id}/aprobar`, { estadoEsperado: 'PENDIENTE_CONTABLE' });
}

describe('acceso', () => {
  test('todo el panel es solo para el admincontable', async () => {
    for (const ruta of ['/admin/resumen', '/parametros', '/festivos/2026', `/reportes/ausentismo?desde=${hoy}&hasta=${hoy}`, '/auditoria']) {
      assert.equal((await director.get(ruta)).status, 403, ruta);
      assert.equal((await colab1.get(ruta)).status, 403, ruta);
    }
    assert.equal((await colab1.post(`/colaboradores/${idColab1}/suspensiones`, { fecha_inicio: hoy, fecha_fin: hoy, motivo: 'Prueba de acceso' })).status, 403);
  });

  test('resumen con pendientes, última nómina y alertas', async () => {
    const r = await admin.get('/admin/resumen');
    assert.equal(r.status, 200);
    assert.equal(typeof r.body.porAprobar, 'number');
    assert.ok(Array.isArray(r.body.alertas));
    assert.ok(r.body.alertas.some((a) => /VERIFICAR/.test(a.texto)), 'avisa de parámetros por verificar');
  });
});

describe('parámetros con vigencia', () => {
  test('un cambio con fecha FUTURA no afecta el presente; al llegar la fecha rige', async () => {
    const futuro = sumarDias(hoy, 10);
    const r = await admin.post('/parametros/PERMISO_MAX_DIAS/versiones', { valor: 5, desde: futuro, motivo: 'Nuevo reglamento interno' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.actual.valor, 3, 'hoy sigue el valor anterior');
    assert.equal(await env.ctx.params.valor('PERMISO_MAX_DIAS'), 3);
    assert.equal(await env.ctx.params.valor('PERMISO_MAX_DIAS', futuro), 5);
    assert.equal(await env.ctx.params.valor('PERMISO_MAX_DIAS', sumarDias(futuro, -1)), 3);
    assert.equal((await colab1.get('/permisos/opciones')).body.maxDias, 3, 'la app usa el de hoy');
    const prog = r.body.versiones.find((v) => v.estado === 'PROGRAMADA');
    assert.equal((await admin.agente.delete(`/api/v1/parametros/versiones/${prog.id}`).set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf)).status, 200);
    assert.equal(await env.ctx.params.valor('PERMISO_MAX_DIAS', futuro), 3, 'al borrarla, la anterior vuelve a regir sin fin');
  });

  test('no se reescribe el pasado, valida tipo, rango y validadores de módulo, y se audita', async () => {
    let r = await admin.post('/parametros/PERMISO_MAX_DIAS/versiones', { valor: 4, desde: sumarDias(hoy, -1), motivo: 'Intento retroactivo' });
    assert.match(r.body.error.campos.desde, /hoy o una fecha futura/);
    r = await admin.post('/parametros/UPLOAD_MAX_MB/versiones', { valor: 500, desde: hoy, motivo: 'Archivos más grandes' });
    assert.match(r.body.error.campos.valor, /entre 1 y 20/);
    r = await admin.post('/parametros/SABADO_HABIL/versiones', { valor: 'no', desde: hoy, motivo: 'Cambio de jornada' });
    assert.ok(r.body.error.campos.valor);
    r = await admin.post('/parametros/LISTA_TIPOS_LICENCIA/versiones', { valor: [{ nombre: 'X' }], desde: hoy, motivo: 'Lista incompleta' });
    assert.match(r.body.error.campos.valor, /nombre único/);
    r = await admin.post('/parametros/LISTA_EPS/versiones', { valor: ['Sura', 'SURA'], desde: hoy, motivo: 'Lista con repetidos' });
    assert.match(r.body.error.campos.valor, /repetidos/);
    r = await admin.post('/parametros/LISTA_EPS/versiones', { valor: ['Sura', 'Sanitas', 'Nueva EPS Demo'], desde: hoy, motivo: 'Actualización de EPS' });
    assert.equal(r.status, 201);
    assert.deepEqual(await env.ctx.params.valor('LISTA_EPS'), ['Sura', 'Sanitas', 'Nueva EPS Demo'], 'rige desde hoy');
    assert.ok(await env.ctx.db('auditoria').where({ accion: 'PROGRAMAR_PARAMETRO', entidad_id: 'LISTA_EPS' }).first());
  });

  test('una versión que ya rige (desde antes de hoy) no se puede borrar', async () => {
    const vigente = (await admin.get('/parametros')).body.parametros.find((p) => p.clave === 'PERMISO_MAX_DIAS').actual;
    assert.ok(vigente.desde < hoy);
    const r = await admin.agente.delete(`/api/v1/parametros/versiones/${vigente.id}`).set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf);
    assert.equal(r.status, 409);
  });
});

describe('festivos', () => {
  test('reemplaza un año completo con validaciones', async () => {
    let r = await admin.agente.put('/api/v1/festivos/2028').set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf)
      .send({ festivos: [{ fecha: '2027-01-01', nombre: 'Año Nuevo' }] });
    assert.equal(r.status, 400);
    r = await admin.agente.put('/api/v1/festivos/2028').set('X-CSRF-Token', (await admin.get('/auth/csrf')).body.csrf)
      .send({ festivos: [{ fecha: '2028-01-01', nombre: 'Año Nuevo' }, { fecha: '2028-01-10', nombre: 'Reyes Magos' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await admin.get('/festivos/2028')).body.festivos.length, 2);
  });
});

describe('anulación de solicitudes aprobadas', () => {
  test('el admin anula unas vacaciones aprobadas: se devuelven los días y se avisa', async () => {
    const antes = (await colab1.get('/me/vacaciones/saldo')).body;
    const s = await pedirVacaciones(colab1, primerHabilDesde(sumarDias(hoy, 30), op), 2);
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await aprobarTodo(s.body.id)).body.estado, 'APROBADA');
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.disfrutados, antes.disfrutados + 2);
    assert.equal((await colab1.post(`/solicitudes/${s.body.id}/anular`, { motivo: 'Ya no las necesito' })).status, 403);
    assert.equal((await admin.post(`/solicitudes/${s.body.id}/anular`, { motivo: 'x' })).status, 400);
    const a = await admin.post(`/solicitudes/${s.body.id}/anular`, { motivo: 'Se reprogramaron por cierre de inventario' });
    assert.equal(a.status, 200);
    assert.equal(a.body.estado, 'ANULADA');
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.disfrutados, antes.disfrutados, 'días devueltos');
    assert.equal((await admin.post(`/solicitudes/${s.body.id}/anular`, { motivo: 'Segunda anulación' })).status, 409);
    // Las mismas fechas se pueden volver a pedir
    assert.equal((await pedirVacaciones(colab1, primerHabilDesde(sumarDias(hoy, 30), op), 2)).status, 201);
  });
});

describe('suspensiones', () => {
  let idSus;
  test('el admin registra: valida, no cruza con otras ausencias y resta días laborados', async () => {
    const antes = (await colab1.get('/me/vacaciones/saldo')).body;
    let r = await admin.post(`/colaboradores/${idColab1}/suspensiones`, { fecha_inicio: sumarDias(hoy, -10), fecha_fin: sumarDias(hoy, 70), motivo: 'Demasiado larga' });
    assert.match(r.body.error.campos.fecha_fin, /60 días/);
    r = await admin.post(`/colaboradores/${idColab1}/suspensiones`, { fecha_inicio: sumarDias(hoy, -10), fecha_fin: sumarDias(hoy, -8), motivo: 'Falta disciplinaria (ficticia)' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    idSus = r.body.id;
    const despues = (await colab1.get('/me/vacaciones/saldo')).body;
    assert.equal(despues.diasNoLaborados - antes.diasNoLaborados, dias360(sumarDias(hoy, -10), sumarDias(hoy, -8)) + 1);
    r = await admin.post(`/colaboradores/${idColab1}/suspensiones`, { fecha_inicio: sumarDias(hoy, -9), fecha_fin: sumarDias(hoy, -9), motivo: 'Se cruza con la anterior' });
    assert.match(r.body.error.campos.fecha_inicio, /Se cruza/);
    // Una solicitud no puede caer sobre la suspensión
    const tk = (await colab1.get('/auth/csrf')).body.csrf;
    const p = await colab1.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', tk).field('tipo', 'PERMISO').field('subtipo', 'DILIGENCIA PERSONAL')
      .field('fecha_inicio', sumarDias(hoy, -9)).field('hora_inicio', '08:00').field('fecha_fin', sumarDias(hoy, -9)).field('hora_fin', '09:00').field('motivo', 'Trámite personal');
    assert.match(p.body.error.mensaje, /suspensión/);
  });

  test('alcance: el propio la ve, el director no; anular restablece', async () => {
    assert.equal((await colab1.get('/me/suspensiones')).body.suspensiones.length, 1);
    assert.equal((await director.get(`/colaboradores/${idColab1}/suspensiones`)).status, 404);
    assert.equal((await admin.post(`/suspensiones/${idSus}/anular`, { motivo: 'Registrada por error' })).status, 200);
    assert.equal((await colab1.get('/me/vacaciones/saldo')).body.diasNoLaborados, 0);
  });
});

describe('ausentismo', () => {
  test('por sede y rango, con días recortados al rango; CSV para Excel sin fórmulas peligrosas', async () => {
    const inc = await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ nombre: '=PEREZ GOMEZ ANA MARIA' });
    assert.equal(inc, 1);
    try {
      const desde = sumarDias(hoy, 25);
      const hasta = sumarDias(hoy, 40);
      const r = await admin.get(`/reportes/ausentismo?desde=${desde}&hasta=${hasta}&sede=${idSedeNorte}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.filas.every((f) => f.sede === 'SEDE NORTE'));
      assert.ok(r.body.filas.every((f) => f.ini >= desde && f.fin <= hasta));
      const csv = await admin.agente.get(`/api/v1/reportes/ausentismo?desde=${desde}&hasta=${hasta}&formato=csv`).buffer(true).parse((res, cb) => {
        let s = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { s += d; });
        res.on('end', () => cb(null, s));
      });
      assert.match(csv.headers['content-type'], /text\/csv/);
      assert.equal(csv.body.charCodeAt(0), 0xfeff, 'BOM para Excel');
      assert.match(csv.body, /Sede;Cédula;Nombre/);
      assert.ok(!/;=PEREZ/.test(csv.body), 'una celda que empieza por = se neutraliza');
      assert.ok(await env.ctx.db('auditoria').where({ accion: 'VER_AUSENTISMO' }).first());
    } finally {
      await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ nombre: 'PEREZ GOMEZ ANA MARIA' });
    }
  });

  test('rango inválido → 400', async () => {
    assert.equal((await admin.get(`/reportes/ausentismo?desde=${hoy}&hasta=${sumarDias(hoy, -1)}`)).status, 400);
    assert.equal((await admin.get(`/reportes/ausentismo?desde=2026-01-01&hasta=2028-01-01`)).status, 400);
  });
});

describe('auditoría', () => {
  test('filtrable por actor (cédula), entidad, acción y fecha; paginada', async () => {
    let r = await admin.get(`/auditoria?actor=${CED.admin}&entidad=solicitud&accion=ANULAR&desde=${hoy}&hasta=${hoy}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.total >= 1);
    assert.ok(r.body.registros.every((x) => x.actor.cedula === CED.admin && x.entidad === 'solicitud' && x.accion === 'ANULAR'));
    r = await admin.get(`/auditoria?desde=${sumarDias(hoy, 1)}`);
    assert.equal(r.body.total, 0, 'nada en el futuro');
    r = await admin.get('/auditoria?pagina=1');
    assert.ok(r.body.registros.length <= 50);
    assert.ok(r.body.opciones.acciones.includes('LOGIN'));
    assert.equal((await admin.get('/auditoria?actor=abc')).status, 400);
  });
});
