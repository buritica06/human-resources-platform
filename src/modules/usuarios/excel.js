// Lectura de la hoja EMPLEADOS del libro de nómina (.xlsx / .xlsm) para la carga masiva.
// Solo lee valores; nunca ejecuta macros. El archivo se procesa en memoria y no se guarda.
import ExcelJS from 'exceljs';
import { invalido } from '../../core/errors.js';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

function valorCelda(c) {
  const v = c?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? ''; // fórmula
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    if (v instanceof Date) return v;
  }
  return v;
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

// Devuelve { filas: [{fila, cedula, nombre, estado}], errores: [{fila, mensaje}] }
export function leerEmpleados(libro) {
  const hoja = libro.worksheets.find((h) => normalizar(h.name) === 'EMPLEADOS');
  if (!hoja) throw invalido('El libro no tiene la hoja "EMPLEADOS".');

  // Ubicar el encabezado (fila con CÉDULA en A y NOMBRE en B) en las primeras 15 filas.
  let filaEnc = 0;
  let colEstado = 0;
  for (let r = 1; r <= Math.min(15, hoja.rowCount); r++) {
    const fila = hoja.getRow(r);
    if (normalizar(valorCelda(fila.getCell(1))) === 'CEDULA' && normalizar(valorCelda(fila.getCell(2))) === 'NOMBRE') {
      filaEnc = r;
      fila.eachCell((c, col) => {
        if (normalizar(valorCelda(c)) === 'ESTADO') colEstado = col;
      });
      break;
    }
  }
  if (!filaEnc) throw invalido('No se encontró el encabezado "CÉDULA | NOMBRE" en la hoja EMPLEADOS.');

  const filas = [];
  const errores = [];
  const vistas = new Map();
  for (let r = filaEnc + 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const rawCed = valorCelda(fila.getCell(1));
    const rawNom = valorCelda(fila.getCell(2));
    if (rawCed === '' && rawNom === '') continue;
    const cedula = String(rawCed).replace(/[.\s]/g, '').replace(/\.0+$/, '');
    const nombre = String(rawNom).replace(/\s+/g, ' ').trim().toUpperCase();
    const estado = colEstado ? normalizar(valorCelda(fila.getCell(colEstado))) || 'ACTIVO' : 'ACTIVO';
    if (!/^\d{5,12}$/.test(cedula)) {
      errores.push({ fila: r, mensaje: 'Cédula vacía o con caracteres no numéricos.' });
      continue;
    }
    if (nombre.length < 3) {
      errores.push({ fila: r, mensaje: 'Nombre vacío.' });
      continue;
    }
    if (vistas.has(cedula)) {
      errores.push({ fila: r, mensaje: `Cédula repetida (también en la fila ${vistas.get(cedula)}).` });
      continue;
    }
    vistas.set(cedula, r);
    filas.push({ fila: r, cedula, nombre, estado });
  }
  return { filas, errores };
}
