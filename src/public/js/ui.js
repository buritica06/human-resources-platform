// Utilidades de interfaz: formato es-CO, avisos, confirmación, errores de formulario,
// campos de contraseña y botones con estado de carga.
import { icono } from './iconos.js';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const cop = (n) => fmtCOP.format(Math.round(Number(n) || 0));
// Valor exacto de la nómina (con centavos solo si los tiene, p. ej. medios pesos del auxilio)
export function copExacto(n) {
  const v = Number(n) || 0;
  const entero = Number.isInteger(Math.round(v * 100) / 100);
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 }).format(v);
}
export const periodoTexto = (inicio, fin) => `${fecha(inicio)} al ${fecha(fin)}`;

// DD/MM/AAAA. Acepta 'AAAA-MM-DD' (fecha pura, sin zona) o ISO con hora.
export function fecha(valor) {
  if (!valor) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' });
}
export const fechaHora = (valor) =>
  valor
    ? new Date(valor).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
    : '';

export const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Avisos ----------
const ICONO_TIPO = { exito: 'ok', error: 'error', alerta: 'alerta', info: 'info' };

export function htmlAviso(tipo, mensaje) {
  return `<div class="aviso aviso--${tipo}">${icono(ICONO_TIPO[tipo])}<p>${escapar(mensaje)}</p></div>`;
}

export function mostrarAviso(contenedor, tipo, mensaje) {
  contenedor.innerHTML = htmlAviso(tipo, mensaje);
  contenedor.hidden = false;
  contenedor.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  contenedor.focus?.();
}

export function toast(mensaje, tipo = 'exito') {
  let zona = document.getElementById('toasts');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toasts';
    zona.className = 'toasts';
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
  const el = document.createElement('div');
  el.innerHTML = htmlAviso(tipo, mensaje);
  const aviso = el.firstElementChild;
  zona.append(aviso);
  setTimeout(() => aviso.remove(), 6000);
}

// ---------- Confirmación ----------
export function confirmar({ titulo, mensaje, aceptar = 'Confirmar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'conf-titulo');
    d.innerHTML = `<h2 id="conf-titulo">${escapar(titulo)}</h2><p>${escapar(mensaje)}</p>
      <div class="formulario-acciones">
        <button type="button" class="btn ${peligro ? 'btn--peligro' : ''}" data-r="si">${escapar(aceptar)}</button>
        <button type="button" class="btn btn--secundario" data-r="no">${escapar(cancelar)}</button>
      </div>`;
    document.body.append(d);
    d.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r) d.close(r);
    });
    d.addEventListener('close', () => {
      resolver(d.returnValue === 'si');
      d.remove();
    });
    d.showModal();
    d.querySelector('[data-r="no"]').focus();
  });
}

// ---------- Formularios ----------
export function limpiarErrores(form) {
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll('.campo-icono[data-invalido]')) el.removeAttribute('data-invalido');
  for (const el of form.querySelectorAll('.error-campo')) el.textContent = '';
}

// Marca los campos con error (campos = { nombre: mensaje }) y enfoca el primero (salvo enfocar: false,
// p. ej. en validaciones en vivo mientras la persona escribe).
// Devuelve false si algún mensaje no tenía dónde mostrarse (el llamador debe dar un aviso general).
export function mostrarErrores(form, campos = {}, { enfocar = true } = {}) {
  let primero = null;
  let todos = true;
  for (const [nombre, mensaje] of Object.entries(campos)) {
    const entrada = form.elements.namedItem(nombre);
    // Grupos (casillas con el mismo name) no tienen id: se usa el contenedor <nombre>-error.
    const unico = entrada && entrada.id ? entrada : null;
    const err = unico ? document.getElementById(`${unico.id}-error`) : form.querySelector(`#${CSS.escape(nombre)}-error`);
    if (!err) {
      todos = false;
      continue;
    }
    err.textContent = mensaje;
    const foco = unico ?? (entrada instanceof RadioNodeList ? entrada[0] : entrada);
    if (foco) {
      foco.setAttribute('aria-invalid', 'true');
      foco.closest('.campo-icono')?.setAttribute('data-invalido', 'true');
      primero ??= foco;
    }
  }
  if (enfocar) primero?.focus();
  return todos;
}

export async function conCarga(boton, accion) {
  const texto = boton.innerHTML;
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.innerHTML = `<svg class="icono girando" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg> Procesando…`;
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    boton.innerHTML = texto;
  }
}

// Botón "ver/ocultar" en cada campo de contraseña: <button class="ver-clave" data-para="id">
export function activarVerClave(raiz = document) {
  for (const b of raiz.querySelectorAll('.ver-clave')) {
    const entrada = document.getElementById(b.dataset.para);
    const pintar = () => {
      const visible = entrada.type === 'text';
      b.innerHTML = icono(visible ? 'ojo' : 'ojoTachado');
      b.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      b.setAttribute('aria-pressed', String(visible));
    };
    b.addEventListener('click', () => {
      entrada.type = entrada.type === 'password' ? 'text' : 'password';
      pintar();
    });
    pintar();
  }
}

// Lista de requisitos de contraseña que se marca mientras se escribe (misma regla que el servidor).
export function activarRequisitosClave(entrada, lista) {
  const reglas = {
    largo: (v) => v.length >= 10,
    letras: (v) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v),
    numeros: (v) => /\d/.test(v),
  };
  const actualizar = () => {
    for (const li of lista.querySelectorAll('[data-regla]')) li.dataset.ok = String(reglas[li.dataset.regla](entrada.value));
  };
  entrada.addEventListener('input', actualizar);
  actualizar();
}

export const datosFormulario = (form) => Object.fromEntries(new FormData(form).entries());
