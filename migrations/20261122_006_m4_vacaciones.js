// M4 – Saldo de vacaciones al corte (P8 del análisis). El archivo de nómina no guarda los días
// disfrutados antes de 2026: el admincontable registra, por colaborador, cuántos días tenía
// pendientes antes de una fecha de corte. Desde esa fecha la plataforma suma lo causado y resta
// lo aprobado. Cada registro se conserva (historial); vale el de fecha de corte más reciente.

export async function up(knex) {
  await knex.schema.createTable('saldos_vacaciones', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.string('fecha_corte', 10).notNullable();
    t.decimal('dias_al_corte', 7, 2).notNullable();
    t.string('observacion', 300).notNullable();
    t.integer('registrado_por').references('usuarios.id');
    t.string('registrado_en', 30).notNullable();
    t.index(['colaborador_id', 'fecha_corte']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('saldos_vacaciones');
}
