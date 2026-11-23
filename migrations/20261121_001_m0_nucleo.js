// M0 – Núcleo: organización, usuarios, sesiones, tokens, parámetros, festivos y auditoría.
// Fechas en texto ISO-8601 (UTC) para que el esquema sea igual en SQLite y PostgreSQL.

export async function up(knex) {
  await knex.schema.createTable('empleadores', (t) => {
    t.increments('id');
    t.string('clave', 30).notNullable().unique();
    t.string('razon_social', 150).notNullable();
    t.string('documento', 20);
  });

  await knex.schema.createTable('sedes', (t) => {
    t.increments('id');
    t.integer('empleador_id').notNullable().references('empleadores.id');
    t.string('nombre', 120).notNullable();
    t.integer('orden').notNullable().defaultTo(0);
    t.boolean('activa').notNullable().defaultTo(true);
    t.unique(['empleador_id', 'nombre']);
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id');
    t.string('cedula', 15).notNullable().unique();
    t.string('nombre', 150).notNullable();
    t.string('rol', 20).notNullable().defaultTo('COLABORADOR'); // COLABORADOR | DIRECTOR | ADMIN
    t.boolean('activo').notNullable().defaultTo(true);
    t.string('password_hash', 255).notNullable();
    t.string('password_hash_anterior', 255);
    t.boolean('debe_cambiar_clave').notNullable().defaultTo(true);
    t.string('clave_temporal_expira', 30);
    t.string('correo', 254);
    t.string('correo_verificado_en', 30);
    t.integer('intentos_fallidos').notNullable().defaultTo(0);
    t.string('bloqueado_hasta', 30);
    t.string('ultimo_acceso', 30);
    t.integer('creado_por').references('usuarios.id');
    t.string('creado_en', 30).notNullable();
    t.string('actualizado_en', 30).notNullable();
  });

  await knex.schema.createTable('director_sedes', (t) => {
    t.integer('usuario_id').notNullable().references('usuarios.id').onDelete('CASCADE');
    t.integer('sede_id').notNullable().references('sedes.id').onDelete('CASCADE');
    t.primary(['usuario_id', 'sede_id']);
  });

  await knex.schema.createTable('sesiones', (t) => {
    t.string('id_hash', 64).primary(); // sha256 del token de la cookie
    t.integer('usuario_id').notNullable().references('usuarios.id').onDelete('CASCADE');
    t.string('csrf', 64).notNullable();
    t.string('creada_en', 30).notNullable();
    t.string('ultimo_uso', 30).notNullable();
    t.string('expira_absoluta', 30).notNullable();
    t.string('ip', 64);
    t.string('user_agent', 255);
    t.index(['usuario_id']);
  });

  await knex.schema.createTable('tokens', (t) => {
    t.increments('id');
    t.integer('usuario_id').notNullable().references('usuarios.id').onDelete('CASCADE');
    t.string('tipo', 20).notNullable(); // VERIFICAR_CORREO | RECUPERAR
    t.string('hash', 64).notNullable().unique();
    t.string('dato', 254); // p. ej. correo a verificar
    t.string('expira_en', 30).notNullable();
    t.string('usado_en', 30);
    t.string('creado_en', 30).notNullable();
    t.index(['usuario_id', 'tipo']);
  });

  await knex.schema.createTable('parametros', (t) => {
    t.increments('id');
    t.string('clave', 60).notNullable();
    t.text('valor').notNullable(); // JSON
    t.string('tipo', 20).notNullable(); // numero | texto | booleano | json
    t.string('vigente_desde', 10).notNullable(); // AAAA-MM-DD
    t.string('vigente_hasta', 10);
    t.string('descripcion', 255);
    t.integer('actualizado_por').references('usuarios.id');
    t.string('actualizado_en', 30).notNullable();
    t.unique(['clave', 'vigente_desde']);
  });

  await knex.schema.createTable('festivos', (t) => {
    t.string('fecha', 10).primary(); // AAAA-MM-DD
    t.integer('anio').notNullable();
    t.string('nombre', 120);
    t.index(['anio']);
  });

  await knex.schema.createTable('auditoria', (t) => {
    t.increments('id');
    t.integer('actor_id').references('usuarios.id');
    t.string('accion', 30).notNullable();
    t.string('entidad', 40).notNullable();
    t.string('entidad_id', 40);
    t.text('detalle'); // JSON sin datos sensibles en claro
    t.string('ip', 64);
    t.string('user_agent', 255);
    t.string('creado_en', 30).notNullable();
    t.index(['entidad', 'entidad_id']);
    t.index(['actor_id']);
    t.index(['creado_en']);
  });
}

export async function down(knex) {
  for (const tabla of ['auditoria', 'festivos', 'parametros', 'tokens', 'sesiones', 'director_sedes', 'usuarios', 'sedes', 'empleadores']) {
    await knex.schema.dropTableIfExists(tabla);
  }
}
