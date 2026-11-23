// PDF del certificado laboral con la plantilla corporativa (src/core/pdf.js). Se genera a partir del
// contenido guardado al emitir: el mismo certificado siempre produce el mismo texto.
import { crearDocumento, linea, pesos, COLOR, MARGEN_PDF } from '../../core/pdf.js';
import { fechaLarga, fechaConstancia } from './letras.js';

const cedulaConPuntos = (c) =>
  String(c ?? '')
    .replace(/\D/g, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const nitConPuntos = (doc) => {
  const s = String(doc ?? '').trim();
  if (!s) return '';
  const [base, dv] = s.split('-');
  const f = cedulaConPuntos(base);
  return dv !== undefined ? `${f}-${dv.replace(/\D/g, '')}` : f;
};

export async function pdfCertificado(k, { appUrl, logoBuffer = null, firmaBuffer = null, nombreFirma = null, cargoFirma = null } = {}) {
  const c = k.contenido;
  const { doc, ancho, terminar } = crearDocumento({
    titulo: 'Certificado laboral',
    empresa: c.empleador,
    documentoEmpresa: c.documentoEmpleador ? `NIT / C.C. ${nitConPuntos(c.documentoEmpleador)}` : null,
    pie: `Código de verificación ${k.codigo} · Generado por la plataforma de Talento Humano`,
  });

  const parrafo = (texto, opciones = {}) =>
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica')
      .fontSize(11)
      .text(texto, MARGEN_PDF, doc.y, { width: ancho, align: 'justify', lineGap: 3.5, ...opciones })
      .moveDown(0.9);

  if (k.anulado_en) {
    doc
      .save()
      .fillColor('#B00020')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('ANULADO – SIN VALIDEZ', MARGEN_PDF, doc.y + 6, { width: ancho, align: 'center' })
      .restore();
  }

  // Logo corporativo opcional (configurado en BD vía CERT_LOGO_BASE64)
  if (logoBuffer) {
    try {
      const logoAncho = 120;
      const logoAlto = 95;
      const yLogo = doc.y - 6;
      doc.image(logoBuffer, MARGEN_PDF + (ancho - logoAncho) / 2, yLogo, { fit: [logoAncho, logoAlto], align: 'center', valign: 'center' });
      doc.y = yLogo + logoAlto + 8;
    } catch {
      /* si el logo no es válido se omite sin fallar el PDF */
    }
  } else {
    doc.moveDown(0.8);
  }

  // Encabezado formal del empleador
  doc
    .fillColor(COLOR.texto)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('EL SUSCRITO GERENTE GENERAL', MARGEN_PDF, doc.y, { width: ancho, align: 'center' })
    .text(String(c.empleador ?? '').toUpperCase(), MARGEN_PDF, doc.y + 2, { width: ancho, align: 'center' });

  doc.moveDown(1.1);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(COLOR.primario)
    .text('CERTIFICA', MARGEN_PDF, doc.y, { width: ancho, align: 'center' })
    .moveDown(1);

  if (c.dirigidoA && c.dirigidoA.toUpperCase() !== 'A QUIEN INTERESE') {
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(`Dirigido a: ${c.dirigidoA.toUpperCase()}`, MARGEN_PDF, doc.y, { width: ancho })
      .moveDown(0.8);
  }

  const empresaTexto = [
    String(c.empleador ?? '').toUpperCase(),
    c.marcaComercial ? `(${c.marcaComercial})` : '',
    c.documentoEmpleador ? `Nit ${nitConPuntos(c.documentoEmpleador)}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (c.fechaRetiro) {
    const motivo = c.motivoRetiro ? `, por ${String(c.motivoRetiro).toLowerCase()}` : '';
    const tipoContratoRetiro = c.contrato ? ` (${c.contrato.replace(/^con /, '')})` : '';
    parrafo(
      `Que ${c.nombre}, identificado(a) con cédula de ciudadanía No. ${cedulaConPuntos(c.cedula)}, laboró en la empresa ${empresaTexto}, con el cargo de ${c.cargo}, desde el ${fechaLarga(c.fechaIngreso)} hasta el ${fechaLarga(c.fechaRetiro)}${motivo || tipoContratoRetiro}.`,
    );
  } else {
    const contrato = c.contrato ? `, ${c.contrato}${c.fechaFinContrato ? ` hasta el ${fechaLarga(c.fechaFinContrato)}` : ''}` : '';
    parrafo(
      `Que ${c.nombre}, identificado(a) con cédula de ciudadanía No. ${cedulaConPuntos(c.cedula)}, labora en la empresa ${empresaTexto}, con el cargo de ${c.cargo}, desde el ${fechaLarga(c.fechaIngreso)}${contrato}.`,
    );
  }

  if (c.salario !== null && c.salario !== undefined) {
    parrafo(
      `${c.fechaRetiro ? 'Su último salario básico mensual fue' : 'Devenga un salario básico mensual'} de ${pesos(c.salario)} (${c.salarioLetras}).`,
    );
  }

  parrafo(`Para constancia de lo anterior se firma${c.ciudad ? ` en ${c.ciudad}` : ''} ${fechaConstancia(c.fechaExpedicion)}.`);

  // Firma del empleador
  doc.moveDown(0.8);
  doc.fillColor(COLOR.texto).font('Helvetica').fontSize(11).text('Cordialmente,', MARGEN_PDF, doc.y, { width: ancho });

  let dibujoFirma = false;
  if (firmaBuffer) {
    try {
      doc.moveDown(0.4);
      const yImg = doc.y;
      doc.image(firmaBuffer, MARGEN_PDF, yImg, { width: 175 });
      doc.y = yImg + 62;
      dibujoFirma = true;
    } catch {
      /* si la firma no se puede decodificar, dibuja línea estándar */
    }
  }
  if (!dibujoFirma) {
    doc.moveDown(2.6);
    const yFirma = doc.y;
    doc
      .save()
      .moveTo(MARGEN_PDF, yFirma)
      .lineTo(MARGEN_PDF + 220, yFirma)
      .lineWidth(0.8)
      .strokeColor(COLOR.texto)
      .stroke()
      .restore();
    doc.moveDown(0.35);
  }

  const firmanteFinal = nombreFirma || c.firmante || c.empleador;
  const cargoFinal = cargoFirma || c.cargoFirmante || 'Empleador';
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR.texto).text(firmanteFinal, MARGEN_PDF, doc.y, { width: ancho });
  if (c.documentoEmpleador) {
    const ccBase = String(c.documentoEmpleador).split('-')[0];
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLOR.texto)
      .text(`C.C. ${cedulaConPuntos(ccBase)}`, MARGEN_PDF, doc.y, { width: ancho });
  }
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.suave).text(cargoFinal, MARGEN_PDF, doc.y, { width: ancho });

  // Bloque de verificación pública
  doc.moveDown(1.8);
  linea(doc);
  const url = `${appUrl}/verificar?codigo=${k.codigo}`;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLOR.primario)
    .text(`Código de verificación: ${k.codigo}`, MARGEN_PDF, doc.y, { width: ancho });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(COLOR.suave)
    .text(
      `Verifique su autenticidad en ${url}. La verificación solo confirma que el certificado es válido y su fecha de expedición; compare el resto de los datos con este documento.`,
      MARGEN_PDF,
      doc.y,
      { width: ancho, link: url },
    );
  return terminar();
}
