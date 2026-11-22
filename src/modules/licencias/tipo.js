// Tipo de solicitud LICENCIA para el motor de solicitudes (mismo flujo de aprobación que permisos
// y vacaciones). Los tipos, sus días máximos, la unidad (calendario u hábiles), si exigen soporte,
// si el soporte es dato de salud y si descuentan días para causar vacaciones vienen del parámetro
// LISTA_TIPOS_LICENCIA, vigente a la FECHA DE INICIO de la licencia.
//
// Las reglas se leen ANTES de cualquier transacción ("previo"; en SQLite hay una sola conexión) y la
// validación es una función pura sobre ese "previo": se usa al crear, al calcular y al enviar un
// borrador (que pudo quedarse guardado mucho tiempo).
import { invalido } from '../../core/errors.js';
import { contarHabiles, fechaValida, hoyBogota, sumarDias } from '../vacaciones/calendario.js';

const fechaTexto = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const diasCalendario = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const MAX_ABSOLUTO = 366; // tope de digitación para tipos sin máximo legal
const BOOLEANOS = ['remunerada', 'soporteObligatorio', 'sensible', 'descuentaVacaciones'];

// Valor vigente a una fecha; si la fecha es anterior a la primera vigencia, el vigente hoy
async function valorVigente(ctx, clave, fecha) {
  try {
    return await ctx.params.valor(clave, fecha);
  } catch {
    return ctx.params.valor(clave, hoyBogota());
  }
}

// Lee y valida el parámetro (un error de configuración no debe desactivar validaciones)
export async function tiposLicencia(ctx, fecha = hoyBogota()) {
  const lista = await valorVigente(ctx, 'LISTA_TIPOS_LICENCIA', fecha);
  if (!listaLicenciasValida(lista)) throw new Error('Parámetro mal configurado: LISTA_TIPOS_LICENCIA');
  return lista;
}

// Validación pura (también la usa el panel del admincontable antes de guardar una versión nueva)
export function listaLicenciasValida(lista) {
  const nombres = new Set();
  const ok = Array.isArray(lista) && lista.length && lista.every((t) => {
    if (!t || typeof t.nombre !== 'string' || !t.nombre.trim() || nombres.has(t.nombre.trim().toUpperCase())) return false;
    nombres.add(t.nombre.trim().toUpperCase());
    return ['calendario', 'habiles'].includes(t.unidad)
      && (t.diasMax === null || (Number.isInteger(t.diasMax) && t.diasMax > 0 && t.diasMax <= MAX_ABSOLUTO))
      && typeof t.codigo === 'string' && t.codigo.trim() !== ''
      && BOOLEANOS.every((b) => typeof t[b] === 'boolean');
  });
  return !!ok;
}

export async function diasAtrasLicencia(ctx) {
  const v = Number(await ctx.params.valor('LIC_REGISTRO_MAX_DIAS_ATRAS'));
  if (!Number.isInteger(v) || v < 0) throw new Error('Parámetro mal configurado: LIC_REGISTRO_MAX_DIAS_ATRAS');
  return v;
}

// Reglas vigentes para una fecha de inicio (fuera de transacciones)
async function reglas(ctx, fechaInicio) {
  const f = fechaValida(fechaInicio) ? fechaInicio : hoyBogota();
  return {
    tipos: await tiposLicencia(ctx, f),
    diasAtras: await diasAtrasLicencia(ctx),
    sabadoHabil: [true, 'SI', 'SÍ', 1].includes(await valorVigente(ctx, 'SABADO_HABIL', f)),
  };
}

