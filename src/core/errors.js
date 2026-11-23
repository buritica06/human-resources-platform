// Errores de dominio con mensaje en lenguaje claro para el usuario.
export class ErrorApp extends Error {
  constructor(status, codigo, mensaje, campos) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export const noEncontrado = (msg = 'No encontramos lo que busca.') => new ErrorApp(404, 'NO_ENCONTRADO', msg);
export const prohibido = (msg = 'No tiene permiso para esta acción.') => new ErrorApp(403, 'PROHIBIDO', msg);
export const noAutenticado = (msg = 'Su sesión terminó. Ingrese de nuevo.') => new ErrorApp(401, 'NO_AUTENTICADO', msg);
export const invalido = (msg, campos) => new ErrorApp(400, 'DATOS_INVALIDOS', msg, campos);
export const conflicto = (msg) => new ErrorApp(409, 'CONFLICTO', msg);

// Validación con zod → ErrorApp 400 con errores por campo
export function validar(esquema, datos) {
  const r = esquema.safeParse(datos ?? {});
  if (r.success) return r.data;
  const campos = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.') || '_';
    if (!campos[k]) campos[k] = issue.message;
  }
  throw invalido('Revise los datos marcados.', campos);
}
