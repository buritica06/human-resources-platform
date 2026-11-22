// Importación de expedientes desde el libro de nómina:
//  - PARAMETROS (opcional): empleadores (CLAVE, NOMBRE COMPLETO, C.C. / NIT) y sedes (EMPLEADOR, SEDE …)
//  - EMPLEADOS: una fila por colaborador (columnas ubicadas por su encabezado)
// Vista previa (no escribe nada) → confirmación en UNA transacción (todo o nada).
import { invalido } from '../../core/errors.js';
import { ahora } from '../../core/db.js';
import { leerLibro, hoja, buscarEncabezado, valorCelda, fechaCelda, cedulaCelda, normalizar } from '../../core/excel.js';
import { normalizarCampo, reglasCruzadas } from './validators.js';
import { POR_CLAVE } from './campos.js';
import { sha256 } from '../../core/security/cripto.js';

// Campo del expediente ← encabezados aceptados del Excel (normalizados: sin tildes, en mayúsculas).
// exacto: el encabezado debe coincidir completo (evita que "ESTADO CIVIL" se tome como "ESTADO").
// Los demás aceptan prefijo ("AUX. TRANSP. (SI/NO)", "DÍA DE DESCANSO (dominical pactado)").
const COLUMNAS = [
  ['cedula', ['CEDULA', 'CC', 'C.C.'], true],
  ['nombre', ['NOMBRE', 'NOMBRE COMPLETO', 'NOMBRES Y APELLIDOS', 'APELLIDOS Y NOMBRES'], true],
  ['_empleador', ['EMPLEADOR'], true],
  ['_sede', ['SEDE'], true],
  ['cargo', ['CARGO'], true],
  ['tipo_contrato', ['TIPO CONTRATO', 'TIPO DE CONTRATO']],
  ['fecha_ingreso', ['FECHA INGRESO', 'FECHA DE INGRESO']],
  ['fecha_fin_contrato', ['FECHA FIN CONTRATO', 'FECHA FIN DE CONTRATO', 'FECHA FIN']],
  ['salario_base', ['SALARIO BASE', 'SALARIO', 'SUELDO BASICO', 'SALARIO BASICO']],
  ['aux_transporte', ['AUX. TRANSP', 'AUX TRANSP', 'AUXILIO DE TRANSPORTE', 'AUXILIO TRANSPORTE']],
  ['eps', ['EPS'], true],
  ['afp', ['AFP', 'PENSION', 'FONDO DE PENSION'], true],
  ['fondo_cesantias', ['CESANTIAS', 'FONDO DE CESANTIAS', 'FONDO CESANTIAS'], true],
  ['caja', ['CAJA', 'CAJA DE COMPENSACION', 'CCF'], true],
  ['arl_riesgo', ['RIESGO ARL', 'CLASE DE RIESGO', 'ARL RIESGO', 'RIESGO']],
  ['banco', ['BANCO'], true],
  ['tipo_cuenta', ['TIPO CUENTA', 'TIPO DE CUENTA']],
  ['numero_cuenta', ['N° CUENTA', 'NO. CUENTA', 'NUMERO DE CUENTA', 'NUMERO CUENTA', 'CUENTA'], true],
  ['estado', ['ESTADO'], true],
  ['fecha_retiro', ['FECHA RETIRO', 'FECHA DE RETIRO']],
  ['motivo_retiro', ['MOTIVO RETIRO', 'MOTIVO DE RETIRO']],
  ['celular', ['CELULAR', 'TELEFONO', 'TELEFONO CELULAR'], true],
  ['dia_descanso', ['DIA DE DESCANSO', 'DIA DESCANSO']],
  ['esquema_horas', ['ESQUEMA DE HORAS', 'ESQUEMA']],
  ['fin_lactancia', ['FIN LACTANCIA', 'FIN DE LACTANCIA', 'FECHA FIN LACTANCIA'], true],
  ['lactancia', ['LACTANCIA']],
];
const CRITICOS = new Set(['cedula', 'nombre', '_empleador', '_sede', 'estado']);

