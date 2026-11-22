// Formulario de licencia: tipo, fechas, motivo y soporte PDF (obligatorio según el tipo).
// Mientras escribe, el servidor cuenta los días con la misma regla que al guardar.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
let op;
let pasos = [];
try {
  [op, { pasos }] = await Promise.all([api('/licencias/opciones'), api('/solicitudes/flujo/LICENCIA')]);
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
  throw err;
}

const campo = (id, etiqueta, control, { ayuda = '', obligatorio = true } = {}) => `<div class="campo">
  <label for="${id}">${etiqueta}${obligatorio ? ' <span class="obligatorio" aria-hidden="true">*</span>' : ''}<span id="${id}-opcional">${obligatorio ? '' : ' (opcional)'}</span></label>
  ${control}<span class="ayuda" id="${id}-ayuda">${ayuda}</span>
  <span class="error-campo" id="${id}-error"></span></div>`;
const desc = (id) => `aria-describedby="${id}-ayuda ${id}-error"`;
const unidad = (t) => (t.unidad === 'habiles' ? 'hábiles' : 'calendario');
const reglaTexto = (t) => `${t.diasMax ? `Máximo ${t.diasMax} días ${unidad(t)}.` : `Se cuentan días ${unidad(t)}.`} ${t.remunerada ? 'Remunerada.' : 'No remunerada: esos días no se pagan ni cuentan para causar vacaciones.'}${t.sensible ? ' El soporte es dato de salud: su director no lo verá.' : ''}`;

zona.innerHTML = `<section class="tarjeta">
  <div id="msg" tabindex="-1" hidden></div>
  <form id="f" novalidate>
    ${campo('subtipo', 'Tipo de licencia', `<select class="entrada" id="subtipo" name="subtipo" required ${desc('subtipo')}><option value="">Elija…</option>${op.tipos.map((t) => `<option>${escapar(t.nombre)}</option>`).join('')}</select>`)}
    <div class="rejilla rejilla--2">
      ${campo('fecha_inicio', 'Desde', `<input class="entrada" type="date" id="fecha_inicio" name="fecha_inicio" required value="${op.hoy}" ${desc('fecha_inicio')}>`)}
      ${campo('fecha_fin', 'Hasta', `<input class="entrada" type="date" id="fecha_fin" name="fecha_fin" required value="${op.hoy}" ${desc('fecha_fin')}>`, { ayuda: 'Incluido.' })}
    </div>
    <p class="ayuda" id="calculo" aria-live="polite"></p>
    ${campo('motivo', 'Motivo', `<textarea class="entrada" id="motivo" name="motivo" rows="3" maxlength="500" required ${desc('motivo')}></textarea>`)}
    <div class="campo"><label for="soporte">Soporte en PDF <span id="soporte-req"></span></label>
      <input class="entrada" type="file" id="soporte" name="soporte" accept="application/pdf,.pdf" aria-describedby="soporte-ayuda soporte-error">
      <span class="ayuda" id="soporte-ayuda">Solo PDF, máximo ${op.maxMb} MB.</span><span class="error-campo" id="soporte-error"></span></div>
    <div class="formulario-acciones">
      <button class="btn" type="submit">${icono('ok')} Enviar solicitud</button>
      <button class="btn btn--secundario" type="button" id="borrador">Guardar sin enviar</button>
    </div>
  </form></section>`;

const f = zona.querySelector('#f');
const msg = zona.querySelector('#msg');
const calculo = zona.querySelector('#calculo');
const tipoActual = () => op.tipos.find((t) => t.nombre === f.subtipo.value);
let resultado = null;
let turno = 0;

function pintarTipo() {
  const t = tipoActual();
  zona.querySelector('#subtipo-ayuda').textContent = t ? reglaTexto(t) : '';
  zona.querySelector('#soporte-req').innerHTML = t?.soporteObligatorio ? '<span class="obligatorio" aria-hidden="true">*</span><span class="sr-only">(obligatorio)</span>' : '(opcional)';
  f.soporte.required = !!t?.soporteObligatorio;
}

