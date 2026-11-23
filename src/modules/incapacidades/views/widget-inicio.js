// Tarjeta de Inicio: botón "Subir incapacidad" y, para el área contable, cuántas hay por revisar.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';

export async function montar(contenedor, me) {
  const [mias, porRevisar] = await Promise.all([
    api('/me/incapacidades').catch(() => ({ sinExpediente: true })),
    me.usuario.rol === 'ADMIN'
      ? api('/incapacidades/pendientes')
          .then((r) => r.pendientes)
          .catch(() => null)
      : null,
  ]);
  if (mias.sinExpediente && porRevisar === null) return;
  const t = document.createElement('section');
  t.className = 'tarjeta';
  t.setAttribute('aria-labelledby', 'w-incap');
  t.innerHTML = `<h2 id="w-incap">Incapacidades</h2>
    ${porRevisar !== null ? `<p><span class="contador-pendientes">${porRevisar}</span> incapacidad(es) por revisar.</p>` : ''}
    <div class="formulario-acciones">
      ${mias.sinExpediente ? '' : `<a class="btn" href="/incapacidades/nueva">${icono('subir')} Subir incapacidad</a>`}
      ${porRevisar !== null ? `<a class="btn ${porRevisar ? '' : 'btn--secundario'}" href="/incapacidades/equipo">${icono('salud')} Revisar incapacidades</a>` : ''}
    </div>`;
  contenedor.prepend(t);
}