// Devuelve { mapa: {campo → columna}, faltantes: [campo] }
function mapearColumnas(columnas) {
  const mapa = {};
  // 1) coincidencias exactas; 2) por prefijo solo para los campos que lo permiten
  for (const exactas of [true, false]) {
    for (const [texto, col] of columnas) {
      if (Object.values(mapa).includes(col)) continue;
      const def = COLUMNAS.find(([campo, alias, soloExacto]) =>
        !(campo in mapa) && alias.some((a) => (exactas ? texto === normalizar(a) : !soloExacto && texto.startsWith(normalizar(a)))));
      if (def) mapa[def[0]] = col;
    }
  }
  const faltantes = COLUMNAS.map(([campo]) => campo).filter((c) => !(c in mapa));
  return { mapa, faltantes };
}

const MAX_CLAVE = 30;

// Lee empleadores y sedes de la hoja PARAMETROS. Devuelve también los errores de esa hoja
// (se reportan en la vista previa; nunca deben llegar a fallar en la confirmación).
function leerOrganizacion(libro) {
  const vacio = { empleadores: [], sedes: [], errores: [] };
  const h = hoja(libro, 'PARAMETROS');
  if (!h) return vacio;
  const enc = buscarEncabezado(h, ['CLAVE'], 10);
  if (!enc) return vacio;
  const col = (pref) => [...enc.columnas].find(([t]) => t.startsWith(normalizar(pref)))?.[1];
  const cClave = enc.columnas.get('CLAVE');
  const cNombre = col('NOMBRE COMPLETO');
  const cDoc = col('C.C');
  const cEmpSede = enc.columnas.get('EMPLEADOR');
  const cSede = col('SEDE');
  const empleadores = [];
  const sedes = [];
  const errores = [];
  for (let r = enc.fila + 1; r <= Math.min(h.rowCount, enc.fila + 200); r++) {
    const f = h.getRow(r);
    const clave = normalizar(valorCelda(f.getCell(cClave)));
    if (clave && cNombre) {
      if (clave.length > MAX_CLAVE) {
        errores.push({ fila: r, mensaje: `PARAMETROS: la clave de empleador "${clave.slice(0, 40)}" supera ${MAX_CLAVE} caracteres.` });
      } else if (!empleadores.some((e) => e.clave === clave)) { // las repetidas se ignoran
        empleadores.push({
          clave,
          razon_social: String(valorCelda(f.getCell(cNombre))).replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 150) || clave,
          documento: cDoc ? String(valorCelda(f.getCell(cDoc))).replace(/\D/g, '').slice(0, 20) || null : null,
        });
      }
    }
    if (cEmpSede && cSede) {
      const emp = normalizar(valorCelda(f.getCell(cEmpSede)));
      const sede = String(valorCelda(f.getCell(cSede))).replace(/\s+/g, ' ').trim().toUpperCase();
      if (emp && sede) {
        if (sede.length > 120) errores.push({ fila: r, mensaje: 'PARAMETROS: nombre de sede demasiado largo (máx. 120).' });
        else if (!sedes.some((s) => s.empleador === emp && s.nombre === sede)) sedes.push({ fila: r, empleador: emp, nombre: sede });
      }
    }
  }
  return { empleadores, sedes, errores };
}

