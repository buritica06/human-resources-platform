// Bandeja de aprobaciones (director: su paso y sus sedes; admincontable: todas las pendientes).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { escapar, fechaHora, htmlAviso } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

await montarShell();
const zona = document.getElementById('zona');
let filtro = '';

async function cargar() {
  try {
    const [{ solicitudes }, { tipos }] = await Promise.all([api(`/aprobaciones${filtro ? `?tipo=${filtro}` : ''}`), api('/solicitudes/tipos')]);
    zona.innerHTML = `<section class="tarjeta">
      <form class="filtros filtros--simple" id="filtros" role="search">
        <div class="campo"><label for="tipo">Tipo</label><select class="entrada" id="tipo">
          <option value="">Todos</option>${tipos.map((t) => `<option value="${escapar(t.tipo)}" ${t.tipo === filtro ? 'selected' : ''}>${escapar(t.etiqueta)}</option>`).join('')}</select></div>
      </form>
      <p class="ayuda" aria-live="polite">${solicitudes.length} pendiente(s) de su aprobación.</p>
      ${solicitudes.length ? `<table class="tabla"><thead><tr><th scope="col">Colaborador</th><th scope="col">Solicitud</th><th scope="col">Cuándo</th><th scope="col">Estado</th><th scope="col">Enviada</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${solicitudes.map((s) => `<tr>
          <td data-etiqueta="Colaborador">${escapar(s.colaborador.nombre)}<br><span class="ayuda">${escapar(s.colaborador.cargo ?? '')}</span></td>
          <td data-etiqueta="Solicitud">${escapar(s.tipoEtiqueta)}: ${escapar(s.subtipo ?? '')}</td>
          <td data-etiqueta="Cuándo">${escapar(cuando(s))}</td>
          <td data-etiqueta="Estado">${pildoraEstado(s.estado, s.estadoEtiqueta)}</td>
          <td data-etiqueta="Enviada">${escapar(fechaHora(s.enviadoEn))}</td>
          <td class="acciones"><a class="btn btn--chico" href="/solicitudes/ver?id=${s.id}">Revisar<span class="sr-only"> solicitud de ${escapar(s.colaborador.nombre)}</span></a></td>
        </tr>`).join('')}</tbody></table>`
        : `<div class="vacio">${icono('ok')}<h3>Todo al día</h3><p>No tiene solicitudes pendientes. Le avisaremos cuando llegue una nueva.</p></div>`}
    </section>`;
    zona.querySelector('#tipo').addEventListener('change', (e) => {
      filtro = e.target.value;
      cargar();
    });
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}
cargar();
addEventListener('th:cambio', (e) => {
  if (['solicitud', 'notificacion'].includes(e.detail?.tipo)) cargar();
});
