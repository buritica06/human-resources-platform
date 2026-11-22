// M2 – Nómina y volantes de pago. La app NO recalcula: guarda lo que trae la hoja NOMINA.

export async function up(knex) {
  await knex.schema.createTable('periodos_nomina', (t) => {
    t.increments('id');
    t.string('nombre_hoja', 60).notNullable();
    t.string('fecha_inicio', 10).notNullable();
    t.string('fecha_fin', 10).notNullable();
    t.string('estado', 12).notNullable(); // BORRADOR | PUBLICADO | ANULADO
    t.integer('colaboradores').notNullable().defaultTo(0);
    t.decimal('total_devengado', 16, 2).notNullable().defaultTo(0);
    t.decimal('total_deducido', 16, 2).notNullable().defaultTo(0);
    t.decimal('total_neto', 16, 2).notNullable().defaultTo(0);
    t.decimal('total_adicional', 16, 2).notNullable().defaultTo(0);
    t.string('archivo_nombre', 200);
    t.string('archivo_sha256', 64);
    t.text('advertencias'); // JSON
    t.integer('cargado_por').references('usuarios.id');
    t.string('cargado_en', 30).notNullable();
    t.integer('publicado_por').references('usuarios.id');
    t.string('publicado_en', 30);
    t.integer('anulado_por').references('usuarios.id');
    t.string('anulado_en', 30);
    t.string('motivo_anulacion', 300);
    t.index(['estado', 'fecha_inicio']);
  });
  // Un solo periodo vigente (no anulado) por rango de fechas. Índice parcial: SQLite y PostgreSQL.
  await knex.raw("CREATE UNIQUE INDEX periodos_nomina_vigente ON periodos_nomina (fecha_inicio, fecha_fin) WHERE estado <> 'ANULADO'");

  await knex.schema.createTable('volantes', (t) => {
    t.increments('id');
    t.integer('periodo_id').notNullable().references('periodos_nomina.id').onDelete('CASCADE');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    // Copia de lo que dice la hoja (el volante no cambia si luego se edita el expediente)
    t.string('cedula', 15).notNullable();
    t.string('nombre', 150).notNullable();
    t.string('empleador', 150);
    t.string('empleador_documento', 20);
    t.string('sede', 120);
    t.string('cargo', 80);
    t.string('rango', 40);
    t.decimal('dias', 6, 2);
    t.decimal('salario_base', 14, 2);
    t.decimal('total_devengado', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_deducido', 14, 2).notNullable().defaultTo(0);
    t.decimal('neto', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_adicional', 14, 2).notNullable().defaultTo(0);
    t.string('eps', 60);
    t.string('afp', 60);
    t.string('observacion', 500);
    t.integer('fila_origen');
    t.unique(['periodo_id', 'colaborador_id']);
    t.index(['colaborador_id']);
  });

  await knex.schema.createTable('volante_lineas', (t) => {
    t.increments('id');
    t.integer('volante_id').notNullable().references('volantes.id').onDelete('CASCADE');
    t.string('concepto', 30).notNullable(); // código del catálogo (src/modules/nomina/conceptos.js)
    t.string('tipo', 10).notNullable(); // DEV | DED | ADICIONAL
    t.string('etiqueta', 80).notNullable(); // texto tal como lo trae la hoja cuando difiere del catálogo
    t.decimal('cantidad', 10, 2);
    t.string('unidad', 12);
    t.decimal('valor', 14, 2).notNullable();
    t.text('detalle'); // JSON: desglose informativo (p. ej. horas por tipo)
    t.integer('orden').notNullable().defaultTo(0);
    t.index(['volante_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('volante_lineas');
  await knex.schema.dropTableIfExists('volantes');
  await knex.raw('DROP INDEX IF EXISTS periodos_nomina_vigente');
  await knex.schema.dropTableIfExists('periodos_nomina');
}
