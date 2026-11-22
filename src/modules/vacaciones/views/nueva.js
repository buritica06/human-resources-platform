// Formulario de vacaciones: fecha de inicio y días hábiles. Mientras escribe, el servidor calcula
// (misma regla que al guardar) el último día, el regreso, los festivos y el saldo que le queda.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, htmlAviso, limpiarErrores, mostrarAviso, mostrarErrores } from '/static/js/ui.js';
import { dias, htmlSaldo } from '/m/vacaciones/tarjeta-saldo.js';

await montarShell();
const zona = document.getElementById('zona');
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const conDia = (f) => `${DIAS_SEMANA[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${fecha(f)}`;

let op;
let saldo;
let pasos = [];
try {
  [op, saldo, { pasos }] = await Promise.all([api('/vacaciones/opciones'), api('/me/vacaciones/saldo'), api('/solicitudes/flujo/VACACIONES')]);
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
  throw err;
}
if (saldo.sinExpediente) {
  zona.innerHTML = htmlAviso('info', 'Su cuenta no tiene expediente de colaborador; no puede solicitar vacaciones.');
  throw new Error('sin expediente');
}

const campo = (id, etiqueta, control, { ayuda = '', obligatorio = true } = {}) => `<div class="campo">
  <label for="${id}">${etiqueta}${obligatorio ? ' <span class="obligatorio" aria-hidden="true">*</span>' : ' (opcional)'}</label>
  ${control}${ayuda ? `<span class="ayuda" id="${id}-ayuda">${ayuda}</span>` : ''}
  <span class="error-campo" id="${id}-error"></span></div>`;

const desc = (id, ayuda) => `aria-describedby="${ayuda ? `${id}-ayuda ` : ''}${id}-error"`;
zona.innerHTML = `
  <section class="tarjeta" aria-labelledby="t-saldo"><h2 id="t-saldo">Su saldo</h2>${htmlSaldo(saldo)}</section>
  ${saldo.registrado ? `<section class="tarjeta">
    <div id="msg" tabindex="-1" hidden></div>
    <form id="f" novalidate>
      <div class="rejilla rejilla--2">
        ${campo('fecha_inicio', 'Primer día de vacaciones', `<input class="entrada" type="date" id="fecha_inicio" name="fecha_inicio" required min="${op.hoy}" ${desc('fecha_inicio', true)}>`, { ayuda: `Debe ser un día hábil. No cuentan los domingos${op.sabadoHabil ? '' : ' ni los sábados'} ni los festivos.` })}
        ${campo('dias', 'Días hábiles a disfrutar', `<input class="entrada" type="number" inputmode="numeric" id="dias" name="dias" required min="1" max="90" step="1" value="1" ${desc('dias', false)}>`)}
      </div>
      ${op.pctCompensacion > 0 ? campo('dias_compensar', 'Días a compensar en dinero', `<input class="entrada" type="number" inputmode="numeric" id="dias_compensar" name="dias_compensar" min="0" step="1" value="0" ${desc('dias_compensar', true)}>`, { obligatorio: false, ayuda: `Hasta el ${op.pctCompensacion} % del total de la solicitud (disfrute + dinero), por acuerdo escrito con la empresa.` }) : ''}
      ${campo('motivo', 'Observaciones', '<textarea class="entrada" id="motivo" name="motivo" rows="2" maxlength="500" aria-describedby="motivo-error"></textarea>', { obligatorio: false })}
      <div id="calculo" class="calculo" aria-live="polite"></div>
      <div class="formulario-acciones">
        <button class="btn" type="submit">${icono('ok')} Enviar solicitud</button>
        <button class="btn btn--secundario" type="button" id="borrador">Guardar sin enviar</button>
      </div>
    </form></section>` : ''}`;

const f = zona.querySelector('#f');
if (f) {
  const msg = zona.querySelector('#msg');
  const calculo = zona.querySelector('#calculo');
  let plan = null;
  let turno = 0;

  const datos = () => ({ fecha_inicio: f.fecha_inicio.value, dias: Number(f.dias.value), dias_compensar: Number(f.dias_compensar?.value || 0) });

  // marcar: al enviar se marcan los campos con error (aria-invalid) y se enfoca; mientras escribe,
  // solo se actualiza el resumen (para no interrumpir a los lectores de pantalla).
  let ultimoError = null;
  async function simular({ marcar = false } = {}) {
    const mio = ++turno;
    plan = null;
    ultimoError = null;
    limpiarErrores(f);
    if (!f.fecha_inicio.value || !f.dias.value) {
      calculo.innerHTML = '<p class="ayuda">Elija el primer día y cuántos días hábiles quiere; aquí verá cuándo regresa.</p>';
      return;
    }
    try {
      const p = await api('/vacaciones/simular', { metodo: 'POST', datos: datos() });
      if (mio !== turno) return;
      plan = p;
      calculo.innerHTML = `<div class="resumen-calculo">
        <p><strong>Del ${escapar(conDia(p.fechaInicio))} al ${escapar(conDia(p.fechaFin))}</strong></p>
        <p>${icono('calendario')} Regresa a trabajar el <strong>${escapar(conDia(p.regreso))}</strong> (${p.diasCalendario} días de calendario).</p>
        ${p.festivos.length ? `<p class="ayuda">Festivos en el periodo (no se cuentan): ${p.festivos.map((x) => `${escapar(x.nombre)} (${escapar(fecha(x.fecha))})`).join(', ')}.</p>` : ''}
        <p>Saldo: ${dias(p.saldoAntes)} → <strong>${dias(p.saldoDespues)}</strong> día(s) después de esta solicitud.</p></div>`;
    } catch (err) {
      if (mio !== turno) return;
      ultimoError = err;
      if (marcar && Object.keys(err.campos ?? {}).length) mostrarErrores(f, err.campos);
      calculo.innerHTML = htmlAviso('alerta', Object.values(err.campos ?? {})[0] ?? err.message);
    }
  }
  let espera;
  f.addEventListener('input', (e) => {
    if (e.target.name === 'motivo') return;
    clearTimeout(espera);
    espera = setTimeout(simular, 400);
  });
  simular();

  async function enviarFormulario(enviar, boton) {
    msg.hidden = true;
    clearTimeout(espera);
    await simular({ marcar: true });
    if (!plan) {
      // Errores sin campo (saldo no registrado, red…): aviso general con foco
      if (!f.querySelector('[aria-invalid="true"]')) mostrarAviso(msg, 'error', ultimoError?.message ?? 'Revise los datos.');
      return;
    }
    if (enviar) {
      const comp = plan.diasCompensar ? ` y compensar ${plan.diasCompensar} día(s) en dinero` : '';
      const ok = await confirmar({
        titulo: 'Enviar solicitud de vacaciones',
        mensaje: `Va a pedir ${plan.dias} día(s) hábil(es) del ${conDia(plan.fechaInicio)} al ${conDia(plan.fechaFin)}${comp}; regresaría el ${conDia(plan.regreso)}. Pasará por: ${pasos.join(' → ') || 'aprobación'}. ¿Enviar?`,
        aceptar: 'Enviar',
      });
      if (!ok) return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...datos(), motivo: f.motivo.value, tipo: 'VACACIONES', enviar: String(enviar) })) fd.append(k, String(v));
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
}
