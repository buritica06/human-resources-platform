// Píldora de estado de una solicitud: color + icono + texto (nunca solo color).
import { icono } from './iconos.js';
import { escapar, fecha } from './ui.js';

export function pildoraEstado(estado, etiqueta) {
  let clase = 'info';
  let ic = 'reloj';
  if (estado === 'APROBADA') [clase, ic] = ['exito', 'ok'];
  else if (estado === 'RECHAZADA') [clase, ic] = ['error', 'cerrar'];
  else if (estado === 'CANCELADA' || estado === 'ANULADA') [clase, ic] = ['neutro', 'cancelar'];
  else if (estado === 'BORRADOR') [clase, ic] = ['neutro', 'editar'];
  else if (estado.startsWith('PENDIENTE_CONTABLE')) clase = 'alerta';
  return `<span class="pildora pildora--${clase}">${icono(ic)} ${escapar(etiqueta ?? estado)}</span>`;
}

// Texto del periodo de una solicitud (con horas si las tiene)
export function cuando(s) {
  const hi = s.horaInicio ? ` ${s.horaInicio}` : '';
  const hf = s.horaFin ? ` ${s.horaFin}` : '';
  if (s.fechaInicio === s.fechaFin) return `${fecha(s.fechaInicio)}${s.horaInicio ? ` de ${s.horaInicio} a ${s.horaFin}` : ''}`;
  return `Del ${fecha(s.fechaInicio)}${hi} al ${fecha(s.fechaFin)}${hf}`;
}
