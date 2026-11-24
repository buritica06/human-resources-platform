// Lista de expedientes (admincontable: todos; director: sus sedes) e importación desde nómina.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono, pintarIconos } from '/static/js/iconos.js';
import { conCarga, escapar, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores, toast } from '/static/js/ui.js';

const me = await montarShell();
const esAdmin = me.usuario.rol === 'ADMIN';
const esGestor = ['ADMIN', 'DIRECTOR'].includes(me.usuario.rol);
pintarIconos();

const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');
const paginacion = document.getElementById('paginacion');
const filtros = document.getElementById('filtros');
let pagina = 1;
let opcionesCache = { sedes: [], empleadores: [], catalogos: {} };

if (esGestor) {
  document.getElementById('btn-nuevo').hidden = false;
  document.getElementById('btn-catalogos').hidden = false;
}
if (esAdmin) document.getElementById('btn-importar').hidden = false;
else document.getElementById('nota-director').hidden = false;

async function cargarOpciones() {
  try {
    opcionesCache = await api('/colaboradores/opciones');
    const sel = document.getElementById('f-sede');
    sel.innerHTML =
      '<option value="">Todas</option>' + opcionesCache.sedes.map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join('');
  } catch {
    /* el filtro de sede es opcional */
  }
}
await cargarOpciones();

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

// ---------- Nuevo colaborador ----------
document.getElementById('btn-nuevo').addEventListener('click', async () => {
  await cargarOpciones();
  const d = document.createElement('dialog');
  d.className = 'modal modal--ancho';
  d.setAttribute('aria-labelledby', 'nuevo-titulo');
  const opts = (arr) =>
    `<option value="">— Seleccione —</option>${(arr ?? []).map((x) => `<option value="${escapar(x)}">${escapar(x)}</option>`).join('')}`;
  d.innerHTML = `<h2 id="nuevo-titulo">Nuevo colaborador</h2>
    <div id="nuevo-msg" tabindex="-1" hidden></div>
    <form novalidate>
      <div class="rejilla rejilla--2">
        <div class="campo"><label for="n-cedula">Cédula *</label><input class="entrada" id="n-cedula" name="cedula" inputmode="numeric" required maxlength="15"><span class="error-campo" id="n-cedula-error"></span></div>
        <div class="campo"><label for="n-nombre">Nombre completo *</label><input class="entrada" id="n-nombre" name="nombre" required maxlength="150"><span class="error-campo" id="n-nombre-error"></span></div>
        <div class="campo"><label for="n-empleador">Empleador</label><select class="entrada" id="n-empleador" name="empleador_id"><option value="">— Seleccione —</option>${opcionesCache.empleadores.map((e) => `<option value="${e.id}">${escapar(e.nombre)}</option>`).join('')}</select><span class="error-campo" id="n-empleador_id-error"></span></div>
        <div class="campo"><label for="n-sede">Sede</label><select class="entrada" id="n-sede" name="sede_id"><option value="">— Seleccione —</option>${opcionesCache.sedes.map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join('')}</select><span class="error-campo" id="n-sede_id-error"></span></div>
        <div class="campo"><label for="n-cargo">Cargo</label><input class="entrada" id="n-cargo" name="cargo" maxlength="80"><span class="error-campo" id="n-cargo-error"></span></div>
        <div class="campo"><label for="n-salario">Salario básico</label><input class="entrada" id="n-salario" name="salario_base" inputmode="numeric" placeholder="Ej.: 1750905"><span class="error-campo" id="n-salario_base-error"></span></div>
        <div class="campo"><label for="n-contrato">Tipo de contrato</label><select class="entrada" id="n-contrato" name="tipo_contrato">${opts(opcionesCache.catalogos.LISTA_CONTRATOS)}</select><span class="error-campo" id="n-tipo_contrato-error"></span></div>
        <div class="campo"><label for="n-ingreso">Fecha de ingreso</label><input class="entrada" id="n-ingreso" name="fecha_ingreso" type="date"><span class="error-campo" id="n-fecha_ingreso-error"></span></div>
        <div class="campo"><label for="n-fin">Fecha fin de contrato</label><input class="entrada" id="n-fin" name="fecha_fin_contrato" type="date"><span class="error-campo" id="n-fecha_fin_contrato-error"></span></div>
        <div class="campo"><label for="n-eps">EPS</label><select class="entrada" id="n-eps" name="eps">${opts(opcionesCache.catalogos.LISTA_EPS)}</select><span class="error-campo" id="n-eps-error"></span></div>
        <div class="campo"><label for="n-afp">Fondo de pensión (AFP)</label><select class="entrada" id="n-afp" name="afp">${opts(opcionesCache.catalogos.LISTA_AFP)}</select><span class="error-campo" id="n-afp-error"></span></div>
      </div>
      <div class="formulario-acciones">
        <button type="submit" class="btn">Crear colaborador</button>
        <button type="button" class="btn btn--secundario" data-cerrar>Cancelar</button>
      </div>
    </form>`;
  document.body.append(d);
  d.showModal();
  const selEmp = d.querySelector('#n-empleador');
  const selSede = d.querySelector('#n-sede');
  selEmp.addEventListener('change', () => {
    const eid = Number(selEmp.value);
    const filtradas = eid ? opcionesCache.sedes.filter((s) => s.empleadorId === eid) : opcionesCache.sedes;
    selSede.innerHTML =
      '<option value="">— Seleccione —</option>' + filtradas.map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join('');
  });
  d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  const form = d.querySelector('form');
  const msg = d.querySelector('#nuevo-msg');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiarErrores(form);
    msg.hidden = true;
    const cuerpo = {};
    for (const [k, v] of new FormData(form)) if (String(v).trim() !== '') cuerpo[k] = String(v).trim();
    if (cuerpo.empleador_id) cuerpo.empleador_id = Number(cuerpo.empleador_id);
    if (cuerpo.sede_id) cuerpo.sede_id = Number(cuerpo.sede_id);
    await conCarga(form.querySelector('button[type=submit]'), async () => {
      try {
        await api('/colaboradores', { method: 'POST', body: cuerpo });
        toast('Colaborador creado correctamente.', 'exito');
        d.close();
        cargar();
      } catch (err) {
        if (err.campos) {
          const prefijados = Object.fromEntries(Object.entries(err.campos).map(([k, v]) => [`n-${k}`, v]));
          mostrarErrores(form, prefijados);
        }
        mostrarAviso(msg, 'error', err.message);
      }
    });
  });
});

