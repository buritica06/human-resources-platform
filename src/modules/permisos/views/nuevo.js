// Formulario de solicitud de permiso: tipo, fecha y hora de inicio y fin, motivo, soporte PDF opcional.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

let op;
try {
  op = await api('/permisos/opciones');
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
  throw err;
}

const campo = (id, etiqueta, control, ayuda = '') => `<div class="campo">
  <label for="${id}">${etiqueta} <span class="obligatorio" aria-hidden="true">*</span></label>
  ${control}${ayuda ? `<span class="ayuda" id="${id}-ayuda">${ayuda}</span>` : ''}
  <span class="error-campo" id="${id}-error"></span></div>`;

zona.innerHTML = `<section class="tarjeta">
  <div id="msg" tabindex="-1" hidden></div>
  <form id="f" novalidate>
    ${campo('subtipo', 'Tipo de permiso', `<select class="entrada" id="subtipo" name="subtipo" required aria-describedby="subtipo-error"><option value="">Elija…</option>${op.tipos.map((t) => `<option>${escapar(t)}</option>`).join('')}</select>`)}
    <div class="rejilla rejilla--2">
      ${campo('fecha_inicio', 'Fecha de inicio', `<input class="entrada" type="date" id="fecha_inicio" name="fecha_inicio" required value="${hoy}" aria-describedby="fecha_inicio-error">`)}
      ${campo('hora_inicio', 'Hora de inicio', '<input class="entrada" type="time" id="hora_inicio" name="hora_inicio" required value="08:00" aria-describedby="hora_inicio-error">')}
      ${campo('fecha_fin', 'Fecha de fin', `<input class="entrada" type="date" id="fecha_fin" name="fecha_fin" required value="${hoy}" aria-describedby="fecha_fin-ayuda fecha_fin-error">`, `Máximo ${op.maxDias} día(s). Para más tiempo, solicite vacaciones o una licencia.`)}
      ${campo('hora_fin', 'Hora de fin', '<input class="entrada" type="time" id="hora_fin" name="hora_fin" required value="10:00" aria-describedby="hora_fin-error">')}
    </div>
    ${campo('motivo', 'Motivo', '<textarea class="entrada" id="motivo" name="motivo" rows="3" maxlength="500" required aria-describedby="motivo-error"></textarea>')}
    <div class="campo"><label for="soporte">Soporte en PDF (opcional)</label>
      <input class="entrada" type="file" id="soporte" name="soporte" accept="application/pdf,.pdf" aria-describedby="soporte-ayuda soporte-error">
      <span class="ayuda" id="soporte-ayuda">Por ejemplo, la cita médica. Solo PDF, máximo ${op.maxMb} MB.</span>
      <span class="error-campo" id="soporte-error"></span></div>
    <div class="formulario-acciones">
      <button class="btn" type="submit">${icono('ok')} Enviar solicitud</button>
      <button class="btn btn--secundario" type="button" id="borrador">Guardar sin enviar</button>
    </div>
  </form></section>`;

const f = zona.querySelector('#f');
const msg = zona.querySelector('#msg');
f.fecha_inicio.addEventListener('change', () => {
  if (f.fecha_fin.value < f.fecha_inicio.value) f.fecha_fin.value = f.fecha_inicio.value;
});

function revisarLocal() {
  const e = {};
  if (!f.subtipo.value) e.subtipo = 'Elija el tipo de permiso.';
  if (!f.fecha_inicio.value) e.fecha_inicio = 'Escriba la fecha de inicio.';
  if (!f.hora_inicio.value) e.hora_inicio = 'Escriba la hora de inicio.';
  if (!f.fecha_fin.value) e.fecha_fin = 'Escriba la fecha de fin.';
  if (!f.hora_fin.value) e.hora_fin = 'Escriba la hora de fin.';
  if (f.fecha_fin.value && f.hora_fin.value && `${f.fecha_fin.value}T${f.hora_fin.value}` <= `${f.fecha_inicio.value}T${f.hora_inicio.value}`) e.hora_fin = 'El fin debe ser posterior al inicio.';
  if (f.motivo.value.trim().length < 5) e.motivo = 'Explique brevemente el motivo (mínimo 5 caracteres).';
  const archivo = f.soporte.files[0];
  if (archivo && !/\.pdf$/i.test(archivo.name)) e.soporte = 'El soporte debe ser un PDF.';
  if (archivo && archivo.size > op.maxMb * 1024 * 1024) e.soporte = `El archivo supera ${op.maxMb} MB.`;
  return e;
}

async function enviarFormulario(enviar, boton) {
  limpiarErrores(f);
  msg.hidden = true;
  const e = revisarLocal();
  if (Object.keys(e).length) return mostrarErrores(f, e);
  if (enviar) {
    const cuando = f.fecha_inicio.value === f.fecha_fin.value
      ? `el ${fecha(f.fecha_inicio.value)} de ${f.hora_inicio.value} a ${f.hora_fin.value}`
      : `del ${fecha(f.fecha_inicio.value)} ${f.hora_inicio.value} al ${fecha(f.fecha_fin.value)} ${f.hora_fin.value}`;
    const ok = await confirmar({ titulo: 'Enviar solicitud', mensaje: `Va a pedir un permiso (${f.subtipo.value.toLowerCase()}) ${cuando}. Lo revisará primero su director y luego el área contable. ¿Enviar?`, aceptar: 'Enviar' });
    if (!ok) return;
  }
  const fd = new FormData(f);
  fd.append('tipo', 'PERMISO');
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

f.addEventListener('submit', (e) => {
  e.preventDefault();
  enviarFormulario(true, f.querySelector('[type=submit]'));
});
zona.querySelector('#borrador').addEventListener('click', (e) => enviarFormulario(false, e.currentTarget));
