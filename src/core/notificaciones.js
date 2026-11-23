// Notificaciones: se guardan en la BD (bandeja de la campana), se avisan en tiempo real por
// Server-Sent Events y, si el usuario tiene correo confirmado, se envían por correo.
// El emisor de eventos es local al proceso: con varias instancias del servidor habría que
// cambiarlo por un canal compartido (p. ej. LISTEN/NOTIFY de PostgreSQL). Ver docs/despliegue.md.
import { EventEmitter } from 'node:events';
import { ahora } from './db.js';
import { log } from './logger.js';

export function crearNotificaciones(ctx) {
  const { db, mailer, cfg } = ctx;
  const emisor = new EventEmitter();
  emisor.setMaxListeners(0);

  // correoGenerico: { asunto, texto } para avisos con datos sensibles (p. ej. salud): el correo
  // sale a un buzón externo, así que solo dice que hay una novedad; el detalle queda en la plataforma.
  async function notificar(usuarioIds, { titulo, mensaje, enlace, correo = true, correoGenerico = null }) {
    const ids = [...new Set(usuarioIds.filter(Boolean))];
    if (!ids.length) return;
    const t = ahora();
    await db('notificaciones').insert(
      ids.map((usuario_id) => ({
        usuario_id,
        titulo: titulo.slice(0, 150),
        mensaje: mensaje?.slice(0, 500) ?? null,
        enlace: enlace ?? null,
        creada_en: t,
      })),
    );
    for (const id of ids) emisor.emit(`u:${id}`, { tipo: 'notificacion', titulo });
    if (!correo) return;
    const destinos = await db('usuarios').whereIn('id', ids).where({ activo: true }).whereNotNull('correo_verificado_en').select('correo');
    for (const { correo: para } of destinos) {
      // En segundo plano: un fallo del correo no afecta la operación (queda en el log)
      mailer
        .enviar({
          para,
          asunto: `${correoGenerico?.asunto ?? titulo} – Talento Humano`,
          texto: `${correoGenerico?.texto ?? mensaje ?? titulo}\n\n${enlace ? `Ver en la plataforma: ${cfg.appUrl}${enlace}` : ''}\n\nEste es un mensaje automático; no lo responda.`,
          enlace: enlace ? `${cfg.appUrl}${enlace}` : undefined,
        })
        .catch((e) => log.error('No se pudo enviar una notificación por correo', { error: e.message }));
    }
  }

  // Avisa un cambio a usuarios (sin guardar notificación), p. ej. para refrescar listas.
  const avisar = (usuarioIds, datos) => {
    for (const id of new Set(usuarioIds.filter(Boolean))) emisor.emit(`u:${id}`, datos);
  };

  return { notificar, avisar, emisor };
}
