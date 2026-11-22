// M8 – Suspensiones (novedad SUS del archivo de nómina). Las registra el área contable; no son una
// solicitud del colaborador. No cuentan como días laborados para causar vacaciones y no pueden
// cruzarse con otras ausencias. Anular deja rastro (no se borra).

export async function up(knex) {
  await knex.schema.createTable('suspensiones', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.string('fecha_inicio', 10).notNullable();
    t.string('fecha_fin', 10).notNullable();
    t.integer('dias').notNullable(); // calendario, ambos extremos incluidos
    t.string('motivo', 500).notNullable();
    t.integer('registrado_por').references('usuarios.id');
    t.string('creado_en', 30).notNullable();
    t.string('anulada_en', 30);
    t.integer('anulada_por').references('usuarios.id');
    t.string('motivo_anulacion', 300);
    t.index(['colaborador_id', 'fecha_inicio']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('suspensiones');
}
