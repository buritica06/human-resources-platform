// Tipo de solicitud VACACIONES para el motor de solicitudes. El flujo, los estados y las
// notificaciones los maneja el motor; aquí van el cálculo y las validaciones del saldo.
import { conflicto, invalido } from '../../core/errors.js';

const fechaTexto = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

export function crearTipoVacaciones(svc) {
  return {
    tipo: 'VACACIONES',
    etiqueta: 'Vacaciones',
    rutaLista: '/vacaciones',
    rutaNueva: '/vacaciones/nueva',
    icono: 'sombrilla',
    accion: 'Solicitar vacaciones',
    categoriaDocumento: 'SOPORTE_VACACIONES',
    documentoSensible: false,
    soporteObligatorio: false,

    // Al crear (fuera de transacción): valida y calcula fin, regreso y saldo
    async validar(ctx, { colaborador, body }) {
      return (await svc.planear(colaborador, body)).campos;
    },

    // Parámetros vigentes, leídos ANTES de la transacción del envío
    prepararEnvio: () => svc.parametros(),

    // Al enviar (dentro de la transacción): se recalcula con el saldo y el calendario de ese
    // momento (un borrador pudo quedarse días guardado) y se actualizan fin, regreso y saldo.
    async revalidarAlEnviar(ctx, s, trx, previo) {
      // Dentro de la transacción no se leen parámetros (SQLite: una sola conexión → bloqueo)
      if (!previo) throw new Error('revalidarAlEnviar de VACACIONES requiere "previo" (parámetros leídos antes de la transacción).');
      const colaborador = await trx('colaboradores').where({ id: s.colaborador_id }).first();
      if (colaborador?.estado !== 'ACTIVO') throw invalido('El expediente está como retirado; no se pueden enviar solicitudes.');
      const { campos } = await svc.planear(
        colaborador,
        {
          fecha_inicio: s.fecha_inicio,
          dias: Number(s.dias_habiles),
          dias_compensar: Number(s.dias_compensar ?? 0),
          motivo: s.motivo ?? '',
        },
        { trx, previo, excluirId: s.id },
      );
      await trx('solicitudes')
        .where({ id: s.id })
        .update({ fecha_fin: campos.fecha_fin, subtipo: campos.subtipo, datos: JSON.stringify(campos.datos) });
      Object.assign(s, { fecha_fin: campos.fecha_fin, subtipo: campos.subtipo, datos: campos.datos });
    },

    // Al aprobar (cada paso, dentro de la transacción): el saldo pudo cambiar mientras estaba en
    // trámite (p. ej. el área contable registró un saldo al corte menor). Si ya no alcanza, 409.
    prepararAprobacion: () => svc.parametros(),
    async revalidarAlAprobar(ctx, s, trx, previo) {
      if (!previo) throw new Error('revalidarAlAprobar de VACACIONES requiere "previo".');
      const colaborador = await trx('colaboradores').where({ id: s.colaborador_id }).first();
      if (colaborador?.estado !== 'ACTIVO') throw conflicto('El colaborador ya está retirado; rechace la solicitud.');
      const saldo = await svc.saldo(colaborador, { trx, previo, excluirId: s.id });
      const pide = Number(s.dias_habiles) + Number(s.dias_compensar ?? 0);
      if (!saldo.registrado || pide > saldo.paraSolicitar + 1e-9) {
        throw conflicto(
          `El saldo de vacaciones del colaborador cambió y ya no alcanza: tiene ${String(Math.max(0, saldo.paraSolicitar ?? 0)).replace('.', ',')} día(s) y la solicitud pide ${pide}. Rechácela o pida al área contable revisar el saldo.`,
        );
      }
    },

    resumen(s) {
      const comp = Number(s.dias_compensar ?? 0);
      return `${Number(s.dias_habiles)} día(s) hábil(es) del ${fechaTexto(s.fecha_inicio)} al ${fechaTexto(s.fecha_fin)}${comp ? ` + ${comp} compensado(s) en dinero` : ''}`;
    },
  };
}
