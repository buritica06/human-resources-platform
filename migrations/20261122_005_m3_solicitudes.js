// M3 – Solicitudes con flujo de aprobación configurable, documentos (PDF) y notificaciones.

export async function up(knex) {
  // Flujo como configuración: cada versión guarda sus pasos. Una solicitud queda atada a la
  // versión con la que se envió, así cambiar el flujo no rompe las que están en curso.
  await knex.schema.createTable('flujos', (t) => {
    t.increments('id');
    t.string('tipo', 20).notNullable(); // PERMISO | VACACIONES | LICENCIA
    t.integer('version').notNullable();
    t.text('pasos').notNullable(); // JSON: [{ rol, estado, etiqueta }]
    t.boolean('activo').notNullable().defaultTo(true);
    t.integer('creado_por').references('usuarios.id');
    t.string('creado_en', 30).notNullable();
    t.unique(['tipo', 'version']);
  });

  await knex.schema.createTable('documentos', (t) => {
    t.increments('id');
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.string('categoria', 30).notNullable(); // SOPORTE_PERMISO | INCAPACIDAD | …
    t.string('storage_key', 120).notNullable().unique(); // nombre aleatorio, fuera de la carpeta pública
    t.string('nombre_original', 200);
    t.string('mime', 60).notNullable();
    t.integer('tamano').notNullable();
    t.string('sha256', 64).notNullable();
    t.boolean('sensible').notNullable().defaultTo(false); // datos de salud: solo colaborador y admin
    t.integer('subido_por').references('usuarios.id');
    t.string('creado_en', 30).notNullable();
    t.index(['colaborador_id']);
  });

  await knex.schema.createTable('solicitudes', (t) => {
    t.increments('id');
    t.string('tipo', 20).notNullable();
    t.string('subtipo', 60);
    t.integer('colaborador_id').notNullable().references('colaboradores.id');
    t.integer('flujo_id').references('flujos.id');
    t.integer('paso_actual'); // índice del paso pendiente; null si no está en trámite
    t.string('estado', 30).notNullable(); // BORRADOR | PENDIENTE_DIRECTOR | PENDIENTE_CONTABLE | APROBADA | RECHAZADA | CANCELADA
    t.string('fecha_inicio', 10).notNullable();
    t.string('hora_inicio', 5);
    t.string('fecha_fin', 10).notNullable();
    t.string('hora_fin', 5);
    t.decimal('dias_habiles', 6, 2);
    t.decimal('dias_compensar', 6, 2);
    t.text('motivo');
    t.integer('documento_id').references('documentos.id');
    t.text('datos'); // JSON con datos propios del tipo
    t.string('creado_en', 30).notNullable();
    t.string('actualizado_en', 30).notNullable();
    t.string('enviado_en', 30);
    t.string('resuelto_en', 30);
    t.index(['colaborador_id', 'tipo']);
    t.index(['estado']);
  });

  await knex.schema.createTable('solicitud_eventos', (t) => {
    t.increments('id');
    t.integer('solicitud_id').notNullable().references('solicitudes.id').onDelete('CASCADE');
    t.integer('actor_id').references('usuarios.id');
    t.string('accion', 20).notNullable(); // CREAR | ENVIAR | APROBAR | RECHAZAR | CANCELAR
    t.string('estado_desde', 30);
    t.string('estado_hasta', 30).notNullable();
    t.string('comentario', 500);
    t.string('creado_en', 30).notNullable();
    t.index(['solicitud_id']);
  });

  await knex.schema.createTable('notificaciones', (t) => {
    t.increments('id');
    t.integer('usuario_id').notNullable().references('usuarios.id').onDelete('CASCADE');
    t.string('titulo', 150).notNullable();
    t.string('mensaje', 500);
    t.string('enlace', 200);
    t.boolean('leida').notNullable().defaultTo(false);
    t.string('creada_en', 30).notNullable();
    t.index(['usuario_id', 'leida']);
  });
}

export async function down(knex) {
  for (const tabla of ['notificaciones', 'solicitud_eventos', 'solicitudes', 'documentos', 'flujos']) {
    await knex.schema.dropTableIfExists(tabla);
  }
}
