// Gestión de usuarios (admincontable): lista, alta, carga masiva, edición y
// restablecimiento de contraseña temporal.
import { api } from '/static/js/api.js';
import { montarShell, textoRol } from '/static/js/shell.js';
import { icono, pintarIconos } from '/static/js/iconos.js';
import {
  confirmar, conCarga, escapar, fechaHora, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores, toast,
} from '/static/js/ui.js';

await montarShell();
pintarIconos();

const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');
const paginacion = document.getElementById('paginacion');
const filtros = document.getElementById('filtros');
let pagina = 1;
let sedesCache = null;

const sedes = async () => (sedesCache ??= (await api('/sedes')).sedes);

function pildorasEstado(u) {
  const p = [];
  p.push(u.activo
    ? `<span class="pildora pildora--exito">${icono('ok')} Activo</span>`
    : `<span class="pildora pildora--neutro">${icono('cerrar')} Inactivo</span>`);
  if (u.bloqueado) p.push(`<span class="pildora pildora--error">${icono('candado')} Bloqueado</span>`);
  if (u.primerIngresoPendiente) p.push(`<span class="pildora pildora--alerta">${icono('reloj')} Primer ingreso pendiente</span>`);
  return p.join(' ');
}

async function cargar() {
  const q = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) q.set(k, v);
  q.set('pagina', pagina);
  lista.setAttribute('aria-busy', 'true');
  try {
    const r = await api(`/usuarios?${q}`);
    conteo.textContent = `${r.total} usuario${r.total === 1 ? '' : 's'}`;
    if (!r.usuarios.length) {
      lista.innerHTML = `<div class="vacio">${icono('usuarios')}<h3>No hay usuarios con estos filtros</h3>
        <p>Cree uno con “Nuevo usuario” o cárguelos todos desde la hoja EMPLEADOS con “Carga masiva desde nómina”.</p></div>`;
    } else {
      lista.innerHTML = `<table class="tabla"><thead><tr>
          <th scope="col">Cédula</th><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col"><span class="sr-only">Acciones</span></th>
        </tr></thead><tbody>
        ${r.usuarios.map((u) => `<tr>
          <td data-etiqueta="Cédula">${escapar(u.cedula)}</td>
          <td data-etiqueta="Nombre">${escapar(u.nombre)}</td>
          <td data-etiqueta="Rol">${escapar(textoRol(u.rol))}</td>
          <td data-etiqueta="Estado">${pildorasEstado(u)}</td>
          <td data-etiqueta="Último acceso">${u.ultimoAcceso ? escapar(fechaHora(u.ultimoAcceso)) : 'Nunca'}</td>
          <td class="acciones"><button type="button" class="btn btn--chico btn--secundario" data-editar="${u.id}">${icono('editar')} Editar<span class="sr-only"> ${escapar(u.nombre)}</span></button></td>
        </tr>`).join('')}
        </tbody></table>`;
    }
    const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
    paginacion.innerHTML = paginas > 1
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
lista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-editar]');
  if (b) abrirEdicion(Number(b.dataset.editar));
});

// ---------- Diálogo genérico ----------
function dialogo(tituloHtml, cuerpoHtml) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'dlg-titulo');
  d.innerHTML = `<h2 id="dlg-titulo">${tituloHtml}</h2>${cuerpoHtml}`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) d.close();
  });
  d.showModal();
  return d;
}

function mostrarClaveTemporal(d, nombre, clave, horas) {
  d.innerHTML = `<h2 id="dlg-titulo">${icono('llave')} Contraseña temporal</h2>
    ${htmlAviso('alerta', `Entréguela personalmente a ${nombre}. Solo se muestra esta vez y vence en ${horas} horas. En el primer ingreso deberá cambiarla.`)}
    <div class="secreto"><span id="clave-temp">${escapar(clave)}</span>
      <button type="button" class="btn btn--chico btn--secundario" id="copiar">${icono('copiar')} Copiar</button></div>
    <div class="formulario-acciones"><button type="button" class="btn" data-cerrar>Listo</button></div>`;
  d.querySelector('#copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(clave);
      toast('Contraseña copiada.');
    } catch {
      toast('No se pudo copiar. Selecciónela y cópiela a mano.', 'alerta');
    }
  });
  d.querySelector('[data-cerrar]').focus();
}

async function camposSedes(seleccionadas = []) {
  const lista = await sedes();
  if (!lista.length) return '<p class="ayuda">No hay sedes registradas.</p>';
  return `<fieldset class="campo" id="grupo-sedes"><legend class="etiqueta">Sedes a su cargo</legend>
    ${lista.map((s) => `<label><input type="checkbox" name="sedes" value="${s.id}" ${seleccionadas.includes(s.id) ? 'checked' : ''}>
      ${escapar(s.nombre)} <span class="ayuda">(${escapar(s.empleador)})</span></label>`).join('<br>')}
    <span class="error-campo" id="sedes-error"></span></fieldset>`;
}

function opcionesRol(actual) {
  return ['COLABORADOR', 'DIRECTOR', 'ADMIN']
    .map((r) => `<option value="${r}" ${r === actual ? 'selected' : ''}>${escapar(textoRol(r))}</option>`).join('');
}

