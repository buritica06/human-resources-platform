// Expediente del colaborador. Una sola página para:
//  /expediente               → el propio colaborador (edita solo los datos permitidos)
//  /colaboradores/ver?id=N   → admincontable (edita todo) o director (solo lectura, sin datos de pago)
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import {
  cop,
  confirmar,
  conCarga,
  escapar,
  fecha,
  fechaHora,
  htmlAviso,
  limpiarErrores,
  mostrarAviso,
  mostrarErrores,
  toast,
} from '/static/js/ui.js';

const me = await montarShell();
const zona = document.getElementById('zona');
const titulo = document.getElementById('titulo');
const propio = location.pathname === '/expediente';
const id = Number(new URLSearchParams(location.search).get('id'));
const base = propio ? '/me/expediente' : `/colaboradores/${id}`;
const esAdmin = me.usuario.rol === 'ADMIN' && !propio;

let datos; // respuesta de la API
let editando = false;

if (!propio) document.getElementById('volver').hidden = false;

async function cargar() {
  try {
    if (!propio && !(Number.isInteger(id) && id > 0)) {
      throw new Error('No se indicó qué colaborador ver. Vuelva a la lista de colaboradores y elija uno.');
    }
    datos = await api(base);
    pintar();
  } catch (err) {
    zona.innerHTML =
      err.codigo === 'SIN_EXPEDIENTE'
        ? `<section class="tarjeta vacio">${icono('documento')}<h2>Aún no tiene expediente</h2><p>${escapar(err.message)}</p></section>`
        : htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}

// ---------- formato de valores ----------
function opcionTexto(campo, valor) {
  const o = (campo.opciones ?? []).find((x) => (typeof x === 'object' ? x.valor === valor : x === valor));
  return typeof o === 'object' ? o.texto : (o ?? valor);
}

function mostrarValor(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '<span class="sin-dato">— <span class="sr-only">Sin dato</span></span>';
  switch (campo.tipo) {
    case 'fecha':
      return escapar(fecha(valor));
    case 'dinero':
      return escapar(cop(valor));
    case 'sino':
      return valor ? 'Sí' : 'No';
    case 'sede':
    case 'empleador':
      return escapar(opcionTexto(campo, valor));
    default:
      return escapar(valor);
  }
}

// ---------- encabezado + pestañas ----------
function pintar() {
  const c = datos.colaborador;
  titulo.textContent = propio ? 'Mi expediente' : c.nombre;
  document.title = `${propio ? 'Mi expediente' : c.nombre} · Talento Humano`;
  const iniciales = c.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
  const estado =
    c.estado === 'ACTIVO'
      ? `<span class="pildora pildora--exito">${icono('ok')} Activo</span>`
      : `<span class="pildora pildora--neutro">${icono('cerrar')} Retirado</span>`;
  zona.innerHTML = `
    <section class="tarjeta ficha" aria-label="Resumen">
      <span class="avatar avatar--grande" aria-hidden="true">${escapar(iniciales)}</span>
      <div>
        <p class="ficha__nombre">${escapar(c.nombre)}</p>
        <p class="ficha__detalle">C.C. ${escapar(c.cedula)} · ${escapar(c.datos.cargo ?? 'Sin cargo')} · ${escapar(c.sede ?? 'Sin sede')}</p>
        ${estado}
      </div>
    </section>
    <section class="tarjeta">
      <div class="pestanas" role="tablist" aria-label="Secciones del expediente">
        ${datos.pestanas
          .map(
            (p, i) => `<button type="button" role="tab" id="tab-${p.clave}" aria-controls="panel-${p.clave}"
            aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${escapar(p.titulo)}</button>`,
          )
          .join('')}
      </div>
      ${datos.pestanas.map((p, i) => `<div role="tabpanel" id="panel-${p.clave}" aria-labelledby="tab-${p.clave}" tabindex="0" ${i === 0 ? '' : 'hidden'}></div>`).join('')}
    </section>`;
  activarPestanas();
  pintarDatos();
  for (const p of datos.pestanas.slice(1)) pintarPestanaModulo(p);
}

function activarPestanas() {
  const tabs = [...zona.querySelectorAll('[role=tab]')];
  const seleccionar = (t) => {
    for (const x of tabs) {
      const activa = x === t;
      x.setAttribute('aria-selected', String(activa));
      x.tabIndex = activa ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !activa;
    }
    t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => seleccionar(t));
    t.addEventListener('keydown', (e) => {
      const mov = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
      if (mov === undefined) return;
      e.preventDefault();
      seleccionar(tabs[(i + mov + tabs.length) % tabs.length]);
    });
  });
}

