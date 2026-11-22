// Tipo de solicitud PERMISO: validaciones propias. El flujo, los estados y las notificaciones
// los maneja el motor de solicitudes.
import { invalido } from '../../core/errors.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const fechaValida = (s) => {
  if (!FECHA.test(String(s ?? ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const hoyBogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10); // Colombia: UTC−5, sin horario de verano
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fechaTexto = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const tipoPermiso = {
  tipo: 'PERMISO',
  etiqueta: 'Permiso',
  rutaLista: '/permisos',
  rutaNueva: '/permisos/nuevo',
  icono: 'reloj',
  categoriaDocumento: 'SOPORTE_PERMISO',
  documentoSensible: false,
  soporteObligatorio: false,

  async validar(ctx, { body }) {
    const tipos = await ctx.params.valor('LISTA_TIPOS_PERMISO');
    const maxDias = Number(await ctx.params.valor('PERMISO_MAX_DIAS'));
    const e = {};
    const subtipo = tipos.find((t) => t.toUpperCase() === String(body.subtipo ?? '').trim().toUpperCase());
    if (!subtipo) e.subtipo = 'Elija el tipo de permiso.';
    const { fecha_inicio: fi, hora_inicio: hi, fecha_fin: ff, hora_fin: hf } = body;
    if (!fechaValida(fi)) e.fecha_inicio = 'Escriba una fecha válida.';
    if (!HORA.test(String(hi ?? ''))) e.hora_inicio = 'Escriba la hora de inicio (HH:MM).';
    if (!fechaValida(ff)) e.fecha_fin = 'Escriba una fecha válida.';
    if (!HORA.test(String(hf ?? ''))) e.hora_fin = 'Escriba la hora de fin (HH:MM).';
    const motivo = String(body.motivo ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
    if (motivo.length < 5) e.motivo = 'Explique brevemente el motivo (mínimo 5 caracteres).';
    if (motivo.length > 500) e.motivo = 'Máximo 500 caracteres.';
    if (!e.fecha_inicio && !e.hora_inicio && !e.fecha_fin && !e.hora_fin) {
      const ini = Date.parse(`${fi}T${hi}:00Z`);
      const fin = Date.parse(`${ff}T${hf}:00Z`);
      const hoy = hoyBogota();
      if (fin <= ini) e.hora_fin = 'El fin debe ser posterior al inicio.';
      else if (fi < sumarDias(hoy, -30)) e.fecha_inicio = 'Solo se pueden registrar permisos de los últimos 30 días.';
      else if (fi > sumarDias(hoy, 365)) e.fecha_inicio = 'La fecha es demasiado lejana.';
      else if ((Date.parse(`${ff}T00:00:00Z`) - Date.parse(`${fi}T00:00:00Z`)) / 86_400_000 + 1 > maxDias) {
        e.fecha_fin = `Un permiso dura máximo ${maxDias} día(s). Para más tiempo solicite vacaciones o una licencia.`;
      }
    }
    if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);
    const horas = Math.round(((Date.parse(`${ff}T${hf}:00Z`) - Date.parse(`${fi}T${hi}:00Z`)) / 3_600_000) * 100) / 100;
    return { subtipo, fecha_inicio: fi, hora_inicio: hi, fecha_fin: ff, hora_fin: hf, motivo, datos: { horas } };
  },

  resumen(s) {
    const mismoDia = s.fecha_inicio === s.fecha_fin;
    const cuando = mismoDia
      ? `${fechaTexto(s.fecha_inicio)} de ${s.hora_inicio} a ${s.hora_fin}`
      : `del ${fechaTexto(s.fecha_inicio)} ${s.hora_inicio} al ${fechaTexto(s.fecha_fin)} ${s.hora_fin}`;
    return `${s.subtipo ?? 'Permiso'} · ${cuando}`;
  },
};
