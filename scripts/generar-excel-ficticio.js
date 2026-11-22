// Genera libros de Excel FICTICIOS con la misma estructura del archivo base de nómina,
// para pruebas y demostraciones. Nunca usa datos reales.
// Salida: tests/fixtures/empleados-ficticio.xlsx y tests/fixtures/empleados-con-errores.xlsx
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const DIR = path.resolve(import.meta.dirname, '..', 'tests', 'fixtures');

const ENCABEZADOS = [
  'CÉDULA', 'NOMBRE', 'EMPLEADOR', 'SEDE', 'CARGO', 'TIPO CONTRATO', 'FECHA INGRESO', 'FECHA FIN CONTRATO',
  'SALARIO BASE', 'AUX. TRANSP. (SI/NO)', 'EPS', 'AFP', 'CESANTÍAS', 'CAJA', 'RIESGO ARL', 'BANCO', 'TIPO CUENTA',
  'N° CUENTA', 'ESTADO', 'FECHA RETIRO', 'MOTIVO RETIRO', 'CELULAR', 'LISTA (no editar)',
  'DÍA DE DESCANSO (dominical pactado)', 'ESQUEMA DE HORAS', 'LACTANCIA (SI/NO) ½ h diaria pagada como H.E.D.', 'FIN LACTANCIA',
];

// [cédula, nombre, empleador, sede, cargo, ingreso, salario, estado]
export const EMPLEADOS_FICTICIOS = [
  ['2000000001', 'ACOSTA BELTRAN CAMILO ANDRES', 'EMP_A', 'SEDE NORTE', 'ADMINISTRADOR', '2021-03-01', 1800000, 'ACTIVO'],
  ['2000000002', 'BARRIOS CASTRO DIANA PAOLA', 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2023-07-15', 1750905, 'ACTIVO'],
  ['2000000003', 'CORREA DUARTE JORGE ELIECER', 'EMP_A', 'SEDE SUR', 'VIGILANTE', '2022-01-10', 1750905, 'ACTIVO'],
  ['2000000004', 'DAZA ESCOBAR MARIA FERNANDA', 'EMP_B', 'SEDE RIO', 'AUXILIAR', '2024-02-01', 1750905, 'ACTIVO'],
  ['2000000005', 'ESPITIA FUENTES LUIS ALBERTO', 'EMP_B', 'SEDE PUERTO', 'ADMINISTRADOR', '2020-09-01', 1900000, 'ACTIVO'],
  ['2000000006', 'FONSECA GARCIA SANDRA MILENA', 'EMP_C', 'SEDE CAMPO', 'AUXILIAR', '2025-05-05', 1750905, 'ACTIVO'],
  ['2000000007', 'GUERRA HERRERA PEDRO PABLO', 'EMP_C', 'SEDE CAMPO', 'AUXILIAR', '2019-04-01', 1750905, 'RETIRADO'],
];

function hojaEmpleados(libro, filas) {
  const h = libro.addWorksheet('EMPLEADOS');
  h.getCell('A1').value = 'MATRIZ DE EMPLEADOS  —  se alimenta desde el formulario FORM EMPLEADO (también se puede editar aquí)';
  h.getCell('F2').value = 'Pendiente por completar: cargo, tipo de contrato y FECHA DE INGRESO de cada empleado.';
  h.getRow(4).values = ENCABEZADOS;
  filas.forEach((f, i) => {
    const r = 5 + i;
    const [ced, nombre, emp, sede, cargo, ingreso, salario, estado] = f;
    const fila = h.getRow(r);
    fila.getCell(1).value = /^\d+$/.test(ced) ? Number(ced) : ced; // en el original la cédula es numérica
    fila.getCell(2).value = nombre;
    fila.getCell(3).value = emp;
    fila.getCell(4).value = sede;
    fila.getCell(5).value = cargo;
    fila.getCell(6).value = 'INDEFINIDO';
    fila.getCell(7).value = new Date(`${ingreso}T00:00:00Z`);
    fila.getCell(9).value = salario;
    fila.getCell(10).value = salario <= 2 * 1750905 ? 'SI' : 'NO';
    fila.getCell(11).value = 'EPS DEMO';
    fila.getCell(12).value = 'AFP DEMO';
    fila.getCell(19).value = estado;
    fila.getCell(23).value = { formula: `IF(A${r}="","",A${r}&" - "&B${r})`, result: `${ced} - ${nombre}` };
    fila.getCell(24).value = 'DOMINGO';
    fila.getCell(25).value = 'SEMANA COMPLETA';
  });
  // Filas vacías con fórmula, como en el original (hasta la fila 400)
  for (let r = 5 + filas.length; r < 5 + filas.length + 5; r++) {
    h.getRow(r).getCell(23).value = { formula: `IF(A${r}="","",A${r}&" - "&B${r})`, result: '' };
  }
  return h;
}

export async function generar() {
  fs.mkdirSync(DIR, { recursive: true });

  const ok = new ExcelJS.Workbook();
  ok.addWorksheet('MENU').getCell('A1').value = 'SISTEMA DE NÓMINA (FICTICIO)';
  hojaEmpleados(ok, EMPLEADOS_FICTICIOS);
  await ok.xlsx.writeFile(path.join(DIR, 'empleados-ficticio.xlsx'));

  const malo = new ExcelJS.Workbook();
  hojaEmpleados(malo, [
    ...EMPLEADOS_FICTICIOS.slice(0, 3),
    ['2000000001', 'DUPLICADO DEMO PRUEBA', 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2024-01-01', 1750905, 'ACTIVO'],
    ['12A45', 'CEDULA MALA DEMO', 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2024-01-01', 1750905, 'ACTIVO'],
    ['2000000020', '=HYPERLINK("http://example.com","x")', 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2024-01-01', 1750905, 'ACTIVO'],
    ['2000000021', 'NOMBRE '.repeat(25), 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2024-01-01', 1750905, 'ACTIVO'],
    // Cédula guardada como texto con decimal: debe leerse como 30000000 (no 300000000)
    ['30000000.0', 'PEÑA ÑUSTES MARIA JOSE', 'EMP_A', 'SEDE NORTE', 'AUXILIAR', '2024-01-01', 1750905, 'ACTIVO'],
  ]);
  await malo.xlsx.writeFile(path.join(DIR, 'empleados-con-errores.xlsx'));

  const sinHoja = new ExcelJS.Workbook();
  sinHoja.addWorksheet('OTRA').getCell('A1').value = 'sin hoja de empleados';
  await sinHoja.xlsx.writeFile(path.join(DIR, 'sin-hoja-empleados.xlsx'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await generar();
  console.log(`Libros ficticios generados en ${DIR}`);
}