function leerForm(form) {
  const fd = new FormData(form);
  return { ...Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'sedes')), sedes: fd.getAll('sedes').map(Number) };
}

// ---------- Nuevo usuario ----------
document.getElementById('btn-nuevo').addEventListener('click', async () => {
  const d = dialogo('Nuevo usuario', `
    <div id="dlg-msg" tabindex="-1" hidden></div>
    <form novalidate>
      <div class="campo"><label for="n-cedula">Cédula <span class="obligatorio" aria-hidden="true">*</span></label>
        <input class="entrada" id="n-cedula" name="cedula" inputmode="numeric" required maxlength="15" aria-describedby="n-cedula-error">
        <span class="error-campo" id="n-cedula-error"></span></div>
      <div class="campo"><label for="n-nombre">Nombre completo (APELLIDOS NOMBRES) <span class="obligatorio" aria-hidden="true">*</span></label>
        <input class="entrada" id="n-nombre" name="nombre" required maxlength="150" aria-describedby="n-nombre-error">
        <span class="error-campo" id="n-nombre-error"></span></div>
      <div class="campo"><label for="n-rol">Rol</label>
        <select class="entrada" id="n-rol" name="rol">${opcionesRol('COLABORADOR')}</select></div>
      <div id="zona-sedes" hidden>${await camposSedes()}</div>
      <div class="formulario-acciones"><button class="btn" type="submit">Crear usuario</button>
        <button class="btn btn--secundario" type="button" data-cerrar>Cancelar</button></div>
    </form>`);
  const form = d.querySelector('form');
  const zonaSedes = d.querySelector('#zona-sedes');
  form.elements.rol.addEventListener('change', () => (zonaSedes.hidden = form.elements.rol.value !== 'DIRECTOR'));
  form.elements.cedula.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    const datos = leerForm(form);
    if (datos.rol !== 'DIRECTOR') datos.sedes = [];
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await api('/usuarios', { metodo: 'POST', datos });
        mostrarClaveTemporal(d, r.usuario.nombre, r.claveTemporal, r.venceEnHoras);
        cargar();
      } catch (err) {
        if (Object.keys(err.campos).length) mostrarErrores(form, err.campos);
        else mostrarAviso(d.querySelector('#dlg-msg'), 'error', err.message);
      }
    });
  });
});

// ---------- Edición ----------
async function abrirEdicion(id) {
  let u;
  try {
    u = await api(`/usuarios/${id}`);
  } catch (err) {
    return toast(err.message, 'error');
  }
  const d = dialogo(`Editar usuario`, `
    <p><strong>${escapar(u.nombre)}</strong> · C.C. ${escapar(u.cedula)}</p>
    <div id="dlg-msg" tabindex="-1" hidden></div>
    <form novalidate>
      <div class="campo"><label for="e-nombre">Nombre completo</label>
        <input class="entrada" id="e-nombre" name="nombre" value="${escapar(u.nombre)}" maxlength="150" aria-describedby="e-nombre-error">
        <span class="error-campo" id="e-nombre-error"></span></div>
      <div class="campo"><label for="e-rol">Rol</label>
        <select class="entrada" id="e-rol" name="rol">${opcionesRol(u.rol)}</select></div>
      <div id="zona-sedes" ${u.rol === 'DIRECTOR' ? '' : 'hidden'}>${await camposSedes(u.sedes)}</div>
      <div class="campo"><label><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo (puede ingresar)</label></div>
      <div class="formulario-acciones">
        <button class="btn" type="submit">Guardar cambios</button>
        <button class="btn btn--secundario" type="button" id="reset">${icono('llave')} Nueva contraseña temporal</button>
        <button class="btn btn--fantasma" type="button" data-cerrar>Cancelar</button>
      </div>
    </form>`);
  const form = d.querySelector('form');
  const zonaSedes = d.querySelector('#zona-sedes');
  form.elements.rol.addEventListener('change', () => (zonaSedes.hidden = form.elements.rol.value !== 'DIRECTOR'));
  form.elements.nombre.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    const datos = leerForm(form);
    datos.activo = form.elements.activo.checked;
    if (datos.rol !== 'DIRECTOR') datos.sedes = [];
    if (u.activo && !datos.activo) {
      const ok = await confirmar({ titulo: 'Desactivar usuario', mensaje: `${u.nombre} no podrá ingresar y se cerrarán sus sesiones abiertas. ¿Continuar?`, aceptar: 'Desactivar', peligro: true });
      if (!ok) return;
    }
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        await api(`/usuarios/${id}`, { metodo: 'PATCH', datos });
        d.close();
        toast('Usuario actualizado.');
        cargar();
      } catch (err) {
        if (Object.keys(err.campos).length) mostrarErrores(form, err.campos);
        else mostrarAviso(d.querySelector('#dlg-msg'), 'error', err.message);
      }
    });
  });

  d.querySelector('#reset').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Nueva contraseña temporal',
      mensaje: `Se generará una contraseña temporal para ${u.nombre}, se desbloqueará la cuenta y se cerrarán sus sesiones. ¿Continuar?`,
      aceptar: 'Generar',
    });
    if (!ok) return;
    try {
      const r = await api(`/usuarios/${id}/reset-clave`, { metodo: 'POST' });
      mostrarClaveTemporal(d, u.nombre, r.claveTemporal, r.venceEnHoras);
      cargar();
    } catch (err) {
      mostrarAviso(d.querySelector('#dlg-msg'), 'error', err.message);
    }
  });
}

