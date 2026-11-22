// Parámetros con vigencia y festivos (panel del admincontable, M8).
// Reglas:
// - Nunca se edita una versión que ya rige: se programa una versión NUEVA con fecha "desde" hoy o
//   futura. La versión anterior queda vigente hasta el día antes; así un cambio futuro no afecta el
//   presente y el historial se conserva.
// - Solo se puede borrar una versión que aún no empieza a regir.
// - El valor se valida por tipo, por rangos conocidos y con los validadores que registran los módulos.
// - Los festivos se reemplazan por año completo; las solicitudes ya aprobadas no se recalculan.
import { conflicto, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { fechaValida, hoyBogota, sumarDias } from '../vacaciones/calendario.js';

import { CAMPOS } from '../colaboradores/campos.js';

// Rangos sensatos [mín, máx, entero] de parámetros que, mal puestos, dañarían la operación o los
// cálculos de referencia (p. ej. HORAS_MES = 0 sería una división por cero).
const RANGOS = {
  SESION_INACTIVIDAD_MIN: [1, 120, true], LOGIN_MAX_INTENTOS: [1, 20, true], LOGIN_BLOQUEO_MIN: [1, 1440, true], UPLOAD_MAX_MB: [1, 20, false],
  VAC_DIAS_HABILES_ANIO: [1, 60, true], VAC_COMPENSACION_MAX_PCT: [0, 100, false], PERMISO_MAX_DIAS: [1, 30, true],
  INC_MAX_DIAS: [1, 540, true], INC_REGISTRO_MAX_DIAS_ATRAS: [0, 365, true], LIC_REGISTRO_MAX_DIAS_ATRAS: [0, 365, true],
  SMMLV: [1, 1e9, false], AUX_TRANSP: [0, 1e8, false], HORAS_MES: [1, 744, false], JORNADA_DIA: [1, 24, false], JORNADA_SEMANA: [1, 168, false],
  HORA_NOCHE_INI: [0, 23, true], HORA_NOCHE_FIN: [0, 23, true], INC_EG_PCT: [0, 1, false],
  F_RN: [0, 5, false], F_DOM: [0, 5, false], F_HED: [1, 5, false], F_HEN: [1, 5, false], F_HEDDF: [1, 10, false], F_HENDF: [1, 10, false],
};

// Solo datos personales y de contacto pueden volverse editables por el propio colaborador (nunca
// salario, cuenta, sede, cédula ni nombre).
const EDITABLES_PERMITIDOS = new Set(CAMPOS.filter((c) => ['personales', 'contacto'].includes(c.grupo) && !['nombre', 'cedula'].includes(c.clave)).map((c) => c.clave));

export function crearServicioParametros(ctx) {
  const { db, auditar } = ctx;

  async function listar() {
    const hoy = hoyBogota();
    const filas = await db('parametros as p').leftJoin('usuarios as u', 'u.id', 'p.actualizado_por')
      .orderBy([{ column: 'p.clave' }, { column: 'p.vigente_desde' }]).select('p.*', 'u.nombre as actualizado_por_nombre');
    const porClave = new Map();
    for (const f of filas) {
      if (!porClave.has(f.clave)) porClave.set(f.clave, { clave: f.clave, tipo: f.tipo, versiones: [] });
      const vigente = f.vigente_desde <= hoy && (!f.vigente_hasta || f.vigente_hasta >= hoy);
      porClave.get(f.clave).versiones.push({
        id: f.id, valor: JSON.parse(f.valor), desde: f.vigente_desde, hasta: f.vigente_hasta, descripcion: f.descripcion,
        estado: vigente ? 'VIGENTE' : f.vigente_desde > hoy ? 'PROGRAMADA' : 'HISTORICA',
        actualizadoPor: f.actualizado_por_nombre, actualizadoEn: f.actualizado_en,
      });
    }
    return [...porClave.values()].map((p) => {
      const actual = p.versiones.find((v) => v.estado === 'VIGENTE');
      const desc = (actual ?? p.versiones.at(-1)).descripcion ?? '';
      return { ...p, descripcion: desc, verificar: /VERIFICAR/.test(desc), actual: actual ?? null };
    });
  }

  async function validarValor(clave, tipo, valor, anterior) {
    if (tipo === 'numero') {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'Escriba un número.';
      if (valor < 0) return 'El valor no puede ser negativo.';
      const r = RANGOS[clave];
      if (r && (valor < r[0] || valor > r[1])) return `Debe estar entre ${r[0]} y ${r[1]}.`;
      if (r?.[2] && !Number.isInteger(valor)) return 'Debe ser un número entero.';
    } else if (tipo === 'booleano') {
      if (typeof valor !== 'boolean') return 'Elija Sí o No.';
    } else if (tipo === 'texto') {
      if (typeof valor !== 'string' || valor.length > 500) return 'Escriba un texto (máximo 500 caracteres).';

    } else if (tipo === 'json') {
      if (Array.isArray(anterior) !== Array.isArray(valor) || typeof valor !== 'object' || valor === null) return 'El valor no tiene la misma forma que el actual.';
      if (Array.isArray(anterior) && anterior.every((x) => typeof x === 'string')) {
        if (!valor.length || !valor.every((x) => typeof x === 'string' && x.trim() && x.length <= 120)) return 'Debe ser una lista de textos no vacíos.';
        if (new Set(valor.map((x) => x.trim().toUpperCase())).size !== valor.length) return 'La lista tiene valores repetidos.';
      }
    }
    if (clave === 'CAMPOS_EDITABLES_COLABORADOR') {
      const malos = valor.filter((x) => !EDITABLES_PERMITIDOS.has(x));
      if (malos.length) return `Estos campos no pueden ser editables por el colaborador: ${malos.join(', ')}. Permitidos: ${[...EDITABLES_PERMITIDOS].join(', ')}.`;
    }
    if (clave === 'LISTA_TIPOS_PERMISO_SENSIBLES') {
      const tipos = (await ctx.params.valor('LISTA_TIPOS_PERMISO')).map((x) => x.toUpperCase());
      const malos = valor.filter((x) => !tipos.includes(x.toUpperCase()));
      if (malos.length) return `No son tipos de permiso: ${malos.join(', ')}.`;
    }
    const v = ctx.validadoresParametros.get(clave);
    return v ? v(valor) : null;
  }

  // Programa una versión nueva: { valor, desde, motivo }
  async function programar(req, clave, { valor, desde, motivo }) {
    const hoy = hoyBogota();
    const versiones = await db('parametros').where({ clave }).orderBy('vigente_desde');
    if (!versiones.length) throw noEncontrado('Ese parámetro no existe.');
    const e = {};
    if (!fechaValida(desde)) e.desde = 'Escriba una fecha válida.';
    else if (desde < hoy) e.desde = 'La nueva versión debe regir desde hoy o una fecha futura (el pasado no se reescribe).';
    else if (versiones.some((v) => v.vigente_desde === desde)) e.desde = 'Ya hay una versión que empieza ese día. Si aún no rige, bórrela y vuelva a programarla.';
    const tipo = versiones.at(-1).tipo;
    const previa = [...versiones].reverse().find((v) => fechaValida(desde) && v.vigente_desde < desde) ?? null;
    if (!e.desde && !previa) e.desde = 'La fecha es anterior a la primera versión del parámetro.';
    // Sin huecos: si la anterior ya terminaba antes, la nueva debe empezar justo al día siguiente
    else if (!e.desde && previa.vigente_hasta && previa.vigente_hasta < sumarDias(desde, -1)) {
      e.desde = `La versión anterior termina el ${previa.vigente_hasta}: la nueva debe empezar el ${sumarDias(previa.vigente_hasta, 1)} para no dejar días sin valor.`;
    }
    const error = await validarValor(clave, tipo, valor, JSON.parse((previa ?? versiones.at(-1)).valor));
    if (error) e.valor = error;
    if (String(motivo ?? '').trim().length < 5) e.motivo = 'Explique el cambio (mínimo 5 caracteres; por ejemplo, la norma).';
    if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);

    const siguiente = versiones.find((v) => v.vigente_desde > desde);
    // Al programar con la norma que lo confirma, la marca "VERIFICAR" se quita
    const descripcionBase = (previa.descripcion ?? '').replace(/\s*–\s*Cambio:.*$/, '').replace(/\s*[–-]\s*VERIFICAR\b/g, '').trim();
    try {
    await db.transaction(async (trx) => {
      // La anterior termina el día antes (si seguía abierta o se solapaba)
      if (previa.vigente_desde < desde && (!previa.vigente_hasta || previa.vigente_hasta >= desde)) {
        await trx('parametros').where({ id: previa.id }).update({ vigente_hasta: sumarDias(desde, -1), actualizado_por: req.usuario.id, actualizado_en: ahora() });
      }
      await trx('parametros').insert({
        clave, valor: JSON.stringify(valor), tipo, vigente_desde: desde, vigente_hasta: siguiente ? sumarDias(siguiente.vigente_desde, -1) : null,
        descripcion: `${descripcionBase.slice(0, 120)} – Cambio: ${String(motivo).trim()}`.slice(0, 255),
        actualizado_por: req.usuario.id, actualizado_en: ahora(),
      });
    });
    } catch (err) {
      if (/unique|duplicate/i.test(err.message)) throw conflicto('Otra persona acaba de programar una versión con esa fecha. Recargue la página.');
      throw err;
    }
    ctx.params.invalidar();
    await auditar(req, { accion: 'PROGRAMAR_PARAMETRO', entidad: 'parametro', entidadId: clave, detalle: { desde, antes: JSON.parse(previa.valor), despues: valor, motivo: String(motivo).trim() } });
    return (await listar()).find((p) => p.clave === clave);
  }

  // Borra una versión que aún no rige y devuelve la vigencia a la anterior
  async function borrarProgramada(req, id) {
    const v = await db('parametros').where({ id }).first();
    if (!v) throw noEncontrado('No encontramos esa versión.');
    // Se puede borrar lo que aún no rige y, para corregir un error, lo que empieza HOY y se creó hoy
    const hoy = hoyBogota();
    const creadaHoy = v.actualizado_en && new Date(Date.parse(v.actualizado_en) - 5 * 3600_000).toISOString().slice(0, 10) === hoy;
    if (v.vigente_desde < hoy || (v.vigente_desde === hoy && !creadaHoy)) throw conflicto('Esa versión ya está rigiendo o rigió: no se puede borrar. Programe una nueva.');
    const anterior = await db('parametros').where({ clave: v.clave }).where('vigente_desde', '<', v.vigente_desde).orderBy('vigente_desde', 'desc').first();
    if (!anterior) throw conflicto('Es la única versión del parámetro: no se puede borrar.');
    await db.transaction(async (trx) => {
      await trx('parametros').where({ id }).del();
      if (anterior.vigente_hasta === sumarDias(v.vigente_desde, -1)) {
        await trx('parametros').where({ id: anterior.id }).update({ vigente_hasta: v.vigente_hasta, actualizado_por: req.usuario.id, actualizado_en: ahora() });
      }
    });
    ctx.params.invalidar();
    await auditar(req, { accion: 'BORRAR_PARAMETRO_PROGRAMADO', entidad: 'parametro', entidadId: v.clave, detalle: { desde: v.vigente_desde, valor: JSON.parse(v.valor) } });
    return (await listar()).find((p) => p.clave === v.clave);
  }

  // ---------- festivos ----------
  async function festivos(anio) {
    return db('festivos').where({ anio }).orderBy('fecha').select('fecha', 'nombre');
  }

  async function guardarFestivos(req, anio, lista) {
    const e = [];
    const vistos = new Set();
    for (const [i, f] of lista.entries()) {
      if (!fechaValida(f.fecha) || Number(f.fecha.slice(0, 4)) !== anio) e.push(`Fila ${i + 1}: la fecha debe ser del ${anio}.`);
      else if (vistos.has(f.fecha)) e.push(`Fila ${i + 1}: la fecha ${f.fecha} está repetida.`);
      vistos.add(f.fecha);
      if (!String(f.nombre ?? '').trim()) e.push(`Fila ${i + 1}: escriba el nombre del festivo.`);
    }
    if (!lista.length) e.push('La lista está vacía. Un año sin festivos impediría calcular días hábiles.');
    if (e.length) throw invalido(e.slice(0, 5).join(' '));
    const antes = await festivos(anio);
    await db.transaction(async (trx) => {
      await trx('festivos').where({ anio }).del();
      await trx('festivos').insert(lista.map((f) => ({ fecha: f.fecha, anio, nombre: String(f.nombre).trim().slice(0, 120) })));
    });
    await auditar(req, { accion: 'GUARDAR_FESTIVOS', entidad: 'festivos', entidadId: String(anio), detalle: { antes: antes.length, despues: lista.length } });
    return festivos(anio);
  }

  return { listar, programar, borrarProgramada, festivos, guardarFestivos };
}
