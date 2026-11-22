// Tarjeta "Último volante" para la página de Inicio.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { copExacto, escapar, periodoTexto } from '/static/js/ui.js';

export async function montar(contenedor) {
  const s = document.createElement('section');
  s.className = 'tarjeta';
  s.setAttribute('aria-labelledby', 'w-volante');
  contenedor.prepend(s);
  try {
    const { volante: v } = await api('/me/volantes/ultimo');
    s.innerHTML = v
      ? `<h2 id="w-volante">Último volante</h2>
         <p class="ayuda">${escapar(v.hoja)} · del ${escapar(periodoTexto(v.inicio, v.fin))}</p>
         <p class="cifra-grande">${copExacto(v.neto)}</p><p class="ayuda">Neto a pagar${v.adicional ? ` + ${copExacto(v.adicional)} en pagos adicionales` : ''}</p>
         <div class="formulario-acciones">
           <a class="btn" href="/volantes/ver?id=${v.id}">${icono('recibo')} Ver volante</a>
           <a class="btn btn--secundario" href="/volantes">Todos mis volantes</a>
         </div>`
      : `<h2 id="w-volante">Último volante</h2><div class="vacio">${icono('recibo')}<p>Aún no hay volantes publicados. Cuando el área contable publique la nómina, lo verá aquí.</p></div>`;
  } catch {
    s.remove();
  }
}
