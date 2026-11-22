import { api } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import { conCarga, datosFormulario, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

pintarIconos();
const form = document.getElementById('form');
const mensaje = document.getElementById('mensaje');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const datos = datosFormulario(form);
  if (!datos.cedula.trim()) return mostrarErrores(form, { cedula: 'Escriba su número de cédula.' });
  await conCarga(form.querySelector('[type=submit]'), async () => {
    try {
      const r = await api('/auth/recuperar', { metodo: 'POST', datos });
      form.hidden = true;
      mostrarAviso(mensaje, 'exito', r.mensaje);
    } catch (err) {
      if (Object.keys(err.campos ?? {}).length) mostrarErrores(form, err.campos);
      else mostrarAviso(mensaje, 'error', err.message);
    }
  });
});
