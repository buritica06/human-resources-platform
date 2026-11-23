// Acceso a datos de usuarios, sedes y alcance de directores.
import { ahora } from '../../core/db.js';

const COLUMNAS = [
  'id',
  'cedula',
  'nombre',
  'rol',
  'activo',
  'debe_cambiar_clave',
  'correo',
  'correo_verificado_en',
  'bloqueado_hasta',
  'ultimo_acceso',
  'creado_en',
];
export const POR_PAGINA = 25;

export function crearRepositorioUsuarios(db) {
  return {
    async listar({ q, rol, activo, pagina }) {
      const base = db('usuarios');
      if (q) {
        const t = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        // Los nombres se guardan siempre en MAYÚSCULAS (toUpperCase de JS sí convierte ñ y tildes);
        // el UPPER de SQLite no, por eso se compara con el término ya convertido en JS.
        base.where((w) => w.whereRaw("cedula LIKE ? ESCAPE '\\'", [t]).orWhereRaw("nombre LIKE ? ESCAPE '\\'", [t.toUpperCase()]));
      }
      if (rol) base.where({ rol });
      if (activo) base.where({ activo: activo === 'true' });
      const [{ total }] = await base.clone().count({ total: '*' });
      const filas = await base
        .select(COLUMNAS)
        .orderBy('nombre')
        .limit(POR_PAGINA)
        .offset((pagina - 1) * POR_PAGINA);
      return { total: Number(total), filas };
    },
    porId: (id) => db('usuarios').select(COLUMNAS).where({ id }).first(),
    existeCedula: async (cedula) => !!(await db('usuarios').where({ cedula }).first('id')),
    cedulasExistentes: async (cedulas) => new Set((await db('usuarios').whereIn('cedula', cedulas).select('cedula')).map((r) => r.cedula)),
    async insertar(trx, datos) {
      const t = ahora();
      const [fila] = await trx('usuarios')
        .insert({ ...datos, creado_en: t, actualizado_en: t })
        .returning('id');
      return typeof fila === 'object' ? fila.id : fila;
    },
    actualizar: (trx, id, cambios) =>
      trx('usuarios')
        .where({ id })
        .update({ ...cambios, actualizado_en: ahora() }),
    sedesDe: async (usuarioId) => (await db('director_sedes').where({ usuario_id: usuarioId }).select('sede_id')).map((r) => r.sede_id),
    async reemplazarSedes(trx, usuarioId, sedes) {
      await trx('director_sedes').where({ usuario_id: usuarioId }).del();
      if (sedes.length) await trx('director_sedes').insert(sedes.map((s) => ({ usuario_id: usuarioId, sede_id: s })));
    },
    contarAdminsActivos: async () => Number((await db('usuarios').where({ rol: 'ADMIN', activo: true }).count({ n: '*' }))[0].n),
    listarSedes: () =>
      db('sedes')
        .join('empleadores', 'empleadores.id', 'sedes.empleador_id')
        .where('sedes.activa', true)
        .select('sedes.id', 'sedes.nombre', 'empleadores.razon_social as empleador')
        .orderBy([{ column: 'empleadores.id' }, { column: 'sedes.orden' }]),
    sedesValidas: async (ids) =>
      ids.length ? (await db('sedes').whereIn('id', ids).where({ activa: true }).count({ n: '*' }))[0].n == ids.length : true,
  };
}
