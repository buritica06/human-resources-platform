// Utilidades comunes de las pantallas de incapacidades.
import { icono } from '/static/js/iconos.js';
import { escapar, fecha } from '/static/js/ui.js';

const ESTILO = { REGISTRADA: ['alerta', 'reloj'], VALIDADA: ['exito', 'ok'], DEVUELTA: ['error', 'cerrar'], ANULADA: ['neutro', 'cancelar'] };
export function pildora(estado, etiqueta) {
  const [clase, ic] = ESTILO[estado] ?? ['info', 'info'];
  return `<span class="pildora pildora--${clase}">${icono(ic)} ${escapar(etiqueta ?? estado)}</span>`;
}
export const periodo = (i) => `${fecha(i.fechaInicio)} al ${fecha(i.fechaFin)} · ${i.dias} día(s)`;

// Tabla de incapacidades. soloFechas: vista del director (sin tipo, estado ni enlaces).
export function tabla(lista, { soloFechas = false, conColaborador = false } = {}) {
  return `<table class="tabla"><thead><tr>
    ${conColaborador ? '<th scope="col">Colaborador</th>' : ''}
    <th scope="col">Fechas</th><th scope="col">Días</th>
    ${soloFechas ? '' : '<th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th>'}
  </tr></thead><tbody>${lista.map((i) => `<tr>
    ${conColaborador ? `<td data-etiqueta="Colaborador">${escapar(i.colaborador.nombre)}<br><span class="ayuda">${escapar(i.colaborador.sede ?? '')}${i.colaborador.cargo ? ` · ${escapar(i.colaborador.cargo)}` : ''}</span></td>` : ''}
    <td data-etiqueta="Fechas">${escapar(fecha(i.fechaInicio))} al ${escapar(fecha(i.fechaFin))}</td>
    <td data-etiqueta="Días">${i.dias}</td>
    ${soloFechas ? '' : `<td data-etiqueta="Tipo">${escapar(i.tipoEtiqueta)}${i.prorrogaDe ? ' <span class="ayuda">(prórroga)</span>' : ''}</td>
      <td data-etiqueta="Estado">${pildora(i.estado, i.estadoEtiqueta)}</td>
      <td class="acciones"><a class="btn btn--chico btn--secundario" href="/incapacidades/ver?id=${i.id}">Ver<span class="sr-only"> incapacidad del ${escapar(fecha(i.fechaInicio))}</span></a></td>`}
  </tr>`).join('')}</tbody></table>`;
}