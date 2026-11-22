// Números y fechas en letras (español de Colombia) para los certificados.
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 0–999. apocope: "UN" en vez de "UNO" delante de MIL/MILLONES/PESOS
function hastaMil(n, apocope) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let txt = CENTENAS[c];
  if (r) {
    let dec;
    if (r < 30) dec = UNIDADES[r];
    else dec = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : '');
    if (apocope) dec = dec.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
    txt = `${txt} ${dec}`.trim();
  }
  return txt;
}

// Entero ≥ 0 hasta 999.999.999.999. apocope: el número va delante de un sustantivo ("UN PESO")
export function enteroALetras(n, { apocope = false } = {}) {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new RangeError('Número fuera de rango');
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) {
    if (millones === 1) partes.push('UN MILLÓN');
    else {
      const mm = Math.floor(millones / 1000);
      const m = millones % 1000;
      const txtMm = mm ? (mm === 1 ? 'MIL' : `${hastaMil(mm, true)} MIL`) : '';
      partes.push(`${txtMm} ${hastaMil(m, true)}`.trim() + ' MILLONES');
    }
  }
  if (miles) partes.push(miles === 1 ? 'MIL' : `${hastaMil(miles, true)} MIL`);
  if (resto) partes.push(hastaMil(resto, apocope));
  return partes.join(' ');
}

// Pesos colombianos: "UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS M/CTE"
export function pesosALetras(valor) {
  const n = Math.round(Number(valor));
  const txt = enteroALetras(n, { apocope: true });
  const de = /MILL(ÓN|ONES)$/.test(txt) ? ' DE' : ''; // "UN MILLÓN DE PESOS"
  return `${txt}${de} ${n === 1 ? 'PESO' : 'PESOS'} M/CTE`;
}

// "22 de noviembre de 2026"
export const fechaLarga = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
