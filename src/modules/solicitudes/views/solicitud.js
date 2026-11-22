// Detalle de una solicitud: estado (en tiempo real), pasos del flujo, historial y acciones
// según quién la mira (cancelar/enviar el solicitante; aprobar/rechazar el aprobador).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, fechaHora, htmlAviso, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

await montarShell();
const zona = document.getElementById('zona');
const titulo = document.getElementById('titulo');
const q = new URLSearchParams(location.search);
const id = Number(q.get('id'));
const ACCION = { CREAR: 'Creó la solicitud', ENVIAR: 'Envió la solicitud', APROBAR: 'Aprobó', RECHAZAR: 'Rechazó', CANCELAR: 'Canceló', OMITIR: 'Paso omitido automáticamente' };
let estadoActual = null; // el estado que ve el usuario: se envía al aprobar/rechazar (409 si cambió)
let aviso = q.get('nueva') === '1' ? htmlAviso('exito', 'Solicitud registrada. Verá aquí cómo avanza y le avisaremos cada cambio.') : '';
history.replaceState(null, '', `/solicitudes/ver?id=${id}`);

async function cargar() {
  try {
    if (!(Number.isInteger(id) && id > 0)) throw new Error('No se indicó qué solicitud ver.');
    const s = await api(`/solicitudes/${id}`);
    estadoActual = s.estado;
    // "Volver": a la página de donde vino (si es de este sitio) o a la lista del tipo
    const ref = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : null;
    const LISTA = { PERMISO: '/permisos', VACACIONES: '/vacaciones', LICENCIA: '/licencias' };
    document.getElementById('volver').href = ref && !ref.startsWith('/solicitudes/ver') && !ref.endsWith('/nuevo') ? ref : s.acciones.aprobar ? '/aprobaciones' : (LISTA[s.tipo] ?? '/inicio');
    titulo.textContent = `${s.tipoEtiqueta}: ${s.subtipo ?? ''}`.trim();
    document.title = `${titulo.textContent} · Talento Humano`;
    zona.innerHTML = `${aviso}
      <section class="tarjeta" aria-labelledby="t-estado">
        <header class="encabezado-tarjeta"><h2 id="t-estado">Estado</h2>${pildoraEstado(s.estado, s.estadoEtiqueta)}</header>
        ${s.pasos.length ? `<ol class="pasos pasos--flujo" aria-label="Pasos de aprobación">
          ${s.pasos.map((p, i) => pasoHtml(p, i)).join('')}
          <li data-hecho="${s.estado === 'APROBADA'}"><span class="num">${s.estado === 'APROBADA' ? icono('ok') : s.pasos.length + 1}</span><span>Aprobada</span></li>
        </ol>` : ''}
        <dl class="datos">
          <div class="dato"><dt>Colaborador</dt><dd>${escapar(s.colaborador.nombre)}</dd></div>
          <div class="dato"><dt>Tipo</dt><dd>${escapar(s.subtipo ?? s.tipoEtiqueta)}</dd></div>
          <div class="dato"><dt>Cuándo</dt><dd>${escapar(cuando(s))}</dd></div>
          ${s.datos?.horas ? `<div class="dato"><dt>Duración</dt><dd>${escapar(String(s.datos.horas).replace('.', ','))} h</dd></div>` : ''}
          ${s.diasHabiles !== null ? `<div class="dato"><dt>Días hábiles</dt><dd>${escapar(String(s.diasHabiles).replace('.', ','))}</dd></div>` : ''}
          ${s.diasCompensar ? `<div class="dato"><dt>Días compensados en dinero</dt><dd>${escapar(String(s.diasCompensar).replace('.', ','))}</dd></div>` : ''}
          ${s.datos?.regreso ? `<div class="dato"><dt>Regresa a trabajar</dt><dd>${escapar(fecha(s.datos.regreso))}</dd></div>` : ''}
          ${s.datos?.festivos?.length ? `<div class="dato"><dt>Festivos en el periodo</dt><dd>${s.datos.festivos.map((x) => `${escapar(x.nombre)} (${escapar(fecha(x.fecha))})`).join(', ')}</dd></div>` : ''}
          ${typeof s.datos?.saldoAlEnviar === 'number' ? `<div class="dato"><dt>Saldo disponible al enviar</dt><dd>${escapar(String(s.datos.saldoAlEnviar).replace('.', ','))} día(s)</dd></div>` : ''}
          <div class="dato"><dt>${s.tipo === 'VACACIONES' ? 'Observaciones' : 'Motivo'}</dt><dd>${escapar(s.motivo ?? '—')}</dd></div>
          <div class="dato"><dt>Soporte</dt><dd>${s.documentoId ? `<a href="/api/v1/documentos/${s.documentoId}?ver=1" target="_blank" rel="noopener">${icono('pdf')} Ver PDF</a> · <a href="/api/v1/documentos/${s.documentoId}">Descargar</a>` : 'Sin soporte'}</dd></div>
        </dl>
        <div class="formulario-acciones" id="acciones">
          ${s.acciones.aprobar ? `<button type="button" class="btn" id="aprobar">${icono('ok')} Aprobar</button>` : ''}
          ${s.acciones.rechazar ? `<button type="button" class="btn btn--peligro" id="rechazar">${icono('cerrar')} Rechazar</button>` : ''}
          ${s.acciones.enviar ? `<button type="button" class="btn" id="enviar">${icono('ok')} Enviar</button>` : ''}
          ${s.acciones.cancelar ? `<button type="button" class="btn btn--secundario" id="cancelar">${icono('cancelar')} Cancelar solicitud</button>` : ''}
        </div>
      </section>
      <section class="tarjeta" aria-labelledby="t-hist"><h2 id="t-hist">Historial</h2>
        <ol class="historial">${s.eventos.map((e) => `<li><strong>${escapar(ACCION[e.accion] ?? e.accion)}</strong> · ${escapar(e.actor ?? '')}
          <span class="ayuda">${escapar(fechaHora(e.creado_en))} → ${escapar(e.estadoHastaEtiqueta)}</span>
          ${e.comentario ? `<p class="comentario">“${escapar(e.comentario)}”</p>` : ''}</li>`).join('')}</ol>
      </section>`;
    aviso = '';
    zona.querySelector('#aprobar')?.addEventListener('click', aprobar);
    zona.querySelector('#rechazar')?.addEventListener('click', () => dialogoMotivo({ titulo: 'Rechazar solicitud', obligatorio: true, boton: 'Rechazar', ruta: 'rechazar', campo: 'motivo' }));
    zona.querySelector('#cancelar')?.addEventListener('click', () => dialogoMotivo({ titulo: 'Cancelar solicitud', obligatorio: false, boton: 'Cancelar solicitud', ruta: 'cancelar', campo: 'motivo', ayuda: 'Opcional: cuéntenos por qué.' }));
    zona.querySelector('#enviar')?.addEventListener('click', enviarBorrador);
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}

// Paso del flujo: hecho, omitido, rechazado/cancelado aquí, en curso o pendiente (icono + texto)
function pasoHtml(p, i) {
  const E = {
    HECHO: ['ok', 'hecho', 'true'], OMITIDO: ['cancelar', 'omitido: la sede no tiene director', 'omitido'],
    RECHAZADO: ['cerrar', 'rechazado en este paso', 'rechazado'], CANCELADO: ['cancelar', 'cancelado en este paso', 'omitido'],
    ACTUAL: [null, 'en curso', 'false'], PENDIENTE: [null, 'pendiente', 'false'],
  }[p.estado];
  return `<li ${p.estado === 'ACTUAL' ? 'aria-current="step"' : ''} data-hecho="${E[2]}">
    <span class="num">${E[0] ? icono(E[0]) : i + 1}</span><span>${escapar(p.etiqueta)} <span class="ayuda">(${E[1]})</span></span></li>`;
}

async function aprobar(e) {
  const boton = e.currentTarget;
  if (!(await confirmar({ titulo: 'Aprobar solicitud', mensaje: '¿Confirma la aprobación? Se le avisará al colaborador.', aceptar: 'Aprobar' }))) return;
  await conCarga(boton, () => accion('aprobar', { estadoEsperado: estadoActual }, 'Solicitud aprobada.'));
}

async function enviarBorrador(e) {
  const boton = e.currentTarget;
  if (!(await confirmar({ titulo: 'Enviar solicitud', mensaje: 'Se enviará para aprobación. ¿Continuar?', aceptar: 'Enviar' }))) return;
  await conCarga(boton, () => accion('enviar', {}, 'Solicitud enviada.'));
}

async function accion(ruta, datos, ok, antesDeRecargar) {
  try {
    await api(`/solicitudes/${id}/${ruta}`, { metodo: 'POST', datos });
    antesDeRecargar?.(); // p. ej. cerrar el diálogo, para que el foco pueda ir al título
    toast(ok);
    await cargar();
    titulo.focus();
  } catch (err) {
    toast(err.message, 'error');
    if (err.status === 409) await cargar();
    throw err;
  }
}

function dialogoMotivo({ titulo: t, obligatorio, boton, ruta, campo, ayuda }) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'dm-titulo');
  d.innerHTML = `<h2 id="dm-titulo">${escapar(t)}</h2>
    <form novalidate><div class="campo"><label for="dm-${campo}">Motivo ${obligatorio ? '<span class="obligatorio" aria-hidden="true">*</span>' : '(opcional)'}</label>
      <textarea class="entrada" id="dm-${campo}" name="${campo}" rows="3" maxlength="500" ${obligatorio ? 'required' : ''} aria-describedby="${ayuda ? `dm-${campo}-ayuda ` : ''}dm-${campo}-error"></textarea>
      ${ayuda ? `<span class="ayuda" id="dm-${campo}-ayuda">${escapar(ayuda)}</span>` : ''}
      <span class="error-campo" id="dm-${campo}-error"></span></div>
      <div class="formulario-acciones"><button class="btn ${ruta === 'rechazar' ? 'btn--peligro' : ''}" type="submit">${escapar(boton)}</button>
      <button class="btn btn--secundario" type="button" data-cerrar>Volver</button></div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
  const f = d.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const valor = f.elements[campo].value.trim();
    if (obligatorio && valor.length < 5) return mostrarErrores(f, { [campo]: 'Explique el motivo (mínimo 5 caracteres). El colaborador lo verá.' });
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        const datos = { ...(valor ? { [campo]: valor } : {}), ...(ruta === 'rechazar' ? { estadoEsperado: estadoActual } : {}) };
        await accion(ruta, datos, ruta === 'rechazar' ? 'Solicitud rechazada.' : 'Solicitud cancelada.', () => d.close());
      } catch (err) {
        if (Object.keys(err.campos ?? {}).length) mostrarErrores(f, Object.fromEntries(Object.entries(err.campos).map(([, m]) => [campo, m])));
      }
    });
  });
  d.showModal();
  f.elements[campo].focus();
}

cargar();
addEventListener('th:cambio', (e) => {
  if (e.detail?.tipo === 'solicitud' && e.detail.id === id) cargar();
});
