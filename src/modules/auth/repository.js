// Acceso a datos del módulo de autenticación.
import { ahora } from '../../core/db.js';

export function crearRepositorioAuth(db) {
  return {
    porCedula: (cedula) => db('usuarios').where({ cedula }).first(),
    porId: (id) => db('usuarios').where({ id }).first(),
    actualizar: (id, cambios) => db('usuarios').where({ id }).update({ ...cambios, actualizado_en: ahora() }),
  };
}
