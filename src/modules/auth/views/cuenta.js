import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { escapar, htmlAviso, toast } from '/static/js/ui.js';
import { formularioClave, formularioCorreo } from './formularios-cuenta.js';

const me = await montarShell();

formularioClave(document.getElementById('zona-clave'), {
  alGuardar: () => toast('Contraseña actualizada. Se cerraron sus otras sesiones abiertas.'),
});

document.getElementById('correo-actual').innerHTML =
  `Correo actual: <strong>${escapar(me.usuario.correo)}</strong> <span class="pildora pildora--exito">${icono('ok')} Confirmado</span>`;

const zonaCorreo = document.getElementById('zona-correo');
formularioCorreo(zonaCorreo, {
  textoBoton: 'Cambiar correo',
  alEnviar: (correo) => {
    zonaCorreo.innerHTML = htmlAviso('info', `Le enviamos un enlace a ${correo}. El cambio se aplicará cuando lo abra. Mientras tanto seguimos usando su correo actual.`);
  },
});
