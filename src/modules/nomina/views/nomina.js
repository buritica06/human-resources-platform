// Nómina (admincontable): 1) subir el libro, 2) elegir la(s) hoja(s), 3) validar y dejar en
// borrador, 4) revisar y publicar. Lista de periodos con sus acciones.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, copExacto, escapar, htmlAviso, limpiarErrores, mostrarErrores, periodoTexto } from '/static/js/ui.js';

await montarShell();
const carga = document.getElementById('carga');
const periodosZona = document.getElementById('periodos');

const ESTADO = {
  BORRADOR: ['alerta', 'editar', 'Borrador'],
  PUBLICADO: ['exito', 'ok', 'Publicado'],
  ANULADO: ['neutro', 'cerrar', 'Anulado'],
};
export const pildoraEstado = (e) => {
  const [c, i, t] = ESTADO[e] ?? ['neutro', 'info', e];
  return `<span class="pildora pildora--${c}">${icono(i)} ${escapar(t)}</span>`;
};

// ---------- Paso 1: subir el libro ----------
let archivo = null;
let huella = null;

function pasoArchivo() {
  carga.innerHTML = `
    <p>Suba el libro de nómina (.xlsx o .xlsm). Después elija la quincena (hoja <strong>NOMINA …</strong>). La plataforma <strong>no recalcula</strong>: valida que cada cédula tenga expediente, que el periodo no esté repetido y que devengado − deducciones = neto. Si algo falla, no se guarda nada.</p>
    <form id="f-archivo" novalidate>
      <div class="campo"><label for="archivo">Libro de nómina</label>
        <input class="entrada" id="archivo" name="archivo" type="file" accept=".xlsx,.xlsm" required aria-describedby="archivo-error">
        <span class="error-campo" id="archivo-error"></span></div>
      <div class="formulario-acciones"><button class="btn" type="submit">${icono('subir')} Ver quincenas del libro</button></div>
    </form>
    <div id="paso2" aria-live="polite"></div>`;
  const f = carga.querySelector('#f-archivo');
  f.archivo.addEventListener('change', () => {
    carga.querySelector('#paso2').innerHTML = '';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    if (!f.archivo.files.length) return mostrarErrores(f, { archivo: 'Elija el archivo.' });
    archivo = f.archivo.files[0];
    await conCarga(f.querySelector('[type=submit]'), async () => {
      const fd = new FormData();
      fd.append('archivo', archivo);
      try {
        const r = await api('/nomina/hojas', { metodo: 'POST', formulario: fd });
        huella = r.huella;
        pasoHojas(r.hojas);
      } catch (err) {
        carga.querySelector('#paso2').innerHTML = htmlAviso('error', err.message);
      }
    });
  });
}

// ---------- Paso 2: elegir hojas ----------
function pasoHojas(hojas) {
  const zona = carga.querySelector('#paso2');
  const pendientes = hojas.filter((h) => h.estadoEnPlataforma !== 'PUBLICADO' && h.inicio);
  zona.innerHTML = `<form id="f-hojas" novalidate>
    <fieldset class="campo"><legend class="etiqueta">Elija la(s) quincena(s) a cargar</legend>
      <ul class="opciones-hojas">${hojas.map((h, i) => {
        const deshabilitada = h.estadoEnPlataforma === 'PUBLICADO';
        return `<li><label><input type="checkbox" name="hoja" value="${escapar(h.nombre)}" ${deshabilitada ? 'disabled' : ''} ${i === 0 && !deshabilitada ? 'checked' : ''}>
          <span>${escapar(h.nombre)}</span>
          <span class="ayuda">${h.inicio ? `Del ${escapar(periodoTexto(h.inicio, h.fin))}` : 'Sin fechas en S1/T1'}</span>
          ${h.estadoEnPlataforma ? pildoraEstado(h.estadoEnPlataforma) : ''}
          ${h.estadoEnPlataforma === 'BORRADOR' ? '<span class="ayuda">(se reemplaza)</span>' : ''}</label></li>`;
      }).join('')}</ul>
      <span class="error-campo" id="hoja-error"></span>
    </fieldset>
    <div class="formulario-acciones">
      <button class="btn" type="submit">Validar y guardar como borrador</button>
      ${pendientes.length > 1 ? `<button class="btn btn--secundario" type="button" id="todas">Marcar las ${pendientes.length} pendientes</button>` : ''}
    </div>
  </form><div id="resultados"></div>`;
  const f = zona.querySelector('#f-hojas');
  zona.querySelector('#todas')?.addEventListener('click', () => {
    for (const c of f.querySelectorAll('input[name=hoja]:not(:disabled)')) c.checked = true;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const elegidas = [...f.querySelectorAll('input[name=hoja]:checked')].map((c) => c.value);
    if (!elegidas.length) return mostrarErrores(f, { hoja: 'Elija al menos una quincena.' });
    const res = zona.querySelector('#resultados');
    res.innerHTML = '';
    await conCarga(f.querySelector('[type=submit]'), async () => {
      for (const hoja of elegidas) await cargarHoja(hoja, res, false);
      await listarPeriodos();
    });
  });
}

