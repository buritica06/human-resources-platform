// M5 – Incapacidades. Dato de salud (Ley 1581 de 2012): el diagnóstico va cifrado (AES-256-GCM)
// y el soporte PDF se guarda como documento sensible. No pasan por el flujo de aprobación: el
// colaborador las registra y el área contable las revisa (valida o devuelve con motivo).

export async function up(knex) {
  await knex.schema.createTable('incapacidades', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.string('tipo', 5).notNullable(); // IGE (enfermedad general) | IRL (riesgo laboral)
    t.string('entidad', 80).notNullable(); // EPS o ARL que expide
    t.string('fecha_inicio', 10).notNullable();
    t.string('fecha_fin', 10).notNullable();
    t.integer('dias').notNullable(); // días calendario, ambos extremos incluidos
    t.integer('prorroga_de').references('incapacidades.id');
    t.string('numero_certificado', 40);
    t.text('diagnostico_cifrado'); // opcional; nunca en claro ni en logs
    t.integer('documento_id').notNullable().references('documentos.id');
    t.string('estado', 12).notNullable(); // REGISTRADA | VALIDADA | DEVUELTA | ANULADA
    t.string('motivo_estado', 500);
    t.integer('registrado_por').references('usuarios.id');
    t.integer('revisado_por').references('usuarios.id');
    t.string('revisado_en', 30);
    t.string('creado_en', 30).notNullable();
    t.string('actualizado_en', 30).notNullable();
    t.index(['colaborador_id', 'fecha_inicio']);
    t.index(['estado']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('incapacidades');
}
