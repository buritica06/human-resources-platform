// Libro de nómina FICTICIO con la estructura de las hojas "NOMINA …" del archivo base
// (varias tablas por empleador y sede, encabezado de dos filas combinadas, deducciones
// negativas, resumen de descuentos, liquidación de extras, tabla de vacaciones, HORAS RESUMEN).
// Cédulas = usuarios demo de la semilla. Salida: tests/fixtures/nomina-ficticia.xlsx
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const DIR = path.resolve(import.meta.dirname, '..', 'tests', 'fixtures');
const fecha = (s) => new Date(`${s}T00:00:00Z`);

// fila: [cedula, nombre, dias, salarioBase, E salario, F rn, G aux, H hx, I inc, J salud, K pension, L prestamo, (M neto opcional), Q obs]
export function hojaNomina(libro, nombre, { inicio, fin, tablas, ext = [], vacaciones = [], subI = 'INCAPACIDAD', sinFechas = false }) {
  const h = libro.addWorksheet(nombre);
  if (!sinFechas) {
    h.getCell('S1').value = fecha(inicio);
    h.getCell('T1').value = fecha(fin);
  }
  h.getCell('G2').value = 'LIQUIDACION NOMINA';
  let r = 4;
  for (const t of tablas) {
    h.getCell(`G${r}`).value = t.empleador; // "NOMBRE C.C 900.000.001"
    r += 2;
    h.getCell(`A${r}`).value = t.sede;
    h.mergeCells(`A${r}:L${r}`);
    r += 1;
    const enc = ['CEDULA', 'EMPLEADO', 'DIAS LAB', 'SALARIO BASE', 'DEVENGADOS ', '', '', '', '', 'DEDUCCIONES', '', '', 'NETO NOMINA', 'SALUD', 'PENSION', 'FIRMAS'];
    const sub = ['', '', '', '', 'SALARIO', 'RECARGO NOCTURNO', 'AUXILIO DE TRANSP.', 'HORAS EXTRAS, DOM-FES', subI, 'SALUD', 'PENSION', 'PRESTAMO'];
    h.getRow(r).values = enc;
    h.getRow(r + 1).values = sub;
    h.mergeCells(r, 5, r, 8); // DEVENGADOS
    h.mergeCells(r, 10, r, 12); // DEDUCCIONES
    for (const c of [1, 2, 3, 4, 13, 14, 15, 16]) h.mergeCells(r, c, r + 1, c); // combinadas en vertical, como el original
    r += 2;
    for (const f of t.filas) {
      const [ced, nom, dias, base, ...vals] = f;
      const ocho = vals.slice(0, 8);
      const neto = vals[8] ?? Math.round(ocho.reduce((s, x) => s + x, 0) * 100) / 100;
      const fila = h.getRow(r);
      fila.getCell(1).value = ced;
      fila.getCell(2).value = nom;
      fila.getCell(3).value = dias;
      fila.getCell(4).value = base;
      ocho.forEach((v, i) => (fila.getCell(5 + i).value = v === 0 ? (i === 4 ? null : 0) : v));
      fila.getCell(13).value = neto;
      fila.getCell(14).value = 'Sura';
      fila.getCell(15).value = 'Porvenir';
      if (vals[9]) fila.getCell(17).value = vals[9];
      r++;
    }
    h.getCell(`A${r}`).value = 'SUBTOTAL';
    r += 2;
    // Resumen de descuentos (nombres en B, sin cédula)
    h.getCell(`B${r}`).value = 'RESUMEN DE DESCUENTOS';
    h.getCell(`B${r + 1}`).value = 'DESCUENTO ';
    h.getCell(`C${r + 1}`).value = 'PRESTAMO';
    h.getCell(`B${r + 2}`).value = t.filas[0]?.[1] ?? 'SIN DESCUENTOS';
    h.getCell(`D${r + 2}`).value = 500000;
    r += 5;
  }
  if (vacaciones.length) {
    h.getCell(`A${r}`).value = 'VACACIONES';
    r++;
    h.getRow(r).values = ['CEDULA', 'EMPLEADO', 'DIAS LAB', 'SALARIO BASE', 'SALARIO', '', 'AUXILIO DE TRANSP.', '', '', 'SALUD', 'PENSION', 'NETO'];
    r++;
    for (const v of vacaciones) h.getRow(r++).values = v;
    r += 2;
  }
  if (ext.length) {
    h.getCell(`A${r}`).value = 'LIQUIDACION DE EXTRAS';
    r += 4;
    h.getRow(r).values = ['CEDULA', 'EMPLEADO', 'SALARIO BASE', 'RECARGOS NOC', 'TOTAL HORAS EXTRAS', 'JORNADAS EXTRAS', 'TOTAL JORNADAS EXTRAS', 'NETO', 'FIRMAS'];
    r++;
    for (const e of ext) h.getRow(r++).values = e;
    h.getCell(`B${r}`).value = 'TOTAL';
    r += 2;
    h.getCell(`D${r}`).value = 'NOM Y PREST';
  }
  return h;
}

