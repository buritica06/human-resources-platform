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
  const conexiones = new Map(); // usuario → flujos abiertos (límite por usuario)
  const MAX_CONEXIONES = 5;
  router.get('/eventos', sesion, (req, res) => {
    const uid = req.usuario.id;
    if ((conexiones.get(uid) ?? 0) >= MAX_CONEXIONES) {
      return res.status(429).json({ error: { codigo: 'DEMASIADAS_CONEXIONES', mensaje: 'Tiene demasiadas pestañas abiertas con avisos en vivo.' } });
    }
    conexiones.set(uid, (conexiones.get(uid) ?? 0) + 1);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 10000\n\n');
    const canal = `u:${uid}`;
    const enviar = (datos) => res.write(`event: cambio\ndata: ${JSON.stringify(datos)}\n\n`);
    ctx.notificaciones.emisor.on(canal, enviar);
    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
    // La sesión se revisa periódicamente (cerrada, vencida o inactiva → se corta el flujo).
    // Cualquier error (p. ej. la BD no responde) cierra el flujo; nunca tumba el servidor.
    const vigilante = setInterval(async () => {
      try {
        const s = await db('sesiones').where({ id_hash: req.sesion.idHash }).first('ultimo_uso', 'expira_absoluta');
        const min = Number(await ctx.params.valor('SESION_INACTIVIDAD_MIN'));
        const vencida = !s || Date.now() > Date.parse(s.expira_absoluta) || Date.now() - Date.parse(s.ultimo_uso) > min * 60_000;
        if (vencida) res.end();
      } catch {
        res.end();
      }
    }, 60_000);
    let cerrado = false;
    req.on('close', () => {
      if (cerrado) return;
      cerrado = true;
      clearInterval(latido);
      clearInterval(vigilante);
      ctx.notificaciones.emisor.off(canal, enviar);
      const n = (conexiones.get(uid) ?? 1) - 1;
      if (n > 0) conexiones.set(uid, n);
      else conexiones.delete(uid);
    });
  });
}

export default {
  nombre: 'notificaciones',
  api: montar,
  paginas: { '/notificaciones': 'notificaciones.html' },
  menu: [],
};
