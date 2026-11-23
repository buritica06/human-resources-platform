// Lista de expedientes (admincontable: todos; director: sus sedes) e importación desde nómina.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono, pintarIconos } from '/static/js/iconos.js';
import { conCarga, escapar, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

const me = await montarShell();
const esAdmin = me.usuario.rol === 'ADMIN';
pintarIconos();

const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');
const paginacion = document.getElementById('paginacion');
const filtros = document.getElementById('filtros');
let pagina = 1;

if (esAdmin) document.getElementById('btn-importar').hidden = false;
else document.getElementById('nota-director').hidden = false;

try {
  const op = await api('/colaboradores/opciones');
  document
    .getElementById('f-sede')
    .insertAdjacentHTML('beforeend', op.sedes.map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join(''));
} catch {
  /* el filtro de sede es opcional */
}

async function cargar() {
  const q = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) q.set(k, v);
  q.set('pagina', pagina);
  lista.setAttribute('aria-busy', 'true');
  try {
    const r = await api(`/colaboradores?${q}`);
    conteo.textContent = `${r.total} colaborador${r.total === 1 ? '' : 'es'}`;
    if (!r.colaboradores.length) {
      lista.innerHTML = `<div class="vacio">${icono('usuarios')}<h3>No hay colaboradores con estos filtros</h3>
        <p>${esAdmin ? 'Cargue los expedientes con “Importar desde nómina” (hoja EMPLEADOS del libro).' : 'Pruebe con otra búsqueda o sede.'}</p></div>`;
    } else {
      lista.innerHTML = `<table class="tabla"><thead><tr>
        <th scope="col">Cédula</th><th scope="col">Nombre</th><th scope="col">Sede</th><th scope="col">Cargo</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th>
        </tr></thead><tbody>
        ${r.colaboradores
          .map(
            (c) => `<tr>
          <td data-etiqueta="Cédula">${escapar(c.cedula)}</td>
          <td data-etiqueta="Nombre">${escapar(c.nombre)}</td>
          <td data-etiqueta="Sede">${escapar(c.sede ?? '—')}</td>
          <td data-etiqueta="Cargo">${escapar(c.cargo ?? '—')}</td>
          <td data-etiqueta="Estado">${
            c.estado === 'ACTIVO'
              ? `<span class="pildora pildora--exito">${icono('ok')} Activo</span>`
              : `<span class="pildora pildora--neutro">${icono('cerrar')} Retirado</span>`
          }</td>
          <td class="acciones"><a class="btn btn--chico btn--secundario" href="/colaboradores/ver?id=${c.id}">${icono('documento')} Ver expediente<span class="sr-only"> de ${escapar(c.nombre)}</span></a></td>
        </tr>`,
          )
          .join('')}</tbody></table>`;
    }
    const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
    paginacion.innerHTML =
      paginas > 1
        ? `<button type="button" class="btn btn--chico btn--secundario" data-pag="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
         <span>Página ${pagina} de ${paginas}</span>
         <button type="button" class="btn btn--chico btn--secundario" data-pag="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente</button>`
        : '';
  } catch (err) {
    lista.innerHTML = htmlAviso('error', err.message);
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

filtros.addEventListener('submit', (e) => {
  e.preventDefault();
  pagina = 1;
  cargar();
});
paginacion.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (b) {
    pagina = Number(b.dataset.pag);
    cargar();
  }
});

