// Tarjeta "Vacaciones disponibles" de la página de Inicio.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { dias } from '/m/vacaciones/tarjeta-saldo.js';

export async function montar(contenedor) {
  let s;
  try {
    s = await api('/me/vacaciones/saldo');
  } catch {
    return;
  }
  if (s.sinExpediente) return;
  const t = document.createElement('section');
  t.className = 'tarjeta';
  t.setAttribute('aria-labelledby', 'w-vacaciones');
  t.innerHTML = s.registrado
    ? `<h2 id="w-vacaciones">Vacaciones</h2>
       <p class="pildora pildora--info">${icono('sombrilla')} Vacaciones disponibles: ${dias(s.paraSolicitar)} días</p>
       ${s.enTramite ? `<p class="ayuda">${dias(s.enTramite)} día(s) en solicitudes en trámite.</p>` : ''}
       <div class="formulario-acciones">
         <a class="btn" href="/vacaciones/nueva">${icono('sombrilla')} Solicitar vacaciones</a>
         <a class="btn btn--secundario" href="/vacaciones">Ver detalle</a>
       </div>`
    : `<h2 id="w-vacaciones">Vacaciones</h2><p class="ayuda">El área contable aún no ha registrado su saldo de vacaciones.</p>`;
  contenedor.prepend(t);
}
