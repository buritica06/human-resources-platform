// Notificaciones: bandeja (campana) y eventos en tiempo real (Server-Sent Events).
import { z } from 'zod';
import { validar } from '../../core/errors.js';
import { autenticado } from '../../core/security/sesion.js';

const esquemaLeer = z.object({ ids: z.array(z.coerce.number().int().positive()).max(200).optional(), todas: z.boolean().optional() });

function montar(router, ctx) {
  const { db } = ctx;
  const sesion = autenticado();

  router.get('/notificaciones', sesion, async (req, res) => {
    const filas = await db('notificaciones').where({ usuario_id: req.usuario.id }).orderBy('id', 'desc').limit(50);
    res.json({ notificaciones: filas.map((n) => ({ id: n.id, titulo: n.titulo, mensaje: n.mensaje, enlace: n.enlace, leida: !!n.leida, creadaEn: n.creada_en })) });
  });
  router.get('/notificaciones/resumen', sesion, async (req, res) => {
    const [{ n }] = await db('notificaciones').where({ usuario_id: req.usuario.id, leida: false }).count({ n: '*' });
    res.json({ noLeidas: Number(n) });
  });
  router.post('/notificaciones/leer', sesion, async (req, res) => {
    const { ids, todas } = validar(esquemaLeer, req.body);
    const q = db('notificaciones').where({ usuario_id: req.usuario.id }); // solo las propias
    if (!todas) q.whereIn('id', ids ?? []);
    await q.update({ leida: true });
    res.json({ ok: true });
  });

  // Tiempo real: un flujo de eventos por usuario. No renueva la inactividad de la sesión
  // (solo cuenta al conectarse); el cliente se reconecta solo.
  router.get('/eventos', sesion, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 10000\n\n');
    const canal = `u:${req.usuario.id}`;
    const enviar = (datos) => res.write(`event: cambio\ndata: ${JSON.stringify(datos)}\n\n`);
    ctx.notificaciones.emisor.on(canal, enviar);
    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
    // La sesión se revisa periódicamente: si expiró o se cerró, se corta el flujo
    const vigilante = setInterval(async () => {
      const viva = await db('sesiones').where({ id_hash: req.sesion.idHash }).first('id_hash');
      if (!viva) res.end();
    }, 60_000);
    req.on('close', () => {
      clearInterval(latido);
      clearInterval(vigilante);
      ctx.notificaciones.emisor.off(canal, enviar);
    });
  });
}

export default {
  nombre: 'notificaciones',
  api: montar,
  paginas: { '/notificaciones': 'notificaciones.html' },
  menu: [],
};
