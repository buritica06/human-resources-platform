// Siembra idempotente: parámetros, festivos y (fuera de producción) organización y
// usuarios FICTICIOS de prueba. Nunca usa datos reales.
import { ahora } from '../src/core/db.js';
import { hashClave } from '../src/core/security/claves.js';
import { PARAMETROS, FESTIVOS, EMPLEADORES_FICTICIOS, SEDES_FICTICIAS } from './datos-iniciales.js';

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
}

export async function sembrarDemo(db, { clave }) {
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
}
