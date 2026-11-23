// Resumen del saldo de vacaciones (lo usan "Mis vacaciones", la pestaña del expediente y el formulario).
import { escapar, fecha, htmlAviso } from '/static/js/ui.js';

export const dias = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

export function htmlSaldo(s, { propio = true } = {}) {
  if (!s?.registrado) {
    return htmlAviso('info', propio
      ? 'El área contable aún no ha registrado su saldo de vacaciones. Cuando lo haga, verá aquí sus días disponibles.'
      : 'Aún no se ha registrado el saldo de vacaciones al corte de este colaborador.');
  }
  return `<p class="ayuda">Días hábiles disponibles para solicitar</p>
    <p class="cifra-grande">${dias(s.paraSolicitar)} <span class="cifra-grande__unidad">días</span></p>
    ${s.enTramite ? `<p class="ayuda">${dias(s.enTramite)} día(s) reservados en solicitudes en trámite.</p>` : ''}
    ${s.resumido ? '' : `<details><summary>¿Cómo se calcula?</summary>
      <dl class="datos datos--compacto">
        <div class="dato"><dt>Saldo al ${escapar(fecha(s.fechaCorte))}</dt><dd>${dias(s.diasAlCorte)}</dd></div>
        <div class="dato"><dt>Causados desde esa fecha (${s.diasLaborados} días laborados${s.diasNoLaborados ? `, sin ${s.diasNoLaborados} de licencia no remunerada` : ''} × ${s.diasPorAnio} / 360)</dt><dd>+ ${dias(s.causadosDesdeCorte)}</dd></div>
        <div class="dato"><dt>Disfrutados (aprobados)</dt><dd>− ${dias(s.disfrutados)}</dd></div>
        <div class="dato"><dt>Compensados en dinero (aprobados)</dt><dd>− ${dias(s.compensados)}</dd></div>
        <div class="dato"><dt>Disponibles al ${escapar(fecha(s.calculadoAl))}</dt><dd><strong>${dias(s.disponibles)}</strong></dd></div>
        <div class="dato"><dt>En trámite</dt><dd>− ${dias(s.enTramite)}</dd></div>
      </dl>
    </details>`}`;
}
