// Acceso a datos del expediente.
import { ahora } from '../../core/db.js';

export const POR_PAGINA = 25;

export function crearRepositorioColaboradores(db) {
  const base = () =>
    db('colaboradores as c')
      .leftJoin('sedes as s', 's.id', 'c.sede_id')
      .leftJoin('empleadores as e', 'e.id', 'c.empleador_id')
      .select('c.*', 's.nombre as sede_nombre', 'e.razon_social as empleador_nombre');

  return {
    porId: (id) => base().where('c.id', id).first(),
    porCedula: (cedula) => base().where('c.cedula', cedula).first(),

    // alcance: null = todas las sedes; array = solo esas sedes
    async listar({ q, sede, estado, pagina }, alcance) {
      const consulta = db('colaboradores as c').leftJoin('sedes as s', 's.id', 'c.sede_id');
      if (alcance) consulta.whereIn('c.sede_id', alcance.length ? alcance : [-1]);
      if (sede) consulta.where('c.sede_id', sede);
      if (estado) consulta.where('c.estado', estado);
      if (q) {
        const t = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
        consulta.where((w) => w.whereRaw("c.cedula LIKE ? ESCAPE '\\'", [t]).orWhereRaw("c.nombre LIKE ? ESCAPE '\\'", [t.toUpperCase()]));
      }
      const [{ total }] = await consulta.clone().count({ total: '*' });
      const filas = await consulta
        .select('c.id', 'c.cedula', 'c.nombre', 'c.cargo', 'c.estado', 's.nombre as sede_nombre')
        .orderBy('c.nombre')
        .limit(POR_PAGINA)
        .offset((pagina - 1) * POR_PAGINA);
      return { total: Number(total), filas };
    },

    sedesDeDirector: async (usuarioId) =>
      (await db('director_sedes').where({ usuario_id: usuarioId }).select('sede_id')).map((r) => r.sede_id),

    sedes: () =>
      db('sedes as s')
        .join('empleadores as e', 'e.id', 's.empleador_id')
        .where('s.activa', true)
        .select('s.id', 's.nombre', 's.empleador_id', 'e.razon_social as empleador')
        .orderBy([{ column: 'e.id' }, { column: 's.orden' }]),
    empleadores: () => db('empleadores').select('id', 'clave', 'razon_social').orderBy('id'),

    async insertar(trx, datos) {
      const t = ahora();
      const [fila] = await trx('colaboradores')
        .insert({ ...datos, creado_en: t, actualizado_en: t })
        .returning('id');
      return typeof fila === 'object' ? fila.id : fila;
    },
    actualizar: (trx, id, cambios) =>
      trx('colaboradores')
        .where({ id })
        .update({ ...cambios, actualizado_en: ahora() }),

    async eliminar(trx, id) {
      for (const tabla of [
        'volantes',
        'incapacidades',
        'solicitudes',
        'certificados',
        'saldos_vacaciones',
        'suspensiones',
        'documentos',
        'expediente_cambios',
      ]) {
        if (await trx.schema.hasTable(tabla)) {
          await trx(tabla).where({ colaborador_id: id }).del();
        }
      }
      return trx('colaboradores').where({ id }).del();
    },

    registrarCambios: (trx, filas) => (filas.length ? trx('expediente_cambios').insert(filas) : null),

    historial: (colaboradorId, excluirCampos = []) =>
      db('expediente_cambios as h')
        .leftJoin('usuarios as u', 'u.id', 'h.actor_id')
        .where('h.colaborador_id', colaboradorId)
        .whereNotIn('h.campo', excluirCampos.length ? excluirCampos : ['__ninguno__'])
        .select('h.id', 'h.campo', 'h.valor_anterior', 'h.valor_nuevo', 'h.origen', 'h.creado_en', 'u.nombre as actor_nombre')
        .orderBy('h.id', 'desc')
        .limit(200),
  };
}
