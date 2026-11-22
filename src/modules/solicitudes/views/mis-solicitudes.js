// Lista de MIS solicitudes de un tipo (lo usan permisos, vacaciones y licencias).
// La página indica el tipo con <body data-tipo="PERMISO" data-nueva="/permisos/nuevo">.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { escapar, fechaHora, htmlAviso } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

await montarShell();
const { tipo, nueva, etiqueta } = document.body.dataset;
const zona = document.getElementById('zona');

async function cargar() {
  try {
    const r = await api(`/me/solicitudes?tipo=${encodeURIComponent(tipo)}`);
    if (r.sinExpediente) {
      zona.innerHTML = htmlAviso('info', 'Su cuenta no tiene expediente de colaborador; no puede hacer solicitudes.');
      return;
    }
    const enCurso = r.solicitudes.filter((s) => !s.final && s.estado !== 'BORRADOR').length;
    zona.innerHTML = `
      <section class="tarjeta">
        <div class="acciones-grandes acciones-grandes--una">
          <a class="accion-grande" href="${escapar(nueva)}">${icono('agregar')} Nueva solicitud de ${escapar(etiqueta.toLowerCase())}</a>
        </div>
        ${enCurso ? `<p class="ayuda">${enCurso} solicitud(es) en trámite.</p>` : ''}
      </section>
      <section class="tarjeta" aria-labelledby="t-hist"><h2 id="t-hist">Historial</h2>
      ${r.solicitudes.length ? `<ul class="lista-volantes">${r.solicitudes.map((s) => `<li class="item-volante">
          <div><div class="item-volante__periodo">${escapar(s.subtipo ?? s.tipoEtiqueta)}</div>
            <div class="ayuda">${escapar(cuando(s))} · solicitada ${escapar(fechaHora(s.creadoEn))}</div></div>
          ${pildoraEstado(s.estado, s.estadoEtiqueta)}
          <a class="btn btn--chico btn--secundario" href="/solicitudes/ver?id=${s.id}">Ver detalle<span class="sr-only"> de ${escapar(s.subtipo ?? '')} ${escapar(cuando(s))}</span></a>
        </li>`).join('')}</ul>`
        : `<div class="vacio">${icono('reloj')}<h3>Aún no tiene solicitudes</h3><p>Use el botón de arriba para hacer la primera. Verá aquí cómo avanza.</p></div>`}
      </section>`;
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  }
}
cargar();
// Tiempo real: si cambia alguna solicitud, se refresca la lista
addEventListener('th:cambio', (e) => {
  if (e.detail?.tipo === 'solicitud' || e.detail?.tipo === 'notificacion') cargar();
});
