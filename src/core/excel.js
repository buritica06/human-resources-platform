// Lectura segura de libros de Excel (.xlsx / .xlsm): solo valores, nunca macros.
// El archivo se procesa en memoria y no se guarda.
import ExcelJS from 'exceljs';
import { invalido } from './errors.js';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/º/g, '°') // "Nº" (ordinal) y "N°" (grado) se tratan igual
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();

export function valorCelda(c) {
  const v = c?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? ''; // fórmula
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return '';
  }
  return v;
}

// Fecha de Excel (Date, número de serie o texto DD/MM/AAAA o AAAA-MM-DD) → 'AAAA-MM-DD' o null
export function fechaCelda(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (v < 1 || v > 80000) return undefined;
    // Math.floor: una fecha con hora (p. ej. 46023,75) sigue siendo el mismo día
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return fechaReal(m[1], m[2], m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return fechaReal(m[3], m[2], m[1]);
  return undefined; // no reconocida
}

// 'AAAA-MM-DD' solo si la fecha existe (rechaza 2026-02-30, 45/13/2026…)
function fechaReal(a, mes, d) {
  const f = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (f.getUTCFullYear() !== Number(a) || f.getUTCMonth() !== Number(mes) - 1 || f.getUTCDate() !== Number(d)) return undefined;
  return f.toISOString().slice(0, 10);
}

// Cédula: número sin decimales, o texto sin ".0" final, puntos ni espacios.
export function cedulaCelda(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : '';
  return String(v ?? '').trim().replace(/\.0+$/, '').replace(/[.\s]/g, '');
}

export async function leerLibro(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || !buffer.subarray(0, 4).equals(FIRMA_ZIP)) {
    throw invalido('El archivo no es un libro de Excel válido (.xlsx o .xlsm).');
  }
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw invalido('No se pudo leer el libro de Excel. Verifique que no esté dañado ni protegido con contraseña.');
  }
  return libro;
}

export const hoja = (libro, nombre) => libro.worksheets.find((h) => normalizar(h.name) === normalizar(nombre));

// Busca en las primeras filas una fila de encabezado que contenga todos los textos pedidos.
// Devuelve { fila, columnas: Map(TEXTO_NORMALIZADO → número de columna) } o null.
export function buscarEncabezado(h, requeridos, maxFilas = 15) {
  for (let r = 1; r <= Math.min(maxFilas, h.rowCount); r++) {
    const columnas = new Map();
    h.getRow(r).eachCell((c, col) => {
      const t = normalizar(valorCelda(c));
      if (t && !columnas.has(t)) columnas.set(t, col);
    });
    if (requeridos.every((req) => columnas.has(normalizar(req)))) return { fila: r, columnas };
  }
  return null;
}
