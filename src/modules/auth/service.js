// Reglas de autenticación y de la cuenta: ingreso, bloqueo, primer ingreso,
// verificación de correo y recuperación de contraseña.
import { ahora } from '../../core/db.js';
import { ErrorApp, invalido } from '../../core/errors.js';
import { hashClave, verificarClave, verificarFicticio, revisarPolitica } from '../../core/security/claves.js';
import { crearRepositorioAuth } from './repository.js';
import { log } from '../../core/logger.js';

const MSG_LOGIN = 'Cédula o contraseña incorrectas, o la cuenta está bloqueada temporalmente por intentos fallidos.';
const HORAS_VERIFICACION = 24;
const HORAS_RECUPERACION = 1;

export function crearServicioAuth(ctx) {
  const { db, params, auditar, tokens, mailer, sesiones, cfg } = ctx;
  const repo = crearRepositorioAuth(db);

  async function login(req, res, { cedula, clave }) {
    const u = await repo.porCedula(cedula);
    if (!u) {
      await verificarFicticio(clave);
      await auditar(req, { accion: 'LOGIN_FALLIDO', entidad: 'usuario', detalle: { motivo: 'no_existe' }, actorId: null });
      throw new ErrorApp(401, 'CREDENCIALES', MSG_LOGIN);
    }
    if (!u.activo) {
      await verificarFicticio(clave);
      await auditar(req, { accion: 'LOGIN_FALLIDO', entidad: 'usuario', entidadId: u.id, detalle: { motivo: 'inactivo' }, actorId: null });
      throw new ErrorApp(401, 'CREDENCIALES', MSG_LOGIN);
    }
    if (u.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.now()) {
      await verificarFicticio(clave);
      await auditar(req, { accion: 'LOGIN_FALLIDO', entidad: 'usuario', entidadId: u.id, detalle: { motivo: 'bloqueado' }, actorId: null });
      throw new ErrorApp(401, 'CREDENCIALES', MSG_LOGIN);
    }
    const ok = await verificarClave(u.password_hash, clave);
    if (!ok) {
      const max = Number(await params.valor('LOGIN_MAX_INTENTOS'));
      // Incremento atómico en la BD: intentos en paralelo no pueden "perderse" y evitar el bloqueo.
      const intentos = await repo.sumarIntentoFallido(u.id);
      if (intentos >= max) {
        const minutos = Number(await params.valor('LOGIN_BLOQUEO_MIN'));
        await repo.actualizar(u.id, { intentos_fallidos: 0, bloqueado_hasta: new Date(Date.now() + minutos * 60_000).toISOString() });
        await sesiones.cerrarTodas(u.id);
        await auditar(req, { accion: 'BLOQUEO', entidad: 'usuario', entidadId: u.id, detalle: { minutos }, actorId: null });
      } else {
        await auditar(req, {
          accion: 'LOGIN_FALLIDO',
          entidad: 'usuario',
          entidadId: u.id,
          detalle: { motivo: 'clave', intentos },
          actorId: null,
        });
      }
      throw new ErrorApp(401, 'CREDENCIALES', MSG_LOGIN);
    }
    // La clave es correcta: ya se puede informar con precisión.
    if (u.debe_cambiar_clave && u.clave_temporal_expira && Date.parse(u.clave_temporal_expira) < Date.now()) {
      await auditar(req, {
        accion: 'LOGIN_FALLIDO',
        entidad: 'usuario',
        entidadId: u.id,
        detalle: { motivo: 'temporal_vencida' },
        actorId: u.id,
      });
      throw new ErrorApp(401, 'CLAVE_TEMPORAL_VENCIDA', 'Su contraseña temporal venció. Pida una nueva al área contable.');
    }
    await repo.actualizar(u.id, { intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: ahora() });
    const csrf = await sesiones.crear(req, res, u);
    await auditar(req, { accion: 'LOGIN', entidad: 'usuario', entidadId: u.id, actorId: u.id });
    return { csrf, primerIngreso: !!u.debe_cambiar_clave || !u.correo_verificado_en };
  }

  async function cambiarClave(req, { actual, nueva }) {
    const u = await repo.porId(req.usuario.id);
    if (!(await verificarClave(u.password_hash, actual))) {
      throw invalido('La contraseña actual no es correcta.', { actual: 'La contraseña actual no es correcta.' });
    }
    const error = revisarPolitica(nueva, { cedula: u.cedula });
    if (error) throw invalido(error, { nueva: error });
    if (nueva === actual || (u.password_hash_anterior && (await verificarClave(u.password_hash_anterior, nueva)))) {
      throw invalido('La nueva contraseña debe ser distinta de las anteriores.', { nueva: 'Debe ser distinta de las anteriores.' });
    }
    await repo.actualizar(u.id, {
      password_hash: await hashClave(nueva),
      password_hash_anterior: u.password_hash,
      debe_cambiar_clave: false,
      clave_temporal_expira: null,
    });
    await sesiones.cerrarTodas(u.id, req.sesion.idHash); // cierra las otras sesiones abiertas
    await auditar(req, { accion: 'CAMBIO_CLAVE', entidad: 'usuario', entidadId: u.id });
  }

  async function registrarCorreo(req, { correo }) {
    const u = await repo.porId(req.usuario.id);
    const token = await tokens.emitir(u.id, 'VERIFICAR_CORREO', { horas: HORAS_VERIFICACION, dato: correo });
    const enlace = `${cfg.appUrl}/verificar-correo?token=${encodeURIComponent(token)}`;
    await mailer.enviar({
      para: correo,
      asunto: 'Confirme su correo – Talento Humano',
      texto: `Hola ${primerNombre(u.nombre)}:\n\nPara confirmar este correo en la plataforma de Talento Humano abra este enlace (vence en ${HORAS_VERIFICACION} horas):\n${enlace}\n\nSi usted no lo solicitó, ignore este mensaje.`,
      html: plantillaHtml(
        u.nombre,
        'Confirme su correo',
        `Para confirmar este correo en la plataforma de Talento Humano pulse el botón. El enlace vence en ${HORAS_VERIFICACION} horas.`,
        enlace,
        'Confirmar correo',
      ),
      enlace,
    });
    await auditar(req, { accion: 'CORREO_REGISTRADO', entidad: 'usuario', entidadId: u.id, detalle: { pendienteVerificacion: true } });
  }

  async function verificarCorreo(req, { token }) {
    const t = await tokens.consumir(token, 'VERIFICAR_CORREO');
    if (!t) throw new ErrorApp(400, 'TOKEN_INVALIDO', 'El enlace no es válido o ya venció. Solicite uno nuevo desde la plataforma.');
    await repo.actualizar(t.usuario_id, { correo: t.dato, correo_verificado_en: ahora() });
    await auditar(req, { accion: 'CORREO_VERIFICADO', entidad: 'usuario', entidadId: t.usuario_id, actorId: t.usuario_id });
  }

  // Siempre responde igual, exista o no la cédula, para no revelar cuentas.
  async function solicitarRecuperacion(req, { cedula }) {
    const u = await repo.porCedula(cedula);
    if (!u || !u.activo || !u.correo || !u.correo_verificado_en) {
      await auditar(req, { accion: 'RECUPERACION_IGNORADA', entidad: 'usuario', entidadId: u?.id ?? null, actorId: null });
      return;
    }
    const token = await tokens.emitir(u.id, 'RECUPERAR', { horas: HORAS_RECUPERACION });
    const enlace = `${cfg.appUrl}/restablecer?token=${encodeURIComponent(token)}`;
    // El envío va en segundo plano: el tiempo de respuesta y un fallo del SMTP no deben
    // delatar si la cédula existe.
    mailer
      .enviar({
        para: u.correo,
        asunto: 'Restablecer contraseña – Talento Humano',
        texto: `Hola ${primerNombre(u.nombre)}:\n\nRecibimos una solicitud para restablecer su contraseña. Abra este enlace (vence en ${HORAS_RECUPERACION} hora):\n${enlace}\n\nSi usted no lo solicitó, ignore este mensaje; su contraseña no cambiará.`,
        html: plantillaHtml(
          u.nombre,
          'Restablecer contraseña',
          `Recibimos una solicitud para restablecer su contraseña. El enlace vence en ${HORAS_RECUPERACION} hora. Si usted no lo solicitó, ignore este mensaje.`,
          enlace,
          'Crear nueva contraseña',
        ),
        enlace,
      })
      .catch((e) => log.error('No se pudo enviar el correo de recuperación', { usuario: u.id, error: e.message }));
    await auditar(req, { accion: 'RECUPERACION_SOLICITADA', entidad: 'usuario', entidadId: u.id, actorId: null });
  }

  async function restablecer(req, { token, nueva }) {
    const MSG = 'El enlace no es válido o ya venció. Solicite uno nuevo.';
    // Se valida la clave antes de gastar el enlace, para que un error de digitación no lo invalide.
    const previo = await tokens.consultar(token, 'RECUPERAR');
    if (!previo) throw new ErrorApp(400, 'TOKEN_INVALIDO', MSG);
    const u = await repo.porId(previo.usuario_id);
    if (!u || !u.activo) throw new ErrorApp(400, 'TOKEN_INVALIDO', MSG);
    const error = revisarPolitica(nueva, { cedula: u.cedula });
    if (error) throw invalido(error, { nueva: error });
    if (
      (await verificarClave(u.password_hash, nueva)) ||
      (u.password_hash_anterior && (await verificarClave(u.password_hash_anterior, nueva)))
    ) {
      throw invalido('La nueva contraseña debe ser distinta de las anteriores.', { nueva: 'Debe ser distinta de las anteriores.' });
    }
    const t = await tokens.consumir(token, 'RECUPERAR');
    if (!t) throw new ErrorApp(400, 'TOKEN_INVALIDO', MSG);
    await repo.actualizar(u.id, {
      password_hash: await hashClave(nueva),
      password_hash_anterior: u.password_hash,
      debe_cambiar_clave: false,
      clave_temporal_expira: null,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    });
    await sesiones.cerrarTodas(u.id);
    await auditar(req, { accion: 'CLAVE_RESTABLECIDA', entidad: 'usuario', entidadId: u.id, actorId: u.id });
  }

  return { login, cambiarClave, registrarCorreo, verificarCorreo, solicitarRecuperacion, restablecer };
}

export const primerNombre = (nombreCompleto) => {
  // La matriz guarda "APELLIDOS NOMBRES": se usa la última parte como saludo si hay 3+ palabras.
  const partes = String(nombreCompleto || '')
    .trim()
    .split(/\s+/);
  const p = partes.length >= 3 ? partes[2] : partes[0];
  return p ? p.charAt(0) + p.slice(1).toLowerCase() : '';
};

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function plantillaHtml(nombre, titulo, texto, enlace, boton) {
  return `<!doctype html><html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;background:#EEF1F6;padding:24px">
<table role="presentation" style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:24px">
<tr><td><h1 style="color:#6A1B9A;font-size:20px">${escapar(titulo)}</h1>
<p>Hola ${escapar(primerNombre(nombre))}:</p><p>${escapar(texto)}</p>
<p><a href="${escapar(enlace)}" style="display:inline-block;background:#6A1B9A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapar(boton)}</a></p>
<p style="font-size:12px;color:#5A6070">Si el botón no funciona, copie este enlace en el navegador:<br>${escapar(enlace)}</p>
</td></tr></table></body></html>`;
}
