// Tarjeta de saldo arriba de "Mis vacaciones" (la monta mis-solicitudes.js con data-cabecera).
import { api } from '/static/js/api.js';
import { htmlSaldo } from '/m/vacaciones/tarjeta-saldo.js';

export async function montar(div) {
  const s = await api('/me/vacaciones/saldo');
  if (s.sinExpediente) return;
  div.innerHTML = `<section class="tarjeta" aria-labelledby="t-saldo"><h2 id="t-saldo">Mi saldo</h2>${htmlSaldo(s)}</section>`;
}
