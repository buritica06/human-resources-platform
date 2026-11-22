// Primer ingreso: 1) cambiar la contraseña temporal, 2) registrar y confirmar el correo.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { formularioClave, formularioCorreo } from './formularios-cuenta.js';

let me = await montarShell({ permitirOnboarding: true });
const etapa = document.getElementById('etapa');
const titulo = document.getElementById('titulo');

function marcarPaso(n) {
  for (const i of [1, 2]) {
    const li = document.getElementById(`paso-${i}`);
    if (i === n) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    li.dataset.hecho = String(i < n);
  }
}

function pintar() {
  const u = me.usuario;
  if (u.cuentaLista) {
    location.replace('/inicio');
    return;
  }
  if (u.debeCambiarClave) {
    marcarPaso(1);
    etapa.innerHTML = `<h2>Paso 1: cree su contraseña</h2><div id="f"></div>`;
    formularioClave(etapa.querySelector('#f'), {
      etiquetaActual: 'Contraseña temporal',
      textoBoton: 'Guardar y continuar',
      alGuardar: async () => {
        me = await api('/auth/me');
        pintar();
        titulo.focus();
      },
    });
    return;
  }
  marcarPaso(2);
  etapa.innerHTML = `<h2>Paso 2: confirme su correo</h2><div id="f"></div>`;
  formularioCorreo(etapa.querySelector('#f'), { alEnviar: mostrarEspera });
}

function mostrarEspera(correo) {
  etapa.innerHTML = `
    <h2>${icono('correo')} Revise su correo</h2>
    ${htmlAviso('info', `Le enviamos un enlace a ${correo}. Ábralo para terminar. Si no lo ve, revise la carpeta de spam o correo no deseado.`)}
    <div class="formulario-acciones">
      <button type="button" class="btn" id="ya">Ya lo confirmé</button>
      <button type="button" class="btn btn--secundario" id="otro">Usar otro correo</button>
    </div>
    <div id="msg-espera" tabindex="-1" hidden></div>`;
  etapa.querySelector('#ya').addEventListener('click', async () => {
    me = await api('/auth/me');
    if (me.usuario.cuentaLista) location.assign('/inicio');
    else {
      const m = etapa.querySelector('#msg-espera');
      m.innerHTML = htmlAviso('alerta', 'Aún no vemos la confirmación. Abra el enlace del correo y vuelva a intentarlo.');
      m.hidden = false;
      m.focus();
    }
  });
  etapa.querySelector('#otro').addEventListener('click', () => {
    etapa.innerHTML = `<h2>Paso 2: confirme su correo</h2><div id="f"></div>`;
    formularioCorreo(etapa.querySelector('#f'), { valorInicial: correo, alEnviar: mostrarEspera });
  });
  etapa.querySelector('#ya').focus();
}

pintar();
