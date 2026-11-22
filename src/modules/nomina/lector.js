// Lector de la hoja "NOMINA …" del libro base. Función pura (sin BD): devuelve lo que dice
// la hoja, más errores y advertencias. La app NO recalcula la nómina; solo valida el cuadre.
//
// La hoja tiene varias tablas (una por sede y empleador), cada una con un encabezado de dos
// filas que empieza por "CÉDULA". Se reconocen por su encabezado, no por la posición:
//  - NÓMINA:  C DIAS LAB | D SALARIO BASE | E..I devengados | J..L deducciones (negativas) | M NETO
//  - EXTRAS ("LIQUIDACIÓN DE EXTRAS", pago aparte): columnas ubicadas por su encabezado
//  - Cualquier otra tabla con cédulas (p. ej. vacaciones liquidadas) NO se carga y se avisa.
import { valorCelda, normalizar, fechaCelda, hoja as buscarHoja } from '../../core/excel.js';
import { CONCEPTOS, HORAS_RESUMEN, TOLERANCIA_CUADRE } from './conceptos.js';

const DEVENGADOS = ['SALARIO', 'RECARGO_NOCTURNO', 'AUX_TRANSPORTE', 'HORAS_EXTRAS', 'INCAPACIDAD'];
const DEDUCCIONES = ['SALUD', 'PENSION', 'PRESTAMO'];
const SUBENCABEZADOS = { 5: 'SALARIO', 6: 'RECARGO', 7: 'AUXILIO', 8: 'HORAS EXTRAS', 9: 'INCAPACIDAD', 10: 'SALUD', 11: 'PENSION', 12: 'PRESTAMO' };

export const esHojaNomina = (nombre) => /^NOMINA\s/.test(normalizar(nombre));

const redondear2 = (n) => Math.round(n * 100) / 100;

// Número de una celda: vacío → 0; texto o error → NaN
function numero(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return Number.NaN;
}

// Cédula de la columna A: número entero o texto con solo dígitos y separadores
function cedula(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? String(v) : null;
  const s = String(v ?? '').trim();
  if (!/^[\d.,\s]+$/.test(s)) return null;
  const d = s.replace(/\D/g, '');
  return /^\d{5,12}$/.test(d) ? d : null;
}

const texto = (v) => (v instanceof Date ? '' : String(v ?? '').replace(/\s+/g, ' ').trim());
const textos = (fila, hasta = 17) => Array.from({ length: hasta + 1 }, (_, i) => (i === 0 ? '' : normalizar(texto(valorCelda(fila.getCell(i))))));

export function listarHojas(libro) {
  return libro.worksheets.filter((h) => esHojaNomina(h.name)).map((h) => {
    const p = periodoDeHoja(h);
    return { nombre: h.name, inicio: p.inicio ?? null, fin: p.fin ?? null };
  });
}

function periodoDeHoja(h) {
  const inicio = fechaCelda(valorCelda(h.getCell('S1')));
  const fin = fechaCelda(valorCelda(h.getCell('T1')));
  if (!inicio || !fin) return { error: 'No se encontraron las fechas del periodo en las celdas S1 y T1 de la hoja.' };
  if (fin < inicio) return { error: 'La fecha final del periodo (T1) es anterior a la inicial (S1).' };
  const dias = (Date.parse(fin) - Date.parse(inicio)) / 86_400_000 + 1;
  if (dias > 31) return { error: `El periodo de la hoja dura ${dias} días; se esperaba una quincena.` };
  return { inicio, fin };
}

function detalleHoras(libro, nombreHoja) {
  const h = buscarHoja(libro, 'HORAS RESUMEN');
  if (!h || normalizar(texto(valorCelda(h.getCell('C2')))) !== normalizar(nombreHoja)) return null;
  for (let r = 1; r <= Math.min(15, h.rowCount); r++) {
    const t = textos(h.getRow(r), 20);
    if (t[1] !== 'CEDULA') continue;
    const cols = HORAS_RESUMEN.map(([enc, etiqueta, concepto]) => ({ col: t.indexOf(enc), etiqueta, concepto })).filter((c) => c.col > 0);
    const mapa = new Map();
    for (let f = r + 1; f <= h.rowCount; f++) {
      const fila = h.getRow(f);
      const ced = cedula(valorCelda(fila.getCell(1)));
      if (!ced) continue;
      const horas = cols.map((c) => ({ ...c, cantidad: numero(valorCelda(fila.getCell(c.col))) })).filter((c) => Number.isFinite(c.cantidad) && c.cantidad > 0);
      if (horas.length) mapa.set(ced, horas);
    }
    return mapa;
  }
  return null;
}

