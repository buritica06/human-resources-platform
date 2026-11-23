// Suspensiones dentro de la pestaña Licencias del expediente. Las ven el propio colaborador y el
// área contable (el director no: el servidor responde 404). El admincontable registra y anula.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fecha, htmlAviso, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';

export async function montar(div, { propio, id, rol }) {
  const admin = rol === 'ADMIN' && !propio;
  const ruta = propio ? '/me/suspensiones' : `/colaboradores/${id}/suspensiones`;
  const pintar = async () => {
    const { suspensiones } = await api(ruta);
    div.querySelector('#sus-lista').innerHTML = suspensiones.length
      ? `<table class="tabla"><thead><tr><th scope="col">Fechas</th><th scope="col">Días</th><th scope="col">Motivo</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${suspensiones
        .map(
          (s) => `<tr>
        <td data-etiqueta="Fechas">${escapar(fecha(s.fechaInicio))} al ${escapar(fecha(s.fechaFin))}${s.anulada ? ` <span class="pildora pildora--neutro">${icono('cancelar')} Anulada</span>` : ''}</td>
        <td data-etiqueta="Días">${s.dias}</td>
        <td data-etiqueta="Motivo">${escapar(s.motivo)}${s.anulada && s.motivoAnulacion ? `<br><span class="ayuda">Anulada: ${escapar(s.motivoAnulacion)}</span>` : ''}</td>
        <td class="acciones">${admin && !s.anulada ? `<button type="button" class="btn btn--chico btn--fantasma" data-anular-sus="${s.id}">Anular<span class="sr-only"> la suspensión del ${escapar(fecha(s.fechaInicio))}</span></button>` : ''}</td></tr>`,
        )
        .join('')}</tbody></table>`
      : '<p class="ayuda">Sin suspensiones registradas.</p>';
  };
  try {
    div.innerHTML = `<h3 class="subtitulo" id="sus-titulo" tabindex="-1">Suspensiones</h3>
      ${
        admin
          ? `<details class="tarjeta-interna"><summary>${icono('agregar')} Registrar suspensión</summary>
        <form id="sus-f" novalidate><p class="ayuda">Los días de suspensión no cuentan para causar vacaciones y no pueden cruzarse con otras ausencias.</p>
          <div class="rejilla rejilla--2">
            <div class="campo"><label for="sus-fi">Desde</label><input class="entrada" type="date" id="sus-fi" name="fecha_inicio" required aria-describedby="sus-fi-error"><span class="error-campo" id="sus-fi-error"></span></div>
            <div class="campo"><label for="sus-ff">Hasta</label><input class="entrada" type="date" id="sus-ff" name="fecha_fin" required aria-describedby="sus-ff-error"><span class="error-campo" id="sus-ff-error"></span></div>
          </div>
          <div class="campo"><label for="sus-m">Motivo</label><textarea class="entrada" id="sus-m" name="motivo" rows="2" maxlength="500" required aria-describedby="sus-m-error"></textarea><span class="error-campo" id="sus-m-error"></span></div>
          <div class="formulario-acciones"><button class="btn" type="submit">${icono('ok')} Registrar</button></div></form></details>`
          : ''
      }
      <div id="sus-lista"></div>`;
    await pintar();
  } catch (err) {
    if (err.status === 404) {
      div.innerHTML = '';
      return;
    }
    div.innerHTML = htmlAviso('error', err.message);
    return;
  }
  if (!admin) return;
  const f = div.querySelector('#sus-f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const datos = { fecha_inicio: f.fecha_inicio.value, fecha_fin: f.fecha_fin.value, motivo: f.motivo.value.trim() };
    const errores = {};
    if (!datos.fecha_inicio) errores.fecha_inicio = 'Escriba la fecha de inicio.';
    if (!datos.fecha_fin) errores.fecha_fin = 'Escriba la fecha final.';
    if (datos.motivo.length < 5) errores.motivo = 'Explique el motivo (mínimo 5 caracteres).';
    if (Object.keys(errores).length) return mostrarErrores(f, errores);
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        await api(`/colaboradores/${id}/suspensiones`, { metodo: 'POST', datos });
        toast('Suspensión registrada. Se le avisó al colaborador.');
        f.reset();
        f.closest('details').open = false;
        await pintar();
        div.querySelector('#sus-titulo').focus();
      } catch (err) {
        if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) toast(err.message, 'error');
      }
    });
  });
  div.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular-sus]');
    if (!b) return;
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'as-t');
    d.innerHTML = `<h2 id="as-t">Anular suspensión</h2><form novalidate><div class="campo"><label for="as-m">Motivo</label>
      <textarea class="entrada" id="as-m" name="motivo" rows="2" maxlength="300" aria-describedby="as-m-error"></textarea><span class="error-campo" id="as-m-error"></span></div>
      <div class="formulario-acciones"><button class="btn btn--peligro" type="submit">Anular</button><button class="btn btn--secundario" type="button" data-cerrar>Volver</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
    const fa = d.querySelector('form');
    fa.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpiarErrores(fa);
      if (fa.motivo.value.trim().length < 5) return mostrarErrores(fa, { motivo: 'Explique el motivo (mínimo 5 caracteres).' });
      await conCarga(fa.querySelector('[type=submit]'), async () => {
        try {
          await api(`/suspensiones/${b.dataset.anularSus}/anular`, { metodo: 'POST', datos: { motivo: fa.motivo.value.trim() } });
          d.close();
          toast('Suspensión anulada.');
          await pintar();
          div.querySelector('#sus-titulo').focus();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    d.showModal();
    fa.motivo.focus();
  });
}
