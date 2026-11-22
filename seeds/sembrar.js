// Siembra idempotente: parámetros, festivos y (fuera de producción) organización y
// usuarios FICTICIOS de prueba. Nunca usa datos reales.
import { ahora } from '../src/core/db.js';
import { hashClave } from '../src/core/security/claves.js';
import { PARAMETROS, FESTIVOS, EMPLEADORES_FICTICIOS, SEDES_FICTICIAS, FLUJO_POR_DEFECTO, TIPOS_CON_FLUJO } from './datos-iniciales.js';

export const USUARIOS_DEMO = [
  { cedula: '1000000001', nombre: 'ADMIN DEMO CONTABLE', rol: 'ADMIN' },
  { cedula: '1000000002', nombre: 'DIRECTOR DEMO NORTE', rol: 'DIRECTOR', sedes: ['SEDE NORTE', 'SEDE SUR'] },
  { cedula: '1000000003', nombre: 'PEREZ GOMEZ ANA MARIA', rol: 'COLABORADOR' },
  { cedula: '1000000004', nombre: 'RAMIREZ DIAZ LUIS CARLOS', rol: 'COLABORADOR' },
];

export async function sembrarBase(db) {
  const t = ahora();
  for (const [clave, valor, tipo, desde, hasta, descripcion] of PARAMETROS) {
    const existe = await db('parametros').where({ clave, vigente_desde: desde }).first();
    if (!existe) {
      await db('parametros').insert({
        clave, valor: JSON.stringify(valor), tipo, vigente_desde: desde, vigente_hasta: hasta, descripcion, actualizado_en: t,
      });
    }
  }
  for (const [fecha, nombre] of FESTIVOS) {
    if (!(await db('festivos').where({ fecha }).first())) {
      await db('festivos').insert({ fecha, anio: Number(fecha.slice(0, 4)), nombre });
    }
  }
  if (await db.schema.hasTable('flujos')) {
    for (const tipo of TIPOS_CON_FLUJO) {
      if (!(await db('flujos').where({ tipo }).first())) {
        await db('flujos').insert({ tipo, version: 1, pasos: JSON.stringify(FLUJO_POR_DEFECTO), activo: true, creado_en: t });
      }
    }
  }
}

// Expedientes FICTICIOS de los usuarios demo. colab1 está en una sede del director demo;
// colab2 no (sirve para probar el alcance).
export const EXPEDIENTES_DEMO = [
  { cedula: '1000000001', sede: 'SEDE CENTRO', cargo: 'CONTADORA', salario_base: 3500000, fecha_ingreso: '2019-02-01', saldoVacaciones: 6 },
  { cedula: '1000000002', sede: 'SEDE NORTE', cargo: 'DIRECTOR ADMINISTRATIVO', salario_base: 3000000, fecha_ingreso: '2020-06-15', saldoVacaciones: 10 },
  { cedula: '1000000003', sede: 'SEDE NORTE', cargo: 'AUXILIAR', salario_base: 1750905, fecha_ingreso: '2023-03-01', cuenta: '12345678901', saldoVacaciones: 8.5 },
  { cedula: '1000000004', sede: 'SEDE RIO', cargo: 'AUXILIAR', salario_base: 1750905, fecha_ingreso: '2024-08-20', saldoVacaciones: 3 },
];

export async function sembrarExpedientesDemo(db, { cifrador } = {}) {
  const t = ahora();
  for (const e of EXPEDIENTES_DEMO) {
    if (await db('colaboradores').where({ cedula: e.cedula }).first()) continue;
    const u = await db('usuarios').where({ cedula: e.cedula }).first();
    const s = await db('sedes').where({ nombre: e.sede }).first();
    await db('colaboradores').insert({
      cedula: e.cedula, nombre: u?.nombre ?? 'DEMO', empleador_id: s.empleador_id, sede_id: s.id, cargo: e.cargo,
      tipo_contrato: 'INDEFINIDO', fecha_ingreso: e.fecha_ingreso, salario_base: e.salario_base, aux_transporte: e.salario_base <= 3501810,
      eps: 'Sura', afp: 'Porvenir', arl_riesgo: 'I', banco: 'BANCOLOMBIA', tipo_cuenta: 'AHORRO',
      numero_cuenta_cifrado: e.cuenta && cifrador ? cifrador.cifrar(e.cuenta) : null,
      estado: 'ACTIVO', celular: `300${e.cedula.slice(-7)}`, ciudad_residencia: 'CIUDAD DEMO',
      dia_descanso: 'DOMINGO', esquema_horas: 'SEMANA COMPLETA', creado_en: t, actualizado_en: t,
    });
  }
  // Saldo de vacaciones al corte (M4), ficticio
  if (await db.schema.hasTable('saldos_vacaciones')) {
    for (const e of EXPEDIENTES_DEMO) {
      const c = await db('colaboradores').where({ cedula: e.cedula }).first();
      if (!c || (await db('saldos_vacaciones').where({ colaborador_id: c.id }).first())) continue;
      await db('saldos_vacaciones').insert({ colaborador_id: c.id, fecha_corte: '2026-01-01', dias_al_corte: e.saldoVacaciones, observacion: 'Saldo ficticio de demostración', registrado_en: t });
    }
  }
}

export async function sembrarDemo(db, { clave, cifrador }) {
  if (!clave) throw new Error('Falta la contraseña de los usuarios demo.');
  const t = ahora();
  for (const e of EMPLEADORES_FICTICIOS) {
    if (!(await db('empleadores').where({ clave: e.clave }).first())) await db('empleadores').insert(e);
  }
  let orden = 0;
  for (const [clave, nombre] of SEDES_FICTICIAS) {
    const emp = await db('empleadores').where({ clave }).first();
    if (!(await db('sedes').where({ empleador_id: emp.id, nombre }).first())) {
      await db('sedes').insert({ empleador_id: emp.id, nombre, orden: orden++ });
    }
  }
  const hash = await hashClave(clave);
  for (const u of USUARIOS_DEMO) {
    let fila = await db('usuarios').where({ cedula: u.cedula }).first();
    if (!fila) {
      await db('usuarios').insert({
        cedula: u.cedula, nombre: u.nombre, rol: u.rol, password_hash: hash,
        debe_cambiar_clave: false,
        correo: `usuario${u.cedula.slice(-2)}@example.com`, correo_verificado_en: t,
        creado_en: t, actualizado_en: t,
      });
      fila = await db('usuarios').where({ cedula: u.cedula }).first();
      for (const nombreSede of u.sedes ?? []) {
        const s = await db('sedes').where({ nombre: nombreSede }).first();
        await db('director_sedes').insert({ usuario_id: fila.id, sede_id: s.id });
      }
    }
  }
  await sembrarExpedientesDemo(db, { cifrador });
}
