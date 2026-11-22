// Registro de auditoría: quién vio o cambió qué y cuándo.
// `detalle` nunca debe contener contraseñas, tokens, diagnósticos ni cuentas en claro.
import { ahora } from './db.js';
import { log } from './logger.js';

const CAMPOS_PROHIBIDOS = /pass|clave|token|hash|diagnost|cuenta/i;

function limpiar(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = CAMPOS_PROHIBIDOS.test(k) ? '[omitido]' : typeof v === 'object' ? limpiar(v) : v;
  }
  return out;
}

export function crearAuditoria(db) {
  return async function auditar(req, { accion, entidad, entidadId = null, detalle = null, actorId }) {
    try {
      await db('auditoria').insert({
        actor_id: actorId !== undefined ? actorId : (req?.usuario?.id ?? null),
        accion,
        entidad,
        entidad_id: entidadId === null ? null : String(entidadId),
        detalle: detalle ? JSON.stringify(limpiar(detalle)) : null,
        ip: req?.ip?.slice(0, 64) ?? null,
        user_agent: req?.get?.('user-agent')?.slice(0, 255) ?? null,
        creado_en: ahora(),
      });
    } catch (e) {
      // La auditoría no debe tumbar la operación, pero el fallo sí se registra.
      log.error('Fallo al auditar', { accion, entidad, error: e.message });
    }
  };
}