export function crearImportador(ctx, svc) {
  const { db, auditar } = ctx;

  async function analizar(buffer) {
    const libro = await leerLibro(buffer);
    const org = leerOrganizacion(libro);
    const h = hoja(libro, 'EMPLEADOS');
    if (!h) throw invalido('El libro no tiene la hoja "EMPLEADOS".');
    const enc = buscarEncabezado(h, ['CÉDULA', 'NOMBRE', 'EMPLEADOR', 'SEDE']);
    if (!enc) throw invalido('La hoja EMPLEADOS no tiene el encabezado esperado (CÉDULA, NOMBRE, EMPLEADOR, SEDE…).');
    const { mapa, faltantes } = mapearColumnas(enc.columnas);

    const errores = [...org.errores];
    const advertencias = [];
    if (faltantes.length) {
      advertencias.push({ fila: enc.fila, mensaje: `No se encontraron estas columnas (esos datos no se importan): ${faltantes.map((c) => POR_CLAVE[c]?.etiqueta ?? c.replace('_', '')).join(', ')}.` });
    }

    // Organización: la de la BD (sedes activas) más la que trae el libro
    const empBD = await db('empleadores').select('id', 'clave', 'razon_social', 'documento');
    const sedesBD = await db('sedes').where({ activa: true }).select('id', 'empleador_id', 'nombre');
    const sedesInactivas = await db('sedes').where({ activa: false }).select('id', 'empleador_id', 'nombre');
    const empPorClave = new Map(empBD.map((e) => [normalizar(e.clave), e]));
    const empleadoresNuevos = org.empleadores.filter((e) => !empPorClave.has(e.clave));
    const claveDeId = new Map(empBD.map((e) => [e.id, normalizar(e.clave)]));
    const enLista = (lista, emp, nombre) =>
      lista.some((s) => claveDeId.get(s.empleador_id) === emp && normalizar(s.nombre) === normalizar(nombre));
    const empleadorConocido = (clave) => empPorClave.has(clave) || empleadoresNuevos.some((e) => e.clave === clave);
    const sedesNuevas = [];
    for (const s of org.sedes) {
      if (enLista(sedesBD, s.empleador, s.nombre)) continue;
      if (enLista(sedesInactivas, s.empleador, s.nombre)) {
        errores.push({ fila: s.fila, mensaje: `PARAMETROS: la sede "${s.nombre}" está desactivada en la plataforma.` });
      } else if (!empleadorConocido(s.empleador)) {
        errores.push({ fila: s.fila, mensaje: `PARAMETROS: la sede "${s.nombre}" es del empleador "${s.empleador}", que no existe.` });
      } else sedesNuevas.push(s);
    }
    const sedeConocida = (emp, nombre) =>
      enLista(sedesBD, emp, nombre) || sedesNuevas.some((s) => s.empleador === emp && normalizar(s.nombre) === normalizar(nombre));

    const v = await svc.contextoValidacion();
    const editables = await svc.editablesColaborador();
    const filas = [];
    const vistas = new Map();

    for (let r = enc.fila + 1; r <= h.rowCount; r++) {
      const f = h.getRow(r);
      const celda = (campo) => (mapa[campo] ? valorCelda(f.getCell(mapa[campo])) : '');
      if (celda('cedula') === '' && celda('nombre') === '') continue;
      const reg = {};
      const malos = [];
      for (const [campo] of Object.entries(mapa)) {
        let bruto = celda(campo);
        if (campo === 'cedula') {
          const ced = cedulaCelda(bruto);
          if (!/^\d{5,12}$/.test(ced)) malos.push(['cedula', 'Cédula vacía o no numérica.']);
          reg.cedula = ced;
          continue;
        }
        if (campo === '_empleador') { reg._empleador = normalizar(bruto); continue; }
        if (campo === '_sede') { reg._sede = String(bruto).replace(/\s+/g, ' ').trim().toUpperCase(); continue; }
        if (POR_CLAVE[campo]?.tipo === 'fecha') {
          const fch = fechaCelda(bruto);
          if (fch === undefined) { malos.push([campo, 'Fecha no reconocida.']); continue; }
          bruto = fch;
        }
        if (campo === 'numero_cuenta' && bruto !== '') bruto = typeof bruto === 'number' ? String(Math.trunc(bruto)) : String(bruto).replace(/[\s.-]/g, '');
        // Celda vacía: no se envía el campo (en un expediente existente NO borra el dato guardado).
        // El estado vacío de un expediente nuevo se asume ACTIVO más abajo.
        if (bruto === '' || bruto === null) continue;
        let res = normalizarCampo(campo, bruto, v);
        // Valores de lista fuera del catálogo: se conservan tal cual (el Excel manda) con advertencia,
        // siempre que quepan en la columna; si no, se omiten.
        if (res.error && POR_CLAVE[campo]?.tipo === 'lista' && campo !== 'estado') {
          const texto = String(bruto).replace(/\s+/g, ' ').trim();
          const max = POR_CLAVE[campo].max ?? 60;
          if (texto.length > max) {
            res = { error: `"${texto.slice(0, 40)}" no está en la lista y supera ${max} caracteres.` };
          } else {
            advertencias.push({ fila: r, mensaje: `${POR_CLAVE[campo].etiqueta}: "${texto}" no está en la lista; se guarda igual.` });
            res = { valor: texto };
          }
        }
        if (res.error) malos.push([campo, res.error]);
        else reg[campo] = res.valor;
      }
      if (!reg.nombre && !malos.some(([c]) => c === 'nombre')) malos.push(['nombre', 'Este dato es obligatorio.']);
      if (!reg._empleador || !empleadorConocido(reg._empleador)) malos.push(['_empleador', `Empleador "${reg._empleador || ''}" no existe.`]);
      else if (!reg._sede || !sedeConocida(reg._empleador, reg._sede)) malos.push(['_sede', `Sede "${reg._sede || ''}" no existe para ese empleador.`]);

      const criticos = malos.filter(([c]) => CRITICOS.has(c));
      if (criticos.length) {
        errores.push({ fila: r, mensaje: criticos.map(([c, m]) => `${POR_CLAVE[c]?.etiqueta ?? c.replace('_', '')}: ${m}`).join(' ') });
        continue;
      }
      // Errores en datos no críticos: se omite ese dato y se avisa
      for (const [c, m] of malos) advertencias.push({ fila: r, mensaje: `${POR_CLAVE[c]?.etiqueta ?? c}: ${m} Se omite este dato.` });
      if (vistas.has(reg.cedula)) {
        errores.push({ fila: r, mensaje: `Cédula repetida (también en la fila ${vistas.get(reg.cedula)}).` });
        continue;
      }
      vistas.set(reg.cedula, r);
      filas.push({ fila: r, ...reg });
    }

    // Ids de empleador/sede ya existentes en la BD (null si se crearán con esta importación)
    const idsOrg = (empClave, sedeNombre) => {
      const e = empPorClave.get(empClave);
      const s = e && sedesBD.find((x) => x.empleador_id === e.id && normalizar(x.nombre) === normalizar(sedeNombre));
      return e && s ? { empleador_id: e.id, sede_id: s.id } : null;
    };

    // Comparación con lo existente
    const existentes = new Map((await db('colaboradores').whereIn('cedula', filas.map((f) => f.cedula))).map((c) => [c.cedula, c]));
    const nuevos = [];
    const actualizados = [];
    let sinCambios = 0;
    for (const f of filas) {
      const { fila, cedula, _empleador, _sede, ...datos } = f;
      // Reglas entre campos: el Excel manda, pero se avisa de inconsistencias.
      for (const m of Object.values(reglasCruzadas({ ...datos, sede_id: null }, v))) advertencias.push({ fila, mensaje: m });
      const actual = existentes.get(cedula);
      if (!actual) {
        nuevos.push({ fila, cedula, nombre: datos.nombre, _empleador, _sede, datos });
        continue;
      }
      // Datos que el colaborador mantiene él mismo: el Excel solo los llena si están vacíos
      for (const k of Object.keys(datos)) if (editables.has(k) && actual[k] !== null && actual[k] !== undefined && actual[k] !== '') delete datos[k];
      const org = idsOrg(_empleador, _sede);
      const { hist } = svc.diferencias(actual, { ...datos, ...(org ?? {}) }, 'IMPORTACION', null, v);
      const campos = hist.map((x) => x.campo);
      if (!org) campos.push('sede_id'); // pasa a una sede que se crea con esta importación
      if (campos.length) actualizados.push({ fila, cedula, nombre: datos.nombre ?? actual.nombre, id: actual.id, _empleador, _sede, datos, campos });
      else sinCambios++;
    }
    return { org: { empleadoresNuevos, sedesNuevas }, nuevos, actualizados, sinCambios, errores, advertencias, v, huella: sha256(buffer) };
  }

  // Vista previa: no escribe nada
  async function vistaPrevia(buffer) {
    const a = await analizar(buffer);
    return resumen(a, false);
  }

  // Se confirma solo el MISMO archivo que se revisó (huella SHA-256 devuelta en la vista previa).
  async function confirmar(req, buffer, huellaRevisada) {
    if (!huellaRevisada || huellaRevisada !== sha256(buffer)) {
      throw invalido('El archivo no coincide con el que se revisó. Revíselo de nuevo antes de confirmar.');
    }
    const a = await analizar(buffer);
    if (a.errores.length) throw invalido('Corrija los errores del archivo antes de confirmar la importación.');
    const t = ahora();
    let creados = 0;
    let actualizados = 0;
    await db.transaction(async (trx) => {
      // 1) Organización
      for (const e of a.org.empleadoresNuevos) await trx('empleadores').insert(e);
      const emp = new Map((await trx('empleadores').select('id', 'clave', 'razon_social')).map((e) => [normalizar(e.clave), e]));
      let orden = Number((await trx('sedes').max({ m: 'orden' }))[0].m ?? 0);
      for (const s of a.org.sedesNuevas) {
        await trx('sedes').insert({ empleador_id: emp.get(s.empleador).id, nombre: s.nombre, orden: ++orden });
      }
      const sedes = await trx('sedes').where({ activa: true }).select('id', 'empleador_id', 'nombre');
      const idSede = (empClave, nombre) => sedes.find((s) => s.empleador_id === emp.get(empClave).id && normalizar(s.nombre) === normalizar(nombre)).id;
      // Contexto con la organización actualizada (para textos del historial)
      const v = { ...a.v, sedes: new Map(sedes.map((s) => [s.id, s])), empleadores: new Map([...emp.values()].map((e) => [e.id, e])) };

      // 2) Nuevos
      for (const n of a.nuevos) {
        const datos = { ...n.datos, empleador_id: emp.get(n._empleador).id, sede_id: idSede(n._empleador, n._sede) };
        const { update } = svc.diferencias({}, datos, 'IMPORTACION', req.usuario.id, v);
        const [fila] = await trx('colaboradores').insert({ cedula: n.cedula, ...update, estado: update.estado ?? 'ACTIVO', creado_en: t, actualizado_en: t }).returning('id');
        const id = typeof fila === 'object' ? fila.id : fila;
        await trx('expediente_cambios').insert({ colaborador_id: id, campo: '_alta', valor_anterior: null, valor_nuevo: 'Expediente creado desde el archivo de nómina', origen: 'IMPORTACION', actor_id: req.usuario.id, creado_en: t });
        creados++;
      }
      // 3) Actualizados
      for (const u of a.actualizados) {
        const actual = await trx('colaboradores').where({ id: u.id }).first();
        const datos = { ...u.datos, empleador_id: emp.get(u._empleador).id, sede_id: idSede(u._empleador, u._sede) };
        const { update, hist } = svc.diferencias(actual, datos, 'IMPORTACION', req.usuario.id, v);
        if (!hist.length) continue;
        await trx('colaboradores').where({ id: u.id }).update({ ...update, actualizado_en: t });
        await trx('expediente_cambios').insert(hist.map((h) => ({ ...h, colaborador_id: u.id })));
        actualizados++;
      }
    });
    await auditar(req, { accion: 'IMPORTAR_EXPEDIENTES', entidad: 'colaborador', detalle: { creados, actualizados, empleadoresNuevos: a.org.empleadoresNuevos.length, sedesNuevas: a.org.sedesNuevas.length } });
    return { ...resumen(a, true), creados, actualizadosAplicados: actualizados };
  }

  function resumen(a, confirmado) {
    return {
      confirmado,
      huella: a.huella,
      empleadoresNuevos: a.org.empleadoresNuevos.map((e) => e.clave),
      sedesNuevas: a.org.sedesNuevas.map((s) => `${s.nombre} (${s.empleador})`),
      nuevos: a.nuevos.map((n) => ({ fila: n.fila, cedula: n.cedula, nombre: n.nombre })),
      actualizar: a.actualizados.map((x) => ({ fila: x.fila, cedula: x.cedula, nombre: x.nombre, campos: [...new Set(x.campos)].map((c) => POR_CLAVE[c]?.etiqueta ?? c) })),
      sinCambios: a.sinCambios,
      errores: a.errores,
      advertencias: a.advertencias,
    };
  }

  return { vistaPrevia, confirmar };
}