async function pintarPestanaModulo(p) {
  const panel = document.getElementById(`panel-${p.clave}`);
  if (p.activa && p.script) {
    try {
      const mod = await import(p.script);
      await mod.montar(panel, { propio, id, rol: me.usuario.rol, clave: p.clave });
      return;
    } catch {
      panel.innerHTML = htmlAviso('error', 'No se pudo cargar esta sección. Intente de nuevo más tarde.');
      return;
    }
  }
  panel.innerHTML = `<div class="vacio">${icono('reloj')}<h3>${escapar(p.titulo)}: próximamente</h3>
    <p>Esta sección se habilitará cuando el área contable active el módulo correspondiente. Aquí verá su historial.</p></div>`;
}

// ---------- pestaña Datos ----------
function pintarDatos() {
  const panel = document.getElementById('panel-datos');
  const editables = datos.campos.filter((c) => c.editable);
  const acciones = editables.length
    ? `<div class="formulario-acciones"><button type="button" class="btn" id="editar">${icono('editar')} ${propio ? 'Actualizar mis datos' : 'Editar expediente'}</button></div>`
    : '';
  const ayuda = propio
    ? `<p class="ayuda">Puede actualizar: ${editables.map((c) => escapar(c.etiqueta.toLowerCase())).join(', ')}. Para cambiar otros datos comuníquese con el área contable.</p>`
    : '';
  panel.innerHTML = `${acciones}${ayuda}
    <form id="form-exp" novalidate>
      <div id="msg-exp" tabindex="-1" hidden></div>
      ${datos.grupos
        .map((g) => {
          const campos = datos.campos.filter((c) => c.grupo === g.clave);
          if (!campos.length) return '';
          return `<section class="grupo-datos" aria-labelledby="g-${g.clave}"><h3 id="g-${g.clave}">${escapar(g.titulo)}</h3>
          <dl class="datos">${campos.map((c) => celdaCampo(c)).join('')}</dl></section>`;
        })
        .join('')}
      <div class="formulario-acciones" id="acciones-form" hidden>
        <button type="submit" class="btn">Guardar cambios</button>
        <button type="button" class="btn btn--secundario" id="cancelar">Cancelar</button>
      </div>
    </form>
    <section class="grupo-datos" aria-labelledby="t-hist"><h3 id="t-hist">Historial de cambios</h3><div id="historial"></div></section>`;
  panel.querySelector('#editar')?.addEventListener('click', () => alternarEdicion(true));
  panel.querySelector('#cancelar').addEventListener('click', () => alternarEdicion(false));
  panel.querySelector('#form-exp').addEventListener('submit', guardar);
  panel.querySelector('#ver-cuenta')?.addEventListener('click', verCuenta);
  cargarHistorial();
}

function celdaCampo(c) {
  const valor = datos.colaborador.datos[c.clave];
  let dd;
  if (editando && c.editable) dd = entradaCampo(c, valor);
  else {
    dd = mostrarValor(c, valor);
    if (c.clave === 'numero_cuenta' && esAdmin && valor) {
      dd += ` <button type="button" class="btn btn--chico btn--fantasma" id="ver-cuenta">${icono('ojo')} Mostrar</button>`;
    }
  }
  const etiqueta =
    editando && c.editable
      ? `<label for="f-${c.clave}">${escapar(c.etiqueta)}${c.obligatorio ? ' <span class="obligatorio" aria-hidden="true">*</span>' : ''}</label>`
      : escapar(c.etiqueta);
  return `<div class="dato${editando && c.editable ? ' dato--editable' : ''}"><dt>${etiqueta}</dt><dd>${dd}
    ${editando && c.editable ? `<span class="error-campo" id="f-${c.clave}-error"></span>` : ''}</dd></div>`;
}