// ---------- Carga masiva ----------
document.getElementById('btn-masiva').addEventListener('click', () => {
  const d = dialogo(`${icono('subir')} Carga masiva desde nómina`, `
    <p>Suba el libro de nómina (.xlsx o .xlsm). Se leerá la hoja <strong>EMPLEADOS</strong> y se crearán usuarios para los colaboradores activos que aún no tengan cuenta. Las macros del libro no se ejecutan y el archivo no se guarda.</p>
    <div id="dlg-msg" tabindex="-1" hidden></div>
    <form novalidate>
      <div class="campo"><label for="m-archivo">Libro de nómina</label>
        <input class="entrada" id="m-archivo" name="archivo" type="file" accept=".xlsx,.xlsm" required aria-describedby="m-archivo-error">
        <span class="error-campo" id="m-archivo-error"></span></div>
      <div class="formulario-acciones"><button class="btn" type="submit">Revisar archivo</button>
        <button class="btn btn--secundario" type="button" data-cerrar>Cancelar</button></div>
    </form>
    <div id="vista"></div>`);
  const form = d.querySelector('form');
  const vista = d.querySelector('#vista');
  const msg = d.querySelector('#dlg-msg');

  const enviar = (confirmarCarga) => {
    const fd = new FormData();
    fd.append('confirmar', String(confirmarCarga));
    fd.append('archivo', form.elements.archivo.files[0]);
    return api('/usuarios/carga-masiva', { metodo: 'POST', formulario: fd });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);
    msg.hidden = true;
    vista.innerHTML = '';
    if (!form.elements.archivo.files.length) return mostrarErrores(form, { archivo: 'Elija el archivo.' });
    await conCarga(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await enviar(false);
        const errores = r.errores.length
          ? `${htmlAviso('error', `El archivo tiene ${r.errores.length} fila(s) con errores. Corríjalas y vuelva a subirlo.`)}
             <ul>${r.errores.map((x) => `<li>Fila ${x.fila}: ${escapar(x.mensaje)}</li>`).join('')}</ul>`
          : '';
        vista.innerHTML = `<h3>Resultado de la revisión</h3>
          <ul><li><strong>${r.nuevos.length}</strong> usuario(s) nuevo(s) por crear</li>
              <li>${r.yaExisten} ya tienen cuenta (no se modifican)</li>
              <li>${r.omitidosRetirados} retirados (se omiten)</li></ul>
          ${errores}
          ${r.nuevos.length ? `<details><summary>Ver los ${r.nuevos.length} nuevos</summary><ul>${r.nuevos.map((n) => `<li>${escapar(n.cedula)} – ${escapar(n.nombre)}</li>`).join('')}</ul></details>` : ''}
          ${!r.errores.length && r.nuevos.length ? `<div class="formulario-acciones"><button class="btn" type="button" id="confirmar">Crear ${r.nuevos.length} usuario(s)</button></div>` : ''}`;
        vista.querySelector('#confirmar')?.addEventListener('click', async (ev) => {
          await conCarga(ev.currentTarget, async () => {
            try {
              const c = await enviar(true);
              mostrarCreados(d, c);
              cargar();
            } catch (err) {
              mostrarAviso(msg, 'error', err.message);
            }
          });
        });
      } catch (err) {
        if (Object.keys(err.campos).length) mostrarErrores(form, err.campos);
        else mostrarAviso(msg, 'error', err.message);
      }
    });
  });
});

function mostrarCreados(d, r) {
  d.innerHTML = `<h2 id="dlg-titulo">${icono('ok')} ${r.creados.length} usuario(s) creados</h2>
    ${htmlAviso('alerta', `Descargue ahora las contraseñas temporales: no se podrán volver a consultar. Vencen en ${r.venceEnHoras} horas. Entréguelas de forma personal y destruya el archivo después.`)}
    <div class="formulario-acciones">
      <button type="button" class="btn" id="descargar">${icono('descargar')} Descargar contraseñas (CSV)</button>
      <button type="button" class="btn btn--secundario" data-cerrar>Cerrar</button>
    </div>`;
  d.querySelector('#descargar').addEventListener('click', () => {
    const filas = [['cedula', 'nombre', 'clave_temporal'], ...r.creados.map((c) => [c.cedula, c.nombre, c.claveTemporal])];
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claves-temporales.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  d.addEventListener('cancel', async (e) => {
    e.preventDefault();
    if (await confirmar({ titulo: '¿Ya descargó las contraseñas?', mensaje: 'Si cierra sin descargarlas tendrá que generar nuevas una por una.', aceptar: 'Sí, cerrar' })) d.close();
  });
}

cargar();
