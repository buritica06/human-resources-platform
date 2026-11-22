// Registrar incapacidad: tipo, entidad, fechas, (prórroga), número, diagnóstico opcional y PDF.
// El admincontable llega con ?colaborador=ID para registrar a nombre de otra persona.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';

const me = await montarShell();
const zona = document.getElementById('zona');
const colaboradorId = Number(new URLSearchParams(location.search).get('colaborador')) || null;
const aNombreDeOtro = colaboradorId && me?.usuario?.rol === 'ADMIN';

let op;
try {
  op = await api(`/incapacidades/opciones${aNombreDeOtro ? `?colaborador=${colaboradorId}` : ''}`);
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
  throw err;
} finally {
  zona.removeAttribute('aria-busy');
}
if (op.sinExpediente && !aNombreDeOtro) {
  zona.innerHTML = htmlAviso('info', 'Su cuenta no tiene expediente de colaborador; no puede registrar incapacidades.');
  throw new Error('sin expediente');
}
if (aNombreDeOtro) {
  const v = document.getElementById('volver');
  v.href = `/colaboradores/ver?id=${colaboradorId}`;
  v.textContent = '← Volver al expediente';
}

const campo = (id, etiqueta, control, { ayuda = '', obligatorio = true } = {}) => `<div class="campo">
  <label for="${id}">${etiqueta}${obligatorio ? ' <span class="obligatorio" aria-hidden="true">*</span>' : ' (opcional)'}</label>
  ${control}${ayuda ? `<span class="ayuda" id="${id}-ayuda">${ayuda}</span>` : ''}
  <span class="error-campo" id="${id}-error"></span></div>`;
const desc = (id, ayuda) => `aria-describedby="${ayuda ? `${id}-ayuda ` : ''}${id}-error"`;

zona.innerHTML = `<section class="tarjeta">
  ${aNombreDeOtro ? htmlAviso('info', 'Está registrando la incapacidad a nombre de otro colaborador; se le avisará.') : ''}
  <p class="ayuda">${icono('candado')} El certificado y el diagnóstico son datos de salud: solo los ven ${aNombreDeOtro ? 'el colaborador' : 'usted'} y el área contable. El director solo ve las fechas.</p>
  <div id="msg" tabindex="-1" hidden></div>
  <form id="f" novalidate>
    <fieldset class="campo" aria-describedby="tipo-error"><legend>Tipo de incapacidad <span class="obligatorio" aria-hidden="true">*</span></legend>
      <div class="opciones-hojas">
        ${op.tipos.map((t, i) => `<label><input type="radio" name="tipo" value="${escapar(t.codigo)}" ${i === 0 ? 'checked' : ''}><span>${escapar(t.etiqueta)} <span class="ayuda">(la expide la ${escapar(t.entidad)})</span></span></label>`).join('')}
      </div><span class="error-campo" id="tipo-error"></span></fieldset>
    ${campo('entidad', 'EPS o ARL que la expidió', `<input class="entrada" id="entidad" name="entidad" maxlength="80" required value="${escapar(op.eps ?? '')}" autocomplete="off" ${desc('entidad', false)}>`)}
    ${op.prorrogables.length ? campo('prorroga_de', '¿Es prórroga de una incapacidad anterior?', `<select class="entrada" id="prorroga_de" name="prorroga_de" ${desc('prorroga_de', true)}>
        <option value="">No, es una incapacidad nueva</option>
        ${op.prorrogables.map((p) => `<option value="${p.id}" data-fin="${escapar(p.fechaFin)}">Sí, de la del ${escapar(fecha(p.fechaInicio))} al ${escapar(fecha(p.fechaFin))}</option>`).join('')}
      </select>`, { obligatorio: false, ayuda: 'La prórroga empieza el día siguiente al fin de la anterior.' }) : ''}
    <div class="rejilla rejilla--2">
      ${campo('fecha_inicio', 'Desde', `<input class="entrada" type="date" id="fecha_inicio" name="fecha_inicio" required ${desc('fecha_inicio', false)}>`)}
      ${campo('fecha_fin', 'Hasta', `<input class="entrada" type="date" id="fecha_fin" name="fecha_fin" required ${desc('fecha_fin', true)}>`, { ayuda: 'Incluido. Cuentan todos los días del calendario.' })}
    </div>
    <p class="ayuda" id="dias" aria-live="polite"></p>
    ${campo('numero_certificado', 'Número del certificado', `<input class="entrada" id="numero_certificado" name="numero_certificado" maxlength="40" autocomplete="off" ${desc('numero_certificado', false)}>`, { obligatorio: false })}
    ${campo('diagnostico', 'Diagnóstico', `<input class="entrada" id="diagnostico" name="diagnostico" maxlength="200" autocomplete="off" ${desc('diagnostico', true)}>`, { obligatorio: false, ayuda: 'Por ejemplo, el código que aparece en el certificado. Se guarda cifrado.' })}
    ${campo('soporte', 'Certificado en PDF', `<input class="entrada" type="file" id="soporte" name="soporte" accept="application/pdf,.pdf" required ${desc('soporte', true)}>`, { ayuda: `Solo PDF, máximo ${op.maxMb} MB. Si lo tiene en papel, puede escanearlo con el celular como PDF.` })}
    <div class="formulario-acciones"><button class="btn" type="submit">${icono('subir')} Registrar incapacidad</button></div>
  </form></section>`;

