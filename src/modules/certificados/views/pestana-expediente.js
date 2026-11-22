// Pestaña "Documentos" del expediente: certificados emitidos. El admincontable puede generar uno a
// nombre del colaborador (también si está retirado) y anularlos. El director no tiene acceso.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { activarAnular, activarFormulario, htmlFormulario, htmlLista } from '/m/certificados/comun.js';

export async function montar(panel, { propio, id, rol }) {
  if (!propio && rol === 'DIRECTOR') {
    panel.innerHTML = `<div class="vacio">${icono('candado')}<h3>Reservado</h3><p>Los certificados solo los ven el colaborador y el área contable.</p></div>`;
    return;
  }
  const ruta = propio ? '/me/certificados' : `/colaboradores/${id}/certificados`;
  const admin = !propio && rol === 'ADMIN';
  const pintar = async () => {
    try {
      panel.querySelector('#doc-lista').innerHTML = htmlLista((await api(ruta)).certificados, { puedeAnular: rol === 'ADMIN' });
    } catch (err) {
      panel.querySelector('#doc-lista').innerHTML = htmlAviso('error', err.message);
    }
  };
  panel.innerHTML = `<h3 class="subtitulo" id="doc-titulo" tabindex="-1">Certificados laborales</h3>
    ${admin ? `<details class="tarjeta-interna"><summary>${icono('agregar')} Generar certificado a su nombre</summary>${htmlFormulario('doc')}</details>` : propio ? `<p><a class="btn btn--secundario" href="/certificados">${icono('documento')} Generar certificado</a></p>` : ''}
    <div id="doc-lista"></div>`;
  await pintar();
  if (admin) activarFormulario(panel.querySelector('#doc-f'), `/colaboradores/${id}/certificados/laboral`, pintar, 'doc-titulo');
  if (rol === 'ADMIN') activarAnular(panel, pintar, 'doc-titulo');
}