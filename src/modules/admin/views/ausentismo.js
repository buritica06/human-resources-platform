// Reporte de ausentismo por sede y rango de fechas (+ descarga CSV para Excel).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fecha, htmlAviso } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const inicioMes = `${hoy.slice(0, 8)}01`;
let sedes = [];
try {
  sedes = (await api('/sedes')).sedes ?? [];
} catch {
  /* sin filtro de sede */
}

zona.innerHTML = `<section class="tarjeta"><form id="f" class="filtros-linea" novalidate>
    <div class="campo"><label for="desde">Desde</label><input class="entrada" type="date" id="desde" name="desde" value="${inicioMes}" required></div>
    <div class="campo"><label for="hasta">Hasta</label><input class="entrada" type="date" id="hasta" name="hasta" value="${hoy}" required></div>
    <div class="campo"><label for="sede">Sede</label><select class="entrada" id="sede" name="sede"><option value="">Todas</option>${sedes.map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join('')}</select></div>
    <div class="formulario-acciones"><button class="btn" type="submit">${icono('documento')} Ver reporte</button>
      <a class="btn btn--secundario" id="csv" href="#">${icono('descargar')} Descargar CSV</a></div>
  </form></section>
  <section class="tarjeta" aria-labelledby="t-res"><h2 id="t-res" tabindex="-1">Resultado</h2><div id="res"></div></section>`;
zona.removeAttribute('aria-busy');
const f = document.getElementById('f');
const res = document.getElementById('res');
const consulta = () => new URLSearchParams({ desde: f.desde.value, hasta: f.hasta.value, ...(f.sede.value ? { sede: f.sede.value } : {}) });
const actualizarCsv = () => {
  document.getElementById('csv').href = `/api/v1/reportes/ausentismo?${consulta()}&formato=csv`;
};
f.addEventListener('change', actualizarCsv);
actualizarCsv();

async function ver(boton) {
  await conCarga(boton, async () => {
    try {
      const r = await api(`/reportes/ausentismo?${consulta()}`);
      res.innerHTML = r.filas.length
        ? `
        <h3 class="subtitulo">Totales por sede y tipo</h3>
        <div class="tabla-desplazable"><table class="tabla"><thead><tr><th scope="col">Sede</th><th scope="col">Tipo</th><th scope="col">Días</th><th scope="col">Horas (permisos)</th></tr></thead>
          <tbody>${r.totales.map((t) => `<tr><td data-etiqueta="Sede">${escapar(t.sede)}</td><td data-etiqueta="Tipo">${escapar(t.tipo)}</td><td data-etiqueta="Días">${t.dias}</td><td data-etiqueta="Horas">${t.horas ? String(t.horas).replace('.', ',') : '—'}</td></tr>`).join('')}</tbody></table></div>
        <h3 class="subtitulo">Detalle (${r.filas.length})</h3>
        <div class="tabla-desplazable"><table class="tabla"><thead><tr><th scope="col">Colaborador</th><th scope="col">Tipo</th><th scope="col">Fechas en el rango</th><th scope="col">Días u horas</th></tr></thead>
          <tbody>${r.filas
            .map(
              (x) => `<tr>
            <td data-etiqueta="Colaborador">${escapar(x.nombre)}<br><span class="ayuda">${escapar(x.sede ?? '')} · ${escapar(x.cargo ?? '')}</span></td>
            <td data-etiqueta="Tipo">${escapar(x.tipo)}${x.detalle ? `<br><span class="ayuda">${escapar(x.detalle)}${x.remunerada ? '' : ' · no remunerada'}</span>` : ''}</td>
            <td data-etiqueta="Fechas">${escapar(fecha(x.ini))}${x.ini !== x.fin ? ` al ${escapar(fecha(x.fin))}` : ''}</td>
            <td data-etiqueta="Días u horas">${x.horas ? `${String(x.horas).replace('.', ',')} h` : `${x.dias} día(s)`}</td></tr>`,
            )
            .join('')}</tbody></table></div>`
        : `<div class="vacio">${icono('ok')}<h3>Sin ausencias</h3><p>No hay ausencias registradas en ese rango.</p></div>`;
      document.getElementById('t-res').focus();
    } catch (err) {
      res.innerHTML = htmlAviso('error', err.message);
    }
  });
}
f.addEventListener('submit', (e) => {
  e.preventDefault();
  ver(f.querySelector('[type=submit]'));
});
ver(f.querySelector('[type=submit]'));
