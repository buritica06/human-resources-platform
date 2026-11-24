// Pruebas de regresión de los hallazgos de la revisión independiente de M1.
import '../helpers/entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { crearEntorno, comoUsuario, CED } from '../helpers/app.js';
import { cargarConfig } from '../../src/core/config.js';
import { fechaCelda } from '../../src/core/excel.js';

const FIX = path.resolve(import.meta.dirname, '..', 'fixtures');
let env;
let admin;
let director;
before(async () => {
  env = await crearEntorno();
  admin = await comoUsuario(env.app, CED.admin);
  director = await comoUsuario(env.app, CED.director);
});
after(() => env.cerrar());

const previa = (archivo) => admin.subir('/colaboradores/importar', path.join(FIX, archivo), { confirmar: 'false' });
async function importar(archivo) {
  const p = await previa(archivo);
  return admin.subir('/colaboradores/importar', path.join(FIX, archivo), { confirmar: 'true', huella: p.body.huella ?? '' });
}
const fila = (cedula) => env.ctx.db('colaboradores').where({ cedula }).first();
const idColab = async (cedula) => (await fila(cedula)).id;

describe('hallazgo 2 – PARAMETROS defectuosa se reporta en la vista previa (no 500)', () => {
  test('clave larga y sede de empleador inexistente → errores; confirmar → 400 sin escribir nada', async () => {
    const r = await previa('parametros-malos.xlsx');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const mensajes = r.body.errores.map((e) => e.mensaje).join(' | ');
    assert.match(mensajes, /supera 30 caracteres/);
    assert.match(mensajes, /EMP_ZZ.*no existe/);
    assert.equal(r.body.errores.length, 2, 'la clave repetida EMP_A se ignora');
    const c = await importar('parametros-malos.xlsx');
    assert.equal(c.status, 400);
    assert.equal(await fila('2000000001'), undefined);
  });
});

describe('hallazgo 6 – solo se confirma el archivo revisado', () => {
  test('sin huella o con la huella de otro archivo → 400', async () => {
    const otra = (await previa('empleados-con-errores.xlsx')).body.huella;
    let r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true' });
    assert.equal(r.status, 400);
    r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-ficticio.xlsx'), { confirmar: 'true', huella: otra });
    assert.equal(r.status, 400);
    assert.match(r.body.error.mensaje, /no coincide/);
    assert.equal(await fila('2000000001'), undefined);
  });
});

