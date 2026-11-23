// Certificados: generar el laboral (con o sin salario) y volver a descargar los anteriores.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { htmlAviso } from '/static/js/ui.js';
import { activarFormulario, htmlFormulario, htmlLista } from '/m/certificados/comun.js';

await montarShell();
const zona = document.getElementById('zona');

async function cargarLista() {
  const lista = document.getElementById('lista');
  try {
    lista.innerHTML = htmlLista((await api('/me/certificados')).certificados);
  } catch (err) {
    lista.innerHTML = htmlAviso('error', err.message);
  }
}

try {
  const r = await api('/me/certificados');
  if (r.sinExpediente) {
    zona.innerHTML = htmlAviso('info', 'Su cuenta no tiene expediente de colaborador; no puede generar certificados.');
  } else {
    zona.innerHTML = `<section class="tarjeta" aria-labelledby="t-nuevo"><h2 id="t-nuevo">${icono('documento')} Certificado laboral</h2>
        <p class="ayuda">Se genera al momento con los datos de su expediente y trae un código para que quien lo reciba verifique que es auténtico.</p>
        ${htmlFormulario('cert')}</section>
      <section class="tarjeta" aria-labelledby="t-hist"><h2 id="t-hist" tabindex="-1">Certificados generados</h2><div id="lista">${htmlLista(r.certificados)}</div></section>`;
    activarFormulario(document.getElementById('cert-f'), '/me/certificados/laboral', cargarLista, 't-hist');
  }
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
} finally {
  zona.removeAttribute('aria-busy');
}
