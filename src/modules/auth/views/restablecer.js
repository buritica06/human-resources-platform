import { api } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import {
  activarRequisitosClave,
  activarVerClave,
  conCarga,
  datosFormulario,
  htmlAviso,
  limpiarErrores,
  mostrarAviso,
  mostrarErrores,
} from '/static/js/ui.js';

pintarIconos();
activarVerClave();
const form = document.getElementById('form');
const mensaje = document.getElementById('mensaje');
activarRequisitosClave(form.elements.nueva, document.getElementById('nueva-req'));

// El token se saca de la URL y se borra de la barra de direcciones y del historial.
const token = new URLSearchParams(location.search).get('token') ?? '';
history.replaceState(null, '', '/restablecer');
if (token.length < 20) {
  form.hidden = true;
  mensaje.innerHTML =
    htmlAviso('error', 'El enlace está incompleto. Ábralo de nuevo desde el correo o solicite otro.') +
    '<a class="btn" href="/recuperar">Solicitar otro enlace</a>';
  mensaje.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const datos = datosFormulario(form);
  if (!datos.nueva) return mostrarErrores(form, { nueva: 'Escriba la nueva contraseña.' });
  if (datos.nueva !== datos.confirmacion) return mostrarErrores(form, { confirmacion: 'Las contraseñas no coinciden.' });
  await conCarga(form.querySelector('[type=submit]'), async () => {
    try {
      await api('/auth/restablecer', { metodo: 'POST', datos: { ...datos, token } });
      location.assign('/login?motivo=restablecida');
    } catch (err) {
      if (Object.keys(err.campos ?? {}).filter((k) => k !== 'token').length) mostrarErrores(form, err.campos);
      else mostrarAviso(mensaje, 'error', err.message);
    }
  });
});
