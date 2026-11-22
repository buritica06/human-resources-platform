// Acceso a datos del módulo de autenticación.
import { ahora } from '../../core/db.js';

export function crearRepositorioAuth(db) {
  return {
    porCedula: (cedula) => db('usuarios').where({ cedula }).first(),
    porId: (id) => db('usuarios').where({ id }).first(),
    actualizar: (id, cambios) => db('usuarios').where({ id }).update({ ...cambios, actualizado_en: ahora() }),
    // UPDATE … SET intentos = intentos + 1 (atómico) y devuelve el valor resultante.
    async sumarIntentoFallido(id) {
      await db('usuarios').where({ id }).increment('intentos_fallidos', 1);
      return Number((await db('usuarios').where({ id }).first('intentos_fallidos')).intentos_fallidos);
    },
  };
}
