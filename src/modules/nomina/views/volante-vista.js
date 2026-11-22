// HTML del volante (lo usan la página del volante y la vista previa del admin).
import { icono } from '/static/js/iconos.js';
import { copExacto, escapar, periodoTexto } from '/static/js/ui.js';

const cantidad = (l) => (l.cantidad === null || l.cantidad === undefined ? '' : `${String(l.cantidad).replace('.', ',')} ${escapar(l.unidad ?? '')}`);

function tablaConceptos(titulo, lineas, total, etiquetaTotal) {
  if (!lineas.length) return '';
  return `<section class="grupo-datos" aria-label="${escapar(titulo)}"><h3>${escapar(titulo)}</h3>
    <table class="tabla tabla--volante"><thead><tr><th scope="col">Concepto</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Valor</th></tr></thead>
    <tbody>${lineas.map((l) => `<tr>
        <td data-etiqueta="Concepto">${escapar(l.etiqueta)}
          ${l.detalle?.length ? `<ul class="desglose">${l.detalle.map((d) => `<li>${escapar(d.etiqueta)}: ${cantidad(d)}</li>`).join('')}</ul>` : ''}</td>
        <td data-etiqueta="Cantidad" class="num">${cantidad(l) || '<span class="sr-only">Sin cantidad</span>'}</td>
        <td data-etiqueta="Valor" class="num">${copExacto(l.valor)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row" colspan="2">${escapar(etiquetaTotal)}</th><td class="num" data-etiqueta="${escapar(etiquetaTotal)}"><strong>${copExacto(total)}</strong></td></tr></tfoot></table></section>`;
}

export function htmlVolante(v, { esAdmin = false } = {}) {
  const pdf = `/api/v1/volantes/${v.id}/pdf`;
  const borrador = v.periodo.estado !== 'PUBLICADO';
  return `
    <section class="tarjeta" aria-labelledby="v-titulo">
      <header class="encabezado-tarjeta">
        <div><h2 id="v-titulo">${escapar(v.periodo.hoja)}</h2>
          <p class="ayuda">Del ${escapar(periodoTexto(v.periodo.inicio, v.periodo.fin))}${v.empleador.nombre ? ` · ${escapar(v.empleador.nombre)}` : ''}</p></div>
        <div class="formulario-acciones">
          <a class="btn" href="${pdf}?descargar=1">${icono('descargar')} Descargar PDF</a>
          <a class="btn btn--secundario" href="${pdf}" target="_blank" rel="noopener">${icono('pdf')} Ver PDF</a>
        </div>
      </header>
      ${borrador ? `<p class="aviso aviso--alerta">${icono('alerta')}<span>Vista previa: este periodo está en <strong>${escapar(v.periodo.estado.toLowerCase())}</strong>; el colaborador ${v.periodo.estado === 'BORRADOR' ? 'aún no lo ve' : 'no lo ve'}.</span></p>` : ''}
      <dl class="datos">
        <div class="dato"><dt>Colaborador</dt><dd>${escapar(v.colaborador.nombre)}</dd></div>
        <div class="dato"><dt>Cédula</dt><dd>${escapar(v.colaborador.cedula)}</dd></div>
        <div class="dato"><dt>Cargo</dt><dd>${escapar(v.colaborador.cargo ?? '—')}</dd></div>
        <div class="dato"><dt>Sede</dt><dd>${escapar(v.colaborador.sede ?? '—')}</dd></div>
        <div class="dato"><dt>Salario base mensual</dt><dd>${v.salarioBase === null ? '—' : copExacto(v.salarioBase)}</dd></div>
        ${v.colaborador.rango ? `<div class="dato"><dt>Rango o nivel</dt><dd>${escapar(v.colaborador.rango)}</dd></div>` : ''}
        <div class="dato"><dt>Días laborados</dt><dd>${v.dias === null ? '—' : escapar(String(v.dias).replace('.', ','))}</dd></div>
      </dl>
      ${tablaConceptos('Devengados', v.devengados, v.totalDevengado, 'Total devengado')}
      ${tablaConceptos('Deducciones', v.deducciones, v.totalDeducido, 'Total deducciones')}
      <div class="neto" role="status"><span>Neto a pagar</span><strong>${copExacto(v.neto)}</strong></div>
      ${tablaConceptos('Pagos adicionales (liquidados aparte)', v.adicionales, v.totalAdicional, 'Total pagos adicionales')}
      ${v.observacion ? `<section class="grupo-datos"><h3>Observaciones</h3><p>${escapar(v.observacion)}</p></section>` : ''}
      <p class="ayuda">Los valores provienen de la nómina liquidada por el área contable${esAdmin ? '' : '. Si encuentra una diferencia, comuníquese con el área contable'}.</p>
    </section>`;
}
