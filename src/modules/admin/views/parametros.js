// Parámetros con vigencia: se ve el valor que rige hoy, el historial y lo programado. Un cambio
// se PROGRAMA con fecha desde (hoy o futura); lo programado se puede borrar antes de que rija.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { confirmar, conCarga, escapar, fecha, fechaHora, htmlAviso, limpiarErrores, mostrarErrores, toast } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
let parametros = [];
let filtro = '';

const mostrarValor = (v, tipo) => {
  if (tipo === 'booleano') return v ? 'Sí' : 'No';
  if (tipo === 'json') return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.join(' · ') : JSON.stringify(v);
  return String(v).replace('.', ',');
};
const ESTADO = { VIGENTE: ['exito', 'rige hoy'], PROGRAMADA: ['info', 'programada'], HISTORICA: ['neutro', 'histórica'] };

function pintar() {
  const lista = parametros.filter((p) => !filtro || `${p.clave} ${p.descripcion}`.toLowerCase().includes(filtro.toLowerCase()));
  document.getElementById('lista').innerHTML = lista.length ? lista.map((p) => `<details class="tarjeta-interna" data-clave="${escapar(p.clave)}">
    <summary><span><strong>${escapar(p.clave)}</strong>${p.verificar ? ` <span class="pildora pildora--alerta">${icono('alerta')} verificar</span>` : ''}<br>
      <span class="ayuda">${escapar(p.descripcion)}</span><br><span class="valor-param">${p.actual ? escapar(mostrarValor(p.actual.valor, p.tipo)) : 'Sin valor vigente hoy'}</span></span></summary>
    <ul class="lista-compacta">${[...p.versiones].reverse().map((v) => `<li class="version">
      <span class="pildora pildora--${ESTADO[v.estado][0]}">${escapar(ESTADO[v.estado][1])}</span>
      <span>Desde ${escapar(fecha(v.desde))}${v.hasta ? ` hasta ${escapar(fecha(v.hasta))}` : ''}:</span>
      <span class="valor-param">${escapar(mostrarValor(v.valor, p.tipo))}</span>
      ${v.actualizadoPor ? `<span class="ayuda">(${escapar(v.actualizadoPor)}, ${escapar(fechaHora(v.actualizadoEn))})</span>` : ''}
      ${v.estado === 'PROGRAMADA' ? `<button type="button" class="btn btn--chico btn--fantasma" data-borrar="${v.id}">Borrar<span class="sr-only"> la versión programada de ${escapar(p.clave)}</span></button>` : ''}
    </li>`).join('')}</ul>
    ${formulario(p)}
  </details>`).join('') : '<p class="ayuda">Ningún parámetro coincide.</p>';
}

function formulario(p) {
  const id = `f-${p.clave}`;
  const v = p.actual?.valor ?? p.versiones.at(-1).valor;
  let control;
  if (p.tipo === 'booleano') control = `<select class="entrada" id="${id}-valor" name="valor"><option value="true" ${v ? 'selected' : ''}>Sí</option><option value="false" ${v ? '' : 'selected'}>No</option></select>`;
  else if (p.tipo === 'numero') control = `<input class="entrada" id="${id}-valor" name="valor" inputmode="decimal" value="${escapar(String(v).replace('.', ','))}" aria-describedby="${id}-valor-error">`;
  else if (p.tipo === 'json' && Array.isArray(v) && v.every((x) => typeof x === 'string')) control = `<textarea class="entrada" id="${id}-valor" name="valor" rows="4" aria-describedby="${id}-valor-ayuda ${id}-valor-error">${escapar(v.join('\n'))}</textarea><span class="ayuda" id="${id}-valor-ayuda">Un valor por línea.</span>`;
  else if (p.tipo === 'json') control = `<textarea class="entrada valor-param" id="${id}-valor" name="valor" rows="8" spellcheck="false" aria-describedby="${id}-valor-ayuda ${id}-valor-error">${escapar(JSON.stringify(v, null, 2))}</textarea><span class="ayuda" id="${id}-valor-ayuda">Formato JSON: conserve la misma estructura.</span>`;
  else control = `<input class="entrada" id="${id}-valor" name="valor" maxlength="500" value="${escapar(v)}" aria-describedby="${id}-valor-error">`;
  return `<form class="formulario-param" data-clave="${escapar(p.clave)}" data-tipo="${p.tipo}" novalidate>
    <h3 class="subtitulo">Programar un cambio</h3>
    <div class="rejilla rejilla--2">
      <div class="campo"><label for="${id}-valor">Nuevo valor</label>${control}<span class="error-campo" id="${id}-valor-error"></span></div>
      <div class="campo"><label for="${id}-desde">Rige desde</label><input class="entrada" type="date" id="${id}-desde" name="desde" min="${hoy}" value="${hoy}" aria-describedby="${id}-desde-error"><span class="error-campo" id="${id}-desde-error"></span></div>
    </div>
    <div class="campo"><label for="${id}-motivo">Motivo del cambio</label><input class="entrada" id="${id}-motivo" name="motivo" maxlength="200" placeholder="Por ejemplo: Decreto 1234 de 2026" aria-describedby="${id}-motivo-error"><span class="error-campo" id="${id}-motivo-error"></span></div>
    <div class="formulario-acciones"><button class="btn" type="submit">${icono('ok')} Programar</button></div>
  </form>`;
}

