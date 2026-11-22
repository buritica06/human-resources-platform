// Catálogo de conceptos del volante, tal como aparecen en la hoja NOMINA del archivo base.
// col: columna de la tabla de nómina (E..L). La app NO calcula: solo muestra estos valores.

export const CONCEPTOS = {
  SALARIO: { tipo: 'DEV', etiqueta: 'Salario', col: 5, orden: 1, unidad: 'días' },
  RECARGO_NOCTURNO: { tipo: 'DEV', etiqueta: 'Recargo nocturno', col: 6, orden: 2, unidad: 'h' },
  AUX_TRANSPORTE: { tipo: 'DEV', etiqueta: 'Auxilio de transporte', col: 7, orden: 3, unidad: 'días' },
  HORAS_EXTRAS: { tipo: 'DEV', etiqueta: 'Horas extras, dominicales y festivos', col: 8, orden: 4 },
  INCAPACIDAD: { tipo: 'DEV', etiqueta: 'Incapacidad / licencia remunerada', col: 9, orden: 5 },
  SALUD: { tipo: 'DED', etiqueta: 'Salud', col: 10, orden: 10 },
  PENSION: { tipo: 'DED', etiqueta: 'Pensión', col: 11, orden: 11 },
  PRESTAMO: { tipo: 'DED', etiqueta: 'Préstamo / anticipo', col: 12, orden: 12 },
  // Tabla "LIQUIDACIÓN DE EXTRAS" (pago aparte, supuesto P5)
  RECARGO_NOC_APARTE: { tipo: 'ADICIONAL', etiqueta: 'Recargos nocturnos (pago aparte)', orden: 20 },
  HORAS_EXTRA_APARTE: { tipo: 'ADICIONAL', etiqueta: 'Horas extras (pago aparte)', orden: 21, unidad: 'h' },
  JORNADAS_EXTRA: { tipo: 'ADICIONAL', etiqueta: 'Jornadas extra', orden: 22, unidad: 'jornadas' },
};

// Desglose informativo de horas (hoja HORAS RESUMEN, solo si corresponde a la misma quincena)
export const HORAS_RESUMEN = [
  ['R.N. (H)', 'Recargo nocturno', 'RECARGO_NOCTURNO'],
  ['DOM/FEST (H)', 'Dominical / festivo', 'HORAS_EXTRAS'],
  ['H.E.D. (H)', 'Hora extra diurna', 'HORAS_EXTRAS'],
  ['H.E.N. (H)', 'Hora extra nocturna', 'HORAS_EXTRAS'],
  ['H.E.D. DOM/FEST (H)', 'Hora extra diurna dominical/festiva', 'HORAS_EXTRAS'],
  ['H.E.N. DOM/FEST (H)', 'Hora extra nocturna dominical/festiva', 'HORAS_EXTRAS'],
];

export const TOLERANCIA_CUADRE = 1; // pesos (medios pesos del auxilio de transporte, supuesto S4)
