// Pestaña "Nómina" del expediente: historial de volantes por año.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { copExacto, escapar, htmlAviso, periodoTexto } from '/static/js/ui.js';

export async function montar(panel, { propio, id, rol }) {
  if (!propio && rol !== 'ADMIN') {
    panel.innerHTML = `<div class="vacio">${icono('candado')}<h3>Información reservada</h3><p>Los volantes de pago solo los ven el colaborador y el área contable.</p></div>`;
    return;
  }
  const base = propio ? '/me/volantes' : `/nomina/colaboradores/${id}/volantes`;
  async function pintar(anio) {
    try {
      const r = await api(`${base}${anio ? `?anio=${anio}` : ''}`);
      if (!r.volantes.length) {
        panel.innerHTML = `<div class="vacio">${icono('recibo')}<h3>Sin volantes</h3><p>Aún no hay volantes de nómina ${propio ? 'publicados' : 'cargados'} para este colaborador.</p></div>`;
        return;
      }
      panel.innerHTML = `${r.anios.length > 1 ? `<div class="campo"><label for="anio-exp">Año</label><select class="entrada" id="anio-exp">${r.anios.map((a) => `<option ${a === r.anio ? 'selected' : ''}>${escapar(a)}</option>`).join('')}</select></div>` : ''}
        <table class="tabla"><thead><tr><th scope="col">Quincena</th><th scope="col">Periodo</th><th scope="col" class="num">Neto</th>${propio ? '' : '<th scope="col">Estado</th>'}<th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${r.volantes.map((v) => `<tr>
          <td data-etiqueta="Quincena">${escapar(v.hoja)}</td>
          <td data-etiqueta="Periodo">${escapar(periodoTexto(v.inicio, v.fin))}</td>
          <td data-etiqueta="Neto" class="num">${copExacto(v.neto)}</td>
          ${propio ? '' : `<td data-etiqueta="Estado">${v.estado === 'PUBLICADO' ? `<span class="pildora pildora--exito">${icono('ok')} Publicado</span>` : `<span class="pildora pildora--alerta">${icono('editar')} Borrador</span>`}</td>`}
          <td class="acciones"><a class="btn btn--chico btn--secundario" href="/volantes/ver?id=${v.id}">Ver<span class="sr-only"> ${escapar(v.hoja)}</span></a>
            <a class="btn btn--chico btn--fantasma" href="/api/v1/volantes/${v.id}/pdf?descargar=1">${icono('descargar')} PDF<span class="sr-only"> ${escapar(v.hoja)}</span></a></td>
        </tr>`).join('')}</tbody></table>`;
      panel.querySelector('#anio-exp')?.addEventListener('change', (e) => pintar(e.target.value));
    } catch (err) {
      panel.innerHTML = htmlAviso('error', err.message);
    }
  }
  await pintar();
}
