// Lectura de la hoja EMPLEADOS del libro de nómina para la carga masiva de usuarios.
import { invalido } from '../../core/errors.js';
import { leerLibro, hoja, buscarEncabezado, valorCelda, cedulaCelda, normalizar } from '../../core/excel.js';

export { leerLibro };

// Devuelve { filas: [{fila, cedula, nombre, estado}], errores: [{fila, mensaje}] }
export function leerEmpleados(libro) {
  const h = hoja(libro, 'EMPLEADOS');
  if (!h) throw invalido('El libro no tiene la hoja "EMPLEADOS".');
  const enc = buscarEncabezado(h, ['CÉDULA', 'NOMBRE']);
  if (!enc || enc.columnas.get('CEDULA') !== 1) throw invalido('No se encontró el encabezado "CÉDULA | NOMBRE" en la hoja EMPLEADOS.');
  const colNombre = enc.columnas.get('NOMBRE');
  const colEstado = enc.columnas.get('ESTADO') ?? 0;

  const filas = [];
  const errores = [];
  const vistas = new Map();
  for (let r = enc.fila + 1; r <= h.rowCount; r++) {
    const fila = h.getRow(r);
    const rawCed = valorCelda(fila.getCell(1));
    const rawNom = valorCelda(fila.getCell(colNombre));
    if (rawCed === '' && rawNom === '') continue;
    const cedula = cedulaCelda(rawCed);
    const nombre = String(rawNom).replace(/\s+/g, ' ').trim().toUpperCase();
    const estado = colEstado ? normalizar(valorCelda(fila.getCell(colEstado))) || 'ACTIVO' : 'ACTIVO';
    if (!/^\d{5,12}$/.test(cedula)) {
      errores.push({ fila: r, mensaje: 'Cédula vacía o con caracteres no numéricos.' });
      continue;
    }
    // Misma regla que el alta manual (validators.js): letras, espacios, punto, apóstrofo y guion.
    if (nombre.length < 3 || nombre.length > 150 || !/^[\p{L} .'-]+$/u.test(nombre)) {
      errores.push({ fila: r, mensaje: 'Nombre vacío, demasiado largo o con caracteres no permitidos.' });
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
