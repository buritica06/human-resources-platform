// La confirmación se hace con POST (no con el GET del enlace) para que los
// antivirus o vistas previas de correo que abren enlaces no consuman el token.
import { api } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';

pintarIconos();
const zona = document.getElementById('resultado');
const token = new URLSearchParams(location.search).get('token') ?? '';
history.replaceState(null, '', '/verificar-correo');

try {
  await api('/auth/verificar-correo', { metodo: 'POST', datos: { token } });
  zona.innerHTML = htmlAviso('exito', 'Su correo quedó confirmado.') + '<a class="btn" href="/inicio">Continuar</a>';
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message) + '<a class="btn btn--secundario" href="/bienvenida">Solicitar un nuevo enlace</a>';
}
