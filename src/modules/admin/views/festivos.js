// Festivos por año: se usan para contar días hábiles (vacaciones y licencias). Guardar reemplaza
// el año completo; lo ya aprobado no se recalcula.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, htmlAviso, toast } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const anioActual = Number(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 4));
let anio = anioActual + (new URLSearchParams(location.search).get('siguiente') ? 1 : 0);

const fila = (f = { fecha: '', nombre: '' }, i = 0) => `<tr>
  <td data-etiqueta="Fecha"><label class="sr-only" for="fe-${i}">Fecha del festivo ${escapar(f.nombre || 'nuevo')}</label><input class="entrada" type="date" id="fe-${i}" name="fecha" value="${escapar(f.fecha)}" min="${anio}-01-01" max="${anio}-12-31" required></td>
  <td data-etiqueta="Nombre"><label class="sr-only" for="fn-${i}">Nombre del festivo ${escapar(f.fecha || 'nuevo')}</label><input class="entrada" id="fn-${i}" name="nombre" value="${escapar(f.nombre ?? '')}" maxlength="120" required></td>
  <td class="acciones"><button type="button" class="btn btn--chico btn--fantasma" data-quitar>${icono('cerrar')}<span class="sr-only">Quitar esta fila</span></button></td></tr>`;

async function cargar() {
  const { festivos } = await api(`/festivos/${anio}`);
  document.getElementById('cuerpo').innerHTML = festivos.length ? festivos.map(fila).join('') : '';
  document.getElementById('estado').innerHTML = festivos.length
    ? `<p class="ayuda">${festivos.length} festivo(s) cargados para ${anio}.</p>`
    : htmlAviso('alerta', `No hay festivos cargados para ${anio}: no se pueden calcular días hábiles de ese año. Agréguelos y guarde.`);
}

zona.innerHTML = `<section class="tarjeta">
  <div class="filtros-linea">
    <div class="campo"><label for="anio">Año</label><select class="entrada" id="anio">${[anioActual - 1, anioActual, anioActual + 1, anioActual + 2].map((a) => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
  </div>
  <div id="estado" aria-live="polite"></div>
  <form id="f" novalidate>
    <div class="tabla-desplazable"><table class="tabla"><thead><tr><th scope="col">Fecha</th><th scope="col">Nombre</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody id="cuerpo"></tbody></table></div>
    <div class="formulario-acciones">
      <button type="button" class="btn btn--secundario" id="agregar">${icono('agregar')} Agregar festivo</button>
      <button type="submit" class="btn">${icono('ok')} Guardar año</button>
    </div>
  </form></section>`;
zona.removeAttribute('aria-busy');
const f = document.getElementById('f');
document.getElementById('anio').addEventListener('change', async (e) => {
  anio = Number(e.target.value);
  await cargar();
});
document.getElementById('agregar').addEventListener('click', () => {
  const cuerpo = document.getElementById('cuerpo');
  cuerpo.insertAdjacentHTML('beforeend', fila(undefined, Date.now()));
  cuerpo.lastElementChild.querySelector('input').focus();
});
f.addEventListener('click', (e) => {
  const b = e.target.closest('[data-quitar]');
  if (!b) return;
  const tr = b.closest('tr');
  (tr.nextElementSibling ?? tr.previousElementSibling)?.querySelector('input')?.focus();
  tr.remove();
});
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const festivos = [...document.querySelectorAll('#cuerpo tr')].map((tr) => ({
    fecha: tr.querySelector('[name=fecha]').value,
    nombre: tr.querySelector('[name=nombre]').value.trim(),
  }));
  if (
    !(await confirmar({
      titulo: `Guardar festivos de ${anio}`,
      mensaje: `Se reemplazarán los festivos de ${anio} por estos ${festivos.length}. Las solicitudes ya aprobadas no se recalculan. ¿Guardar?`,
      aceptar: 'Guardar',
    }))
  )
    return;
  await conCarga(f.querySelector('[type=submit]'), async () => {
    try {
      await api(`/festivos/${anio}`, { metodo: 'PUT', datos: { festivos } });
      toast(`Festivos de ${anio} guardados.`);
      await cargar();
      document.getElementById('titulo').focus();
    } catch (err) {
      document.getElementById('estado').innerHTML = htmlAviso('error', err.message);
    }
  });
});
try {
  await cargar();
} catch (err) {
  document.getElementById('estado').innerHTML = htmlAviso('error', err.message);
}
