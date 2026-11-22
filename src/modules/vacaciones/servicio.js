// Saldo y planeación de vacaciones (M4). Reglas (docs/plan.md §9), todas parametrizadas:
// - Causados = saldo al corte + días laborados desde el corte (DAYS360 + 1) × VAC_DIAS_HABILES_ANIO / 360.
// - Disfrutados y compensados = solicitudes de vacaciones APROBADAS que empiezan desde el corte.
// - Disponibles = causados − disfrutados − compensados.
// - Para solicitar = disponibles − lo que está en trámite (pendiente de aprobación).
// - Días hábiles: excluye domingos, festivos y (si SABADO_HABIL es falso) sábados.
// - Compensación en dinero: máximo VAC_COMPENSACION_MAX_PCT % de los días de la solicitud.
// - Días laborados: se restan las licencias APROBADAS cuyo tipo descuenta vacaciones (no
//   remuneradas, M6) y los periodos de ctx.diasNoLaborados (suspensiones, M8).
//
// OJO (SQLite, una sola conexión): los parámetros se leen con `parametros()` ANTES de abrir una
// transacción; dentro de ella solo se consulta con `trx`.
import { invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import {
  aniosEntre, dias360, fechaValida, finDeDisfrute, hoyBogota, motivoNoHabil, siguienteHabil, primerHabilDesde, sumarDias,
} from './calendario.js';

const EN_TRAMITE_EXCLUIDOS = ['BORRADOR', 'RECHAZADA', 'CANCELADA', 'ANULADA', 'APROBADA'];
const r2 = (x) => Math.round(x * 100) / 100;
const fechaTexto = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

export function crearServicioVacaciones(ctx) {
  const { db, auditar } = ctx;

  // Parámetros vigentes (fuera de transacciones)
  // Si un parámetro no es un número válido se falla con error de configuración (nunca se
  // desactivan las validaciones en silencio).
  async function parametros(fecha = hoyBogota()) {
    const p = {
      diasAnio: Number(await ctx.params.valor('VAC_DIAS_HABILES_ANIO', fecha)),
      sabadoHabil: [true, 'SI', 'SÍ', 1].includes(await ctx.params.valor('SABADO_HABIL', fecha)),
      pctCompensacion: Number(await ctx.params.valor('VAC_COMPENSACION_MAX_PCT', fecha)),
    };
    if (!Number.isFinite(p.diasAnio) || p.diasAnio <= 0 || p.diasAnio > 60) throw new Error('Parámetro mal configurado: VAC_DIAS_HABILES_ANIO');
    if (!Number.isFinite(p.pctCompensacion) || p.pctCompensacion < 0 || p.pctCompensacion > 100) throw new Error('Parámetro mal configurado: VAC_COMPENSACION_MAX_PCT');
    return p;
  }

  // Festivos desde un año en adelante: { mapa fecha → nombre, anios cargados }
  async function festivosDesde(anio, trx = db) {
    const filas = await trx('festivos').where('anio', '>=', anio).select('fecha', 'nombre', 'anio');
    return { mapa: new Map(filas.map((f) => [f.fecha, f.nombre])), anios: new Set(filas.map((f) => Number(f.anio))) };
  }
  // Falla si algún año del rango no tiene festivos cargados (el cálculo sería incorrecto)
  function exigirFestivos(cargados, anios) {
    const faltan = anios.filter((y) => !cargados.has(y));
    if (faltan.length) {
      throw invalido(`Aún no están cargados los festivos de ${faltan.join(', ')}. Pida al área contable que los registre antes de solicitar vacaciones en esas fechas.`, { fecha_inicio: `Faltan los festivos de ${faltan.join(', ')}.` });
    }
  }

  async function corteVigente(colaboradorId, trx = db) {
    return trx('saldos_vacaciones').where({ colaborador_id: colaboradorId })
      .orderBy([{ column: 'fecha_corte', order: 'desc' }, { column: 'id', order: 'desc' }]).first();
  }

  // Saldo a "hoy". excluirId: no contar esa solicitud (la que se está enviando).
  async function saldo(colaborador, { trx = db, previo, excluirId = null, hoy = hoyBogota() } = {}) {
    const p = previo ?? (await parametros(hoy));
    const corte = await corteVigente(colaborador.id, trx);
    if (!corte) return { registrado: false };
    // Hasta hoy, o hasta el retiro si ya se retiró
    const hasta = colaborador.fecha_retiro && colaborador.fecha_retiro < hoy ? colaborador.fecha_retiro : hoy;
    // Licencias aprobadas que no cuentan como tiempo laborado (p. ej. no remuneradas, M6): se
    // restan sus días dentro del periodo [corte, hasta], contados con el MISMO método del total
    // (DAYS360 + 1) para no mezclar bases. La regla viaja en la solicitud (datos).
    let diasNoLaborados = 0;
    if (hasta >= corte.fecha_corte) {
      const licencias = await trx('solicitudes').where({ colaborador_id: colaborador.id, tipo: 'LICENCIA', estado: 'APROBADA' })
        .where('fecha_inicio', '<=', hasta).where('fecha_fin', '>=', corte.fecha_corte).select('fecha_inicio', 'fecha_fin', 'datos');
      for (const l of licencias) {
        if (!JSON.parse(l.datos ?? '{}').descuentaVacaciones) continue;
        const ini = l.fecha_inicio > corte.fecha_corte ? l.fecha_inicio : corte.fecha_corte;
        const fin = l.fecha_fin < hasta ? l.fecha_fin : hasta;
        diasNoLaborados += Math.max(0, dias360(ini, fin) + 1);
      }
      // Otros periodos no laborados que registran otros módulos (p. ej. suspensiones, M8)
      for (const buscar of ctx.diasNoLaborados ?? []) {
        for (const p of await buscar(trx, colaborador.id, corte.fecha_corte, hasta)) {
          const ini = p.desde > corte.fecha_corte ? p.desde : corte.fecha_corte;
          const fin = p.hasta < hasta ? p.hasta : hasta;
          if (ini <= fin) diasNoLaborados += Math.max(0, dias360(ini, fin) + 1);
        }
      }
    }
    const diasLaborados = hasta >= corte.fecha_corte ? Math.max(0, dias360(corte.fecha_corte, hasta) + 1 - diasNoLaborados) : 0;
    const causadosDesdeCorte = (diasLaborados * p.diasAnio) / 360;
    const filas = await trx('solicitudes').where({ colaborador_id: colaborador.id, tipo: 'VACACIONES' })
      .where('fecha_inicio', '>=', corte.fecha_corte).whereNotIn('estado', ['BORRADOR', 'RECHAZADA', 'CANCELADA', 'ANULADA'])
      .modify((q) => (excluirId ? q.whereNot('id', excluirId) : q))
      .select('estado', 'dias_habiles', 'dias_compensar');
    let disfrutados = 0;
    let compensados = 0;
    let enTramite = 0;
    for (const f of filas) {
      const d = Number(f.dias_habiles ?? 0);
      const c = Number(f.dias_compensar ?? 0);
      if (f.estado === 'APROBADA') {
        disfrutados += d;
        compensados += c;
      } else if (!EN_TRAMITE_EXCLUIDOS.includes(f.estado)) enTramite += d + c;
    }
    const disponibles = r2(Number(corte.dias_al_corte) + causadosDesdeCorte - disfrutados - compensados);
    return {
      registrado: true,
      fechaCorte: corte.fecha_corte,
      diasAlCorte: Number(corte.dias_al_corte),
      diasLaborados, diasNoLaborados,
      causadosDesdeCorte: r2(causadosDesdeCorte),
      disfrutados, compensados, enTramite,
      disponibles,
      paraSolicitar: r2(disponibles - enTramite),
      calculadoAl: hasta,
      diasPorAnio: p.diasAnio,
    };
  }

  // Valida y calcula una solicitud: { fecha_inicio, dias, dias_compensar }.
  // Devuelve { campos (para guardar), plan (para mostrar) } o lanza 400 con errores por campo.
  async function planear(colaborador, body, { trx = db, previo, excluirId = null } = {}) {
    const hoy = hoyBogota();
    const e = {};
    const fi = String(body.fecha_inicio ?? '').trim();
    const dias = Number(body.dias);
    const comp = body.dias_compensar === undefined || body.dias_compensar === '' ? 0 : Number(body.dias_compensar);
    if (!fechaValida(fi)) e.fecha_inicio = 'Escriba una fecha válida.';
    else if (fi < hoy) e.fecha_inicio = 'Las vacaciones deben empezar hoy o después.';
    else if (fi > sumarDias(hoy, 365)) e.fecha_inicio = 'Solo se pueden programar hasta un año adelante.';
    if (!Number.isInteger(dias) || dias < 1) e.dias = 'Escriba cuántos días hábiles quiere disfrutar (número entero, mínimo 1).';
    else if (dias > 90) e.dias = 'Máximo 90 días hábiles por solicitud.';
    if (!Number.isInteger(comp) || comp < 0) e.dias_compensar = 'Escriba un número entero (0 si no quiere compensar).';
    const motivo = String(body.motivo ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
    if (motivo.length > 500) e.motivo = 'Máximo 500 caracteres.';
    if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);

    const p = previo ?? (await parametros(hoy));
    const { mapa: fest, anios } = await festivosDesde(Number(fi.slice(0, 4)), trx);
    exigirFestivos(anios, [Number(fi.slice(0, 4))]);
    const op = { festivos: fest, sabadoHabil: p.sabadoHabil };

    const noHabil = motivoNoHabil(fi, op);
    if (noHabil) {
      const sugerida = primerHabilDesde(fi, op);
      throw invalido('Revise los datos marcados.', { fecha_inicio: `El ${fechaTexto(fi)} no es día hábil (${noHabil}). Puede empezar el ${fechaTexto(sugerida)}.` });
    }
    // Compensación (CST art. 189: "hasta la mitad"): comp ≤ pct % del TOTAL de la solicitud
    // (disfrute + dinero)  ⇔  comp × (100 − pct) ≤ pct × dias. Con 50 %: comp ≤ dias.
    const pct = p.pctCompensacion;
    const maxComp = pct >= 100 ? Infinity : Math.floor((pct * dias) / (100 - pct));
    if (comp > maxComp) {
      throw invalido('Revise los datos marcados.', {
        dias_compensar: pct <= 0 ? 'La compensación en dinero no está habilitada.'
          : `Lo compensado en dinero puede ser máximo el ${pct} % del total de la solicitud (disfrute + dinero): con ${dias} día(s) de disfrute, hasta ${maxComp}.`,
      });
    }
    const s = await saldo(colaborador, { trx, previo: p, excluirId, hoy });
    if (!s.registrado) {
      throw invalido('El área contable aún no ha registrado su saldo de vacaciones. Comuníquese con ellos para que lo registren.');
    }
    if (dias + comp > s.paraSolicitar) {
      const extra = s.enTramite ? ` (tiene ${String(s.enTramite).replace('.', ',')} día(s) en otras solicitudes en trámite)` : '';
      throw invalido('Revise los datos marcados.', {
        dias: `Solo tiene ${String(Math.max(0, s.paraSolicitar)).replace('.', ',')} día(s) disponibles para solicitar${extra}. Pidió ${dias + comp}.`,
      });
    }
    const ff = finDeDisfrute(fi, dias, op);
    const regreso = siguienteHabil(ff, op);
    exigirFestivos(anios, aniosEntre(fi, regreso)); // el calendario debe cubrir todo el rango
    // Cruce con otras ausencias (también lo revalida el motor al enviar): se avisa desde la simulación
    await ctx.servicioSolicitudes?.motor.validarSinCruce(trx, { id: excluirId, colaborador_id: colaborador.id, fecha_inicio: fi, fecha_fin: ff });
    const festivosEnRango = [...fest].filter(([f]) => f >= fi && f <= ff).map(([fecha, nombre]) => ({ fecha, nombre }));
    const subtipo = `${dias} día(s) hábil(es)${comp ? ` + ${comp} en dinero` : ''}`;
    return {
      campos: {
        subtipo, fecha_inicio: fi, fecha_fin: ff, dias_habiles: dias, dias_compensar: comp, motivo: motivo || null,
        datos: { regreso, saldoAlEnviar: s.paraSolicitar, festivos: festivosEnRango },
      },
      plan: {
        fechaInicio: fi, fechaFin: ff, regreso, dias, diasCompensar: comp,
        diasCalendario: Math.round((Date.parse(`${regreso}T00:00:00Z`) - Date.parse(`${fi}T00:00:00Z`)) / 86_400_000),
        festivos: festivosEnRango, saldoAntes: s.paraSolicitar, saldoDespues: Math.round((s.paraSolicitar - dias - comp) * 100) / 100,
        maxCompensar: Number.isFinite(maxComp) ? maxComp : null,
      },
    };
  }

  // Registro del saldo al corte (solo admincontable). Queda en el historial y en la auditoría.
  async function registrarCorte(req, colaboradorId, { fecha_corte: fecha, dias, observacion }) {
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c) throw noEncontrado('No encontramos ese colaborador.');
    const e = {};
    if (!fechaValida(fecha)) e.fecha_corte = 'Escriba una fecha válida.';
    else if (fecha > hoyBogota()) e.fecha_corte = 'La fecha de corte no puede ser futura.';
    else if (c.fecha_ingreso && fecha < c.fecha_ingreso) e.fecha_corte = 'La fecha de corte no puede ser anterior al ingreso.';
    if (!Number.isFinite(dias) || dias < -60 || dias > 400 || Math.abs(dias * 100 - Math.round(dias * 100)) > 1e-6) e.dias = 'Escriba los días (entre −60 y 400, hasta dos decimales).';
    if (String(observacion ?? '').trim().length < 5) e.observacion = 'Explique de dónde sale el saldo (mínimo 5 caracteres).';
    const anterior = await corteVigente(c.id);
    // Un corte anterior al vigente no tendría efecto (vale el más reciente): se rechaza
    if (!e.fecha_corte && anterior && fecha < anterior.fecha_corte) {
      e.fecha_corte = `Ya hay un saldo al ${fechaTexto(anterior.fecha_corte)}. Para corregirlo, registre uno con esa fecha o una posterior.`;
    }
    if (Object.keys(e).length) throw invalido('Revise los datos marcados.', e);
    const [fila] = await db('saldos_vacaciones').insert({
      colaborador_id: c.id, fecha_corte: fecha, dias_al_corte: Math.round(dias * 100) / 100, observacion: String(observacion).trim().slice(0, 300),
      registrado_por: req.usuario.id, registrado_en: ahora(),
    }).returning('id');
    await auditar(req, {
      accion: 'REGISTRAR_SALDO_VACACIONES', entidad: 'colaborador', entidadId: c.id,
      detalle: {
        antes: anterior ? { fecha: anterior.fecha_corte, dias: Number(anterior.dias_al_corte) } : null, despues: { fecha, dias },
        id: typeof fila === 'object' ? fila.id : fila, ...(c.cedula === req.usuario.cedula ? { autoregistro: true } : {}),
      },
    });
  }

  async function cortes(colaboradorId) {
    return db('saldos_vacaciones as s').leftJoin('usuarios as u', 'u.id', 's.registrado_por')
      .where('s.colaborador_id', colaboradorId).orderBy([{ column: 's.fecha_corte', order: 'desc' }, { column: 's.id', order: 'desc' }])
      .select('s.fecha_corte as fechaCorte', 's.dias_al_corte as dias', 's.observacion', 's.registrado_en as registradoEn', 'u.nombre as registradoPor')
      .then((f) => f.map((x) => ({ ...x, dias: Number(x.dias) })));
  }

  return { parametros, festivosDesde, saldo, planear, registrarCorte, cortes };
}
