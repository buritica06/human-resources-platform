// Tokens de un solo uso (verificación de correo, recuperación de contraseña).
// Solo se guarda el hash; el token en claro viaja únicamente en el enlace del correo.
import { ahora } from '../db.js';
import { tokenAleatorio, sha256 } from './cripto.js';

export function crearTokens(db) {
  return {
    async emitir(usuarioId, tipo, { horas, dato = null }) {
      // Un token nuevo invalida los anteriores del mismo tipo.
      await db('tokens').where({ usuario_id: usuarioId, tipo }).whereNull('usado_en').update({ usado_en: ahora() });
      const token = tokenAleatorio(32);
      await db('tokens').insert({
        usuario_id: usuarioId,
        tipo,
        hash: sha256(token),
        dato,
        expira_en: new Date(Date.now() + horas * 3600_000).toISOString(),
        creado_en: ahora(),
      });
      return token;
    },
    // Devuelve el token si es válido SIN gastarlo (para validar antes de consumir).
    async consultar(token, tipo) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const fila = await db('tokens')
        .where({ hash: sha256(token), tipo })
        .first();
      if (!fila || fila.usado_en || Date.parse(fila.expira_en) < Date.now()) return null;
      return fila;
    },
    // Marca el token como usado y lo devuelve si es válido; si no, null.
    async consumir(token, tipo) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const fila = await db('tokens')
        .where({ hash: sha256(token), tipo })
        .first();
      if (!fila || fila.usado_en || Date.parse(fila.expira_en) < Date.now()) return null;
      const n = await db('tokens').where({ id: fila.id }).whereNull('usado_en').update({ usado_en: ahora() });
      return n === 1 ? fila : null;
    },
  };
}
