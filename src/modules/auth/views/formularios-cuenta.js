// Formularios reutilizables de la cuenta: cambio de contraseña y registro de correo.
// Los usan la página de primer ingreso (bienvenida) y "Mi cuenta".
import { api } from '/static/js/api.js';
import { pintarIconos } from '/static/js/iconos.js';
import {
  activarRequisitosClave, activarVerClave, conCarga, datosFormulario, escapar,
  limpiarErrores, mostrarAviso, mostrarErrores,
} from '/static/js/ui.js';

function campoClave(id, etiqueta, autocompletar, extra = '') {
  return `<div class="campo">
    <label for="${id}">${etiqueta}</label>
    <div class="campo-icono">
      <span class="icono-lado"><span data-icono="llave"></span></span>
      <input class="entrada" id="${id}" name="${id}" type="password" autocomplete="${autocompletar}" required maxlength="128"
             aria-describedby="${id}-error${extra ? ` ${id}-req` : ''}">
      <button type="button" class="ver-clave" data-para="${id}"></button>
    </div>
    ${extra}
    <span class="error-campo" id="${id}-error"></span>
  </div>`;
}

export function formularioClave(contenedor, { etiquetaActual = 'Contraseña actual', textoBoton = 'Guardar contraseña', alGuardar }) {
  contenedor.innerHTML = `
    <div id="msg-clave" tabindex="-1" hidden></div>
    <form id="form-clave" novalidate>
      ${campoClave('actual', etiquetaActual, 'current-password')}
      ${campoClave('nueva', 'Nueva contraseña', 'new-password', `
        <ul class="lista-requisitos" id="nueva-req" aria-label="Requisitos">
          <li data-regla="largo">Mínimo 10 caracteres</li>
          <li data-regla="letras">Al menos una letra</li>
          <li data-regla="numeros">Al menos un número</li>
          <li>Que no contenga su cédula</li>
        </ul>`)}
      ${campoClave('confirmacion', 'Confirme la nueva contraseña', 'new-password')}
      <div class="formulario-acciones"><button class="btn" type="submit">${escapar(textoBoton)}</button></div>
    </form>`;
  pintarIconos(contenedor);
  activarVerClave(contenedor);
  const form = contenedor.querySelector('form');
  const msg = contenedor.querySelector('#msg-clave');
  activarRequisitosClave(form.elements.nueva, contenedor.querySelector('#nueva-req'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    msg.hidden = true;
    const datos = datosFormulario(form);
    const faltan = {};
    if (!datos.actual) faltan.actual = 'Escriba su contraseña actual.';
    if (!datos.nueva) faltan.nueva = 'Escriba la nueva contraseña.';
    if (datos.nueva && datos.confirmacion !== datos.nueva) faltan.confirmacion = 'Las contraseñas no coinciden.';
    if (Object.keys(faltan).length) return mostrarErrores(form, faltan);
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await api('/auth/cambiar-clave', { metodo: 'POST', datos });
        form.reset();
        await alGuardar?.(r);
      } catch (err) {
        if (Object.keys(err.campos ?? {}).length) mostrarErrores(form, err.campos);
        else mostrarAviso(msg, 'error', err.message);
      }
    });
  });
}

export function formularioCorreo(contenedor, { valorInicial = '', textoBoton = 'Enviar enlace de confirmación', alEnviar }) {
  contenedor.innerHTML = `
    <div id="msg-correo" tabindex="-1" hidden></div>
    <form id="form-correo" novalidate>
      <div class="campo">
        <label for="correo">Correo electrónico</label>
        <div class="campo-icono">
          <span class="icono-lado"><span data-icono="correo"></span></span>
          <input class="entrada" id="correo" name="correo" type="email" autocomplete="email" required maxlength="254"
                 value="${escapar(valorInicial)}" aria-describedby="correo-ayuda correo-error">
        </div>
        <span class="ayuda" id="correo-ayuda">Lo usaremos para avisarle de sus solicitudes y para recuperar su contraseña.</span>
        <span class="error-campo" id="correo-error"></span>
      </div>
      <div class="formulario-acciones"><button class="btn" type="submit">${escapar(textoBoton)}</button></div>
    </form>`;
  pintarIconos(contenedor);
  const form = contenedor.querySelector('form');
  const msg = contenedor.querySelector('#msg-correo');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    msg.hidden = true;
    const datos = datosFormulario(form);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) {
      return mostrarErrores(form, { correo: 'Escriba un correo válido, por ejemplo nombre@dominio.com.' });
    }
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await api('/auth/correo', { metodo: 'POST', datos });
        await alEnviar?.(datos.correo.trim().toLowerCase(), r);
      } catch (err) {
        if (Object.keys(err.campos ?? {}).length) mostrarErrores(form, err.campos);
        else mostrarAviso(msg, 'error', err.message);
      }
    });
  });
}
