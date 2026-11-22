// Auditoría: quién hizo qué y cuándo, con filtros por actor (cédula), entidad, acción y fechas.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fechaHora, htmlAviso, limpiarErrores, mostrarErrores } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
let pagina = 1;
let opciones = null;

zona.innerHTML = `<section class="tarjeta"><form id="f" class="filtros-linea" novalidate role="search">
    <div class="campo"><label for="actor">Cédula de quien actuó</label><input class="entrada" id="actor" name="actor" inputmode="numeric" maxlength="15" aria-describedby="actor-error"><span class="error-campo" id="actor-error"></span></div>
    <div class="campo"><label for="entidad">Entidad</label><select class="entrada" id="entidad" name="entidad"><option value="">Todas</option></select></div>
    <div class="campo"><label for="accion">Acción</label><select class="entrada" id="accion" name="accion"><option value="">Todas</option></select></div>
    <div class="campo"><label for="desde">Desde</label><input class="entrada" type="date" id="desde" name="desde"></div>
    <div class="campo"><label for="hasta">Hasta</label><input class="entrada" type="date" id="hasta" name="hasta"></div>
    <div class="formulario-acciones"><button class="btn" type="submit">${icono('candado')} Buscar</button></div>
  </form></section>
  <section class="tarjeta" aria-labelledby="t-res"><h2 id="t-res" tabindex="-1">Registros</h2><p class="ayuda" id="conteo" aria-live="polite"></p><div id="res"></div>
    <nav class="formulario-acciones" aria-label="Páginas"><button type="button" class="btn btn--secundario" id="ant">Anterior</button><button type="button" class="btn btn--secundario" id="sig">Siguiente</button></nav></section>`;
zona.removeAttribute('aria-busy');
const f = document.getElementById('f');
const res = document.getElementById('res');

const detalleTexto = (d) => (d ? Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '');

async function buscar(boton) {
  limpiarErrores(f);
  if (f.actor.value && !/^\d{3,15}$/.test(f.actor.value.trim())) return mostrarErrores(f, { actor: 'Solo números, sin puntos.' });
  const q = new URLSearchParams({ pagina: String(pagina) });
  for (const k of ['actor', 'entidad', 'accion', 'desde', 'hasta']) if (f[k].value.trim()) q.set(k, f[k].value.trim());
  await conCarga(boton, async () => {
    try {
      const r = await api(`/auditoria?${q}`);
      if (!opciones) {
        opciones = r.opciones;
        f.entidad.insertAdjacentHTML('beforeend', opciones.entidades.map((x) => `<option>${escapar(x)}</option>`).join(''));
        f.accion.insertAdjacentHTML('beforeend', opciones.acciones.map((x) => `<option>${escapar(x)}</option>`).join(''));
      }
      const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
      document.getElementById('conteo').textContent = `${r.total} registro(s) · página ${r.pagina} de ${paginas}`;
      document.getElementById('ant').disabled = r.pagina <= 1;
      document.getElementById('sig').disabled = r.pagina >= paginas;
      res.innerHTML = r.registros.length ? `<div class="tabla-desplazable"><table class="tabla"><thead><tr><th scope="col">Fecha</th><th scope="col">Quién</th><th scope="col">Acción</th><th scope="col">Sobre</th><th scope="col">Detalle</th></tr></thead>
        <tbody>${r.registros.map((x) => `<tr>
          <td data-etiqueta="Fecha">${escapar(fechaHora(x.fecha))}</td>
          <td data-etiqueta="Quién">${x.actor ? `${escapar(x.actor.nombre)}<br><span class="ayuda">${escapar(x.actor.cedula)}</span>` : '<span class="ayuda">Sistema / sin sesión</span>'}</td>
          <td data-etiqueta="Acción">${escapar(x.accion)}</td>
          <td data-etiqueta="Sobre">${escapar(x.entidad)}${x.entidadId ? ` #${escapar(x.entidadId)}` : ''}</td>
          <td data-etiqueta="Detalle"><span class="valor-param">${escapar(detalleTexto(x.detalle))}</span></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="vacio">${icono('candado')}<h3>Sin registros</h3><p>No hay registros con esos filtros.</p></div>`;
    } catch (err) {
      res.innerHTML = htmlAviso('error', err.message);
    }
  });
}
f.addEventListener('submit', (e) => {
  e.preventDefault();
  pagina = 1;
  buscar(f.querySelector('[type=submit]'));
});
document.getElementById('ant').addEventListener('click', (e) => { pagina--; buscar(e.currentTarget).then(() => document.getElementById('t-res').focus()); });
document.getElementById('sig').addEventListener('click', (e) => { pagina++; buscar(e.currentTarget).then(() => document.getElementById('t-res').focus()); });
buscar(f.querySelector('[type=submit]'));