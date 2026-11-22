// Detalle de una incapacidad (dueño y admincontable). El área contable la valida o la devuelve
// con motivo; el dueño puede anularla mientras está en revisión.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, fechaHora, htmlAviso, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';
import { pildora } from '/m/incapacidades/comun.js';

await montarShell();
const zona = document.getElementById('zona');
const titulo = document.getElementById('titulo');
const q = new URLSearchParams(location.search);
const id = Number(q.get('id'));
let aviso = q.get('nueva') === '1' ? htmlAviso('exito', 'Incapacidad registrada. El área contable la revisará y le avisaremos.') : '';
history.replaceState(null, '', `/incapacidades/ver?id=${id}`);
let estadoActual = null;
const TIPO_SOLICITUD = { PERMISO: 'Permiso', VACACIONES: 'Vacaciones', LICENCIA: 'Licencia' };

async function cargar() {
  try {
    if (!(Number.isInteger(id) && id > 0)) throw new Error('No se indicó qué incapacidad ver.');
    const i = await api(`/incapacidades/${id}`);
    estadoActual = i.estado;
    const { propia } = i;
    if (!propia) {
      const v = document.getElementById('volver');
      v.href = '/incapacidades/equipo';
      v.textContent = '← Volver a incapacidades del equipo';
    }
    titulo.textContent = `Incapacidad del ${fecha(i.fechaInicio)}`;
    document.title = `${titulo.textContent} · Talento Humano`;
    zona.innerHTML = `${aviso}
      <section class="tarjeta" aria-labelledby="t-estado">
        <header class="encabezado-tarjeta"><h2 id="t-estado">Estado</h2>${pildora(i.estado, i.estadoEtiqueta)}</header>
        ${i.motivoEstado ? `<p class="comentario">Motivo: “${escapar(i.motivoEstado)}”</p>` : ''}
        ${i.estado === 'DEVUELTA' && propia ? htmlAviso('alerta', 'Corrija lo indicado y vuelva a subir la incapacidad con el botón "Subir incapacidad".') : ''}
        <dl class="datos">
          ${propia ? '' : `<div class="dato"><dt>Colaborador</dt><dd>${escapar(i.colaborador.nombre)} · C.C. ${escapar(i.colaborador.cedula)}</dd></div>`}
          <div class="dato"><dt>Tipo</dt><dd>${escapar(i.tipoEtiqueta)}${i.prorrogaDe ? ` (prórroga)` : ''}</dd></div>
          <div class="dato"><dt>Entidad</dt><dd>${escapar(i.entidad)}</dd></div>
          <div class="dato"><dt>Fechas</dt><dd>Del ${escapar(fecha(i.fechaInicio))} al ${escapar(fecha(i.fechaFin))}</dd></div>
          <div class="dato"><dt>Días</dt><dd>${i.dias}</dd></div>
          <div class="dato"><dt>Número del certificado</dt><dd>${escapar(i.numeroCertificado ?? '—')}</dd></div>
          <div class="dato"><dt>${icono('candado')} Diagnóstico</dt><dd>${escapar(i.diagnostico ?? 'No se registró')}</dd></div>
          <div class="dato"><dt>Certificado</dt><dd><a href="/api/v1/documentos/${i.documentoId}?ver=1" target="_blank" rel="noopener">${icono('pdf')} Ver PDF</a> · <a href="/api/v1/documentos/${i.documentoId}">Descargar</a></dd></div>
          <div class="dato"><dt>Registrada</dt><dd>${escapar(fechaHora(i.creadoEn))}</dd></div>
          ${i.revisadoEn ? `<div class="dato"><dt>Revisada</dt><dd>${escapar(fechaHora(i.revisadoEn))}</dd></div>` : ''}
        </dl>
        ${i.crucesSolicitudes?.length ? `<div class="aviso-contenedor">${htmlAviso('alerta', `En esas fechas también hay: ${i.crucesSolicitudes.map((s) => `${TIPO_SOLICITUD[s.tipo] ?? s.tipo} del ${fecha(s.fechaInicio)} al ${fecha(s.fechaFin)} (${s.estado.toLowerCase().replace('_', ' ')})`).join('; ')}. La incapacidad interrumpe esas ausencias: revíselo en la nómina.`)}</div>` : ''}
        <div class="formulario-acciones">
          ${i.acciones.validar ? `<button type="button" class="btn" id="validar">${icono('ok')} Validar</button>` : ''}
          ${i.acciones.devolver ? `<button type="button" class="btn btn--peligro" id="devolver">${icono('cerrar')} Devolver</button>` : ''}
          ${i.acciones.anular ? `<button type="button" class="btn btn--secundario" id="anular">${icono('cancelar')} Anular</button>` : ''}
        </div>
      </section>`;
    aviso = '';
    zona.querySelector('#validar')?.addEventListener('click', async (e) => {
      const boton = e.currentTarget;
      if (!(await confirmar({ titulo: 'Validar incapacidad', mensaje: '¿Confirma que el certificado y los datos son correctos? Se le avisará al colaborador.', aceptar: 'Validar' }))) return;
      await conCarga(boton, () => accion('validar', { estadoEsperado: estadoActual }, 'Incapacidad validada.').catch(() => {}));
    });
    zona.querySelector('#devolver')?.addEventListener('click', () => dialogoMotivo({ titulo: 'Devolver incapacidad', ruta: 'devolver', obligatorio: true, boton: 'Devolver', ayuda: 'Diga qué debe corregir el colaborador; lo verá en la notificación.' }));
    zona.querySelector('#anular')?.addEventListener('click', () => dialogoMotivo({ titulo: 'Anular incapacidad', ruta: 'anular', obligatorio: !propia, boton: 'Anular', ayuda: 'Por ejemplo: se subió un archivo equivocado.' }));
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}

async function accion(ruta, datos, ok, antes) {
  try {
    await api(`/incapacidades/${id}/${ruta}`, { metodo: 'POST', datos });
    antes?.();
    toast(ok);
    await cargar();
    titulo.focus();
  } catch (err) {
    toast(err.message, 'error');
    if (err.status === 409) await cargar();
    throw err;
  }
}

function dialogoMotivo({ titulo: t, ruta, obligatorio, boton, ayuda }) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'dm-titulo');
  d.innerHTML = `<h2 id="dm-titulo">${escapar(t)}</h2>
    <form novalidate><div class="campo"><label for="dm-motivo">Motivo ${obligatorio ? '<span class="obligatorio" aria-hidden="true">*</span>' : '(opcional)'}</label>
      <textarea class="entrada" id="dm-motivo" name="motivo" rows="3" maxlength="500" aria-describedby="dm-motivo-ayuda dm-motivo-error"></textarea>
      <span class="ayuda" id="dm-motivo-ayuda">${escapar(ayuda)}</span><span class="error-campo" id="dm-motivo-error"></span></div>
      <div class="formulario-acciones"><button class="btn ${ruta === 'devolver' ? 'btn--peligro' : ''}" type="submit">${escapar(boton)}</button>
      <button class="btn btn--secundario" type="button" data-cerrar>Volver</button></div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
  const f = d.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    const motivo = f.motivo.value.trim();
    if (obligatorio && motivo.length < 5) return mostrarErrores(f, { motivo: 'Explique el motivo (mínimo 5 caracteres).' });
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        const datos = { ...(motivo ? { motivo } : {}), ...(ruta === 'devolver' ? { estadoEsperado: estadoActual } : {}) };
        await accion(ruta, datos, ruta === 'devolver' ? 'Incapacidad devuelta.' : 'Incapacidad anulada.', () => d.close());
      } catch (err) {
        if (err.status === 409) d.close(); // la vista ya se recargó con el estado nuevo
        else if (err.campos?.motivo) mostrarErrores(f, { motivo: err.campos.motivo });
      }
    });
  });
  d.showModal();
  f.motivo.focus();
}

cargar();
addEventListener('th:cambio', (e) => {
  if (e.detail?.tipo === 'incapacidad' && e.detail.id === id) cargar();
});