async function calcular() {
  const mio = ++turno;
  resultado = null;
  if (!f.subtipo.value || !f.fecha_inicio.value || !f.fecha_fin.value) {
    calculo.textContent = '';
    return;
  }
  try {
    const r = await api('/licencias/calcular', { metodo: 'POST', datos: { subtipo: f.subtipo.value, fecha_inicio: f.fecha_inicio.value, fecha_fin: f.fecha_fin.value } });
    if (mio !== turno) return;
    resultado = r;
    calculo.textContent = `${r.dias} día(s) ${r.unidad === 'habiles' ? 'hábiles' : 'calendario'} de licencia${r.remunerada ? '' : ' no remunerada'}.`;
  } catch (err) {
    if (mio !== turno) return;
    calculo.textContent = Object.values(err.campos ?? {}).filter((m) => !/motivo/i.test(m))[0] ?? err.message;
  }
}
let espera;
const programar = () => {
  clearTimeout(espera);
  espera = setTimeout(calcular, 350);
};
f.subtipo.addEventListener('change', () => {
  pintarTipo();
  programar();
});
f.fecha_inicio.addEventListener('change', () => {
  if (f.fecha_fin.value < f.fecha_inicio.value) f.fecha_fin.value = f.fecha_inicio.value;
  programar();
});
f.fecha_fin.addEventListener('change', programar);
pintarTipo();

function revisarLocal() {
  const e = {};
  const t = tipoActual();
  if (!t) e.subtipo = 'Elija el tipo de licencia.';
  if (!f.fecha_inicio.value) e.fecha_inicio = 'Escriba la fecha de inicio.';
  if (!f.fecha_fin.value) e.fecha_fin = 'Escriba la fecha final.';
  else if (f.fecha_fin.value < f.fecha_inicio.value) e.fecha_fin = 'La fecha final no puede ser anterior a la inicial.';
  if (f.motivo.value.trim().length < 5) e.motivo = 'Explique brevemente el motivo (mínimo 5 caracteres).';
  const a = f.soporte.files[0];
  if (t?.soporteObligatorio && !a) e.soporte = `La licencia de ${t.nombre.toLowerCase()} requiere soporte en PDF.`;
  if (a && !/\.pdf$/i.test(a.name)) e.soporte = 'El soporte debe ser un PDF.';
  if (a && a.size > op.maxMb * 1024 * 1024) e.soporte = `El archivo supera ${op.maxMb} MB.`;
  return e;
}

async function enviarFormulario(enviar, boton) {
  limpiarErrores(f);
  msg.hidden = true;
  const e = revisarLocal();
  if (Object.keys(e).length) return mostrarErrores(f, e);
  if (enviar) {
    clearTimeout(espera);
    await calcular();
    const dias = resultado ? ` (${resultado.dias} día(s) ${resultado.unidad === 'habiles' ? 'hábiles' : 'calendario'})` : '';
    const ok = await confirmar({ titulo: 'Enviar solicitud de licencia', mensaje: `Va a pedir licencia de ${f.subtipo.value.toLowerCase()} del ${fecha(f.fecha_inicio.value)} al ${fecha(f.fecha_fin.value)}${dias}. Pasará por: ${pasos.join(' → ') || 'aprobación'}. ¿Enviar?`, aceptar: 'Enviar' });
    if (!ok) return;
  }
  const fd = new FormData(f);
  fd.append('tipo', 'LICENCIA');
  fd.append('enviar', String(enviar));
  if (!f.soporte.files.length) fd.delete('soporte');
  await conCarga(boton, async () => {
    try {
      const r = await api('/solicitudes', { metodo: 'POST', formulario: fd });
      location.assign(`/solicitudes/ver?id=${r.id}&nueva=1`);
    } catch (err) {
      if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) mostrarAviso(msg, 'error', err.message);
    }
  });
}
f.addEventListener('submit', (ev) => {
  ev.preventDefault();
  enviarFormulario(true, f.querySelector('[type=submit]'));
});
zona.querySelector('#borrador').addEventListener('click', (ev) => enviarFormulario(false, ev.currentTarget));
