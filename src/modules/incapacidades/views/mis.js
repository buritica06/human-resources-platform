// Mis incapacidades: botón para registrar y lista propia.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { tabla } from '/m/incapacidades/comun.js';

await montarShell();
const zona = document.getElementById('zona');

async function cargar() {
  try {
    const r = await api('/me/incapacidades');
    if (r.sinExpediente) {
      zona.innerHTML = htmlAviso('info', 'Su cuenta no tiene expediente de colaborador; no puede registrar incapacidades.');
      return;
    }
    zona.innerHTML = `<section class="tarjeta">
        <div class="acciones-grandes acciones-grandes--una"><a class="accion-grande" href="/incapacidades/nueva">${icono('subir')} Subir incapacidad</a></div>
        <p class="ayuda">${icono('candado')} Su diagnóstico y el certificado solo los ven usted y el área contable. Su director solo ve las fechas.</p>
      </section>
      <section class="tarjeta" aria-labelledby="t-hist"><h2 id="t-hist">Historial</h2>
        ${r.incapacidades.length ? tabla(r.incapacidades) : `<div class="vacio">${icono('salud')}<h3>No tiene incapacidades registradas</h3><p>Si le dan una incapacidad, súbala con el botón de arriba.</p></div>`}
      </section>`;
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}
cargar();
addEventListener('th:cambio', (e) => {
  if (['incapacidad', 'notificacion'].includes(e.detail?.tipo)) cargar();
});