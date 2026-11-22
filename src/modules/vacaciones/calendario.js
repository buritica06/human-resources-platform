// Calendario laboral (funciones puras, sin BD). Fechas ISO "AAAA-MM-DD" tratadas como días de
// calendario (sin zona horaria). Replica las fórmulas de la hoja LIQ VACACIONES del archivo:
// - Días laborados: DAYS360(inicio, fin) + 1 (método de EE. UU., el predeterminado de Excel).
// - Fin del disfrute: WORKDAY.INTL(inicio − 1, días, fin de semana, FESTIVOS).
// - Regreso: WORKDAY.INTL(fin, 1, fin de semana, FESTIVOS).
// Fin de semana: solo domingo si el sábado es hábil (SABADO_HABIL), si no sábado y domingo.

const DIA_MS = 86_400_000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const aMs = (f) => Date.parse(`${f}T00:00:00Z`);
export const aIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const sumarDias = (f, n) => aIso(aMs(f) + n * DIA_MS);
export const hoyBogota = () => aIso(Date.now() - 5 * 3600_000); // Colombia: UTC−5, sin horario de verano

export function fechaValida(f) {
  if (!FECHA.test(String(f ?? ''))) return false;
  const ms = aMs(f);
  return !Number.isNaN(ms) && aIso(ms) === f;
}

// op: { festivos: Map|Set de fechas ISO, sabadoHabil: boolean }
export function motivoNoHabil(f, { festivos, sabadoHabil }) {
  const d = new Date(aMs(f)).getUTCDay();
  if (d === 0) return 'domingo';
  if (d === 6 && !sabadoHabil) return 'sábado';
  if (festivos.has(f)) return festivos instanceof Map ? `festivo: ${festivos.get(f)}` : 'festivo';
  return null;
}
export const esHabil = (f, op) => motivoNoHabil(f, op) === null;

// Días hábiles entre dos fechas, ambas incluidas
export function contarHabiles(desde, hasta, op) {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (esHabil(f, op)) n++;
  return n;
}

// Fecha del n-ésimo día hábil contando desde "inicio" (incluido): WORKDAY.INTL(inicio − 1, n)
export function finDeDisfrute(inicio, n, op) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n debe ser un entero positivo');
  let f = sumarDias(inicio, -1);
  for (let k = 0; k < n;) {
    f = sumarDias(f, 1);
    if (esHabil(f, op)) k++;
  }
  return f;
}

// Siguiente día hábil después de f: WORKDAY.INTL(f, 1)
export function siguienteHabil(f, op) {
  let x = sumarDias(f, 1);
  while (!esHabil(x, op)) x = sumarDias(x, 1);
  return x;
}

// Primer día hábil desde f (incluido)
export const primerHabilDesde = (f, op) => (esHabil(f, op) ? f : siguienteHabil(f, op));

// DAYS360 de Excel, método de EE. UU. (NASD, como lo calcula Excel con método FALSO u omitido):
// - Si el inicio es el último día del mes (incluido febrero), cuenta como día 30.
// - Si el fin es día 31 y el inicio (ya ajustado) es 30, el fin cuenta como 30.
export function dias360(desde, hasta) {
  const [y1, m1, d1o] = desde.split('-').map(Number);
  const [y2, m2, d2o] = hasta.split('-').map(Number);
  const ultimoDia = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  let d1 = d1o;
  let d2 = d2o;
  if (d1 === ultimoDia(y1, m1)) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

// Años que toca un rango (para verificar que hay festivos cargados)
export function aniosEntre(desde, hasta) {
  const r = [];
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) r.push(y);
  return r;
}