// Clasifica la tabla cuyo encabezado está en la fila r.
function clasificarTabla(h, r, errores) {
  const t = textos(h.getRow(r));
  const s = textos(h.getRow(r + 1));
  const sOrig = Array.from({ length: 14 }, (_, i) => (i === 0 ? '' : texto(valorCelda(h.getRow(r + 1).getCell(i)))));
  if (t[3] === 'DIAS LAB' && t[4] === 'SALARIO BASE' && t[13].startsWith('NETO') && s[5] === 'SALARIO') {
    for (const [col, esperado] of Object.entries(SUBENCABEZADOS)) {
      if (!s[col].startsWith(esperado)) {
        errores.push({ fila: r + 1, mensaje: `Encabezado no reconocido: la columna ${String.fromCharCode(64 + Number(col))} dice "${sOrig[col]}" y se esperaba "${esperado}…". Verifique que la hoja tenga el formato del archivo base.` });
        return { tipo: 'INVALIDA', desde: r + 2 };
      }
    }
    return { tipo: 'NOM', desde: r + 2, etiquetaIncapacidad: sOrig[9], etiquetaHoras: sOrig[8] };
  }
  const col = (nombre) => t.findIndex((x, i) => i > 0 && x === nombre);
  const neto = col('NETO');
  if (t[3] === 'SALARIO BASE' && neto > 0 && (col('JORNADAS EXTRAS') > 0 || col('TOTAL HORAS EXTRAS') > 0)) {
    return {
      tipo: 'EXT', desde: r + 1, neto,
      recargo: Math.max(col('RECARGO NOC'), col('RECARGOS NOC')),
      horasCant: col('HORAS EXTRAS'), horasValor: col('TOTAL HORAS EXTRAS'),
      jornadasCant: col('JORNADAS EXTRAS'), jornadasValor: col('TOTAL JORNADAS EXTRAS'),
    };
  }
  return { tipo: 'OTRA', desde: r + 1, encabezado: r };
}