// ---------- Paso 3: validar y guardar ----------
async function cargarHoja(hoja, res, crearExpedientes) {
  const bloque = document.createElement('section');
  bloque.className = 'resultado-carga';
  bloque.setAttribute('aria-label', `Resultado de ${hoja}`);
  res.append(bloque);
  bloque.innerHTML = `<h3>${escapar(hoja)}</h3><p class="ayuda">Validando…</p>`;
  const fd = new FormData();
  fd.append('archivo', archivo);
  fd.append('hoja', hoja);
  fd.append('huella', huella);
  fd.append('crearExpedientes', String(crearExpedientes));
  try {
    const r = await api('/nomina/cargas', { metodo: 'POST', formulario: fd });
    const adv = r.advertencias?.length
      ? `<details><summary>${r.advertencias.length} advertencia(s) (no impiden cargar)</summary><ul>${r.advertencias.map((a) => `<li>${a.fila ? `Fila ${a.fila}: ` : ''}${escapar(a.mensaje)}</li>`).join('')}</ul></details>` : '';
    if (r.ok) {
      bloque.innerHTML = `<h3>${escapar(hoja)}</h3>${htmlAviso('exito', `Guardada como borrador: ${r.colaboradores} colaborador(es), neto total ${copExacto(r.totales.neto)}${r.totales.adicional ? ` + ${copExacto(r.totales.adicional)} en pagos adicionales` : ''}. Aún no es visible para los colaboradores.`)}
        ${r.faltantes?.length ? htmlAviso('info', `Se crearon ${r.faltantes.length} expediente(s) básico(s) como RETIRADO.`) : ''}
        ${adv}<a class="btn" href="/nomina/periodo?id=${r.periodoId}">${icono('recibo')} Revisar y publicar</a>`;
      return;
    }
    const soloFaltantes = r.faltantes?.length && r.errores.length === r.faltantes.length;
    bloque.innerHTML = `<h3>${escapar(hoja)}</h3>${htmlAviso('error', `No se guardó nada: hay ${r.errores.length} problema(s). Corrija el Excel y vuelva a cargarlo.`)}
      <ul>${r.errores.map((x) => `<li>${x.fila ? `Fila ${x.fila}: ` : ''}${escapar(x.mensaje)}</li>`).join('')}</ul>
      ${soloFaltantes ? `<div class="aviso aviso--info">${icono('info')}<div><p>Si son colaboradores que ya se retiraron y no están en la hoja EMPLEADOS, la plataforma puede crearles un expediente básico (estado RETIRADO) con el nombre de la nómina, para conservar su historial de volantes.</p>
        <button type="button" class="btn btn--secundario" data-crear>Crear ${r.faltantes.length} expediente(s) básico(s) y cargar</button></div></div>` : ''}
      ${adv}`;
    bloque.querySelector('[data-crear]')?.addEventListener('click', async (ev) => {
      await conCarga(ev.currentTarget, async () => {
        bloque.remove();
        await cargarHoja(hoja, res, true);
        await listarPeriodos();
      });
    });
  } catch (err) {
    bloque.innerHTML = `<h3>${escapar(hoja)}</h3>${htmlAviso('error', err.message)}`;
  }
}

// ---------- Periodos ----------
async function listarPeriodos() {
  periodosZona.setAttribute('aria-busy', 'true');
  try {
    const { periodos } = await api('/nomina/periodos');
    if (!periodos.length) {
      periodosZona.innerHTML = `<div class="vacio">${icono('recibo')}<h3>Aún no hay periodos</h3><p>Cargue una quincena con el formulario de arriba.</p></div>`;
      return;
    }
    periodosZona.innerHTML = `<table class="tabla"><thead><tr><th scope="col">Quincena</th><th scope="col">Periodo</th><th scope="col">Estado</th><th scope="col" class="num">Colaboradores</th><th scope="col" class="num">Neto total</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${periodos.map((p) => `<tr>
        <td data-etiqueta="Quincena">${escapar(p.hoja)}</td>
        <td data-etiqueta="Periodo">${escapar(periodoTexto(p.inicio, p.fin))}</td>
        <td data-etiqueta="Estado">${pildoraEstado(p.estado)}</td>
        <td data-etiqueta="Colaboradores" class="num">${p.colaboradores}</td>
        <td data-etiqueta="Neto total" class="num">${copExacto(p.totalNeto)}</td>
        <td class="acciones"><a class="btn btn--chico ${p.estado === 'BORRADOR' ? '' : 'btn--secundario'}" href="/nomina/periodo?id=${p.id}">${p.estado === 'BORRADOR' ? 'Revisar y publicar' : 'Ver'}<span class="sr-only"> ${escapar(p.hoja)}</span></a></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (err) {
    periodosZona.innerHTML = htmlAviso('error', err.message);
  } finally {
    periodosZona.removeAttribute('aria-busy');
  }
}

pasoArchivo();
listarPeriodos();
