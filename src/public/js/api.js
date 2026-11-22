// Cliente de la API: JSON, token CSRF automático y manejo de sesión vencida.
let csrf = null;

export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.error?.mensaje || 'No se pudo completar la operación. Revise su conexión e intente de nuevo.');
    this.status = status;
    this.codigo = cuerpo?.error?.codigo;
    this.campos = cuerpo?.error?.campos || {};
  }
}

export const fijarCsrf = (t) => {
  csrf = t;
};

async function obtenerCsrf() {
  if (!csrf) {
    try {
      const r = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
      csrf = (await r.json()).csrf;
    } catch {
      throw new ErrorApi(0, null); // mensaje claro de conexión, no el error técnico del navegador
    }
  }
  return csrf;
}

export async function api(ruta, { metodo = 'GET', datos, formulario, sinRenovar = false, reintento = false } = {}) {
  const headers = { Accept: 'application/json' };
  const opciones = { method: metodo, headers, credentials: 'same-origin' };
  if (metodo !== 'GET') headers['X-CSRF-Token'] = await obtenerCsrf();
  if (sinRenovar) headers['X-Sin-Renovar'] = '1';
  if (formulario) opciones.body = formulario;
  else if (datos !== undefined) {
    headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  let r;
  try {
    r = await fetch(`/api/v1${ruta}`, opciones);
  } catch {
    throw new ErrorApi(0, null);
  }
  if (r.status === 204) return null;
  const cuerpo = await r.json().catch(() => null);
  if (r.ok) return cuerpo;
  // Token CSRF desactualizado (p. ej. tras iniciar sesión en otra pestaña): reintentar una vez.
  if (r.status === 403 && cuerpo?.error?.codigo === 'CSRF' && !reintento) {
    csrf = null;
    return api(ruta, { metodo, datos, formulario, sinRenovar, reintento: true });
  }
  if (r.status === 401 && cuerpo?.error?.codigo === 'NO_AUTENTICADO' && !location.pathname.startsWith('/login')) {
    // Solo se explica el motivo si fue por inactividad; quien entra por primera vez no ve avisos.
    irALogin(cuerpo.error.mensaje.includes('inactividad') ? 'inactividad' : null);
    return new Promise(() => {}); // la página se va a recargar
  }
  if (r.status === 403 && cuerpo?.error?.codigo === 'PRIMER_INGRESO' && location.pathname !== '/bienvenida') {
    location.assign('/bienvenida');
    return new Promise(() => {});
  }
  throw new ErrorApi(r.status, cuerpo);
}

export function irALogin(motivo) {
  const volver = location.pathname + location.search;
  const q = new URLSearchParams();
  if (motivo) q.set('motivo', motivo);
  if (volver && volver !== '/' && !volver.startsWith('/login')) q.set('volver', volver);
  location.assign(`/login?${q}`);
}