function entradaCampo(c, valor) {
  const idc = `f-${c.clave}`;
  const comun = `class="entrada" id="${idc}" name="${c.clave}" aria-describedby="${idc}-error" ${c.obligatorio ? 'required' : ''}`;
  const v = valor ?? '';
  const opcion = (val, texto, sel) => `<option value="${escapar(val)}" ${sel ? 'selected' : ''}>${escapar(texto)}</option>`;
  switch (c.tipo) {
    case 'fecha':
      return `<input type="date" ${comun} value="${escapar(v)}">`;
    case 'dinero':
      return `<input inputmode="numeric" ${comun} value="${escapar(v)}" placeholder="Ej.: 1750905">`;
    case 'texto':
      if (c.clave === 'numero_cuenta') {
        // Nunca se precarga el número (llega enmascarado): se escribe uno nuevo solo para cambiarlo.
        return `<input type="text" inputmode="numeric" ${comun} value="" maxlength="20" placeholder="${escapar(v || 'Sin cuenta')} — escriba uno nuevo para cambiarlo">`;
      }
      return `<input type="text" ${comun} value="${escapar(v)}" maxlength="150">`;
    case 'celular':
    case 'telefono':
      return `<input type="tel" inputmode="tel" autocomplete="tel" ${comun} value="${escapar(v)}" maxlength="15">`;
    case 'sino':
      return `<select ${comun}>${opcion('', '— Sin dato —', v === '')}${opcion('SI', 'Sí', v === true)}${opcion('NO', 'No', v === false)}</select>`;
    case 'lista': {
      const ops = c.opciones.includes(v) || v === '' ? c.opciones : [v, ...c.opciones];
      return `<select ${comun}>${c.obligatorio ? '' : opcion('', '— Sin dato —', v === '')}${ops.map((o) => opcion(o, o, o === v)).join('')}</select>`;
    }
    case 'sede':
    case 'empleador':
      return `<select ${comun}>${c.opciones.map((o) => opcion(o.valor, o.texto, o.valor === v)).join('')}</select>`;
    default:
      return `<input type="text" ${comun} value="${escapar(v)}" maxlength="150">`;
  }
}

function alternarEdicion(si) {
  editando = si;
  pintarDatos();
  const panel = document.getElementById('panel-datos');
  panel.querySelector('#acciones-form').hidden = !si;
  if (panel.querySelector('#editar')) panel.querySelector('#editar').hidden = si;
  if (si) {
    panel.querySelector('.dato--editable .entrada')?.focus();
    // Admin: la lista de sedes se filtra según el empleador elegido
    const emp = panel.querySelector('#f-empleador_id');
    const sede = panel.querySelector('#f-sede_id');
    if (emp && sede) {
      const todas = datos.campos.find((c) => c.clave === 'sede_id').opciones;
      const filtrar = () => {
        const actual = Number(sede.value);
        const ops = todas.filter((o) => o.empleador === Number(emp.value));
        // Si la sede actual no es del empleador elegido, se pide elegir una (no se cambia en silencio).
        const valida = ops.some((o) => o.valor === actual);
        sede.innerHTML =
          (valida ? '' : '<option value="" selected>— Elija la sede —</option>') +
          ops.map((o) => `<option value="${o.valor}" ${o.valor === actual ? 'selected' : ''}>${escapar(o.texto)}</option>`).join('');
      };
      emp.addEventListener('change', filtrar);
      filtrar();
    }
  }
}