export function horasResumen(libro, quincena, filas) {
  const h = libro.addWorksheet('HORAS RESUMEN');
  h.getCell('B2').value = 'Quincena:';
  h.getCell('C2').value = quincena;
  h.getRow(5).values = ['CÉDULA', 'EMPLEADO', 'EMPLEADOR - ESQUEMA', 'SALARIO', 'VALOR HORA', 'R.N. (h)', 'DOM/FEST (h)', 'H.E.D. (h)', 'H.E.N. (h)', 'H.E.D. DOM/FEST (h)', 'H.E.N. DOM/FEST (h)'];
  filas.forEach((f, i) => (h.getRow(6 + i).values = f));
}

const EMP_A = 'EMPLEADOR DEMO A C.C 900.000.001';
const EMP_B = 'EMPLEADOR DEMO B C.C 900.000.002';

export async function generar() {
  fs.mkdirSync(DIR, { recursive: true });
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet('MENU').getCell('A1').value = 'SISTEMA DE NÓMINA (FICTICIO)';

  // 1) Quincena válida (NOV 1-15)
  hojaNomina(libro, 'NOMINA NOV 1-15', {
    inicio: '2026-11-01', fin: '2026-11-15',
    tablas: [
      {
        empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE',
        filas: [
          // colab1: con recargo, extras, préstamo y observación; aux con medio peso
          [1000000003, 'PEREZ GOMEZ ANA MARIA', 15, 1750905, 875452.5, 20005, 124547.5, 53571, 0, -37900, -37900, -100000, undefined, 'PRUEBA OBSERVACION'],
          [1000000002, 'DIRECTOR DEMO NORTE', 15, 3000000, 1500000, 0, 0, 0, 0, -60000, -60000, 0],
          // cédula guardada como texto con puntos (como ocurre en el original)
          ['1.000.000.001', 'ADMIN DEMO CONTABLE', 15, 3500000, 1750000, 0, 0, 0, 0, -70000, -70000, 0],
        ],
      },
      {
        empleador: EMP_B, sede: 'COMPRAVENTA SEDE RIO',
        filas: [
          // colab2: incapacidad (días descontados)
          [1000000004, 'RAMIREZ DIAZ LUIS CARLOS', 10, 1750905, 583635, 0, 83031.67, 0, 291817.5, -35000, -35000, 0],
        ],
      },
    ],
    vacaciones: [[1000000004, 'RAMIREZ DIAZ LUIS CARLOS', 15, 1750905, 875452.5, '', 0, '', '', -35000, -35000, 805452.5]],
    ext: [[1000000003, 'PEREZ GOMEZ ANA MARIA', 1750905, 10000, 0, 2, 116727, 126727]],
  });
  horasResumen(libro, 'NOMINA NOV 1-15', [[1000000003, 'PEREZ GOMEZ ANA MARIA', 'EMP_A', 1750905, 8337.64, 3.5, 2, 4.5, 0, 0, 0]]);

  // 2) Quincena con una cédula sin expediente (OCT 16-31)
  hojaNomina(libro, 'NOMINA OCT 16-31', {
    inicio: '2026-10-16', fin: '2026-10-31',
    tablas: [{
      empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE',
      filas: [
        [1000000003, 'PEREZ GOMEZ ANA MARIA', 15, 1750905, 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0],
        [3000000099, 'RETIRADO DEMO ANTIGUO', 15, 1750905, 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0],
      ],
    }],
  });

  // 3) Descuadre (OCT 1-15): el neto no coincide
  hojaNomina(libro, 'NOMINA OCT 1-15', {
    inicio: '2026-10-01', fin: '2026-10-15',
    tablas: [{
      empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE',
      filas: [[1000000003, 'PEREZ GOMEZ ANA MARIA', 15, 1750905, 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0, 999999]],
    }],
  });

  // 4) Encabezado no reconocido (SEP 16-30)
  hojaNomina(libro, 'NOMINA SEP 16-30', {
    inicio: '2026-09-16', fin: '2026-09-30', subI: 'BONIFICACION',
    tablas: [{ empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE', filas: [[1000000003, 'PEREZ GOMEZ ANA MARIA', 15, 1750905, 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0]] }],
  });

  // 5) Sin fechas en S1/T1 (SEP 1-15)
  hojaNomina(libro, 'NOMINA SEP 1-15', {
    inicio: '2026-09-01', fin: '2026-09-15', sinFechas: true,
    tablas: [{ empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE', filas: [[1000000003, 'PEREZ GOMEZ ANA MARIA', 15, 1750905, 875452.5, 0, 124547.5, 0, 0, -35000, -35000, 0]] }],
  });

  // 6) Se cruza con NOV 1-15 (NOV 10-20)
  hojaNomina(libro, 'NOMINA NOV 10-20', {
    inicio: '2026-11-10', fin: '2026-11-20',
    tablas: [{ empleador: EMP_A, sede: 'COMPRAVENTA SEDE NORTE', filas: [[1000000003, 'PEREZ GOMEZ ANA MARIA', 11, 1750905, 642000, 0, 91000, 0, 0, -25700, -25700, 0]] }],
  });

  await libro.xlsx.writeFile(path.join(DIR, 'nomina-ficticia.xlsx'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await generar();
  console.log(`Libro de nómina ficticio generado en ${DIR}`);
}
