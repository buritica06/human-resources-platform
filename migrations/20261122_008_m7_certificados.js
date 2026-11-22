// M7 – Certificados laborales con código de verificación. Se guarda una copia del contenido con el
// que se emitió (así el PDF se puede volver a descargar idéntico aunque el expediente cambie) y la
// huella sha256 del texto. La verificación pública solo dice si el código es válido, el tipo y la fecha.

export async function up(knex) {
  await knex.schema.createTable('certificados', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.string('tipo', 20).notNullable(); // LABORAL
    t.boolean('con_salario').notNullable().defaultTo(false);
    t.string('codigo', 20).notNullable().unique(); // aleatorio, p. ej. 7KQ2-M9XD-4TRA
    t.string('dirigido_a', 100);
    t.text('contenido').notNullable(); // JSON con los datos impresos
    t.string('huella', 64).notNullable();
    t.integer('emitido_por').references('usuarios.id');
    t.string('emitido_en', 30).notNullable();
    t.string('anulado_en', 30);
    t.integer('anulado_por').references('usuarios.id');
    t.string('motivo_anulacion', 300);
    t.index(['colaborador_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('certificados');
}
