// Vista previa de un periodo (admincontable): totales, advertencias, volantes y acciones
// (publicar, eliminar borrador, anular publicado).
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import {
  confirmar,
  conCarga,
  copExacto,
  escapar,
  fechaHora,
  htmlAviso,
  limpiarErrores,
  mostrarErrores,
  periodoTexto,
  toast,
} from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const id = Number(new URLSearchParams(location.search).get('id'));
const ESTADO = {
  BORRADOR: ['alerta', 'editar', 'Borrador'],
  PUBLICADO: ['exito', 'ok', 'Publicado'],
  ANULADO: ['neutro', 'cerrar', 'Anulado'],
};
const pildora = (e) => `<span class="pildora pildora--${ESTADO[e][0]}">${icono(ESTADO[e][1])} ${ESTADO[e][2]}</span>`;

async function cargar() {
  try {
    if (!(Number.isInteger(id) && id > 0)) throw new Error('No se indicó qué periodo ver.');
    const { periodo: p, volantes } = await api(`/nomina/periodos/${id}`);
    document.getElementById('titulo').textContent = p.hoja;
    document.title = `${p.hoja} · Talento Humano`;
    zona.innerHTML = `
      <section class="tarjeta" aria-labelledby="t-resumen">
        <header class="encabezado-tarjeta"><h2 id="t-resumen">Resumen</h2>${pildora(p.estado)}</header>
        <dl class="datos">
          <div class="dato"><dt>Periodo</dt><dd>${escapar(periodoTexto(p.inicio, p.fin))}</dd></div>
          <div class="dato"><dt>Colaboradores</dt><dd>${p.colaboradores}</dd></div>
          <div class="dato"><dt>Total devengado</dt><dd>${copExacto(p.totalDevengado)}</dd></div>
          <div class="dato"><dt>Total deducciones</dt><dd>${copExacto(p.totalDeducido)}</dd></div>
          <div class="dato"><dt>Neto total</dt><dd>${copExacto(p.totalNeto)}</dd></div>
          <div class="dato"><dt>Pagos adicionales</dt><dd>${copExacto(p.totalAdicional)}</dd></div>
          <div class="dato"><dt>Archivo</dt><dd>${escapar(p.archivo ?? '—')}</dd></div>
          <div class="dato"><dt>Cargado</dt><dd>${escapar(fechaHora(p.cargadoEn))}</dd></div>
          ${p.publicadoEn ? `<div class="dato"><dt>Publicado</dt><dd>${escapar(fechaHora(p.publicadoEn))}</dd></div>` : ''}
          ${p.anuladoEn ? `<div class="dato"><dt>Anulado</dt><dd>${escapar(fechaHora(p.anuladoEn))}: ${escapar(p.motivoAnulacion ?? '')}</dd></div>` : ''}
        </dl>
        ${p.advertencias.length ? `<details><summary>${p.advertencias.length} advertencia(s) de la carga</summary><ul>${p.advertencias.map((a) => `<li>${a.fila ? `Fila ${a.fila}: ` : ''}${escapar(a.mensaje)}</li>`).join('')}</ul></details>` : ''}
        <div class="formulario-acciones" id="acciones">
          ${
            p.estado === 'BORRADOR'
              ? `<button type="button" class="btn" id="publicar">${icono('ok')} Publicar a los colaboradores</button>
             <button type="button" class="btn btn--peligro" id="eliminar">Eliminar borrador</button>`
              : ''
          }
          ${p.estado === 'PUBLICADO' ? `<button type="button" class="btn btn--peligro" id="anular">Anular periodo</button>` : ''}
        </div>
        ${p.estado === 'BORRADOR' ? `<p class="ayuda">Revise algunos volantes antes de publicar. Al publicar, cada colaborador verá el suyo.</p>` : ''}
      </section>
      <section class="tarjeta" aria-labelledby="t-volantes"><h2 id="t-volantes">Volantes (${volantes.length})</h2>
        <table class="tabla"><thead><tr><th scope="col">Colaborador</th><th scope="col">Sede</th><th scope="col" class="num">Devengado</th><th scope="col" class="num">Deducciones</th><th scope="col" class="num">Neto</th><th scope="col" class="num">Adicional</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${volantes
          .map(
            (v) => `<tr>
          <td data-etiqueta="Colaborador">${escapar(v.nombre)}<br><span class="ayuda">C.C. ${escapar(v.cedula)}</span></td>
          <td data-etiqueta="Sede">${escapar(v.sede ?? '—')}</td>
          <td data-etiqueta="Devengado" class="num">${copExacto(v.devengado)}</td>
          <td data-etiqueta="Deducciones" class="num">${copExacto(v.deducido)}</td>
          <td data-etiqueta="Neto" class="num"><strong>${copExacto(v.neto)}</strong></td>
          <td data-etiqueta="Adicional" class="num">${v.adicional ? copExacto(v.adicional) : '—'}</td>
          <td class="acciones"><a class="btn btn--chico btn--secundario" href="/volantes/ver?id=${v.id}&periodo=${id}">Ver<span class="sr-only"> volante de ${escapar(v.nombre)}</span></a></td>
        </tr>`,
          )
          .join('')}</tbody></table></section>`;

    zona.querySelector('#publicar')?.addEventListener('click', async (e) => {
      const boton = e.currentTarget; // después del await, currentTarget ya es null
      if (
        !(await confirmar({
          titulo: 'Publicar nómina',
          mensaje: `Los ${p.colaboradores} colaboradores podrán ver y descargar su volante de ${p.hoja}. ¿Publicar?`,
          aceptar: 'Publicar',
        }))
      )
        return;
      await conCarga(boton, async () => {
        try {
          await api(`/nomina/periodos/${id}/publicar`, { metodo: 'POST' });
          toast('Nómina publicada.');
          await cargar();
          document.getElementById('titulo').focus();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    zona.querySelector('#eliminar')?.addEventListener('click', async (e) => {
      const boton = e.currentTarget;
      if (
        !(await confirmar({
          titulo: 'Eliminar borrador',
          mensaje: `Se eliminará el borrador de ${p.hoja} y sus volantes. Podrá volver a cargarlo.`,
          aceptar: 'Eliminar',
          peligro: true,
        }))
      )
        return;
      await conCarga(boton, async () => {
        try {
          await api(`/nomina/periodos/${id}`, { metodo: 'DELETE' });
          location.assign('/nomina');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    zona.querySelector('#anular')?.addEventListener('click', () => dialogoAnular(p));
  } catch (err) {
    zona.innerHTML = htmlAviso('error', err.message);
  } finally {
    zona.removeAttribute('aria-busy');
  }
}

function dialogoAnular(p) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'an-titulo');
  d.innerHTML = `<h2 id="an-titulo">Anular ${escapar(p.hoja)}</h2>
    <p>Los colaboradores dejarán de ver estos volantes. El periodo quedará registrado como anulado y podrá cargar la versión corregida.</p>
    <form novalidate><div class="campo"><label for="motivo">Motivo <span class="obligatorio" aria-hidden="true">*</span></label>
      <textarea class="entrada" id="motivo" name="motivo" rows="3" maxlength="300" required aria-describedby="motivo-error"></textarea>
      <span class="error-campo" id="motivo-error"></span></div>
      <div class="formulario-acciones"><button class="btn btn--peligro" type="submit">Anular</button>
      <button class="btn btn--secundario" type="button" data-cerrar>Cancelar</button></div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-cerrar]').addEventListener('click', () => d.close());
  const f = d.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(f);
    if (f.motivo.value.trim().length < 5) return mostrarErrores(f, { motivo: 'Explique el motivo (mínimo 5 caracteres).' });
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        await api(`/nomina/periodos/${id}/anular`, { metodo: 'POST', datos: { motivo: f.motivo.value } });
        d.close();
        toast('Periodo anulado.');
        await cargar();
        document.getElementById('titulo').focus();
      } catch (err) {
        if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) toast(err.message, 'error');
      }
    });
  });
  d.showModal();
  f.motivo.focus();
}

cargar();
