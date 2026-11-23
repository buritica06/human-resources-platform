// Plantilla corporativa de PDF (PDFKit): encabezado, pie, tablas simples y formato es-CO.
// La reutilizan los volantes (M2) y los certificados (M7).
import PDFDocument from 'pdfkit';

export const COLOR = { primario: '#6A1B9A', texto: '#1F2330', suave: '#5A6070', borde: '#D5D9E2', fondo: '#F3E8F8' };
const MARGEN = 48;

export function pesos(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  const entero = Number.isInteger(Math.round(v * 100) / 100);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(v)
    .split(String.fromCharCode(160))
    .join(' '); // espacio duro -> espacio normal (Helvetica)
}

export const fechaCorta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function ahoraBogota() {
  return new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Crea el documento con encabezado y pie. Devuelve { doc, terminar() → Promise<Buffer> }
export function crearDocumento({ titulo, subtitulo, empresa, documentoEmpresa, pie }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGEN, bottom: MARGEN + 20, left: MARGEN, right: MARGEN },
    info: { Title: titulo, Producer: 'Plataforma de Talento Humano' },
  });
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const fin = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(partes))));

  const ancho = doc.page.width - 2 * MARGEN;
  doc.rect(0, 0, doc.page.width, 6).fill(COLOR.primario);
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(16).text(titulo, MARGEN, MARGEN, { width: ancho });
  if (subtitulo) doc.fillColor(COLOR.suave).font('Helvetica').fontSize(10).text(subtitulo, { width: ancho });
  if (empresa) {
    doc.moveDown(0.3).fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(10).text(empresa, { width: ancho });
    if (documentoEmpresa) doc.font('Helvetica').fillColor(COLOR.suave).text(documentoEmpresa, { width: ancho });
  }
  doc.moveDown(0.6);
  linea(doc);

  // El pie va debajo del margen inferior: se quita el margen mientras se dibuja para que
  // PDFKit no abra una página nueva (lo que volvería a dibujar el pie, sin fin).
  const piePagina = () => {
    const { x, y: yAntes } = doc;
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .save()
      .fillColor(COLOR.suave)
      .font('Helvetica')
      .fontSize(7.5)
      .text(pie ?? `Generado el ${ahoraBogota()} por la plataforma de Talento Humano.`, MARGEN, doc.page.height - MARGEN, {
        width: ancho,
        align: 'center',
        lineBreak: false,
      })
      .restore();
    doc.page.margins.bottom = margenInferior;
    doc.x = x;
    doc.y = yAntes;
  };
  doc.on('pageAdded', piePagina);
  piePagina();

  return {
    doc,
    ancho,
    async terminar() {
      doc.end();
      return fin;
    },
  };
}

export function linea(doc, color = COLOR.borde) {
  const y = doc.y;
  doc
    .save()
    .moveTo(MARGEN, y)
    .lineTo(doc.page.width - MARGEN, y)
    .lineWidth(0.7)
    .strokeColor(color)
    .stroke()
    .restore();
  doc.moveDown(0.5);
}

export function titulo2(doc, texto) {
  asegurarEspacio(doc, 60);
  doc.moveDown(0.4).fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(11).text(texto.toUpperCase(), MARGEN);
  doc.moveDown(0.2);
}

// Pares etiqueta/valor en dos columnas
export function datos(doc, pares) {
  const ancho = doc.page.width - 2 * MARGEN;
  const col = ancho / 2;
  for (let i = 0; i < pares.length; i += 2) {
    asegurarEspacio(doc, 30);
    const y = doc.y;
    let maxY = y;
    for (const [j, par] of [pares[i], pares[i + 1]].entries()) {
      if (!par) continue;
      const x = MARGEN + j * col;
      doc
        .fillColor(COLOR.suave)
        .font('Helvetica')
        .fontSize(8)
        .text(par[0], x, y, { width: col - 10 });
      doc
        .fillColor(COLOR.texto)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(par[1] || '—', x, doc.y, { width: col - 10 });
      maxY = Math.max(maxY, doc.y);
    }
    doc.y = maxY + 4;
  }
}

// Tabla simple: columnas [{ titulo, ancho (fracción), alinear }], filas [[...]]
export function tabla(doc, columnas, filas, { totales } = {}) {
  const ancho = doc.page.width - 2 * MARGEN;
  const xs = [];
  let acc = MARGEN;
  for (const c of columnas) {
    xs.push(acc);
    acc += c.ancho * ancho;
  }
  const fila = (valores, { negrita = false, fondo = null } = {}) => {
    asegurarEspacio(doc, 22);
    const y = doc.y;
    const alturas = valores.map((v, i) =>
      doc
        .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .heightOfString(String(v ?? ''), { width: columnas[i].ancho * ancho - 8 }),
    );
    const alto = Math.max(...alturas) + 8;
    if (fondo) doc.save().rect(MARGEN, y, ancho, alto).fill(fondo).restore();
    valores.forEach((v, i) => {
      doc
        .fillColor(COLOR.texto)
        .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(String(v ?? ''), xs[i] + 4, y + 4, { width: columnas[i].ancho * ancho - 8, align: columnas[i].alinear ?? 'left' });
    });
    doc.y = y + alto;
    doc
      .save()
      .moveTo(MARGEN, doc.y)
      .lineTo(MARGEN + ancho, doc.y)
      .lineWidth(0.5)
      .strokeColor(COLOR.borde)
      .stroke()
      .restore();
  };
  fila(
    columnas.map((c) => c.titulo),
    { negrita: true, fondo: COLOR.fondo },
  );
  for (const f of filas) fila(f);
  if (totales) fila(totales, { negrita: true });
  doc.moveDown(0.5);
}

export function asegurarEspacio(doc, alto) {
  if (doc.y + alto > doc.page.height - MARGEN - 30) doc.addPage();
}

export const MARGEN_PDF = MARGEN;
