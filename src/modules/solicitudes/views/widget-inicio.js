// Tarjetas de Inicio: botones grandes para pedir (según los tipos activos), solicitudes en
// curso y, para directores y admincontable, cuántas esperan su aprobación.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { escapar } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

export async function montar(contenedor, me) {
  const [{ tipos }, mias] = await Promise.all([
    api('/solicitudes/tipos'),
    api('/me/solicitudes?estado=EN_CURSO').catch(() => ({ solicitudes: [] })),
  ]);
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta';
  tarjeta.setAttribute('aria-labelledby', 'w-solicitudes');
  const enCurso = mias.solicitudes.filter((s) => s.estado !== 'BORRADOR');
  tarjeta.innerHTML = `<h2 id="w-solicitudes">Solicitudes</h2>
    ${!mias.sinExpediente && tipos.length ? `<div class="acciones-grandes">${tipos.map((t) => `<a class="accion-grande" href="${escapar(t.rutaNueva)}">${icono(t.icono)} ${escapar(t.accion)}</a>`).join('')}</div>` : ''}
    <h3 class="subtitulo">En curso</h3>
    ${
      enCurso.length
        ? `<ul class="lista-compacta">${enCurso
            .slice(0, 4)
            .map(
              (s) => `<li>
        <a href="/solicitudes/ver?id=${s.id}">${escapar(s.tipoEtiqueta)}: ${escapar(s.subtipo ?? '')}</a>
        <span class="ayuda">${escapar(cuando(s))}</span> ${pildoraEstado(s.estado, s.estadoEtiqueta)}</li>`,
            )
            .join('')}</ul>`
        : '<p class="ayuda">No tiene solicitudes en trámite.</p>'
    }`;
  contenedor.prepend(tarjeta);

  if (['DIRECTOR', 'ADMIN'].includes(me.usuario.rol)) {
    const { pendientes } = await api('/aprobaciones/resumen').catch(() => ({ pendientes: 0 }));
    const t2 = document.createElement('section');
    t2.className = 'tarjeta';
    t2.setAttribute('aria-labelledby', 'w-aprob');
    t2.innerHTML = `<h2 id="w-aprob">Por aprobar</h2>
      <p><span class="contador-pendientes">${pendientes}</span> solicitud(es) esperan su aprobación.</p>
      <a class="btn ${pendientes ? '' : 'btn--secundario'}" href="/aprobaciones">${icono('ok')} Ir a aprobaciones</a>`;
    contenedor.prepend(t2);
  }
}
