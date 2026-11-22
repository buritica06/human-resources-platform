// Validación y normalización de los datos del expediente según el catálogo de campos.
import { z } from 'zod';
import { POR_CLAVE, ESTADOS } from './campos.js';

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fechaValida(s) {
  const m = FECHA.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1900 && +m[1] <= 2100;
}

const edad = (fecha, hoy = new Date()) => {
  const [a, m, d] = fecha.split('-').map(Number);
  let e = hoy.getUTCFullYear() - a;
  if (hoy.getUTCMonth() + 1 < m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() < d)) e--;
  return e;
};

const limpiarTexto = (v) =>
  String(v)
    .replace(/\p{Cc}/gu, ' ') // caracteres de control
    .replace(/\s+/g, ' ')
    .trim();

// Normaliza un valor. Devuelve { valor } o { error }.
// ctx: { listas: { LISTA_X: [...] }, sedes: Map(id → {empleador_id}), empleadores: Set(id) }
export function normalizarCampo(clave, bruto, ctx) {
  const c = POR_CLAVE[clave];
  if (!c || c.soloLectura) return { error: 'Este dato no se puede modificar.' };
  const vacio = bruto === null || bruto === undefined || (typeof bruto === 'string' && bruto.trim() === '');
  if (vacio) return c.obligatorio ? { error: 'Este dato es obligatorio.' } : { valor: null };

  switch (c.tipo) {
    case 'texto': {
      if (typeof bruto !== 'string' && typeof bruto !== 'number') return { error: 'Valor no válido.' };
      let s = limpiarTexto(bruto);
      if (c.max && s.length > c.max) return { error: `Máximo ${c.max} caracteres.` };
      if (c.patron && !c.patron.test(s)) return { error: c.mensajePatron || 'Formato no válido.' };
      if (clave === 'nombre' && !/^[\p{L} .'-]{3,}$/u.test(s)) return { error: 'Solo letras y espacios (mínimo 3).' };
      if (c.mayusculas) s = s.toUpperCase();
      return { valor: s };
    }
    case 'fecha': {
      const s = String(bruto).trim();
      if (!fechaValida(s)) return { error: 'Fecha no válida (DD/MM/AAAA).' };
      if (clave === 'fecha_nacimiento') {
        const e = edad(s);
        if (e < 14 || e > 100) return { error: 'Revise la fecha de nacimiento.' };
      }
      return { valor: s };
    }
    case 'dinero': {
      const n = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(/[$\s.]/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: 'Escriba un valor en pesos válido.' };
      return { valor: Math.round(n * 100) / 100 };
    }
    case 'sino': {
      if (typeof bruto === 'boolean') return { valor: bruto };
      const s = String(bruto).trim().toUpperCase();
      if (['SI', 'SÍ', 'TRUE', '1'].includes(s)) return { valor: true };
      if (['NO', 'FALSE', '0'].includes(s)) return { valor: false };
      return { error: 'Responda SI o NO.' };
    }
    case 'lista': {
      const opciones = c.lista === '_ESTADO' ? ESTADOS : ctx.listas?.[c.lista] ?? [];
      const s = limpiarTexto(bruto);
      const encontrada = opciones.find((o) => o.toUpperCase() === s.toUpperCase());
      if (!encontrada) return { error: 'Elija una opción de la lista.' };
      return { valor: encontrada };
    }
    case 'celular': {
      const s = String(bruto).replace(/[\s()+-]/g, '').replace(/^57(?=3\d{9}$)/, '');
      if (!/^3\d{9}$/.test(s)) return { error: 'Celular de 10 dígitos que empiece por 3.' };
      return { valor: s };
    }
    case 'telefono': {
      const s = String(bruto).replace(/[\s()+-]/g, '');
      if (!/^\d{7,10}$/.test(s)) return { error: 'Teléfono de 7 a 10 dígitos.' };
      return { valor: s };
    }
    case 'sede': {
      const id = Number(bruto);
      if (!Number.isInteger(id) || !ctx.sedes?.has(id)) return { error: 'Elija una sede válida.' };
      return { valor: id };
    }
    case 'empleador': {
      const id = Number(bruto);
      if (!Number.isInteger(id) || !ctx.empleadores?.has(id)) return { error: 'Elija un empleador válido.' };
      return { valor: id };
    }
    default:
      return { error: 'Tipo de dato desconocido.' };
  }
}

// Valida un objeto de cambios. Devuelve { limpios, errores }.
export function normalizarCambios(cambios, ctx) {
  const limpios = {};
  const errores = {};
  for (const [clave, bruto] of Object.entries(cambios)) {
    const r = normalizarCampo(clave, bruto, ctx);
    if (r.error) errores[clave] = r.error;
    else limpios[clave] = r.valor;
  }
  return { limpios, errores };
}

// Reglas entre campos sobre el registro resultante (actual + cambios).
export function reglasCruzadas(r, ctx) {
  const errores = {};
  if (r.sede_id && r.empleador_id && ctx.sedes?.get(r.sede_id)?.empleador_id !== r.empleador_id) {
    errores.sede_id = 'La sede no pertenece al empleador elegido.';
  }
  if (r.fecha_ingreso && r.fecha_fin_contrato && r.fecha_fin_contrato < r.fecha_ingreso) {
    errores.fecha_fin_contrato = 'No puede ser anterior a la fecha de ingreso.';
  }
  if (r.estado === 'RETIRADO' && !r.fecha_retiro) errores.fecha_retiro = 'Indique la fecha de retiro.';
  if (r.fecha_retiro && r.fecha_ingreso && r.fecha_retiro < r.fecha_ingreso) {
    errores.fecha_retiro = 'No puede ser anterior a la fecha de ingreso.';
  }
  return errores;
}

export const esquemaCuerpo = z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]))
  .refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 50, { message: 'No hay cambios.' });

export const esquemaListar = z.object({
  q: z.string().trim().max(60).optional(),
  sede: z.coerce.number().int().positive().optional(),
  estado: z.enum(ESTADOS).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const esquemaId = z.object({ id: z.coerce.number().int().positive() });
