// Pestaña "Vacaciones" del expediente: saldo, historial de solicitudes y, para el admincontable,
// el historial de saldos al corte con el formulario para registrar uno nuevo.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { conCarga, escapar, fecha, fechaHora, htmlAviso, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';
import { dias, htmlSaldo } from '/m/vacaciones/tarjeta-saldo.js';
import { montar as montarSolicitudes } from '/m/solicitudes/pestana-expediente.js';

export async function montar(panel, { propio, id, clave }) {
  try {
    const r = propio ? { saldo: await api('/me/vacaciones/saldo'), cortes: [], puedeRegistrar: false } : await api(`/colaboradores/${id}/vacaciones`);
    panel.innerHTML = `<h3 class="subtitulo">Saldo</h3><div id="v-saldo">${htmlSaldo(r.saldo, { propio })}</div>
      ${r.puedeRegistrar || r.cortes.length ? '<h3 class="subtitulo">Saldos al corte registrados</h3><div id="v-cortes"></div>' : ''}
      ${r.puedeRegistrar ? formulario() : ''}
      <h3 class="subtitulo">Solicitudes</h3><div id="v-solicitudes"></div>`;
    pintarCortes(panel, r.cortes);
    await montarSolicitudes(panel.querySelector('#v-solicitudes'), { propio, id, clave });
    if (r.puedeRegistrar) activarFormulario(panel, id);
  } catch (err) {
    panel.innerHTML = htmlAviso('error', err.message);
  }
}

function pintarCortes(panel, cortes) {
  const div = panel.querySelector('#v-cortes');
  if (!div) return;
  div.innerHTML = cortes.length
    ? `<table class="tabla"><thead><tr><th scope="col">Fecha de corte</th><th scope="col">Días</th><th scope="col">Observación</th><th scope="col">Registrado</th></tr></thead>
      <tbody>${cortes.map((c, i) => `<tr>
        <td data-etiqueta="Fecha de corte">${escapar(fecha(c.fechaCorte))}${i === 0 ? ' <span class="pildora pildora--exito">vigente</span>' : ''}</td>
        <td data-etiqueta="Días">${dias(c.dias)}</td>
        <td data-etiqueta="Observación">${escapar(c.observacion)}</td>
        <td data-etiqueta="Registrado">${escapar(fechaHora(c.registradoEn))}${c.registradoPor ? ` · ${escapar(c.registradoPor)}` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="ayuda">Aún no hay saldos registrados. Sin uno, el colaborador no puede solicitar vacaciones.</p>';
}

const formulario = () => `<details class="tarjeta-interna"><summary>${icono('agregar')} Registrar saldo al corte</summary>
  <form id="v-form" novalidate>
    <p class="ayuda">Días de vacaciones que el colaborador tenía pendientes <strong>antes</strong> de la fecha de corte. Desde esa fecha la plataforma suma lo causado y resta lo que se apruebe aquí (incluidas las vacaciones ya aprobadas que empiecen desde esa fecha).</p>
    <div class="rejilla rejilla--2">
      <div class="campo"><label for="v-fecha">Fecha de corte <span class="obligatorio" aria-hidden="true">*</span></label>
        <input class="entrada" type="date" id="v-fecha" name="fecha_corte" required aria-describedby="v-fecha-error"><span class="error-campo" id="v-fecha-error"></span></div>
      <div class="campo"><label for="v-dias">Días pendientes al corte <span class="obligatorio" aria-hidden="true">*</span></label>
        <input class="entrada" type="number" inputmode="decimal" step="0.01" id="v-dias" name="dias" required aria-describedby="v-dias-error"><span class="error-campo" id="v-dias-error"></span></div>
    </div>
    <div class="campo"><label for="v-obs">De dónde sale el saldo <span class="obligatorio" aria-hidden="true">*</span></label>
      <input class="entrada" id="v-obs" name="observacion" maxlength="300" required aria-describedby="v-obs-error"><span class="error-campo" id="v-obs-error"></span></div>
    <div class="formulario-acciones"><button class="btn" type="submit">${icono('ok')} Registrar saldo</button></div>
  </form></details>`;

function activarFormulario(panel, id) {
  const f = panel.querySelector('#v-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const datos = { fecha_corte: f.fecha_corte.value, dias: f.dias.value === '' ? NaN : Number(f.dias.value), observacion: f.observacion.value.trim() };
    const err = {};
    if (!datos.fecha_corte) err.fecha_corte = 'Escriba la fecha de corte.';
    if (!Number.isFinite(datos.dias)) err.dias = 'Escriba los días (puede tener decimales).';
    if (datos.observacion.length < 5) err.observacion = 'Explique de dónde sale el saldo (mínimo 5 caracteres).';
    if (Object.keys(err).length) return mostrarErrores(f, err);
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await api(`/colaboradores/${id}/vacaciones/corte`, { metodo: 'POST', datos });
        panel.querySelector('#v-saldo').innerHTML = htmlSaldo(r.saldo, { propio: false });
        pintarCortes(panel, r.cortes);
        f.reset();
        f.closest('details').open = false;
        toast('Saldo registrado.');
      } catch (er) {
        if (!Object.keys(er.campos ?? {}).length || !mostrarErrores(f, er.campos)) toast(er.message, 'error');
      }
    });
  });
}
