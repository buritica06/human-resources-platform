// PDF del volante de pago: mismos datos que la pantalla (solo los conceptos que tiene).
import { crearDocumento, datos, tabla, titulo2, pesos, fechaCorta, linea, asegurarEspacio, COLOR, MARGEN_PDF } from '../../core/pdf.js';

const cantidad = (l) => (l.cantidad === null || l.cantidad === undefined ? '' : `${String(l.cantidad).replace('.', ',')} ${l.unidad ?? ''}`.trim());

export async function pdfVolante(v) {
  const { doc, ancho, terminar } = crearDocumento({
    titulo: 'Comprobante de pago de nómina',
    subtitulo: `Periodo del ${fechaCorta(v.periodo.inicio)} al ${fechaCorta(v.periodo.fin)} · ${v.periodo.hoja}`,
    empresa: v.empleador.nombre,
    documentoEmpresa: v.empleador.documento ? `C.C. / NIT ${v.empleador.documento}` : null,
  });
  if (v.periodo.estado !== 'PUBLICADO') {
    doc.save().fillColor('#B3261E').font('Helvetica-Bold').fontSize(10).text(`VISTA PREVIA – periodo ${v.periodo.estado.toLowerCase()}`).restore();
    doc.moveDown(0.3);
  }

  titulo2(doc, 'Colaborador');
  datos(doc, [
    ['Nombre', v.colaborador.nombre], ['Cédula', v.colaborador.cedula],
    ['Cargo', v.colaborador.cargo], ['Sede', v.colaborador.sede],
    ['Salario base mensual', pesos(v.salarioBase)], ['Rango o nivel', v.colaborador.rango],
    ['Días laborados', v.dias === null ? '' : String(v.dias).replace('.', ',')], ['EPS / AFP', [v.colaborador.eps, v.colaborador.afp].filter(Boolean).join(' / ')],
  ]);

  const cols = [{ titulo: 'Concepto', ancho: 0.55 }, { titulo: 'Cantidad', ancho: 0.2, alinear: 'right' }, { titulo: 'Valor', ancho: 0.25, alinear: 'right' }];
  const filas = (lineas) => lineas.flatMap((l) => [
    [l.etiqueta, cantidad(l), pesos(l.valor)],
    ...(l.detalle ?? []).map((d) => [`   · ${d.etiqueta}`, cantidad(d), '']),
  ]);
  if (v.devengados.length) {
    titulo2(doc, 'Devengados');
    tabla(doc, cols, filas(v.devengados), { totales: ['Total devengado', '', pesos(v.totalDevengado)] });
  }
  if (v.deducciones.length) {
    titulo2(doc, 'Deducciones');
    tabla(doc, cols, filas(v.deducciones), { totales: ['Total deducciones', '', pesos(v.totalDeducido)] });
  }

  asegurarEspacio(doc, 50);
  const y = doc.y + 4;
  doc.save().rect(MARGEN_PDF, y, ancho, 34).fill(COLOR.fondo).restore();
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(13)
    .text('NETO A PAGAR', MARGEN_PDF + 10, y + 10, { width: ancho / 2 })
    .text(pesos(v.neto), MARGEN_PDF + ancho / 2, y + 10, { width: ancho / 2 - 10, align: 'right' });
  doc.y = y + 44;

  if (v.adicionales.length) {
    titulo2(doc, 'Pagos adicionales (liquidados aparte)');
    tabla(doc, cols, filas(v.adicionales), { totales: ['Total pagos adicionales', '', pesos(v.totalAdicional)] });
  }
  if (v.observacion) {
    titulo2(doc, 'Observaciones');
    doc.fillColor(COLOR.texto).font('Helvetica').fontSize(9).text(v.observacion, { width: ancho });
  }
  doc.moveDown(1);
  linea(doc);
  doc.fillColor(COLOR.suave).font('Helvetica').fontSize(8).text(
    'Los valores provienen de la nómina liquidada por el área contable. Si encuentra una diferencia, comuníquese con el área contable.',
    { width: ancho },
  );
  return terminar();
}
