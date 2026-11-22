// M1 – Expediente del colaborador e historial de cambios.
// El colaborador se relaciona con su cuenta de usuario por la cédula (sin FK), para que
// los módulos "usuarios" y "colaboradores" sean independientes.

export async function up(knex) {
  await knex.schema.createTable('colaboradores', (t) => {
    t.increments('id');
    t.string('cedula', 15).notNullable().unique();
    t.string('nombre', 150).notNullable(); // APELLIDOS NOMBRES, como en el archivo de nómina
    // Laborales
    t.integer('empleador_id').references('empleadores.id');
    t.integer('sede_id').references('sedes.id');
    t.string('cargo', 80);
    t.string('rango', 40); // opcional (supuesto P2)
    t.string('tipo_contrato', 40);
    t.string('fecha_ingreso', 10);
    t.string('fecha_fin_contrato', 10);
    t.decimal('salario_base', 14, 2);
    t.boolean('aux_transporte');
    t.string('dia_descanso', 12);
    t.string('esquema_horas', 20);
    t.boolean('lactancia');
    t.string('fin_lactancia', 10);
    // Seguridad social
    t.string('eps', 60);
    t.string('afp', 60);
    t.string('fondo_cesantias', 60);
    t.string('caja', 60);
    t.string('arl_riesgo', 5);
    // Pago (número de cuenta cifrado en reposo)
    t.string('banco', 60);
    t.string('tipo_cuenta', 20);
    t.text('numero_cuenta_cifrado');
    // Estado
    t.string('estado', 12).notNullable().defaultTo('ACTIVO'); // ACTIVO | RETIRADO
    t.string('fecha_retiro', 10);
    t.string('motivo_retiro', 60);
    // Personales y contacto (no están en el archivo de nómina; los completa el colaborador o el admin)
    t.string('fecha_nacimiento', 10);
    t.string('sexo', 20);
    t.string('estado_civil', 20);
    t.string('nacionalidad', 40);
    t.string('ciudad_nacimiento', 80);
    t.string('ciudad_residencia', 80);
    t.string('direccion', 120);
    t.string('barrio', 80);
    t.string('celular', 15);
    t.string('contacto_emergencia_nombre', 100);
    t.string('contacto_emergencia_telefono', 15);
    t.string('creado_en', 30).notNullable();
    t.string('actualizado_en', 30).notNullable();
    t.index(['sede_id']);
    t.index(['estado']);
  });

  await knex.schema.createTable('expediente_cambios', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id').onDelete('CASCADE');
    t.string('campo', 40).notNullable();
    t.text('valor_anterior');
    t.text('valor_nuevo');
    t.string('origen', 15).notNullable(); // COLABORADOR | ADMIN | IMPORTACION
    t.integer('actor_id').references('usuarios.id');
    t.string('creado_en', 30).notNullable();
    t.index(['colaborador_id', 'creado_en']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('expediente_cambios');
  await knex.schema.dropTableIfExists('colaboradores');
}
