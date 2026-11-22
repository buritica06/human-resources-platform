// Verificación pública de certificados (sin sesión): solo validez, tipo y fecha.
import { pintarIconos, icono } from '/static/js/iconos.js';
import { escapar, fecha, htmlAviso, limpiarErrores, mostrarErrores } from '/static/js/ui.js';

pintarIconos();
const f = document.getElementById('f');
const resultado = document.getElementById('resultado');
const inicial = new URLSearchParams(location.search).get('codigo');

async function verificar() {
  limpiarErrores(f);
  const codigo = f.codigo.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (codigo.length !== 12) return mostrarErrores(f, { codigo: 'El código tiene 12 letras y números (por ejemplo: 7KQ2-M9XD-4TRA).' });
  resultado.innerHTML = '<p class="ayuda">Verificando…</p>';
  try {
    const r = await fetch(`/api/v1/certificados/verificar/${encodeURIComponent(codigo)}`, { headers: { Accept: 'application/json' } });
    const d = await r.json().catch(() => null); // p. ej. una página de error del proxy
    if (!r.ok || !d) throw new Error(d?.error?.mensaje ?? 'No se pudo verificar en este momento. Intente más tarde.');
    resultado.innerHTML = d.valido
      ? `<div class="aviso aviso--exito" role="status">${icono('ok')}<div><strong>Certificado válido.</strong><br>${escapar(d.tipo)} expedido el ${escapar(fecha(d.emitidoEn))}.</div></div>`
      : htmlAviso('error', `${d.motivo}${d.emitidoEn ? ` (expedido el ${fecha(d.emitidoEn)})` : ''}`);
  } catch (err) {
    resultado.innerHTML = htmlAviso('error', err instanceof TypeError ? 'No se pudo verificar. Revise su conexión.' : err.message);
  }
  resultado.focus();
}
f.addEventListener('submit', (e) => {
  e.preventDefault();
  verificar();
});
if (inicial) {
  f.codigo.value = inicial.slice(0, 20);
  verificar();
}