const f = zona.querySelector('#f');
const msg = zona.querySelector('#msg');
const diasEl = zona.querySelector('#dias');
const sumar = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const contar = () => (f.fecha_inicio.value && f.fecha_fin.value && f.fecha_fin.value >= f.fecha_inicio.value
  ? Math.round((Date.parse(`${f.fecha_fin.value}T00:00:00Z`) - Date.parse(`${f.fecha_inicio.value}T00:00:00Z`)) / 86_400_000) + 1 : null);
function actualizarDias() {
  const n = contar();
  diasEl.textContent = n ? `${n} día(s) de incapacidad.` : '';
}
f.fecha_inicio.addEventListener('change', () => {
  if (!f.fecha_fin.value || f.fecha_fin.value < f.fecha_inicio.value) f.fecha_fin.value = f.fecha_inicio.value;
  actualizarDias();
});
f.fecha_fin.addEventListener('change', actualizarDias);
f.prorroga_de?.addEventListener('change', () => {
  const fin = f.prorroga_de.selectedOptions[0]?.dataset.fin;
  if (fin) {
    f.fecha_inicio.value = sumar(fin, 1);
    if (!f.fecha_fin.value || f.fecha_fin.value < f.fecha_inicio.value) f.fecha_fin.value = f.fecha_inicio.value;
    actualizarDias();
  }
});
f.tipo.forEach?.((r) => r.addEventListener('change', () => {
  if (r.checked) f.entidad.value = r.value === 'IRL' ? (f.entidad.value === op.eps ? '' : f.entidad.value) : (f.entidad.value || op.eps || '');
}));

function revisarLocal() {
  const e = {};
  if (f.entidad.value.trim().length < 2) e.entidad = 'Escriba la EPS o ARL que expidió la incapacidad.';
  if (!f.fecha_inicio.value) e.fecha_inicio = 'Escriba la fecha de inicio.';
  if (!f.fecha_fin.value) e.fecha_fin = 'Escriba la fecha final.';
  else if (f.fecha_fin.value < f.fecha_inicio.value) e.fecha_fin = 'La fecha final no puede ser anterior a la inicial.';
  const a = f.soporte.files[0];
  if (!a) e.soporte = 'Adjunte el certificado en PDF.';
  else if (!/\.pdf$/i.test(a.name)) e.soporte = 'El certificado debe ser un PDF.';
  else if (a.size > op.maxMb * 1024 * 1024) e.soporte = `El archivo supera ${op.maxMb} MB.`;
  return e;
}

f.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = f.querySelector('[type=submit]');
  limpiarErrores(f);
  msg.hidden = true;
  const e = revisarLocal();
  if (Object.keys(e).length) return mostrarErrores(f, e);
  const ok = await confirmar({
    titulo: 'Registrar incapacidad',
    mensaje: `Incapacidad del ${fecha(f.fecha_inicio.value)} al ${fecha(f.fecha_fin.value)} (${contar()} día(s)). El área contable la revisará y su director verá solo las fechas. ¿Registrar?`,
    aceptar: 'Registrar',
  });
  if (!ok) return;
  const fd = new FormData(f);
  if (!fd.get('prorroga_de')) fd.delete('prorroga_de');
  if (aNombreDeOtro) fd.append('colaborador_id', String(colaboradorId));
  await conCarga(boton, async () => {
    try {
      const r = await api('/incapacidades', { metodo: 'POST', formulario: fd });
      location.assign(`/incapacidades/ver?id=${r.id}&nueva=1`);
    } catch (err) {
      if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) mostrarAviso(msg, 'error', err.message);
    }
  });
});
