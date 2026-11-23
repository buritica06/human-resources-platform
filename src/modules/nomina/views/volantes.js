// Mis volantes: lista por año (solo periodos publicados).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { copExacto, escapar, htmlAviso, periodoTexto } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');

async function cargar(anio) {
  zona.setAttribute('aria-busy', 'true');
  try {
    const r = await api(`/me/volantes${anio ? `?anio=${anio}` : ''}`);
    if (!r.volantes.length) {
      zona.innerHTML = `<section class="tarjeta vacio">${icono('recibo')}<h2>Aún no hay volantes</h2>
        <p>${r.sinExpediente ? 'Su cuenta no tiene expediente de colaborador.' : 'Cuando el área contable publique la nómina de una quincena, su volante aparecerá aquí.'}</p></section>`;
      return;
    }
    zona.innerHTML = `<section class="tarjeta" aria-labelledby="t-anio">
      <header class="encabezado-tarjeta">
        <h2 id="t-anio">Volantes de ${escapar(r.anio)}</h2>
        ${r.anios.length > 1 ? `<div class="campo"><label for="anio">Año</label><select class="entrada" id="anio">${r.anios.map((a) => `<option ${a === r.anio ? 'selected' : ''}>${escapar(a)}</option>`).join('')}</select></div>` : ''}
      </header>
      <ul class="lista-volantes">${r.volantes
        .map(
          (v) => `<li class="item-volante">
          <div><div class="item-volante__periodo">${escapar(v.hoja)}</div><div class="ayuda">Del ${escapar(periodoTexto(v.inicio, v.fin))}</div></div>
          <div><span class="ayuda">Neto</span> <span class="item-volante__neto">${copExacto(v.neto)}</span>
            ${v.adicional ? `<span class="pildora pildora--primario">+ ${copExacto(v.adicional)} adicional</span>` : ''}</div>
          <div class="formulario-acciones">
            <a class="btn btn--chico" href="/volantes/ver?id=${v.id}">${icono('recibo')} Ver<span class="sr-only"> volante ${escapar(v.hoja)}</span></a>
            <a class="btn btn--chico btn--secundario" href="/api/v1/volantes/${v.id}/pdf?descargar=1">${icono('descargar')} PDF<span class="sr-only"> de ${escapar(v.hoja)}</span></a>
          </div></li>`,
        )
        .join('')}</ul></section>`;
    zona.querySelector('#anio')?.addEventListener('change', (e) => cargar(e.target.value));
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}
cargar();
