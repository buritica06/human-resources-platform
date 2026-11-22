// La confirmación exige pulsar un botón (POST). Así los antivirus o vistas previas de
// correo que abren enlaces, incluso ejecutando JavaScript, no consumen el token.
import { api } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import { conCarga, htmlAviso } from '/static/js/ui.js';

pintarIconos();
const zona = document.getElementById('resultado');
const boton = document.getElementById('confirmar');
const token = new URLSearchParams(location.search).get('token') ?? '';
history.replaceState(null, '', '/verificar-correo');

if (token.length < 20) {
  zona.innerHTML = htmlAviso('error', 'El enlace está incompleto. Ábralo de nuevo desde el correo.')
    + '<a class="btn btn--secundario" href="/bienvenida">Solicitar un nuevo enlace</a>';
} else {
  boton.addEventListener('click', () =>
    conCarga(boton, async () => {
      try {
        await api('/auth/verificar-correo', { metodo: 'POST', datos: { token } });
        zona.innerHTML = htmlAviso('exito', 'Su correo quedó confirmado.') + '<a class="btn" href="/inicio">Continuar</a>';
      } catch (err) {
        zona.innerHTML = htmlAviso('error', err.message) + '<a class="btn btn--secundario" href="/bienvenida">Solicitar un nuevo enlace</a>';
      }
      zona.querySelector('a')?.focus();
    }),
  );
}
