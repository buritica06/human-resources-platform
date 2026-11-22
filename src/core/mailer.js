// Envío de correos. En local escribe un .eml en data/correos y muestra el enlace en consola;
// en pruebas los guarda en memoria; en producción usa SMTP.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { log, mascaraCorreo } from './logger.js';

export function crearMailer(cfg) {
  const enviados = []; // solo se llena en pruebas
  let transporte;
  if (cfg.correo.transporte === 'smtp') {
    const { host, port, secure, user, pass } = cfg.correo.smtp;
    transporte = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  } else {
    transporte = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }

  return {
    enviados,
    async enviar({ para, asunto, texto, html, enlace }) {
      if (cfg.env === 'test') {
        // Registro sincrónico: las pruebas ven el correo aunque el envío vaya en segundo plano.
        enviados.push({ para, asunto, texto, enlace });
        return;
      }
      const info = await transporte.sendMail({ from: cfg.correo.remitente, to: para, subject: asunto, text: texto, html });
      if (cfg.correo.transporte !== 'smtp') {
        fs.mkdirSync(cfg.correo.dir, { recursive: true });
        const archivo = path.join(cfg.correo.dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.eml`);
        fs.writeFileSync(archivo, info.message);
        // Solo en desarrollo: el enlace se muestra para poder probar sin SMTP.
        log.info('Correo de prueba guardado', { para: mascaraCorreo(para), asunto, archivo, enlace });
      } else {
        log.info('Correo enviado', { para: mascaraCorreo(para), asunto });
      }
    },
  };
}
