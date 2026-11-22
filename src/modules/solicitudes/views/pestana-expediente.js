// Pestañas Permisos / Vacaciones / Licencias del expediente: historial de solicitudes del tipo.
import { api } from '/static/js/api.js';
import { icono } from '/static/js/iconos.js';
import { escapar, fechaHora, htmlAviso } from '/static/js/ui.js';
import { pildoraEstado, cuando } from '/static/js/estados.js';

const TIPO = { permisos: 'PERMISO', vacaciones: 'VACACIONES', licencias: 'LICENCIA' };

export async function montar(panel, { propio, id, clave }) {
  const tipo = TIPO[clave];
  try {
    const r = propio ? await api(`/me/solicitudes?tipo=${tipo}`) : await api(`/colaboradores/${id}/solicitudes?tipo=${tipo}`);
    const lista = r.solicitudes.filter((s) => s.estado !== 'BORRADOR');
    if (!lista.length) {
      panel.innerHTML = `<div class="vacio">${icono('reloj')}<h3>Sin registros</h3><p>No hay solicitudes de este tipo.</p></div>`;
      return;
    }
    panel.innerHTML = `<table class="tabla"><thead><tr><th scope="col">Solicitud</th><th scope="col">Cuándo</th><th scope="col">Estado</th><th scope="col">Solicitada</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${lista.map((s) => `<tr>
        <td data-etiqueta="Solicitud">${escapar(s.subtipo ?? s.tipoEtiqueta)}</td>
        <td data-etiqueta="Cuándo">${escapar(cuando(s))}</td>
        <td data-etiqueta="Estado">${pildoraEstado(s.estado, s.estadoEtiqueta)}</td>
        <td data-etiqueta="Solicitada">${escapar(fechaHora(s.creadoEn))}</td>
        <td class="acciones"><a class="btn btn--chico btn--secundario" href="/solicitudes/ver?id=${s.id}">Ver<span class="sr-only"> ${escapar(s.subtipo ?? '')}</span></a></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (err) {
    panel.innerHTML = htmlAviso('error', err.message);
  }
}
