import { api, fijarCsrf } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import { activarVerClave, conCarga, datosFormulario, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

pintarIconos();
activarVerClave();

const form = document.getElementById('form-login');
const mensaje = document.getElementById('mensaje');
const q = new URLSearchParams(location.search);
const MOTIVOS = {
  inactividad: ['info', 'Su sesión se cerró por inactividad. Ingrese de nuevo.'],
  sesion: ['info', 'Su sesión terminó. Ingrese de nuevo.'],
  restablecida: ['exito', 'Contraseña actualizada. Ya puede ingresar.'],
};
if (MOTIVOS[q.get('motivo')]) mostrarAviso(mensaje, ...MOTIVOS[q.get('motivo')]);

// Solo se permite volver a rutas internas de la app (evita redirecciones abiertas).
const destino = () => {
  const v = q.get('volver');
  return v && /^\/[a-z0-9/_-]*(\?[\w=&%-]*)?$/i.test(v) && !v.startsWith('//') ? v : '/inicio';
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  mensaje.hidden = true;
  const datos = datosFormulario(form);
  const faltan = {};
  if (!datos.cedula.trim()) faltan.cedula = 'Escriba su número de cédula.';
  if (!datos.clave) faltan.clave = 'Escriba su contraseña.';
  if (Object.keys(faltan).length) return mostrarErrores(form, faltan);

  await conCarga(form.querySelector('[type=submit]'), async () => {
    try {
      const r = await api('/auth/login', { metodo: 'POST', datos });
      fijarCsrf(r.csrf);
      location.assign(r.primerIngreso ? '/bienvenida' : destino());
    } catch (err) {
      form.elements.clave.value = '';
      if (err.campos && Object.keys(err.campos).length) mostrarErrores(form, err.campos);
      else mostrarAviso(mensaje, 'error', err.message);
    }
  });
});