// Valor de la entrada en el mismo formato que la API
function valorEntrada(c, el) {
  const s = el.value;
  if (s === '') return null;
  if (c.tipo === 'sino') return s === 'SI';
  if (c.tipo === 'sede' || c.tipo === 'empleador') return Number(s);
  if (c.tipo === 'dinero') return s;
  return s;
}

async function guardar(e) {
  e.preventDefault();
  const form = e.currentTarget;
  limpiarErrores(form);
  const cambios = {};
  for (const c of datos.campos.filter((x) => x.editable)) {
    const el = form.elements.namedItem(c.clave);
    if (!el) continue;
    const nuevo = valorEntrada(c, el);
    const actual = datos.colaborador.datos[c.clave] ?? null;
    // numero_cuenta llega enmascarado: solo se envía si el admin escribió uno nuevo
    if (c.clave === 'numero_cuenta') {
      if (nuevo !== null) cambios.numero_cuenta = nuevo;
      continue;
    }
    if (String(nuevo ?? '') !== String(actual ?? '')) cambios[c.clave] = nuevo;
  }
  const msg = form.querySelector('#msg-exp');
  if (!Object.keys(cambios).length) {
    mostrarAviso(msg, 'info', 'No hay cambios para guardar.');
    return;
  }
  const nombres = Object.keys(cambios)
    .map((k) => datos.campos.find((c) => c.clave === k).etiqueta)
    .join(', ');
  if (!(await confirmar({ titulo: 'Confirmar cambios', mensaje: `Se actualizará: ${nombres}. ¿Desea guardar?`, aceptar: 'Guardar' })))
    return;
  await conCarga(form.querySelector('[type=submit]'), async () => {
    try {
      await api(base, { metodo: 'PATCH', datos: cambios });
      datos = await api(base);
      editando = false;
      pintar();
      toast('Datos actualizados.');
    } catch (err) {
      if (
        !Object.keys(err.campos ?? {}).length ||
        !mostrarErrores(form, Object.fromEntries(Object.entries(err.campos).map(([k, m]) => [k, m])))
      ) {
        mostrarAviso(msg, 'error', err.message);
      }
    }
  });
}

async function verCuenta(e) {
  const b = e.currentTarget;
  try {
    const r = await api(`/colaboradores/${id}/cuenta`);
    const dd = b.parentElement;
    dd.setAttribute('role', 'status'); // el lector de pantalla anuncia el número revelado
    dd.innerHTML = `<span class="secreto-inline">${escapar(r.numeroCuenta)}</span> <span class="ayuda">(consulta registrada)</span>`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cargarHistorial() {
  const zonaH = document.getElementById('historial');
  try {
    const r = await api(`${base}/historial`);
    if (!r.cambios.length) {
      zonaH.innerHTML = '<p class="ayuda">Todavía no hay cambios registrados.</p>';
      return;
    }
    const ORIGEN = { COLABORADOR: 'El colaborador', ADMIN: 'Área contable', IMPORTACION: 'Archivo de nómina' };
    zonaH.innerHTML = `<table class="tabla"><thead><tr><th scope="col">Fecha</th><th scope="col">Dato</th><th scope="col">Antes</th><th scope="col">Después</th><th scope="col">Por</th></tr></thead><tbody>
      ${r.cambios
        .map(
          (h) => `<tr>
        <td data-etiqueta="Fecha">${escapar(fechaHora(h.fecha))}</td>
        <td data-etiqueta="Dato">${escapar(h.campo === '_alta' ? 'Expediente' : h.etiqueta)}</td>
        <td data-etiqueta="Antes">${escapar(h.anterior ?? '—')}</td>
        <td data-etiqueta="Después">${escapar(h.nuevo ?? '—')}</td>
        <td data-etiqueta="Por">${escapar(h.actor ?? '')}${h.actor ? '<br>' : ''}<span class="ayuda">${escapar(ORIGEN[h.origen] ?? h.origen)}</span></td>
      </tr>`,
        )
        .join('')}</tbody></table>`;
  } catch (err) {
    zonaH.innerHTML = htmlAviso('error', err.message);
  }
}

cargar();
