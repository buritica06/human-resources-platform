// Expediente del colaborador: consulta por alcance, edición por permisos, historial
// de cambios y número de cuenta cifrado.
import { ErrorApp, invalido, noEncontrado } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { CAMPOS, GRUPOS, POR_CLAVE, ESTADOS } from './campos.js';
import { normalizarCambios, reglasCruzadas } from './validators.js';
import { crearRepositorioColaboradores, POR_PAGINA } from './repository.js';
import { log } from '../../core/logger.js';

// Campos que involucra cada regla entre campos (validators.reglasCruzadas). Una regla se
// verifica si cambia CUALQUIERA de sus campos.
const CAMPOS_REGLA = {
  sede_id: ['sede_id', 'empleador_id'],
  fecha_fin_contrato: ['fecha_fin_contrato', 'fecha_ingreso'],
  fecha_retiro: ['fecha_retiro', 'estado', 'fecha_ingreso'],
};

const CAMPOS_PAGO = CAMPOS.filter((c) => c.director === false).map((c) => c.clave);
const LISTAS = [...new Set(CAMPOS.filter((c) => c.lista && !c.lista.startsWith('_')).map((c) => c.lista))];

export const mascaraCuenta = (n) => (!n ? null : /^\d+$/.test(n) ? `•••• ${String(n).slice(-4)}` : n);

