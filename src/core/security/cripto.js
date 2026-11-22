// Utilidades criptográficas: tokens aleatorios, hash de tokens, comparación segura y
// cifrado AES-256-GCM para campos sensibles en reposo.
import crypto from 'node:crypto';

export const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function igualesSeguro(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

export function crearCifrador(claveHex) {
  const clave = claveHex ? Buffer.from(claveHex, 'hex') : null;
  const exigir = () => {
    if (!clave || clave.length !== 32) throw new Error('DATA_ENCRYPTION_KEY no configurada (64 caracteres hex).');
  };
  return {
    cifrar(texto) {
      if (texto === null || texto === undefined || texto === '') return null;
      exigir();
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
      const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
      return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
    },
    descifrar(valor) {
      if (!valor) return null;
      exigir();
      const [v, iv, tag, datos] = String(valor).split(':');
      if (v !== 'v1') throw new Error('Formato de cifrado desconocido');
      const d = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
    },
  };
}