describe('hallazgos 1, 5 y 8 – variantes de encabezado, valores largos y celdas vacías', () => {
  test('base: se importa el libro ficticio', async () => {
    const r = await importar('empleados-ficticio.xlsx');
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  test('celdas vacías no borran datos; "TIPO DE CONTRATO" y "Nº CUENTA" se reconocen; ARL larga se omite; columnas faltantes se avisan', async () => {
    const antes = await fila('2000000001');
    assert.ok(antes.numero_cuenta_cifrado);
    const p = await previa('empleados-variantes.xlsx');
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.body.errores.length, 0, JSON.stringify(p.body.errores));
    const avisos = p.body.advertencias.map((a) => a.mensaje).join(' | ');
    assert.match(avisos, /No se encontraron estas columnas/);
    assert.match(avisos, /Caja de compensación/);
    assert.doesNotMatch(avisos, /Tipo de contrato,|Número de cuenta,/, 'las variantes de encabezado sí se reconocen');
    assert.match(avisos, /Clase de riesgo ARL.*supera 5 caracteres/);
    assert.deepEqual(
      p.body.actualizar.map((a) => a.campos),
      [['Tipo de contrato']],
    );
    const r = await admin.subir('/colaboradores/importar', path.join(FIX, 'empleados-variantes.xlsx'), {
      confirmar: 'true',
      huella: p.body.huella,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const despues = await fila('2000000001');
    assert.equal(despues.tipo_contrato, 'FIJO 1 AÑO');
    assert.equal(despues.numero_cuenta_cifrado, antes.numero_cuenta_cifrado, 'la cuenta no se borra');
    assert.equal(Number(despues.salario_base), Number(antes.salario_base));
    assert.equal(despues.estado, antes.estado);
    assert.equal(despues.eps, antes.eps);
    assert.equal(despues.arl_riesgo, antes.arl_riesgo);
    assert.equal(despues.estado_civil, antes.estado_civil, '"ESTADO CIVIL" no se confunde con "ESTADO"');
  });

  test('un retirado con ESTADO vacío en el Excel sigue RETIRADO', async () => {
    assert.equal((await fila('2000000007')).estado, 'RETIRADO');
  });
});

describe('hallazgo 4 – reglas entre campos al cambiar solo una fecha', () => {
  test('mover la fecha de ingreso después del retiro o del fin del contrato → 400', async () => {
    const id = await idColab(CED.colab2);
    let r = await admin.patch(`/colaboradores/${id}`, { fecha_fin_contrato: '2025-12-31' });
    assert.equal(r.status, 200);
    r = await admin.patch(`/colaboradores/${id}`, { fecha_ingreso: '2026-03-01' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.fecha_fin_contrato);
    r = await admin.patch(`/colaboradores/${id}`, { estado: 'RETIRADO', fecha_retiro: '2026-06-30', fecha_fin_contrato: null });
    assert.equal(r.status, 200);
    r = await admin.patch(`/colaboradores/${id}`, { fecha_ingreso: '2026-08-01' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.campos.fecha_retiro);
  });
});

describe('asignación masiva y fugas en metadatos', () => {
  test('claves no previstas del admin (__proto__, numero_cuenta_cifrado, id, cedula) → 400 y sin efecto', async () => {
    const id = await idColab(CED.colab1);
    const antes = await fila(CED.colab1);
    for (const cuerpo of [
      { numero_cuenta_cifrado: 'x' },
      { id: 999 },
      { cedula: '1' },
      { creado_en: 'x' },
      JSON.parse('{"__proto__": "x"}'),
    ]) {
      const r = await admin.patch(`/colaboradores/${id}`, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
    }
    const despues = await fila(CED.colab1);
    assert.deepEqual({ ...despues, actualizado_en: null }, { ...antes, actualizado_en: null });
  });

  test('el director recibe todos los metadatos editables de su sede', async () => {
    const r = await director.get(`/colaboradores/${await idColab(CED.colab1)}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.campos.some((c) => c.clave === 'salario_base' && c.editable));
    assert.ok(r.body.campos.some((c) => c.clave === 'tipo_contrato' && c.editable));
    assert.ok(r.body.campos.some((c) => c.clave === 'eps' && c.editable));
    assert.ok(r.body.campos.some((c) => c.clave === 'afp' && c.editable));
  });
});

describe('hallazgo 7 – auditoría de lecturas', () => {
  test('ver historial y buscar en la lista quedan registrados', async () => {
    const id = await idColab(CED.colab1);
    await admin.get(`/colaboradores/${id}/historial`);
    await director.get('/colaboradores?q=perez');
    const colab = await comoUsuario(env.app, CED.colab1);
    await colab.get('/me/expediente/historial');
    const h = await env.ctx.db('auditoria').where({ accion: 'VER_HISTORIAL' });
    assert.ok(h.some((x) => x.entidad_id === String(id) && !JSON.parse(x.detalle ?? '{}').propio));
    assert.ok(h.some((x) => JSON.parse(x.detalle ?? '{}').propio));
    const b = await env.ctx.db('auditoria').where({ accion: 'BUSCAR' }).orderBy('id', 'desc').first();
    assert.equal(JSON.parse(b.detalle).q, 'perez');
  });
});

describe('hallazgo 3 y bajos', () => {
  test('la clave de cifrado de desarrollo solo se usa en desarrollo/pruebas locales', () => {
    const previo = process.env.DATA_ENCRYPTION_KEY;
    delete process.env.DATA_ENCRYPTION_KEY;
    try {
      assert.equal(cargarConfig({ env: 'development', produccion: false, appUrl: 'http://localhost:3000' }).claveDesarrollo, true);
      const remoto = cargarConfig({ env: 'development', produccion: false, appUrl: 'http://10.0.0.5:3000' });
      assert.equal(remoto.claveCifrado, '');
      const staging = cargarConfig({ env: 'staging', produccion: false, appUrl: 'http://localhost:3000' });
      assert.equal(staging.claveCifrado, '');
    } finally {
      if (previo !== undefined) process.env.DATA_ENCRYPTION_KEY = previo;
    }
  });

  test('número de serie de Excel con hora no salta al día siguiente', () => {
    assert.equal(fechaCelda(46023), '2026-01-01');
    assert.equal(fechaCelda(46023.75), '2026-01-01');
  });

  test('una cuenta que no se puede descifrar no tumba la página', async () => {
    const id = await idColab(CED.colab1);
    await env.ctx.db('colaboradores').where({ id }).update({ numero_cuenta_cifrado: 'v1:AAAA:BBBB:CCCC' });
    const r = await admin.get(`/colaboradores/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.colaborador.datos.numero_cuenta, '(no se puede leer)');
  });
});