// ---------- Catálogos laborales (Contratos, EPS, AFP) ----------
document.getElementById('btn-catalogos').addEventListener('click', async () => {
  const NOMBRES = { LISTA_CONTRATOS: 'Tipos de contrato', LISTA_EPS: 'EPS', LISTA_AFP: 'Fondos de pensión (AFP)' };
  const d = document.createElement('dialog');
  d.className = 'modal modal--ancho';
  d.setAttribute('aria-labelledby', 'cat-titulo');
  d.innerHTML = `<h2 id="cat-titulo">Catálogos laborales</h2>
    <p class="ayuda">Cree, edite o elimine tipos de contrato, EPS y AFP disponibles en los expedientes.</p>
    <div id="cat-msg" tabindex="-1" hidden></div>
    <div id="cat-cuerpo"></div>
    <div class="formulario-acciones"><button type="button" class="btn btn--secundario" data-cerrar>Cerrar</button></div>`;
  document.body.append(d);
  d.showModal();
  d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());

  const msg = d.querySelector('#cat-msg');
  const cuerpo = d.querySelector('#cat-cuerpo');

  async function pintarCatalogos() {
    const { catalogos } = await api('/colaboradores/catalogos');
    cuerpo.innerHTML = Object.entries(NOMBRES)
      .map(
        ([clave, titulo]) => `<section class="tarjeta-interna">
        <h3>${escapar(titulo)}</h3>
        <ul class="lista-compacta">
          ${(catalogos[clave] ?? [])
            .map(
              (item) => `<li>
            <span>${escapar(item)}</span>
            <button type="button" class="btn btn--chico btn--secundario" data-editar="${clave}" data-valor="${escapar(item)}">Editar</button>
            <button type="button" class="btn btn--chico btn--peligro" data-eliminar="${clave}" data-valor="${escapar(item)}">Eliminar</button>
          </li>`,
            )
            .join('')}
        </ul>
        <form class="filtros-linea" data-agregar="${clave}">
          <input class="entrada" name="valor" placeholder="Nuevo registro..." required maxlength="60">
          <button type="submit" class="btn btn--chico">Agregar</button>
        </form>
      </section>`,
      )
      .join('');
  }

  cuerpo.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('form[data-agregar]');
    if (!f) return;
    ev.preventDefault();
    msg.hidden = true;
    const valor = new FormData(f).get('valor')?.toString().trim();
    if (!valor) return;
    try {
      await api(`/colaboradores/catalogos/${f.dataset.agregar}/items`, { method: 'POST', body: { valor } });
      toast('Registro agregado al catálogo.', 'exito');
      await pintarCatalogos();
    } catch (err) {
      mostrarAviso(msg, 'error', err.message);
    }
  });

  cuerpo.addEventListener('click', async (ev) => {
    const bEd = ev.target.closest('[data-editar]');
    if (bEd) {
      msg.hidden = true;
      const anterior = bEd.dataset.valor;
      const nuevo = window.prompt(`Editar "${anterior}":`, anterior)?.trim();
      if (!nuevo || nuevo === anterior) return;
      try {
        await api(`/colaboradores/catalogos/${bEd.dataset.editar}/items`, { method: 'PATCH', body: { anterior, nuevo } });
        toast('Registro actualizado.', 'exito');
        await pintarCatalogos();
      } catch (err) {
        mostrarAviso(msg, 'error', err.message);
      }
      return;
    }
    const bEl = ev.target.closest('[data-eliminar]');
    if (bEl) {
      msg.hidden = true;
      const valor = bEl.dataset.valor;
      if (!window.confirm(`¿Eliminar "${valor}" del catálogo?`)) return;
      try {
        await api(`/colaboradores/catalogos/${bEl.dataset.eliminar}/items`, { method: 'DELETE', body: { valor } });
        toast('Registro eliminado del catálogo.', 'exito');
        await pintarCatalogos();
      } catch (err) {
        mostrarAviso(msg, 'error', err.message);
      }
    }
  });

  await pintarCatalogos();
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