// Lee la hoja indicada. Resultado: { periodo, registros: [...], errores, advertencias, totales }
export function leerHojaNomina(libro, nombreHoja) {
  const errores = [];
  const advertencias = [];
  const h = libro.worksheets.find((x) => x.name === nombreHoja);
  if (!h || !esHojaNomina(h.name)) return { errores: [{ fila: null, mensaje: `El libro no tiene la hoja "${nombreHoja}".` }], advertencias, registros: [] };
  const periodo = periodoDeHoja(h);
  if (periodo.error) errores.push({ fila: 1, mensaje: periodo.error });
  const horas = detalleHoras(libro, h.name);

  const porCedula = new Map();
  let empleador = { texto: null, documento: null };
  let sede = null;
  let tabla = null;
  let tablasNomina = 0;

  for (let r = 1; r <= h.rowCount; r++) {
    const fila = h.getRow(r);
    // Empleador: título con "C.C" (p. ej. "NOMBRE APELLIDO C.C 12.345.678")
    for (let c = 1; c <= 12; c++) {
      const tx = texto(valorCelda(fila.getCell(c)));
      if (/C\.\s?C\.?\s*[\d.]{5,}/i.test(tx)) {
        empleador = { texto: tx.replace(/\s*C\.\s?C\.?.*$/i, '').trim(), documento: (tx.match(/C\.\s?C\.?\s*([\d.]+)/i)?.[1] ?? '').replace(/\D/g, '') || null };
        break;
      }
    }
    const a = valorCelda(fila.getCell(1));
    const aTxt = normalizar(texto(a));
    if (aTxt === 'CEDULA') {
      tabla = clasificarTabla(h, r, errores);
      if (tabla.tipo === 'NOM') tablasNomina++;
      r = tabla.desde - 1;
      continue;
    }
    const ced = cedula(a);
    const nombre = texto(valorCelda(fila.getCell(2)));
    // "RESUMEN DE DESCUENTOS" (en la columna B) cierra la tabla de nómina
    if (!ced && !aTxt && /^RESUMEN/.test(normalizar(nombre))) {
      tabla = null;
      continue;
    }
    if (!ced) {
      if (aTxt && typeof a === 'string') {
        // Texto en A que no es cédula: fin de la tabla (SUBTOTAL, TOTAL, título…)
        tabla = null;
        if ((aTxt.startsWith('COMPRAVENTA') || aTxt.startsWith('MASINERO')) && !aTxt.includes('LIQUIDACION')) sede = texto(a);
      } else if (tabla?.tipo === 'NOM' && !aTxt && nombre && !/^[\d.,\s]+$/.test(nombre)) {
        // Una fila con nombre pero sin cédula no se puede asignar a nadie. (Las filas solo con
        // números, sin nombre, son totales sin rótulo y se ignoran.)
        advertencias.push({ fila: r, mensaje: `"${nombre}" no tiene cédula en la columna A: esa fila no se carga.` });
      }
      continue;
    }
    if (!tabla || !nombre || /^[\d.,\s]+$/.test(nombre)) continue;

    if (tabla.tipo === 'OTRA') {
      advertencias.push({ fila: r, mensaje: `${nombre} (C.C. ${ced}) está en una tabla que no es de nómina ni de extras (encabezado en la fila ${tabla.encabezado}); esa fila no se carga.` });
      continue;
    }
    if (tabla.tipo === 'INVALIDA') continue;

    if (tabla.tipo === 'NOM') {
      if (porCedula.get(ced)?.nomina) {
        errores.push({ fila: r, cedula: ced, mensaje: `${nombre} (C.C. ${ced}) aparece dos veces en la nómina (también en la fila ${porCedula.get(ced).fila}).` });
        continue;
      }
      const val = {};
      let malo = null;
      for (const k of [...DEVENGADOS, ...DEDUCCIONES]) {
        val[k] = numero(valorCelda(fila.getCell(CONCEPTOS[k].col)));
        if (!Number.isFinite(val[k])) malo = CONCEPTOS[k].etiqueta;
      }
      const neto = numero(valorCelda(fila.getCell(13)));
      if (!Number.isFinite(neto)) malo = 'Neto';
      if (malo) {
        errores.push({ fila: r, cedula: ced, mensaje: `${nombre} (C.C. ${ced}): el valor de "${malo}" no es un número.` });
        continue;
      }
      const devengado = redondear2(DEVENGADOS.reduce((s, k) => s + val[k], 0));
      const deducido = redondear2(DEDUCCIONES.reduce((s, k) => s + Math.abs(val[k]), 0));
      if (Math.abs(devengado - deducido - neto) > TOLERANCIA_CUADRE) {
        errores.push({ fila: r, cedula: ced, mensaje: `${nombre} (C.C. ${ced}): devengado (${devengado}) − deducciones (${deducido}) = ${redondear2(devengado - deducido)}, pero el neto de la hoja es ${neto}.` });
        continue;
      }
      const reg = porCedula.get(ced) ?? { cedula: ced, adicionales: [], netoAdicional: 0 };
      const dias = numero(valorCelda(fila.getCell(3)));
      const salarioBase = numero(valorCelda(fila.getCell(4)));
      Object.assign(reg, {
        fila: r, nombre, nomina: true, empleador: empleador.texto, empleadorDocumento: empleador.documento, sede,
        dias: Number.isFinite(dias) ? dias : null,
        salarioBase: Number.isFinite(salarioBase) ? salarioBase : null,
        devengado, deducido, neto,
        eps: texto(valorCelda(fila.getCell(14))) || null,
        afp: texto(valorCelda(fila.getCell(15))) || null,
        observacion: texto(valorCelda(fila.getCell(17))).slice(0, 500) || null,
        lineas: [],
      });
      const det = horas?.get(ced) ?? [];
      for (const k of [...DEVENGADOS, ...DEDUCCIONES]) {
        if (val[k] === 0) continue; // solo los conceptos que tiene el colaborador
        const c = CONCEPTOS[k];
        const linea = { concepto: k, tipo: c.tipo, etiqueta: c.etiqueta, valor: redondear2(Math.abs(val[k])), cantidad: null, unidad: null, detalle: null, orden: c.orden };
        if ((k === 'SALARIO' || k === 'AUX_TRANSPORTE') && reg.dias) { linea.cantidad = reg.dias; linea.unidad = 'días'; }
        if (k === 'INCAPACIDAD' && tabla.etiquetaIncapacidad && normalizar(tabla.etiquetaIncapacidad) !== 'INCAPACIDAD') {
          linea.etiqueta = `Incapacidad / licencia (${tabla.etiquetaIncapacidad.replace(/^INCAPACIDAD\s*[-/]?\s*/i, '').toLowerCase() || 'remunerada'})`;
        }
        const desglose = det.filter((d) => d.concepto === k);
        if (k === 'RECARGO_NOCTURNO' && desglose.length) { linea.cantidad = desglose[0].cantidad; linea.unidad = 'h'; }
        if (k === 'HORAS_EXTRAS' && desglose.length) linea.detalle = desglose.map((d) => ({ etiqueta: d.etiqueta, cantidad: d.cantidad, unidad: 'h' }));
        reg.lineas.push(linea);
      }
      porCedula.set(ced, reg);
      continue;
    }

    if (tabla.tipo === 'EXT') {
      const leer = (col) => (col > 0 ? numero(valorCelda(fila.getCell(col))) : 0);
      const v = {
        recargo: leer(tabla.recargo), horasCant: leer(tabla.horasCant), horasValor: leer(tabla.horasValor),
        jornadasCant: leer(tabla.jornadasCant), jornadasValor: leer(tabla.jornadasValor), neto: leer(tabla.neto),
      };
      if (!Number.isFinite(v.neto)) {
        errores.push({ fila: r, cedula: ced, mensaje: `${nombre} (C.C. ${ced}): el neto de la liquidación de extras no es un número.` });
        continue;
      }
      // Texto (p. ej. una nota) en una columna de valores: se toma como vacío si así cuadra.
      const conTexto = Object.entries(v).filter(([, x]) => !Number.isFinite(x)).map(([k]) => k);
      for (const k of conTexto) v[k] = 0;
      if (v.recargo === 0 && v.horasValor === 0 && v.jornadasValor === 0 && v.neto === 0) continue;
      let suma = redondear2(v.recargo + v.horasValor + v.jornadasValor);
      // Total vacío pero con cantidad y neto en un ÚNICO concepto: el neto corresponde a ese
      // concepto (no se calcula nada: se atribuye el valor que ya trae la hoja) y se avisa.
      if (suma === 0 && v.neto !== 0) {
        const unicos = [['jornadasValor', v.jornadasCant, 'jornadas extra'], ['horasValor', v.horasCant, 'horas extras']].filter(([, cant]) => cant > 0);
        if (unicos.length === 1) {
          v[unicos[0][0]] = v.neto;
          suma = v.neto;
          advertencias.push({ fila: r, mensaje: `${nombre} (C.C. ${ced}): el total de ${unicos[0][2]} está vacío; se toma el neto de la fila (${v.neto}).` });
        }
      }
      if (Math.abs(suma - v.neto) > TOLERANCIA_CUADRE) {
        errores.push({ fila: r, cedula: ced, mensaje: `${nombre} (C.C. ${ced}): en la liquidación de extras la suma (${suma}) no coincide con el neto (${v.neto}).` });
        continue;
      }
      if (conTexto.length) {
        advertencias.push({ fila: r, mensaje: `${nombre} (C.C. ${ced}): una columna de valores de la liquidación de extras tiene texto; se tomó como vacía (el neto cuadra).` });
      }
      const reg = porCedula.get(ced) ?? { cedula: ced, nombre, fila: r, adicionales: [], netoAdicional: 0, lineas: [], empleador: empleador.texto, empleadorDocumento: empleador.documento, sede };
      const agregar = (concepto, valor, cantidad) => {
        if (!valor) return;
        const c = CONCEPTOS[concepto];
        const previa = reg.adicionales.find((x) => x.concepto === concepto);
        if (previa) {
          previa.valor = redondear2(previa.valor + valor);
          if (cantidad) previa.cantidad = redondear2((previa.cantidad ?? 0) + cantidad);
        } else {
          reg.adicionales.push({ concepto, tipo: 'ADICIONAL', etiqueta: c.etiqueta, valor: redondear2(valor), cantidad: cantidad || null, unidad: cantidad ? c.unidad : null, detalle: null, orden: c.orden });
        }
      };
      agregar('RECARGO_NOC_APARTE', v.recargo, 0);
      agregar('HORAS_EXTRA_APARTE', v.horasValor, v.horasCant);
      agregar('JORNADAS_EXTRA', v.jornadasValor, v.jornadasCant);
      reg.netoAdicional = redondear2(reg.netoAdicional + v.neto);
      porCedula.set(ced, reg);
    }
  }

  if (!tablasNomina && !errores.length) errores.push({ fila: null, mensaje: 'No se encontró ninguna tabla de nómina (encabezado CÉDULA | EMPLEADO | DIAS LAB | SALARIO BASE … NETO NOMINA).' });
  const registros = [...porCedula.values()];
  const totales = registros.reduce((t, x) => ({
    devengado: redondear2(t.devengado + (x.devengado ?? 0)),
    deducido: redondear2(t.deducido + (x.deducido ?? 0)),
    neto: redondear2(t.neto + (x.neto ?? 0)),
    adicional: redondear2(t.adicional + x.netoAdicional),
  }), { devengado: 0, deducido: 0, neto: 0, adicional: 0 });
  return { hoja: h.name, periodo: periodo.error ? null : periodo, registros, errores, advertencias, totales, conDetalleHoras: !!horas };
}
