// Flujos de aprobación por tipo de solicitud. Guardar crea una versión NUEVA: las solicitudes que
// ya están en trámite terminan con la versión con la que se enviaron.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, htmlAviso, toast } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const OPCIONES = {
  DIRECTOR_ADMIN: { texto: 'Director de la sede y luego área contable', pasos: [{ rol: 'DIRECTOR' }, { rol: 'ADMIN' }] },
  ADMIN: { texto: 'Solo el área contable', pasos: [{ rol: 'ADMIN' }] },
  DIRECTOR: { texto: 'Solo el director de la sede', pasos: [{ rol: 'DIRECTOR' }] },
};
const claveDe = (pasos) => pasos.map((p) => p.rol).join('_');

try {
  const { tipos } = await api('/solicitudes/tipos');
  const flujos = await Promise.all(tipos.map((t) => api(`/flujos/${t.tipo}`)));
  zona.innerHTML = `${htmlAviso('info', 'Cambiar un flujo no afecta las solicitudes que ya están en trámite. Si una sede no tiene director, ese paso se omite automáticamente.')}
    ${tipos
      .map(
        (t, i) => `<section class="tarjeta" aria-labelledby="t-${t.tipo}">
      <h2 id="t-${t.tipo}" tabindex="-1">${icono(t.icono)} ${escapar(t.etiqueta)} <span class="ayuda">(versión ${flujos[i].version})</span></h2>
      <form data-tipo="${t.tipo}" novalidate><fieldset class="campo"><legend>¿Quién aprueba?</legend><div class="opciones-hojas">
        ${Object.entries(OPCIONES)
          .map(
            ([k, o]) =>
              `<label><input type="radio" name="flujo" value="${k}" ${claveDe(flujos[i].pasos) === k ? 'checked' : ''}><span>${escapar(o.texto)}</span></label>`,
          )
          .join('')}
      </div></fieldset>
      <div class="formulario-acciones"><button class="btn" type="submit">${icono('ok')} Guardar flujo de ${escapar(t.etiqueta.toLowerCase())}</button></div></form>
    </section>`,
      )
      .join('')}`;
  zona.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const o = OPCIONES[f.flujo.value];
    if (
      !(await confirmar({
        titulo: 'Guardar flujo',
        mensaje: `Las nuevas solicitudes las aprobará: ${o.texto.toLowerCase()}. ¿Guardar?`,
        aceptar: 'Guardar',
      }))
    )
      return;
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await api(`/flujos/${f.dataset.tipo}`, { metodo: 'PUT', datos: { pasos: o.pasos } });
        toast(`Flujo guardado (versión ${r.version}).`);
        const h = document.getElementById(`t-${f.dataset.tipo}`);
        h.querySelector('.ayuda').textContent = `(versión ${r.version})`;
        h.focus();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
} finally {
  zona.removeAttribute('aria-busy');
}
