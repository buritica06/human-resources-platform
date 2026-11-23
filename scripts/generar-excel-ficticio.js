// Genera libros de Excel FICTICIOS con la misma estructura del archivo base de nómina,
// para pruebas y demostraciones. Nunca usa datos reales.
// Salida: tests/fixtures/empleados-ficticio.xlsx y tests/fixtures/empleados-con-errores.xlsx
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const DIR = path.resolve(import.meta.dirname, '..', 'tests', 'fixtures');

const ENCABEZADOS = [
  'CÉDULA',
  'NOMBRE',
  'EMPLEADOR',
  'SEDE',
  'CARGO',
  'TIPO CONTRATO',
  'FECHA INGRESO',
  'FECHA FIN CONTRATO',
  'SALARIO BASE',
  'AUX. TRANSP. (SI/NO)',
  'EPS',
  'AFP',
  'CESANTÍAS',
  'CAJA',
  'RIESGO ARL',
  'BANCO',
  'TIPO CUENTA',
  'N° CUENTA',
  'ESTADO',
  'FECHA RETIRO',
  'MOTIVO RETIRO',
  'CELULAR',
  'LISTA (no editar)',
  'DÍA DE DESCANSO (dominical pactado)',
  'ESQUEMA DE HORAS',
  'LACTANCIA (SI/NO) ½ h diaria pagada como H.E.D.',
  'FIN LACTANCIA',
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
  // Empleador y sede que solo existen en la hoja PARAMETROS del libro (se crean al importar)
  ['2000000008', 'HOYOS IBARRA ROSA ELENA', 'EMP_D', 'SEDE NUEVA', 'AUXILIAR', '2025-10-01', 1750905, 'ACTIVO'],
];

function hojaParametros(libro) {
  const h = libro.addWorksheet('PARAMETROS');
  h.getCell('A1').value = 'PARÁMETROS DEL SISTEMA DE NÓMINA (FICTICIO)';
  h.getCell('K4').value = 'CLAVE';
  h.getCell('L4').value = 'ENCABEZADO EN LA NÓMINA';
  h.getCell('M4').value = 'NOMBRE COMPLETO (liquidaciones)';
  h.getCell('N4').value = 'C.C. / NIT';
  h.getCell('P4').value = 'EMPLEADOR';
  h.getCell('Q4').value = 'SEDE (título en la nómina, en este orden)';
  const emp = [
    ['EMP_A', 'EMPLEADOR DEMO A'],
    ['EMP_B', 'EMPLEADOR DEMO B'],
    ['EMP_C', 'EMPLEADOR DEMO C'],
    ['EMP_D', 'EMPLEADOR DEMO D'],
  ];
  emp.forEach(([k, n], i) => {
    h.getCell(`K${6 + i}`).value = k;
    h.getCell(`M${6 + i}`).value = n;
    h.getCell(`N${6 + i}`).value = 900000001 + i;
  });
  const sedes = [
    ['EMP_A', 'SEDE NORTE'],
    ['EMP_A', 'SEDE SUR'],
    ['EMP_B', 'SEDE RIO'],
    ['EMP_B', 'SEDE PUERTO'],
    ['EMP_C', 'SEDE CAMPO'],
    ['EMP_D', 'SEDE NUEVA'],
  ];
  sedes.forEach(([e, s], i) => {
    h.getCell(`P${6 + i}`).value = e;
    h.getCell(`Q${6 + i}`).value = s;
  });
}

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
    fila.getCell(12).value = 'Porvenir';
    fila.getCell(15).value = 'I';
    fila.getCell(16).value = 'BANCOLOMBIA';
    fila.getCell(17).value = 'AHORRO';
    fila.getCell(18).value = Number(`9${String(ced).replace(/\D/g, '').slice(-9)}`) || null; // número de cuenta ficticio
    fila.getCell(19).value = estado;
    if (estado === 'RETIRADO') {
      fila.getCell(20).value = new Date('2026-06-30T00:00:00Z');
      fila.getCell(21).value = 'RENUNCIA VOLUNTARIA';
    }
    fila.getCell(22).value = `3${String(ced).replace(/\D/g, '').slice(-9).padStart(9, '0')}`;
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
  hojaParametros(ok);
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

  // PARAMETROS defectuosa: clave repetida (se ignora), clave demasiado larga y sede de un
  // empleador que no existe (ambas deben salir como error en la vista previa, no como 500).
  const pm = new ExcelJS.Workbook();
  const hp = pm.addWorksheet('PARAMETROS');
  hp.getRow(4).values = [];
  hp.getCell('K4').value = 'CLAVE';
  hp.getCell('M4').value = 'NOMBRE COMPLETO (liquidaciones)';
  hp.getCell('P4').value = 'EMPLEADOR';
  hp.getCell('Q4').value = 'SEDE (título en la nómina, en este orden)';
  [
    ['EMP_A', 'EMPLEADOR DEMO A'],
    ['EMP_A', 'EMPLEADOR DEMO A'],
    ['X'.repeat(40), 'CLAVE LARGA'],
  ].forEach(([k, n], i) => {
    hp.getCell(`K${6 + i}`).value = k;
    hp.getCell(`M${6 + i}`).value = n;
  });
  hp.getCell('P6').value = 'EMP_A';
  hp.getCell('Q6').value = 'SEDE NORTE';
  hp.getCell('P7').value = 'EMP_ZZ';
  hp.getCell('Q7').value = 'SEDE FANTASMA';
  hojaEmpleados(pm, EMPLEADOS_FICTICIOS.slice(0, 1));
  await pm.xlsx.writeFile(path.join(DIR, 'parametros-malos.xlsx'));

  // Encabezados con variantes ("TIPO DE CONTRATO", "Nº CUENTA" con º ordinal, "ESTADO CIVIL"
  // antes de "ESTADO", sin columna CAJA) y celdas vacías que NO deben borrar datos existentes.
  const va = new ExcelJS.Workbook();
  const hv = va.addWorksheet('EMPLEADOS');
  hv.getRow(4).values = [
    'CÉDULA',
    'NOMBRE',
    'EMPLEADOR',
    'SEDE',
    'ESTADO CIVIL',
    'ESTADO',
    'TIPO DE CONTRATO',
    'Nº CUENTA',
    'SALARIO BASE',
    'RIESGO ARL',
    'EPS',
  ];
  hv.getRow(5).values = [
    2000000001,
    'ACOSTA BELTRAN CAMILO ANDRES',
    'EMP_A',
    'SEDE NORTE',
    '',
    '',
    'FIJO 1 AÑO',
    '',
    '',
    'RIESGO MUY ALTO',
    '',
  ];
  await va.xlsx.writeFile(path.join(DIR, 'empleados-variantes.xlsx'));

  const sinHoja = new ExcelJS.Workbook();
  sinHoja.addWorksheet('OTRA').getCell('A1').value = 'sin hoja de empleados';
  await sinHoja.xlsx.writeFile(path.join(DIR, 'sin-hoja-empleados.xlsx'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await generar();
  console.log(`Libros ficticios generados en ${DIR}`);
}
