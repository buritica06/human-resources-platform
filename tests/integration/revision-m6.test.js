// Regresión de los hallazgos de la revisión independiente de M6 (licencias).
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

async function pedir(c, campos = {}, archivo = null) {
  const t = (await c.get('/auth/csrf')).body.csrf;
  let r = c.agente.post('/api/v1/solicitudes').set('X-CSRF-Token', t);
  const datos = { tipo: 'LICENCIA', subtipo: 'CALAMIDAD DOMÉSTICA', fecha_inicio: sumarDias(hoy, 10), fecha_fin: sumarDias(hoy, 11), motivo: 'Daño en la vivienda', ...campos };
  for (const [k, v] of Object.entries(datos)) r = r.field(k, String(v));
  if (archivo) r = r.attach('soporte', archivo, 'soporte.pdf');
  return r;
}
async function cambiarParametro(clave, valor) {
  await env.ctx.db('parametros').where({ clave }).update({ valor: JSON.stringify(valor) });
  env.ctx.params.invalidar();
}

test('un borrador se revalida al enviarlo: ventana de días atrás, tipo vigente y expediente activo', async () => {
  const b = await pedir(colab1, { fecha_inicio: sumarDias(hoy, -5), fecha_fin: sumarDias(hoy, -4), enviar: 'false' });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await cambiarParametro('LIC_REGISTRO_MAX_DIAS_ATRAS', 2); // como si hubiera pasado el tiempo
  try {
    const e = await colab1.post(`/solicitudes/${b.body.id}/enviar`, {});
    assert.equal(e.status, 400);
    assert.match(e.body.error.campos.fecha_inicio, /últimos 2 días/);
  } finally {
    await cambiarParametro('LIC_REGISTRO_MAX_DIAS_ATRAS', 30);
  }
  await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ estado: 'RETIRADO' });
  try {
    const e = await colab1.post(`/solicitudes/${b.body.id}/enviar`, {});
    assert.match(e.body.error.mensaje, /retirado/);
  } finally {
    await env.ctx.db('colaboradores').where({ id: idColab1 }).update({ estado: 'ACTIVO' });
  }
  assert.equal((await colab1.post(`/solicitudes/${b.body.id}/enviar`, {})).status, 200, 'con todo en regla, se envía');
});

test('parámetro mal configurado (booleano como texto, nombres repetidos) → error controlado, no se relajan reglas', async () => {
  const original = (await env.ctx.db('parametros').where({ clave: 'LISTA_TIPOS_LICENCIA' }).first()).valor;
  try {
    const lista = JSON.parse(original);
    await cambiarParametro('LISTA_TIPOS_LICENCIA', lista.map((t, i) => (i === 0 ? { ...t, sensible: 'false' } : t)));
    assert.equal((await colab1.get('/licencias/opciones')).status, 500);
    await cambiarParametro('LISTA_TIPOS_LICENCIA', [...lista, { ...lista[0], nombre: 'maternidad' }]);
    assert.equal((await colab1.post('/licencias/calcular', { subtipo: 'LUTO', fecha_inicio: hoy, fecha_fin: hoy })).status, 500);
  } finally {
    await env.ctx.db('parametros').where({ clave: 'LISTA_TIPOS_LICENCIA' }).update({ valor: original });
    env.ctx.params.invalidar();
  }
});

test('la regla queda congelada en la solicitud aunque el parámetro cambie después', async () => {
  const r = await pedir(colab1, { subtipo: 'NO REMUNERADA', fecha_inicio: sumarDias(hoy, 40), fecha_fin: sumarDias(hoy, 41) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const original = (await env.ctx.db('parametros').where({ clave: 'LISTA_TIPOS_LICENCIA' }).first()).valor;
  try {
    await cambiarParametro('LISTA_TIPOS_LICENCIA', JSON.parse(original).map((t) => ({ ...t, descuentaVacaciones: false })));
    const s = (await colab1.get(`/solicitudes/${r.body.id}`)).body;
    assert.equal(s.datos.descuentaVacaciones, true);
  } finally {
    await env.ctx.db('parametros').where({ clave: 'LISTA_TIPOS_LICENCIA' }).update({ valor: original });
    env.ctx.params.invalidar();
  }
  await colab1.post(`/solicitudes/${r.body.id}/cancelar`, {});
});

test('maternidad: el director no ve enlace al soporte sensible ni el motivo; el dueño y el admin sí', async () => {
  const r = await pedir(colab1, { subtipo: 'MATERNIDAD', fecha_inicio: sumarDias(hoy, 60), fecha_fin: sumarDias(hoy, 70), motivo: 'Parto programado por preeclampsia' }, PDF);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = (await director.get(`/solicitudes/${r.body.id}`)).body;
  assert.equal(d.documentoVisible, false);
  assert.ok(!JSON.stringify(d).includes('preeclampsia'), 'el motivo no llega al director');
  assert.equal(d.acciones.aprobar, true, 'el director igual puede aprobar (ve tipo y fechas)');
  const propia = (await colab1.get(`/solicitudes/${r.body.id}`)).body;
  assert.equal(propia.documentoVisible, true);
  assert.match(propia.motivo, /preeclampsia/);
  assert.equal((await admin.get(`/solicitudes/${r.body.id}`)).body.documentoVisible, true);
});

test('calcular sin sesión → 401', async () => {
  const { cliente } = await import('../helpers/app.js');
  const c = cliente(env.app);
  assert.equal((await c.post('/licencias/calcular', { subtipo: 'LUTO', fecha_inicio: hoy, fecha_fin: hoy })).status, 401);
});
