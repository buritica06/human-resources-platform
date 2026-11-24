// Certificados laborales (M7). Se arman con los datos VIGENTES del expediente al momento de emitir
// (sin recalcular nada: el salario es el salario básico registrado) y quedan guardados con un código
// de verificación aleatorio. La verificación pública no expone datos personales.
// Alcance: el colaborador emite y descarga los suyos; el admincontable, los de cualquiera (también
// de retirados). El director no accede (pueden llevar el salario).
import crypto from 'node:crypto';
import { ErrorApp, conflicto, invalido, noEncontrado } from '../../core/errors.js';
import { log } from '../../core/logger.js';
import { ahora } from '../../core/db.js';
import { hoyBogota } from '../vacaciones/calendario.js';
import { fechaLarga, pesosALetras } from './letras.js';

const fechaBogota = (iso) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para dictarlo sin errores
export const formatoCodigo = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function generarCodigo() {
  const b = crypto.randomBytes(12); // 12 caracteres × 5 bits = 60 bits
  const s = [...b].map((x) => ALFABETO[x & 31]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export const normalizarCodigo = (c) =>
  String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(.{4})(.{4})(.{4}).*/, '$1-$2-$3');

function tipoContratoTexto(c) {
  const t = String(c.tipo_contrato ?? '').toUpperCase();
  if (t.includes('INDEFINIDO')) return 'con contrato a término indefinido';
  if (t.includes('FIJO')) return 'con contrato a término fijo';
  if (t.includes('OBRA')) return 'con contrato por obra o labor';
  return t ? `con contrato ${t.toLowerCase()}` : null;
}

export function crearServicioCertificados(ctx) {
  const { db, auditar } = ctx;

  const paramOpcional = async (clave, defecto = null) => {
    try {
      const v = await ctx.params.valor(clave);
      return v ?? defecto;
    } catch {
      return defecto;
    }
  };

  async function parametros() {
    const firmas = await paramOpcional('CERT_FIRMAS_EMPLEADORES', {});
    return {
      firmante: String((await paramOpcional('CERT_FIRMANTE_NOMBRE', '')) ?? '').trim(),
      cargoFirmante: String((await paramOpcional('CERT_FIRMANTE_CARGO', '')) ?? '').trim(),
      ciudad: String((await paramOpcional('CERT_CIUDAD', '')) ?? '').trim(),
      marcaComercial: String((await paramOpcional('CERT_MARCA_COMERCIAL', '')) ?? '').trim(),
      firmas: firmas && typeof firmas === 'object' ? firmas : {},
    };
  }

  function decodificarDataUri(dataUri) {
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) return null;
    const i = dataUri.indexOf(';base64,');
    if (i < 0) return null;
    try {
      return Buffer.from(dataUri.slice(i + 8), 'base64');
    } catch {
      return null;
    }
  }

  async function recursosPdf(claveEmpleador) {
    const logoUri = await paramOpcional('CERT_LOGO_BASE64', null);
    const firmas = await paramOpcional('CERT_FIRMAS_EMPLEADORES', {});
    const cfgFirma = claveEmpleador && firmas && typeof firmas === 'object' ? firmas[claveEmpleador] : null;
    return {
      logoBuffer: decodificarDataUri(logoUri),
      firmaBuffer: decodificarDataUri(cfgFirma?.imagen),
      nombreFirma: cfgFirma?.nombreFirma ? String(cfgFirma.nombreFirma).trim() : null,
      cargoFirma: cfgFirma?.cargoFirma ? String(cfgFirma.cargoFirma).trim() : null,
    };
  }

  // Arma el contenido; si faltan datos del expediente, explica cuáles
  async function armarContenido(c, { conSalario, dirigidoA }) {
    const emp = c.empleador_id ? await db('empleadores').where({ id: c.empleador_id }).first() : null;
    const faltan = [];
    if (!emp) faltan.push('empleador');
    if (!c.fecha_ingreso) faltan.push('fecha de ingreso');
    if (!c.cargo) faltan.push('cargo');
    if (conSalario && !(Number(c.salario_base) > 0)) faltan.push('salario básico');
    const hoy = hoyBogota();
    // Retirado: con fecha de retiro (si es futura, aún labora). Fijo vigente: con fecha de fin no vencida.
    if (c.estado === 'RETIRADO' && !c.fecha_retiro) faltan.push('fecha de retiro');
    const retirado = c.estado === 'RETIRADO' && c.fecha_retiro && c.fecha_retiro <= hoy;
    const fijo = String(c.tipo_contrato ?? '')
      .toUpperCase()
      .includes('FIJO');
    if (fijo && !retirado && !c.fecha_fin_contrato) faltan.push('fecha de fin del contrato a término fijo');
    if (faltan.length)
      throw invalido(`No se puede emitir el certificado: al expediente le falta ${faltan.join(', ')}. Comuníquese con el área contable.`);
    if (fijo && !retirado && c.fecha_fin_contrato < hoy) {
      throw invalido(
        'No se puede emitir el certificado: el contrato a término fijo figura vencido en el expediente. Comuníquese con el área contable para actualizarlo.',
      );
    }
    const p = await parametros();
    const cfgFirma = p.firmas?.[emp.clave] ?? null;
    // El salario se imprime en pesos enteros: el número y las letras salen del MISMO valor
    const salario = conSalario ? Math.round(Number(c.salario_base)) : null;
    return {
      claveEmpleador: emp.clave ?? null,
      empleador: emp.razon_social,
      documentoEmpleador: emp.documento ?? null,
      marcaComercial: p.marcaComercial || null,
      nombre: c.nombre,
      cedula: c.cedula,
      cargo: c.cargo,
      fechaIngreso: c.fecha_ingreso,
      fechaRetiro: retirado ? c.fecha_retiro : null,
      motivoRetiro: retirado ? c.motivo_retiro || null : null,
      contrato: tipoContratoTexto(c),
      fechaFinContrato: !retirado && fijo ? c.fecha_fin_contrato : null,
      salario,
      salarioLetras: conSalario ? pesosALetras(salario) : null,
      dirigidoA: dirigidoA || 'A QUIEN INTERESE',
      fechaExpedicion: hoy,
      firmante: cfgFirma?.nombreFirma || p.firmante,
      cargoFirmante: cfgFirma?.cargoFirma || p.cargoFirmante || 'Empleador',
      ciudad: p.ciudad,
    };
  }

  async function colaboradorParaEmitir(req, colaboradorId) {
    if (colaboradorId === null) {
      const c = await db('colaboradores').where({ cedula: req.usuario.cedula }).first();
      if (!c) throw noEncontrado('Su cuenta no tiene expediente de colaborador.');
      return c;
    }
    const c = await db('colaboradores').where({ id: colaboradorId }).first();
    if (!c) throw noEncontrado('No encontramos ese colaborador.');
    return c;
  }

  // colaboradorId null = el propio (la ruta de admin ya validó el rol)
  async function emitir(req, colaboradorId, { conSalario, dirigidoA }) {
    const c = await colaboradorParaEmitir(req, colaboradorId);
    const contenido = await armarContenido(c, { conSalario, dirigidoA });
    const texto = JSON.stringify(contenido);
    let codigo;
    let id;
    for (let intento = 0; intento < 3 && !id; intento++) {
      codigo = generarCodigo();
      try {
        const [fila] = await db('certificados')
          .insert({
            colaborador_id: c.id,
            tipo: 'LABORAL',
            con_salario: conSalario,
            codigo,
            dirigido_a: contenido.dirigidoA,
            contenido: texto,
            huella: crypto.createHash('sha256').update(texto).digest('hex'),
            emitido_por: req.usuario.id,
            emitido_en: ahora(),
          })
          .returning('id');
        id = typeof fila === 'object' ? fila.id : fila;
      } catch (e) {
        if (!/unique|duplicate/i.test(e.message)) throw e; // choque de código (casi imposible): reintenta
      }
    }
    if (!id) throw new Error('No se pudo generar un código de verificación único');
    await auditar(req, {
      accion: 'EMITIR_CERTIFICADO',
      entidad: 'certificado',
      entidadId: id,
      detalle: { tipo: 'LABORAL', conSalario, aNombreDe: c.cedula !== req.usuario.cedula },
    });
    return { id, codigo, conSalario, emitidoEn: ahora() };
  }

  // Para descargar: el dueño o el admincontable
  async function cargar(req, id) {
    const f = await db('certificados as k')
      .join('colaboradores as c', 'c.id', 'k.colaborador_id')
      .where('k.id', id)
      .first('k.*', 'c.cedula');
    if (!f || !(f.cedula === req.usuario.cedula || req.usuario.rol === 'ADMIN')) {
      await auditar(req, { accion: 'ACCESO_DENEGADO', entidad: 'certificado', entidadId: id });
      throw noEncontrado('No encontramos ese certificado.');
    }
    // Anulado: el colaborador ya no lo puede descargar; el admin lo recibe marcado ANULADO
    if (f.anulado_en && req.usuario.rol !== 'ADMIN')
      throw new ErrorApp(410, 'ANULADO', 'Este certificado fue anulado y ya no se puede descargar. Genere uno nuevo.');
    // Integridad: el contenido debe coincidir con la huella guardada al emitir
    if (crypto.createHash('sha256').update(f.contenido).digest('hex') !== f.huella) {
      log.error('Huella de certificado no coincide', { certificado: f.id });
      throw new ErrorApp(
        500,
        'INTEGRIDAD',
        'No se puede entregar este certificado: su contenido no coincide con el emitido. Comuníquese con el área contable.',
      );
    }
    await auditar(req, { accion: 'DESCARGAR_CERTIFICADO', entidad: 'certificado', entidadId: id });
    return { ...f, contenido: JSON.parse(f.contenido) };
  }

  const presentar = (f) => ({
    id: f.id,
    tipo: f.tipo,
    conSalario: !!f.con_salario,
    codigo: f.codigo,
    dirigidoA: f.dirigido_a,
    emitidoEn: f.emitido_en,
    anulado: !!f.anulado_en,
    anuladoEn: f.anulado_en,
    motivoAnulacion: f.motivo_anulacion,
  });

  async function lista(req, colaboradorId) {
    let c;
    if (colaboradorId === null) c = await db('colaboradores').where({ cedula: req.usuario.cedula }).first();
    else {
      c = await db('colaboradores').where({ id: colaboradorId }).first();
      if (!c || !(c.cedula === req.usuario.cedula || req.usuario.rol === 'ADMIN')) {
        await auditar(req, {
          accion: 'ACCESO_DENEGADO',
          entidad: 'colaborador',
          entidadId: colaboradorId,
          detalle: { recurso: 'certificados' },
        });
        throw noEncontrado('No encontramos ese colaborador.');
      }
    }
    if (!c) return { certificados: [], sinExpediente: true };
    return { certificados: (await db('certificados').where({ colaborador_id: c.id }).orderBy('id', 'desc').limit(100)).map(presentar) };
  }

  async function anular(req, id, motivo) {
    const f = await db('certificados').where({ id }).first();
    if (!f) throw noEncontrado('No encontramos ese certificado.');
    if (f.anulado_en) throw conflicto('Ese certificado ya estaba anulado.');
    await db('certificados').where({ id }).update({ anulado_en: ahora(), anulado_por: req.usuario.id, motivo_anulacion: motivo });
    await auditar(req, { accion: 'ANULAR_CERTIFICADO', entidad: 'certificado', entidadId: id });
    return presentar(await db('certificados').where({ id }).first());
  }

  // Pública: solo validez, tipo y fecha (sin nombre, cédula, empresa ni salario)
  async function verificar(codigoCrudo) {
    const codigo = normalizarCodigo(codigoCrudo);
    if (!formatoCodigo.test(codigo))
      return { valido: false, motivo: 'El código no tiene el formato correcto (por ejemplo: 7KQ2-M9XD-4TRA).' };
    const f = await db('certificados').where({ codigo }).first();
    if (!f) return { valido: false, motivo: 'No encontramos un certificado con ese código.' };
    if (f.anulado_en)
      return { valido: false, anulado: true, motivo: 'Este certificado fue anulado por la empresa.', emitidoEn: fechaBogota(f.emitido_en) };
    return { valido: true, tipo: 'Certificado laboral', emitidoEn: fechaBogota(f.emitido_en) };
  }

  return { emitir, cargar, lista, anular, verificar, fechaLarga, recursosPdf };
}