export function crearServicioColaboradores(ctx) {
  const { db, params, auditar, cifrador } = ctx;
  const repo = crearRepositorioColaboradores(db);

  // ---------- utilidades ----------
  async function contextoValidacion() {
    const listas = {};
    for (const l of LISTAS) listas[l] = await params.valor(l);
    const sedes = new Map((await repo.sedes()).map((s) => [s.id, s]));
    const empleadores = new Map((await repo.empleadores()).map((e) => [e.id, e]));
    return { listas, sedes, empleadores };
  }

  const editablesColaborador = async () => new Set(await params.valor('CAMPOS_EDITABLES_COLABORADOR'));

  // Alcance del usuario: null = todo; array de sedes (director). Colaborador: sin alcance sobre otros.
  async function alcance(req) {
    if (req.usuario.rol === 'ADMIN') return null;
    if (req.usuario.rol === 'DIRECTOR') return repo.sedesDeDirector(req.usuario.id);
    return [];
  }

  async function cargarConAlcance(req, id) {
    const c = await repo.porId(id);
    const a = await alcance(req);
    // Fuera de alcance → 404 (no se revela que existe)
    if (!c || (a && !a.includes(c.sede_id))) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'colaborador', entidadId: id });
      throw noEncontrado('No encontramos ese colaborador.');
    }
    return c;
  }

  // Si el dato no se puede descifrar (p. ej. se cambió DATA_ENCRYPTION_KEY) no se tumba la página:
  // se registra el error y se muestra como ilegible.
  const ILEGIBLE = '(no se puede leer)';
  function descifrarCuenta(c) {
    if (!c.numero_cuenta_cifrado) return null;
    try {
      return cifrador.descifrar(c.numero_cuenta_cifrado);
    } catch (e) {
      log.error('No se pudo descifrar un número de cuenta', { colaborador: c.id, error: e.message });
      return ILEGIBLE;
    }
  }

  // vista: PROPIO | DIRECTOR | ADMIN
  function presentar(c, vista) {
    const datos = {};
    for (const campo of CAMPOS) {
      if (vista === 'DIRECTOR' && campo.director === false) continue;
      if (campo.clave === 'numero_cuenta') datos.numero_cuenta = mascaraCuenta(descifrarCuenta(c));
      else if (campo.tipo === 'dinero') datos[campo.clave] = c[campo.clave] === null ? null : Number(c[campo.clave]);
      else if (campo.tipo === 'sino') datos[campo.clave] = c[campo.clave] === null ? null : !!c[campo.clave];
      else datos[campo.clave] = c[campo.clave] ?? null;
    }
    return {
      id: c.id,
      cedula: c.cedula,
      nombre: c.nombre,
      estado: c.estado,
      sede: c.sede_nombre ?? null,
      empleador: c.empleador_nombre ?? null,
      datos,
    };
  }

  async function metadatos(vista, editables) {
    const v = await contextoValidacion();
    const sedes = [...v.sedes.values()].map((s) => ({ valor: s.id, texto: s.nombre, empleador: s.empleador_id }));
    const empleadores = (await repo.empleadores()).map((e) => ({ valor: e.id, texto: e.razon_social }));
    return {
      grupos: GRUPOS.map(([clave, titulo]) => ({ clave, titulo })),
      campos: CAMPOS.filter((c) => !(vista === 'DIRECTOR' && c.director === false)).map((c) => ({
        clave: c.clave,
        etiqueta: c.etiqueta,
        grupo: c.grupo,
        tipo: c.tipo,
        obligatorio: !!c.obligatorio,
        editable: editables.has(c.clave) && !c.soloLectura,
        ...(c.tipo === 'lista' ? { opciones: c.lista === '_ESTADO' ? ESTADOS : v.listas[c.lista] } : {}),
        ...(c.tipo === 'sede' ? { opciones: sedes } : {}),
        ...(c.tipo === 'empleador' ? { opciones: empleadores } : {}),
      })),
    };
  }

  // Pestañas: las de módulos aún no activos aparecen con un aviso (se llenan en M2–M7).
  function pestanas() {
    const aportadas = new Map();
    for (const m of ctx.modulos) for (const p of m.pestanasExpediente ?? []) aportadas.set(p.clave, { ...p, modulo: m.nombre });
    return [
      { clave: 'datos', titulo: 'Datos', activa: true },
      ...[
        ['nomina', 'Nómina'], ['permisos', 'Permisos'], ['vacaciones', 'Vacaciones'],
        ['incapacidades', 'Incapacidades'], ['licencias', 'Licencias'], ['documentos', 'Documentos'],
      ].map(([clave, titulo]) => ({ clave, titulo, activa: aportadas.has(clave), script: aportadas.get(clave)?.script ?? null })),
    ];
  }

  // ---------- escritura con historial ----------
  // Compara el registro actual (c, puede ser {} si es nuevo) con los valores limpios.
  // Devuelve { update (columnas BD), historial (filas listas para insertar sin colaborador_id) }.
  function diferencias(c, limpios, origen, actorId, v) {
    const hist = [];
    const update = {};
    const t = ahora();
    const fila = (campo, a, n) => ({ campo, valor_anterior: textoHist(campo, a, v), valor_nuevo: textoHist(campo, n, v), origen, actor_id: actorId, creado_en: t });
    for (const [clave, nuevo] of Object.entries(limpios)) {
      if (clave === 'numero_cuenta') {
        const actual = descifrarCuenta(c);
        if ((actual ?? null) === (nuevo ?? null)) continue;
        update.numero_cuenta_cifrado = cifrador.cifrar(nuevo);
        hist.push(fila(clave, mascaraCuenta(actual), mascaraCuenta(nuevo)));
        continue;
      }
      const tipo = POR_CLAVE[clave].tipo;
      const crudo = c[clave] ?? null;
      const anterior = crudo === null ? null : tipo === 'sino' ? !!crudo : tipo === 'dinero' ? Number(crudo) : crudo;
      if (anterior === nuevo) continue;
      update[clave] = nuevo;
      hist.push(fila(clave, anterior, nuevo));
    }
    return { update, hist };
  }

  // Las diferencias se calculan DENTRO de la transacción, con el registro releído (y bloqueado
  // en PostgreSQL), para que dos ediciones simultáneas no dejen un historial impreciso.
  async function aplicarCambios(req, c, limpios, origen, v) {
    const campos = await db.transaction(async (trx) => {
      const q = trx('colaboradores').where({ id: c.id });
      if (db.client.config.client === 'pg') q.forUpdate();
      const actual = await q.first();
      const { update, hist } = diferencias(actual, limpios, origen, req.usuario.id, v);
      if (!hist.length) return [];
      await repo.actualizar(trx, c.id, update);
      await repo.registrarCambios(trx, hist.map((h) => ({ ...h, colaborador_id: c.id })));
      return hist.map((h) => h.campo);
    });
    if (campos.length) await auditar(req, { accion: 'EDITAR', entidad: 'colaborador', entidadId: c.id, detalle: { origen, campos } });
    return campos;
  }

  // En el historial se guarda el texto legible (nombre de la sede, SI/NO), no el id.
  function textoHist(campo, valor, v) {
    if (valor === null || valor === undefined) return null;
    if (campo === 'sede_id') return v?.sedes.get(valor)?.nombre ?? String(valor);
    if (campo === 'empleador_id') return v?.empleadores.get(valor)?.razon_social ?? String(valor);
    if (typeof valor === 'boolean') return valor ? 'SI' : 'NO';
    return String(valor);
  }

  async function validarYAplicar(req, c, cuerpo, origen) {
    const v = await contextoValidacion();
    const { limpios, errores } = normalizarCambios(cuerpo, v);
    if (Object.keys(errores).length) throw invalido('Revise los datos marcados.', errores);
    const resultante = { ...c, ...limpios };
    const cruzados = reglasCruzadas(resultante, v);
    // Se exige toda regla que involucre CUALQUIER campo que cambia (p. ej. mover la fecha de
    // ingreso después de la de retiro). Las inconsistencias ya existentes en otros datos no bloquean.
    const relevantes = Object.fromEntries(Object.entries(cruzados).filter(([regla]) =>
      (CAMPOS_REGLA[regla] ?? [regla]).some((campo) => campo in limpios)));
    if (Object.keys(relevantes).length) throw invalido('Revise los datos marcados.', relevantes);
    return aplicarCambios(req, c, limpios, origen, v);
  }

  // ---------- casos de uso ----------
  async function miExpediente(req) {
    const c = await repo.porCedula(req.usuario.cedula);
    if (!c) throw new ErrorApp(404, 'SIN_EXPEDIENTE', 'Aún no tiene un expediente registrado. Comuníquese con el área contable.');
    await auditar(req, { accion: 'VER', entidad: 'colaborador', entidadId: c.id, detalle: { propio: true } });
    return { colaborador: presentar(c, 'PROPIO'), ...(await metadatos('PROPIO', await editablesColaborador())), pestanas: pestanas() };
  }

  async function actualizarMio(req, cuerpo) {
    const c = await repo.porCedula(req.usuario.cedula);
    if (!c) throw new ErrorApp(404, 'SIN_EXPEDIENTE', 'Aún no tiene un expediente registrado.');
    const permitidos = await editablesColaborador();
    const negados = Object.keys(cuerpo).filter((k) => !permitidos.has(k));
    if (negados.length) {
      await auditar(req, { accion: 'EDICION_DENEGADA', entidad: 'colaborador', entidadId: c.id, detalle: { campos: negados } });
      throw new ErrorApp(403, 'CAMPO_NO_EDITABLE', 'Algunos datos solo los puede cambiar el área contable.',
        Object.fromEntries(negados.map((k) => [k, 'Solo el área contable puede cambiar este dato.'])));
    }
    const cambiados = await validarYAplicar(req, c, cuerpo, 'COLABORADOR');
    return { cambiados, colaborador: presentar(await repo.porId(c.id), 'PROPIO') };
  }

  async function miHistorial(req) {
    const c = await repo.porCedula(req.usuario.cedula);
    if (!c) throw new ErrorApp(404, 'SIN_EXPEDIENTE', 'Aún no tiene un expediente registrado.');
    await auditar(req, { accion: 'VER_HISTORIAL', entidad: 'colaborador', entidadId: c.id, detalle: { propio: true } });
    return { cambios: presentarHistorial(await repo.historial(c.id)) };
  }

  async function listar(req, filtros) {
    const a = await alcance(req);
    const { total, filas } = await repo.listar(filtros, a);
    // Ley 1581: queda registro de quién consultó la lista y con qué filtros
    await auditar(req, { accion: 'BUSCAR', entidad: 'colaborador', detalle: { q: filtros.q ?? null, sede: filtros.sede ?? null, estado: filtros.estado ?? null, pagina: filtros.pagina, resultados: total } });
    return {
      total, pagina: filtros.pagina, porPagina: POR_PAGINA,
      colaboradores: filas.map((f) => ({ id: f.id, cedula: f.cedula, nombre: f.nombre, cargo: f.cargo, estado: f.estado, sede: f.sede_nombre })),
    };
  }

  async function detalle(req, id) {
    const c = await cargarConAlcance(req, id);
    const vista = req.usuario.rol === 'ADMIN' ? 'ADMIN' : 'DIRECTOR';
    await auditar(req, { accion: 'VER', entidad: 'colaborador', entidadId: id });
    const editables = vista === 'ADMIN' ? new Set(CAMPOS.map((c2) => c2.clave)) : new Set();
    return { colaborador: presentar(c, vista), ...(await metadatos(vista, editables)), pestanas: pestanas() };
  }

  async function actualizar(req, id, cuerpo) {
    const c = await cargarConAlcance(req, id);
    const cambiados = await validarYAplicar(req, c, cuerpo, 'ADMIN');
    return { cambiados, colaborador: presentar(await repo.porId(id), 'ADMIN') };
  }

  async function historial(req, id) {
    await cargarConAlcance(req, id);
    await auditar(req, { accion: 'VER_HISTORIAL', entidad: 'colaborador', entidadId: id });
    const excluir = req.usuario.rol === 'DIRECTOR' ? CAMPOS_PAGO : [];
    return { cambios: presentarHistorial(await repo.historial(id, excluir)) };
  }

  async function revelarCuenta(req, id) {
    const c = await cargarConAlcance(req, id);
    await auditar(req, { accion: 'VER_CUENTA', entidad: 'colaborador', entidadId: id });
    return { numeroCuenta: descifrarCuenta(c) };
  }

  async function opciones(req) {
    const a = await alcance(req);
    const sedes = (await repo.sedes()).filter((s) => !a || a.includes(s.id));
    return { sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, empleador: s.empleador })), estados: ESTADOS };
  }

  function presentarHistorial(filas) {
    return filas.map((h) => ({
      id: h.id,
      campo: h.campo,
      etiqueta: POR_CLAVE[h.campo]?.etiqueta ?? h.campo,
      anterior: h.valor_anterior,
      nuevo: h.valor_nuevo,
      origen: h.origen,
      actor: h.actor_nombre ?? null,
      fecha: h.creado_en,
    }));
  }

  return {
    repo, contextoValidacion, diferencias, editablesColaborador, presentar,
    miExpediente, actualizarMio, miHistorial, listar, detalle, actualizar, historial, revelarCuenta, opciones,
  };
}
