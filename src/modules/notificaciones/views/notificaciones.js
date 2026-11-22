// Bandeja de notificaciones (campana).
import { api } from '/static/js/api.js';
import { montarShell, actualizarCampana } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fechaHora, htmlAviso } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');

async function cargar() {
  try {
    const { notificaciones } = await api('/notificaciones');
    const noLeidas = notificaciones.filter((n) => !n.leida).length;
    zona.innerHTML = `<section class="tarjeta">
      <header class="encabezado-tarjeta"><h2>${noLeidas} sin leer</h2>
        ${noLeidas ? '<button type="button" class="btn btn--chico btn--secundario" id="todas">Marcar todas como leídas</button>' : ''}</header>
      ${notificaciones.length ? `<ul class="lista-volantes">${notificaciones.map((n) => `<li class="item-volante ${n.leida ? '' : 'no-leida'}">
          <div><div class="item-volante__periodo">${n.leida ? '' : `<span class="pildora pildora--primario">${icono('campana')} Nueva</span> `}${escapar(n.titulo)}</div>
            ${n.mensaje ? `<div>${escapar(n.mensaje)}</div>` : ''}<div class="ayuda">${escapar(fechaHora(n.creadaEn))}</div></div>
          ${n.enlace && n.enlace.startsWith('/') && !n.enlace.startsWith('//') ? `<a class="btn btn--chico btn--secundario" href="${escapar(n.enlace)}" data-id="${n.id}">Ver<span class="sr-only"> ${escapar(n.titulo)}</span></a>` : ''}
        </li>`).join('')}</ul>`
        : `<div class="vacio">${icono('campana')}<h3>Sin notificaciones</h3><p>Aquí verá los avisos de sus solicitudes y aprobaciones.</p></div>`}
    </section>`;
    zona.querySelector('#todas')?.addEventListener('click', (e) => conCarga(e.currentTarget, async () => {
      await api('/notificaciones/leer', { metodo: 'POST', datos: { todas: true } });
      await cargar();
      actualizarCampana();
    }));
    // Al abrir una notificación, se marca como leída (antes de navegar, para que no se pierda)
    for (const a of zona.querySelectorAll('a[data-id]')) {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        await api('/notificaciones/leer', { metodo: 'POST', datos: { ids: [Number(a.dataset.id)] } }).catch(() => {});
        location.assign(a.getAttribute('href'));
      });
    }
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}
cargar();
addEventListener('th:cambio', (e) => {
  if (e.detail?.tipo === 'notificacion') cargar();
});
