// Módulo M7 – Certificados laborales (con o sin salario) con código de verificación.
// Requiere "colaboradores". La verificación pública (/verificar) no necesita sesión y no expone
// datos personales; tiene su propio límite de peticiones.
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { validar } from '../../core/errors.js';
import { autenticado, rol, ROLES } from '../../core/security/sesion.js';
import { crearServicioCertificados } from './servicio.js';
import { pdfCertificado } from './pdf.js';

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const esquemaEmitir = z.object({
  conSalario: z.boolean({ error: 'Indique si el certificado lleva el salario.' }),
  dirigidoA: z.string().trim().max(100, 'Máximo 100 caracteres.').regex(/^[\p{Script=Latin}\p{N} .,&()'-]*$/u, 'Use solo letras, números y signos básicos.').optional(),
});
const esquemaAnular = z.object({ motivo: z.string({ error: 'Escriba el motivo.' }).trim().min(5, 'Explique el motivo (mínimo 5 caracteres).').max(300) });

export default {
  nombre: 'certificados',
  api(router, ctx) {
    const svc = crearServicioCertificados(ctx);
    const sesion = autenticado();
    const verificacionLimitada = rateLimit({
      windowMs: ctx.limites.ventanaMs, limit: ctx.limites.verificar ?? 60, standardHeaders: 'draft-8', legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiadas consultas. Espere unos minutos e intente de nuevo.' } }),
    });

    // Emisión: límite por usuario (cada certificado queda guardado y auditado)
    const emisionLimitada = rateLimit({
      windowMs: ctx.limites.ventanaMs, limit: ctx.limites.emitirCertificado ?? 20, standardHeaders: 'draft-8', legacyHeaders: false,
      keyGenerator: (req) => `u${req.usuario.id}`,
      handler: (_req, res) => res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Ha generado muchos certificados seguidos. Espere unos minutos.' } }),
    });
    router.post('/me/certificados/laboral', sesion, emisionLimitada, async (req, res) => res.status(201).json(await svc.emitir(req, null, validar(esquemaEmitir, req.body))));
    router.post('/colaboradores/:id/certificados/laboral', sesion, rol(ROLES.ADMIN), emisionLimitada, async (req, res) =>
      res.status(201).json(await svc.emitir(req, validar(esquemaId, req.params).id, validar(esquemaEmitir, req.body))));
    router.get('/me/certificados', sesion, async (req, res) => res.json(await svc.lista(req, null)));
    router.get('/colaboradores/:id/certificados', sesion, async (req, res) => res.json(await svc.lista(req, validar(esquemaId, req.params).id)));
    router.get('/certificados/:id/pdf', sesion, async (req, res) => {
      const k = await svc.cargar(req, validar(esquemaId, req.params).id);
      const pdf = await pdfCertificado(k, { appUrl: ctx.cfg.appUrl });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${req.query.descargar === '1' ? 'attachment' : 'inline'}; filename="certificado-laboral-${k.codigo}.pdf"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
    });
    router.post('/certificados/:id/anular', sesion, rol(ROLES.ADMIN), async (req, res) =>
      res.json(await svc.anular(req, validar(esquemaId, req.params).id, validar(esquemaAnular, req.body).motivo)));
    // Pública (sin sesión)
    router.get('/certificados/verificar/:codigo', verificacionLimitada, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await svc.verificar(String(req.params.codigo).slice(0, 30)));
    });
  },
  paginas: { '/certificados': 'certificados.html', '/verificar': 'verificar.html' },
  menu: [{ texto: 'Certificados', href: '/certificados', icono: 'documento', orden: 25 }],
  pestanasExpediente: [{ clave: 'documentos', script: '/m/certificados/pestana-expediente.js' }],
};
