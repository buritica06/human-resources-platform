// M2 (revisión): recordar qué carga de nómina creó un expediente básico, para poder
// borrarlo si se elimina ese borrador y el expediente no tiene nada más.

export async function up(knex) {
  await knex.schema.alterTable('colaboradores', (t) => {
    t.integer('creado_por_periodo_id'); // sin FK: el periodo puede eliminarse
  });
}

export async function down(knex) {
  await knex.schema.alterTable('colaboradores', (t) => {
    t.dropColumn('creado_por_periodo_id');
  });
}