function leerValor(f) {
  const crudo = f.valor.value;
  const tipo = f.dataset.tipo;
  if (tipo === 'booleano') return crudo === 'true';
  if (tipo === 'numero') {
    // "1.750.905" o "0,6667": con coma, los puntos son de miles; sin coma, el punto es decimal
    const s = crudo.trim();
    return s === '' ? NaN : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  }
  if (tipo === 'json' && !crudo.trim().startsWith('[') && !crudo.trim().startsWith('{')) return crudo.split('\n').map((x) => x.trim()).filter(Boolean);
  if (tipo === 'json') return JSON.parse(crudo);
  return crudo;
}

async function cargar() {
  parametros = (await api('/parametros')).parametros;
  pintar();
}

try {
  zona.innerHTML = `${htmlAviso('info', 'Los cambios se programan con fecha: lo que ya rigió no se modifica. Un cambio con fecha futura no afecta los cálculos de hoy.')}
    <section class="tarjeta" aria-labelledby="t-params"><h2 id="t-params">Parámetros</h2><div class="campo"><label for="buscar">Buscar parámetro</label><input class="entrada" id="buscar" type="search" autocomplete="off"></div>
    <div id="lista"></div></section>`;
  await cargar();
  document.getElementById('buscar').addEventListener('input', (e) => {
    filtro = e.target.value;
    pintar();
  });
  zona.addEventListener('submit', async (e) => {
    const f = e.target.closest('.formulario-param');
    if (!f) return;
    e.preventDefault();
    limpiarErrores(f);
    let valor;
    try {
      valor = leerValor(f);
    } catch {
      return mostrarErrores(f, { valor: 'El JSON no es válido.' });
    }
    const clave = f.dataset.clave;
    if (f.motivo.value.trim().length < 5) return mostrarErrores(f, { motivo: 'Explique el cambio (mínimo 5 caracteres).' });
    if (!(await confirmar({ titulo: `Programar ${clave}`, mensaje: `Desde el ${fecha(f.desde.value)} regirá el nuevo valor. ${f.desde.value === hoy ? 'Empieza a aplicarse HOY.' : 'Hasta entonces sigue el valor actual.'} ¿Continuar?`, aceptar: 'Programar' }))) return;
    await conCarga(f.querySelector('[type=submit]'), async () => {
      try {
        await api(`/parametros/${encodeURIComponent(clave)}/versiones`, { metodo: 'POST', datos: { valor, desde: f.desde.value, motivo: f.motivo.value.trim() } });
        toast('Cambio programado.');
        await cargar();
        const d = document.querySelector(`details[data-clave="${CSS.escape(clave)}"]`);
        if (d) {
          d.open = true;
          d.querySelector('summary').focus();
        }
      } catch (err) {
        if (!Object.keys(err.campos ?? {}).length || !mostrarErrores(f, err.campos)) toast(err.message, 'error');
      }
    });
  });
  zona.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrar]');
    if (!b) return;
    const clave = b.closest('details').dataset.clave;
    if (!(await confirmar({ titulo: 'Borrar versión programada', mensaje: 'La versión anterior seguirá rigiendo. ¿Borrar?', aceptar: 'Borrar', peligro: true }))) return;
    try {
      await api(`/parametros/versiones/${b.dataset.borrar}`, { metodo: 'DELETE' });
      toast('Versión programada borrada.');
      await cargar();
      const d = document.querySelector(`details[data-clave="${CSS.escape(clave)}"]`);
      if (d) {
        d.open = true;
        d.querySelector('summary').focus();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
} finally {
  zona.removeAttribute('aria-busy');
}
