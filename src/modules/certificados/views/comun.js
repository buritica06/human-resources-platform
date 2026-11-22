// Formulario y lista de certificados (los usan "Certificados" y la pestaña del expediente).
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fechaHora, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';

export const htmlFormulario = (prefijo) => `<form id="${prefijo}-f" novalidate>
  <fieldset class="campo"><legend>¿Incluir el salario?</legend>
    <div class="opciones-hojas">
      <label><input type="radio" name="conSalario" value="no" checked><span>Sin salario <span class="ayuda">(cargo y tiempo de servicio)</span></span></label>
      <label><input type="radio" name="conSalario" value="si"><span>Con salario básico <span class="ayuda">(por ejemplo, para un crédito o un arriendo)</span></span></label>
    </div></fieldset>
  <div class="campo"><label for="${prefijo}-dirigido">Dirigido a (opcional)</label>
    <input class="entrada" id="${prefijo}-dirigido" name="dirigidoA" maxlength="100" placeholder="A QUIEN INTERESE" aria-describedby="${prefijo}-dirigido-ayuda ${prefijo}-dirigido-error">
    <span class="ayuda" id="${prefijo}-dirigido-ayuda">Por ejemplo, el nombre del banco. Si lo deja vacío dirá "A quien interese".</span>
    <span class="error-campo" id="${prefijo}-dirigido-error"></span></div>
  <div class="formulario-acciones"><button class="btn" type="submit">${icono('documento')} Generar certificado</button></div>
</form>`;

export function htmlLista(certificados, { puedeAnular = false } = {}) {
  if (!certificados.length) return `<div class="vacio">${icono('documento')}<h3>Aún no hay certificados</h3><p>Los certificados que genere aparecerán aquí para volver a descargarlos.</p></div>`;
  return `<table class="tabla"><thead><tr><th scope="col">Certificado</th><th scope="col">Código</th><th scope="col">Expedido</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
    <tbody>${certificados.map((k) => `<tr>
      <td data-etiqueta="Certificado">Laboral ${k.conSalario ? 'con salario' : 'sin salario'}<br><span class="ayuda">${escapar(k.dirigidoA ?? '')}</span>
        ${k.anulado ? `<br><span class="pildora pildora--neutro">${icono('cancelar')} Anulado</span>` : ''}</td>
      <td data-etiqueta="Código"><code>${escapar(k.codigo)}</code></td>
      <td data-etiqueta="Expedido">${escapar(fechaHora(k.emitidoEn))}</td>
      <td class="acciones">
        ${k.anulado ? '' : `<a class="btn btn--chico btn--secundario" href="/api/v1/certificados/${k.id}/pdf?descargar=1">${icono('descargar')} PDF<span class="sr-only"> del certificado ${escapar(k.codigo)}</span></a>`}
        ${puedeAnular && !k.anulado ? `<button type="button" class="btn btn--chico btn--fantasma" data-anular="${k.id}">Anular<span class="sr-only"> el certificado ${escapar(k.codigo)}</span></button>` : ''}
      </td></tr>`).join('')}</tbody></table>`;
}

// Emite y descarga. ruta: '/me/certificados/laboral' o '/colaboradores/ID/certificados/laboral'
// focoTrasEmitir: id del elemento (con tabindex=-1) que recibe el foco al terminar, p. ej. el título de la lista
export function activarFormulario(f, ruta, alEmitir, focoTrasEmitir = null) {
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const conSalario = f.conSalario.value === 'si';
    const dirigidoA = f.dirigidoA.value.trim();
    if (dirigidoA && !/^[\p{L}\p{N} .,&()'-]*$/u.test(dirigidoA)) return mostrarErrores(f, { dirigidoA: 'Use solo letras, números y signos básicos.' });
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        const k = await api(ruta, { metodo: 'POST', datos: { conSalario, ...(dirigidoA ? { dirigidoA } : {}) } });
        await alEmitir?.(); // la lista ya lo muestra (con su botón para volver a descargar)
        // Descarga sin salir de la página: si falla, el certificado igual queda en la lista
        try {
          const r = await fetch(`/api/v1/certificados/${k.id}/pdf?descargar=1`, { credentials: 'same-origin' });
          if (!r.ok) throw new Error();
          const url = URL.createObjectURL(await r.blob());
          const a = Object.assign(document.createElement('a'), { href: url, download: `certificado-laboral-${k.codigo}.pdf` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          toast(`Certificado generado (código ${k.codigo}). Se está descargando.`);
        } catch {
          toast(`Certificado generado (código ${k.codigo}), pero no se pudo descargar. Use el botón PDF de la lista.`, 'error');
        }
        document.getElementById(focoTrasEmitir)?.focus();
      } catch (err) {
        if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) toast(err.message, 'error');
      }
    });
  });
}

// Anular (admincontable)
export function activarAnular(contenedor, alAnular, focoTrasAnular = null) {
  contenedor.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular]');
    if (!b) return;
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'an-titulo');
    d.innerHTML = `<h2 id="an-titulo">Anular certificado</h2>
      <form novalidate><p class="ayuda">Quien lo verifique verá que fue anulado.</p>
        <div class="campo"><label for="an-motivo">Motivo <span class="obligatorio" aria-hidden="true">*</span></label>
          <textarea class="entrada" id="an-motivo" name="motivo" rows="2" maxlength="300" aria-describedby="an-motivo-error"></textarea>
          <span class="error-campo" id="an-motivo-error"></span></div>
        <div class="formulario-acciones"><button class="btn btn--peligro" type="submit">Anular</button>
          <button class="btn btn--secundario" type="button" data-cerrar>Volver</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      d.remove();
      b.isConnected && b.focus();
    });
    d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
    const f = d.querySelector('form');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpiarErrores(f);
      const motivo = f.motivo.value.trim();
      if (motivo.length < 5) return mostrarErrores(f, { motivo: 'Explique el motivo (mínimo 5 caracteres).' });
      await conCarga(f.querySelector('[type=submit]'), async () => {
        try {
          await api(`/certificados/${b.dataset.anular}/anular`, { metodo: 'POST', datos: { motivo } });
          d.close();
          toast('Certificado anulado.');
          await alAnular?.();
          document.getElementById(focoTrasAnular)?.focus(); // el botón ya no existe tras recargar la lista
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    d.showModal();
    f.motivo.focus();
  });
}