// Gestión de usuarios por el admincontable: crear, carga masiva, activar/desactivar,
// cambiar rol y sedes, y restablecer la contraseña temporal.
import { conflicto, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { hashClave, generarClaveTemporal } from '../../core/security/claves.js';
import { crearRepositorioUsuarios, POR_PAGINA } from './repository.js';
import { leerLibro, leerEmpleados } from './excel.js';

const HORAS_CLAVE_TEMPORAL = 72;

export function crearServicioUsuarios(ctx) {
  const { db, auditar, sesiones } = ctx;
  const repo = crearRepositorioUsuarios(db);
  const venceTemporal = () => new Date(Date.now() + HORAS_CLAVE_TEMPORAL * 3600_000).toISOString();

  const presentar = (u, sedes) => ({
    id: u.id,
    cedula: u.cedula,
    nombre: u.nombre,
    rol: u.rol,
    activo: !!u.activo,
    primerIngresoPendiente: !!u.debe_cambiar_clave || !u.correo_verificado_en,
    correoVerificado: !!u.correo_verificado_en,
    bloqueado: !!u.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.now(),
    ultimoAcceso: u.ultimo_acceso,
    ...(sedes ? { sedes } : {}),
  });

  async function listar(filtros) {
    const { total, filas } = await repo.listar(filtros);
    return { total, pagina: filtros.pagina, porPagina: POR_PAGINA, usuarios: filas.map((u) => presentar(u)) };
  }

  async function detalle(id) {
    const u = await repo.porId(id);
    if (!u) throw noEncontrado('El usuario no existe.');
    return presentar(u, await repo.sedesDe(id));
  }

  async function crear(req, { cedula, nombre, rol, sedes }) {
    if (await repo.existeCedula(cedula)) throw conflicto('Ya existe un usuario con esa cédula.');
    if (rol !== 'DIRECTOR' && sedes.length)
      throw invalido('Solo los directores tienen sedes asignadas.', { sedes: 'Solo para directores.' });
    if (!(await repo.sedesValidas(sedes))) throw invalido('Alguna sede no existe.', { sedes: 'Sede no válida.' });
    const claveTemporal = generarClaveTemporal();
    const hash = await hashClave(claveTemporal);
    const id = await db.transaction(async (trx) => {
      const nuevo = await repo.insertar(trx, {
        cedula,
        nombre,
        rol,
        password_hash: hash,
        debe_cambiar_clave: true,
        clave_temporal_expira: venceTemporal(),
        creado_por: req.usuario.id,
      });
      if (sedes.length) await repo.reemplazarSedes(trx, nuevo, sedes);
      return nuevo;
    });
    await auditar(req, { accion: 'CREAR', entidad: 'usuario', entidadId: id, detalle: { rol, sedes } });
    // La clave temporal se entrega UNA sola vez: no se guarda en claro ni se puede volver a consultar.
    return { usuario: await detalle(id), claveTemporal, venceEnHoras: HORAS_CLAVE_TEMPORAL };
  }

  async function actualizar(req, id, cambios) {
    const u = await repo.porId(id);
    if (!u) throw noEncontrado('El usuario no existe.');
    const esUnoMismo = id === req.usuario.id;
    if (esUnoMismo && (cambios.activo === false || (cambios.rol && cambios.rol !== u.rol))) {
      throw invalido('No puede desactivarse ni cambiar su propio rol.');
    }
    const rolFinal = cambios.rol ?? u.rol;
    if (u.rol === 'ADMIN' && (rolFinal !== 'ADMIN' || cambios.activo === false) && (await repo.contarAdminsActivos()) <= 1) {
      throw invalido('Debe quedar al menos un admincontable activo.');
    }
    if (cambios.sedes && rolFinal !== 'DIRECTOR' && cambios.sedes.length) {
      throw invalido('Solo los directores tienen sedes asignadas.', { sedes: 'Solo para directores.' });
    }
    if (cambios.sedes && !(await repo.sedesValidas(cambios.sedes))) throw invalido('Alguna sede no existe.', { sedes: 'Sede no válida.' });

    const antes = { nombre: u.nombre, rol: u.rol, activo: !!u.activo, sedes: await repo.sedesDe(id) };
    await db.transaction(async (trx) => {
      const campos = {};
      if (cambios.nombre !== undefined) campos.nombre = cambios.nombre;
      if (cambios.rol !== undefined) campos.rol = cambios.rol;
      if (cambios.activo !== undefined) campos.activo = cambios.activo;
      if (Object.keys(campos).length) await repo.actualizar(trx, id, campos);
      if (cambios.sedes) await repo.reemplazarSedes(trx, id, cambios.sedes);
      else if (rolFinal !== 'DIRECTOR') await repo.reemplazarSedes(trx, id, []);
    });
    // Desactivar o cambiar el rol invalida las sesiones abiertas de ese usuario.
    if (cambios.activo === false || (cambios.rol && cambios.rol !== u.rol)) await sesiones.cerrarTodas(id);
    const despues = await detalle(id);
    await auditar(req, {
      accion: 'EDITAR',
      entidad: 'usuario',
      entidadId: id,
      detalle: { antes, despues: { nombre: despues.nombre, rol: despues.rol, activo: despues.activo, sedes: despues.sedes } },
    });
    return despues;
  }

  async function restablecerClave(req, id) {
    const u = await repo.porId(id);
    if (!u) throw noEncontrado('El usuario no existe.');
    const claveTemporal = generarClaveTemporal();
    await repo.actualizar(db, id, {
      password_hash: await hashClave(claveTemporal),
      debe_cambiar_clave: true,
      clave_temporal_expira: venceTemporal(),
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    });
    // Un enlace de recuperación pendiente permitiría saltarse la clave temporal impuesta.
    await db('tokens').where({ usuario_id: id, tipo: 'RECUPERAR' }).whereNull('usado_en').update({ usado_en: ahora() });
    await sesiones.cerrarTodas(id);
    await auditar(req, { accion: 'RESTABLECER_CLAVE', entidad: 'usuario', entidadId: id });
    return { claveTemporal, venceEnHoras: HORAS_CLAVE_TEMPORAL };
  }

  // Carga masiva desde la hoja EMPLEADOS. Con confirmar=false solo valida (vista previa);
  // con confirmar=true crea todos los usuarios nuevos en una transacción o ninguno.
  async function cargaMasiva(req, buffer, confirmar) {
    const libro = await leerLibro(buffer);
    const { filas, errores } = leerEmpleados(libro);
    const activos = filas.filter((f) => f.estado === 'ACTIVO');
    const omitidosRetirados = filas.length - activos.length;
    const existentes = await repo.cedulasExistentes(activos.map((f) => f.cedula));
    const nuevos = activos.filter((f) => !existentes.has(f.cedula));
    const resumen = {
      totalFilas: filas.length + errores.length,
      nuevos: nuevos.map(({ fila, cedula, nombre }) => ({ fila, cedula, nombre })),
      yaExisten: existentes.size,
      omitidosRetirados,
      errores,
    };
    if (!confirmar) return { confirmado: false, ...resumen };
    if (errores.length) throw invalido('Corrija los errores del archivo antes de confirmar la carga.');
    if (!nuevos.length) throw invalido('No hay usuarios nuevos para crear.');

    // Los hash se calculan antes de abrir la transacción para no bloquear la BD.
    const preparados = [];
    for (const f of nuevos) {
      const claveTemporal = generarClaveTemporal();
      preparados.push({ ...f, claveTemporal, hash: await hashClave(claveTemporal) });
    }
    const creados = [];
    await db.transaction(async (trx) => {
      for (const f of preparados) {
        const id = await repo.insertar(trx, {
          cedula: f.cedula,
          nombre: f.nombre,
          rol: 'COLABORADOR',
          password_hash: f.hash,
          debe_cambiar_clave: true,
          clave_temporal_expira: venceTemporal(),
          creado_por: req.usuario.id,
        });
        creados.push({ id, cedula: f.cedula, nombre: f.nombre, claveTemporal: f.claveTemporal });
      }
    });
    await auditar(req, { accion: 'CARGA_MASIVA', entidad: 'usuario', detalle: { creados: creados.length, yaExisten: existentes.size } });
    return { confirmado: true, ...resumen, creados, venceEnHoras: HORAS_CLAVE_TEMPORAL };
  }

  return { listar, detalle, crear, actualizar, restablecerClave, cargaMasiva, listarSedes: () => repo.listarSedes() };
}
