// PDF del certificado laboral con la plantilla corporativa (src/core/pdf.js). Se genera a partir del
// contenido guardado al emitir: el mismo certificado siempre produce el mismo texto.
import { crearDocumento, linea, pesos, COLOR, MARGEN_PDF } from '../../core/pdf.js';
import { fechaLarga } from './letras.js';

const cedulaConPuntos = (c) => String(c).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export async function pdfCertificado(k, { appUrl }) {
  const c = k.contenido;
  const { doc, ancho, terminar } = crearDocumento({
    titulo: 'Certificado laboral',
    empresa: c.empleador,
    documentoEmpresa: c.documentoEmpleador ? `Documento No. ${c.documentoEmpleador}` : null,
    pie: `Código de verificación ${k.codigo} · Generado por la plataforma de Talento Humano`,
  });
  const parrafo = (texto, opciones = {}) => doc.fillColor(COLOR.texto).font('Helvetica').fontSize(11).text(texto, MARGEN_PDF, doc.y, { width: ancho, align: 'justify', lineGap: 3, ...opciones }).moveDown(0.8);

  if (k.anulado_en) {
    // Solo el admincontable puede descargar uno anulado: queda marcado arriba, visible
    doc.save().fillColor('#B00020').font('Helvetica-Bold').fontSize(14)
      .text('ANULADO – SIN VALIDEZ', MARGEN_PDF, doc.y + 6, { width: ancho, align: 'center' }).restore();
  }
  doc.moveDown(1);
  doc.fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(11).text(c.dirigidoA.toUpperCase(), MARGEN_PDF, doc.y, { width: ancho });
  doc.moveDown(1.2);
  parrafo(`${c.empleador}${c.documentoEmpleador ? `, identificado con documento No. ${c.documentoEmpleador},` : ''}`);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.primario).text('CERTIFICA:', MARGEN_PDF, doc.y, { width: ancho, align: 'center' }).moveDown(0.8);

  const periodo = c.fechaRetiro
    ? `laboró en la empresa desde el ${fechaLarga(c.fechaIngreso)} hasta el ${fechaLarga(c.fechaRetiro)}`
    : `labora en la empresa desde el ${fechaLarga(c.fechaIngreso)}`;
  const contrato = c.contrato ? `, ${c.contrato}${c.fechaFinContrato ? ` hasta el ${fechaLarga(c.fechaFinContrato)}` : ''}` : '';
  parrafo(`Que ${c.nombre}, identificado(a) con cédula de ciudadanía No. ${cedulaConPuntos(c.cedula)}, ${periodo}${contrato}, ${c.fechaRetiro ? 'desempeñó' : 'desempeñando'} el cargo de ${c.cargo}.`
    .replace(', desempeñó el cargo', ', y desempeñó el cargo'));
  if (c.salario !== null && c.salario !== undefined) {
    parrafo(`${c.fechaRetiro ? 'Su último salario básico mensual fue' : 'Devenga un salario básico mensual'} de ${pesos(c.salario)} (${c.salarioLetras}).`);
  }
  parrafo(`Se expide a solicitud del interesado${c.ciudad ? `, en ${c.ciudad},` : ''} el ${fechaLarga(c.fechaExpedicion)}.`);

  // Firma
  doc.moveDown(3);
  const yFirma = doc.y;
  doc.save().moveTo(MARGEN_PDF, yFirma).lineTo(MARGEN_PDF + 220, yFirma).lineWidth(0.7).strokeColor(COLOR.texto).stroke().restore();
  doc.moveDown(0.3);
  if (c.firmante) doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.texto).text(c.firmante, MARGEN_PDF, doc.y, { width: ancho });
  if (c.cargoFirmante) doc.font('Helvetica').fontSize(10).fillColor(COLOR.texto).text(c.cargoFirmante, MARGEN_PDF, doc.y, { width: ancho });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.suave).text(c.empleador, MARGEN_PDF, doc.y, { width: ancho });

  // Verificación
  doc.moveDown(2);
  linea(doc);
  const url = `${appUrl}/verificar?codigo=${k.codigo}`;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.primario).text(`Código de verificación: ${k.codigo}`, MARGEN_PDF, doc.y, { width: ancho });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.suave)
    .text(`Verifique su autenticidad en ${url}. La verificación solo confirma que el certificado es válido y su fecha de expedición; compare el resto de los datos con este documento.`, MARGEN_PDF, doc.y, { width: ancho, link: url });
  return terminar();
}