// Validación pura sobre "previo"; db puede ser la conexión o la transacción (solo lee festivos)
async function validarCon(previo, db, body) {
  const hoy = hoyBogota();
  const e = {};
  const t = previo.tipos.find((x) => x.nombre.toUpperCase() === String(body.subtipo ?? '').trim().toUpperCase());
  if (!t) e.subtipo = 'Elija el tipo de licencia.';
  const fi = String(body.fecha_inicio ?? '');
  const ff = String(body.fecha_fin ?? '');
  if (!fechaValida(fi)) e.fecha_inicio = 'Escriba una fecha válida.';
  if (!fechaValida(ff)) e.fecha_fin = 'Escriba una fecha válida.';
  const motivo = String(body.motivo ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if (motivo.length < 5) e.motivo = 'Explique brevemente el motivo (mínimo 5 caracteres).';
  if (motivo.length > 500) e.motivo = 'Máximo 500 caracteres.';
  let dias = null;
  if (!e.fecha_inicio && !e.fecha_fin) {
    if (ff < fi) e.fecha_fin = 'La fecha final no puede ser anterior a la inicial.';
    else if (fi < sumarDias(hoy, -previo.diasAtras)) e.fecha_inicio = `Solo se pueden registrar licencias de los últimos ${previo.diasAtras} días. Para una más antigua, comuníquese con el área contable.`;
    else if (fi > sumarDias(hoy, 365)) e.fecha_inicio = 'Solo se pueden solicitar hasta un año adelante.';
    else if (diasCalendario(fi, ff) > MAX_ABSOLUTO) e.fecha_fin = `Máximo ${MAX_ABSOLUTO} días por solicitud.`;
    else if (t) {
      if (t.unidad === 'habiles') {
        const anios = new Set((await db('festivos').distinct('anio')).map((x) => Number(x.anio)));
        const faltan = [];
        for (let y = Number(fi.slice(0, 4)); y <= Number(ff.slice(0, 4)); y++) if (!anios.has(y)) faltan.push(y);
        if (faltan.length) e.fecha_inicio = `Aún no están cargados los festivos de ${faltan.join(', ')}; no se pueden contar los días hábiles. Comuníquese con el área contable.`;
        else {
          const festivos = new Map((await db('festivos').where('fecha', '>=', fi).where('fecha', '<=', ff).select('fecha', 'nombre')).map((x) => [x.fecha, x.nombre]));
          dias = contarHabiles(fi, ff, { festivos, sabadoHabil: previo.sabadoHabil });
          if (dias === 0) e.fecha_inicio = 'En esas fechas no hay días hábiles.';
        }
      } else dias = diasCalendario(fi, ff);
      if (!e.fecha_inicio && t.diasMax && dias > t.diasMax) {
        e.fecha_fin = `La licencia de ${t.nombre.toLowerCase()} es de máximo ${t.diasMax} día(s) ${t.unidad === 'habiles' ? 'hábiles' : 'calendario'}. Pidió ${dias}.`;
      }
    }
  }
  if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);
  return {
    tipo: t,
    campos: {
      subtipo: t.nombre, fecha_inicio: fi, fecha_fin: ff, motivo,
      // Copia de la regla con la que se pidió (si el parámetro cambia, la solicitud no cambia)
      datos: { dias, unidad: t.unidad, codigo: t.codigo, remunerada: t.remunerada, descuentaVacaciones: t.descuentaVacaciones, sensible: t.sensible },
    },
  };
}

export function crearTipoLicencia() {
  const buscar = async (ctx, campos) => (await tiposLicencia(ctx, fechaValida(campos.fecha_inicio) ? campos.fecha_inicio : undefined))
    .find((t) => t.nombre.toUpperCase() === String(campos.subtipo ?? '').trim().toUpperCase());

  return {
    tipo: 'LICENCIA',
    etiqueta: 'Licencia',
    rutaLista: '/licencias',
    rutaNueva: '/licencias/nueva',
    icono: 'calendario',
    accion: 'Solicitar licencia',
    categoriaDocumento: 'SOPORTE_LICENCIA',
    // Según el tipo (antes de la transacción, leen parámetros)
    async documentoSensible(ctx, campos) {
      return !!(await buscar(ctx, campos))?.sensible;
    },
    async soporteObligatorio(ctx, campos) {
      return !!(await buscar(ctx, campos))?.soporteObligatorio;
    },

    async validar(ctx, { body }) {
      return (await validarCon(await reglas(ctx, body.fecha_inicio), ctx.db, body)).campos;
    },

    // Envío (también de un borrador viejo): reglas leídas antes; se revalida todo dentro de la transacción
    prepararEnvio: (ctx, s) => reglas(ctx, s?.fecha_inicio),
    async revalidarAlEnviar(ctx, s, trx, previo) {
      if (!previo) throw new Error('revalidarAlEnviar de LICENCIA requiere "previo" (reglas leídas antes de la transacción).');
      const colaborador = await trx('colaboradores').where({ id: s.colaborador_id }).first();
      if (colaborador?.estado !== 'ACTIVO') throw invalido('El expediente está como retirado; no se pueden enviar solicitudes.');
      const { tipo, campos } = await validarCon(previo, trx, s);
      if (tipo.soporteObligatorio && !s.documento_id) throw invalido(`La licencia de ${tipo.nombre.toLowerCase()} requiere soporte en PDF. Cree la solicitud de nuevo con el soporte.`);
      await trx('solicitudes').where({ id: s.id }).update({ subtipo: campos.subtipo, datos: JSON.stringify(campos.datos) });
      Object.assign(s, { subtipo: campos.subtipo, datos: campos.datos });
    },

    resumen(s) {
      const d = s.datos ?? {};
      return `${s.subtipo ?? 'Licencia'} · del ${fechaTexto(s.fecha_inicio)} al ${fechaTexto(s.fecha_fin)}${d.dias ? ` (${d.dias} día(s) ${d.unidad === 'habiles' ? 'hábiles' : 'calendario'})` : ''}`;
    },
  };
}
