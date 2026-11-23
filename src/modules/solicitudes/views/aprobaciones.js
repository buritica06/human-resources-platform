// Bandeja de aprobaciones (director: su paso y sus sedes; admincontable: el paso contable).
// El filtro y la región de anuncios se pintan una sola vez; al cambiar algo (tiempo real) solo
// se refresca la lista, con una espera corta para agrupar avisos seguidos.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { escapar, fechaHora, htmlAviso } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

await montarShell();
const zona = document.getElementById('zona');
let filtro = '';

try {
  const { tipos } = await api('/solicitudes/tipos');
  zona.innerHTML = `<section class="tarjeta">
    <form class="filtros filtros--simple" role="search">
      <div class="campo"><label for="tipo">Tipo</label><select class="entrada" id="tipo">
        <option value="">Todos</option>${tipos.map((t) => `<option value="${escapar(t.tipo)}">${escapar(t.etiqueta)}</option>`).join('')}</select></div>
    </form>
    <p class="ayuda" id="conteo" aria-live="polite"></p>
    <div id="lista" aria-busy="true"></div>
  </section>`;
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
  throw err;
} finally {
  zona.removeAttribute('aria-busy');
}
const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');

async function cargar() {
  try {
    const { solicitudes } = await api(`/aprobaciones${filtro ? `?tipo=${filtro}` : ''}`);
    conteo.textContent = `${solicitudes.length} pendiente(s) de su aprobación.`;
    lista.innerHTML = solicitudes.length
      ? `<table class="tabla"><thead><tr><th scope="col">Colaborador</th><th scope="col">Solicitud</th><th scope="col">Cuándo</th><th scope="col">Estado</th><th scope="col">Enviada</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${solicitudes
        .map(
          (s) => `<tr>
        <td data-etiqueta="Colaborador">${escapar(s.colaborador.nombre)}<br><span class="ayuda">${escapar(s.colaborador.cargo ?? '')}</span></td>
        <td data-etiqueta="Solicitud">${escapar(s.tipoEtiqueta)}: ${escapar(s.subtipo ?? '')}</td>
        <td data-etiqueta="Cuándo">${escapar(cuando(s))}</td>
        <td data-etiqueta="Estado">${pildoraEstado(s.estado, s.estadoEtiqueta)}</td>
        <td data-etiqueta="Enviada">${escapar(fechaHora(s.enviadoEn))}</td>
        <td class="acciones"><a class="btn btn--chico" href="/solicitudes/ver?id=${s.id}">Revisar<span class="sr-only"> solicitud de ${escapar(s.colaborador.nombre)}</span></a></td>
      </tr>`,
        )
        .join('')}</tbody></table>`
      : `<div class="vacio">${icono('ok')}<h3>Todo al día</h3><p>No tiene solicitudes pendientes. Le avisaremos cuando llegue una nueva.</p></div>`;
  } catch (err) {
    lista.innerHTML = htmlAviso('error', err.message);
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

document.getElementById('tipo').addEventListener('change', (e) => {
  filtro = e.target.value;
  cargar();
});
cargar();

let espera = null;
addEventListener('th:cambio', (e) => {
  if (!['solicitud', 'notificacion'].includes(e.detail?.tipo)) return;
  clearTimeout(espera);
  espera = setTimeout(cargar, 400);
});