// ---------- Importación ----------
document.getElementById('btn-importar').addEventListener('click', () => {
  const d = document.createElement('dialog');
  d.className = 'modal modal--ancho';
  d.setAttribute('aria-labelledby', 'imp-titulo');
  d.innerHTML = `<h2 id="imp-titulo">${icono('subir')} Importar expedientes desde nómina</h2>
    <p>Suba el libro de nómina (.xlsx o .xlsm). Se leen las hojas <strong>EMPLEADOS</strong> (un expediente por fila) y <strong>PARAMETROS</strong> (empleadores y sedes). Primero verá un resumen; nada se guarda hasta que confirme. Las macros no se ejecutan y el archivo no se conserva.</p>
    <div id="imp-msg" tabindex="-1" hidden></div>
    <form novalidate>
      <div class="campo"><label for="imp-archivo">Libro de nómina</label>
        <input class="entrada" id="imp-archivo" name="archivo" type="file" accept=".xlsx,.xlsm" required aria-describedby="imp-archivo-error">
        <span class="error-campo" id="imp-archivo-error"></span></div>
      <div class="formulario-acciones"><button class="btn" type="submit">Revisar archivo</button>
        <button class="btn btn--secundario" type="button" data-cerrar>Cerrar</button></div>
    </form>
    <div id="imp-vista" aria-live="polite"></div>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) d.close();
  });
  d.showModal();
  const form = d.querySelector('form');
  const vista = d.querySelector('#imp-vista');
  const msg = d.querySelector('#imp-msg');
  let huella = null; // huella del archivo revisado: solo ese se puede confirmar
  form.elements.archivo.addEventListener('change', () => {
    huella = null;
    vista.innerHTML = '';
    msg.hidden = true;
  });
  const enviar = (confirmarImp) => {
    const fd = new FormData();
    fd.append('confirmar', String(confirmarImp));
    if (confirmarImp) fd.append('huella', huella ?? '');
    fd.append('archivo', form.elements.archivo.files[0]);
    return api('/colaboradores/importar', { metodo: 'POST', formulario: fd });
  };
  const lista2 = (items, fn) => `<ul>${items.map(fn).join('')}</ul>`;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    msg.hidden = true;
    vista.innerHTML = '';
    if (!form.elements.archivo.files.length) return mostrarErrores(form, { archivo: 'Elija el archivo.' });
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await enviar(false);
        huella = r.huella;
        const hayCambios = r.nuevos.length || r.actualizar.length || r.empleadoresNuevos.length || r.sedesNuevas.length;
        vista.innerHTML = `<h3>Resultado de la revisión</h3>
          <ul>
            <li><strong>${r.nuevos.length}</strong> expediente(s) nuevo(s)</li>
            <li><strong>${r.actualizar.length}</strong> expediente(s) con cambios</li>
            <li>${r.sinCambios} sin cambios</li>
            ${r.empleadoresNuevos.length ? `<li>Empleadores nuevos: ${escapar(r.empleadoresNuevos.join(', '))}</li>` : ''}
            ${r.sedesNuevas.length ? `<li>Sedes nuevas: ${escapar(r.sedesNuevas.join(', '))}</li>` : ''}
          </ul>
          ${
            r.errores.length
              ? htmlAviso('error', `${r.errores.length} fila(s) con errores. Corríjalas en el Excel y vuelva a subirlo.`) +
                lista2(r.errores, (x) => `<li>Fila ${x.fila}: ${escapar(x.mensaje)}</li>`)
              : ''
          }
          ${
            r.advertencias.length
              ? `<details><summary>${r.advertencias.length} advertencia(s) (no impiden importar)</summary>
            ${lista2(r.advertencias, (x) => `<li>Fila ${x.fila}: ${escapar(x.mensaje)}</li>`)}</details>`
              : ''
          }
          ${
            r.actualizar.length
              ? `<details><summary>Ver los cambios</summary>
            ${lista2(r.actualizar, (x) => `<li>${escapar(x.nombre)}: ${escapar(x.campos.join(', '))}</li>`)}</details>`
              : ''
          }
          ${
            r.nuevos.length
              ? `<details><summary>Ver los nuevos</summary>
            ${lista2(r.nuevos, (x) => `<li>${escapar(x.cedula)} – ${escapar(x.nombre)}</li>`)}</details>`
              : ''
          }
          ${
            !r.errores.length && hayCambios
              ? '<div class="formulario-acciones"><button class="btn" type="button" id="imp-confirmar">Confirmar importación</button></div>'
              : !r.errores.length
                ? htmlAviso('info', 'No hay nada nuevo que importar.')
                : ''
          }`;
        vista.querySelector('#imp-confirmar')?.addEventListener('click', async (ev) => {
          await conCarga(ev.currentTarget, async () => {
            try {
              const c = await enviar(true);
              vista.innerHTML =
                htmlAviso(
                  'exito',
                  `Importación terminada: ${c.creados} expediente(s) creado(s) y ${c.actualizadosAplicados} actualizado(s).`,
                ) +
                (c.creados
                  ? `<p>Para que los nuevos colaboradores puedan ingresar, cree sus cuentas en <a href="/usuarios">Usuarios → Carga masiva desde nómina</a>.</p>`
                  : '');
              form.hidden = true;
              cargar();
            } catch (err) {
              mostrarAviso(msg, 'error', err.message);
            }
          });
        });
      } catch (err) {
        if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(form, err.campos)) mostrarAviso(msg, 'error', err.message);
      }
    });
  });
});

cargar();
