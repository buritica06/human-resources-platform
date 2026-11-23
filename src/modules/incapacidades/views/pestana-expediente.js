// Pestaña "Incapacidades" del expediente. Director: solo fechas (el servidor no envía más).
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { tabla } from '/m/incapacidades/comun.js';

export async function montar(panel, { propio, id, rol }) {
  try {
    const r = propio ? { ...(await api('/me/incapacidades')), soloFechas: false } : await api(`/colaboradores/${id}/incapacidades`);
    panel.innerHTML = `${r.soloFechas ? `<p class="ayuda">${icono('candado')} Por protección de datos de salud solo se muestran las fechas.</p>` : ''}
      ${!propio && rol === 'ADMIN' ? `<p><a class="btn btn--secundario" href="/incapacidades/nueva?colaborador=${id}">${icono('subir')} Registrar incapacidad a su nombre</a></p>` : ''}
      ${r.incapacidades.length ? tabla(r.incapacidades, { soloFechas: r.soloFechas }) : `<div class="vacio">${icono('salud')}<h3>Sin incapacidades</h3><p>No hay incapacidades registradas.</p></div>`}`;
  } catch (err) {
    panel.innerHTML = htmlAviso('error', err.message);
  }
}
