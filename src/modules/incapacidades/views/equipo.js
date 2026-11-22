// Incapacidades del equipo. Director: solo nombre, fechas y días de sus sedes (el servidor no
// envía nada más). Admincontable: todas, con filtro por estado, para revisarlas.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { tabla } from '/m/incapacidades/comun.js';

const me = await montarShell();
const zona = document.getElementById('zona');
const esAdmin = me.usuario.rol === 'ADMIN';
let estado = esAdmin ? 'REGISTRADA' : '';

zona.innerHTML = `<section class="tarjeta">
  ${esAdmin ? `<form class="filtros filtros--simple" role="search"><div class="campo"><label for="estado">Estado</label>
    <select class="entrada" id="estado"><option value="REGISTRADA">En revisión</option><option value="VALIDADA">Validadas</option>
    <option value="DEVUELTA">Devueltas</option><option value="ANULADA">Anuladas</option><option value="">Todas</option></select></div></form>`
    : `<p class="ayuda">${icono('candado')} Por protección de datos de salud solo se muestran las fechas.</p>`}
  <p class="ayuda" id="conteo" aria-live="polite"></p>
  <div id="lista" aria-busy="true"></div></section>`;
zona.removeAttribute('aria-busy');
const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');

async function cargar() {
  try {
    const r = await api(`/incapacidades${estado ? `?estado=${estado}` : ''}`);
    conteo.textContent = `${r.incapacidades.length} incapacidad(es).`;
    lista.innerHTML = r.incapacidades.length ? tabla(r.incapacidades, { soloFechas: r.soloFechas, conColaborador: true })
      : `<div class="vacio">${icono('ok')}<h3>Sin incapacidades</h3><p>${esAdmin && estado === 'REGISTRADA' ? 'No hay incapacidades por revisar.' : 'No hay registros.'}</p></div>`;
  } catch (err) {
    lista.innerHTML = htmlAviso('error', err.message);
  } finally {
    lista.removeAttribute('aria-busy');
  }
}
document.getElementById('estado')?.addEventListener('change', (e) => {
  estado = e.target.value;
  cargar();
});
cargar();
let espera;
addEventListener('th:cambio', (e) => {
  if (!['incapacidad', 'notificacion'].includes(e.detail?.tipo)) return;
  clearTimeout(espera);
  espera = setTimeout(cargar, 400);
});