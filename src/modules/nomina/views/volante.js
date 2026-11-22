// Detalle de un volante (colaborador: el suyo publicado; admincontable: cualquiera).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { htmlAviso } from '/static/js/ui.js';
import { htmlVolante } from './volante-vista.js';

const me = await montarShell();
const zona = document.getElementById('zona');
const id = Number(new URLSearchParams(location.search).get('id'));
const desde = new URLSearchParams(location.search).get('periodo');
if (desde && me.usuario.rol === 'ADMIN') {
  const volver = document.getElementById('volver');
  volver.href = `/nomina/periodo?id=${encodeURIComponent(desde)}`;
  volver.textContent = '← Volver al periodo';
}

try {
  if (!(Number.isInteger(id) && id > 0)) throw new Error('No se indicó qué volante ver.');
  const v = await api(`/volantes/${id}`);
  document.getElementById('titulo').textContent = `Volante ${v.periodo.hoja}`;
  document.title = `Volante ${v.periodo.hoja} · Talento Humano`;
  zona.innerHTML = htmlVolante(v, { esAdmin: me.usuario.rol === 'ADMIN' });
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
} finally {
  zona.removeAttribute('aria-busy');
}
