// Documentos PDF de los colaboradores (soportes de permisos, incapacidades…).
// Solo PDF, validando el contenido real (no la extensión), con tamaño máximo parametrizable.
import { ahora } from './db.js';
import { invalido } from './errors.js';
import crypto from 'node:crypto';

const FIRMA_PDF = Buffer.from('%PDF-');

// Devuelve el mensaje de error en lenguaje claro, o null si el PDF es aceptable.
export function revisarPdf(buffer, maxMb) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'El archivo está vacío.';
  if (buffer.length > maxMb * 1024 * 1024)
    return `El archivo supera ${maxMb} MB. Reduzca su tamaño (por ejemplo, escaneando en blanco y negro).`;
  // El encabezado %PDF- debe estar en el byte 0 (sin nada antes: evita archivos "políglotas")
  if (!buffer.subarray(0, FIRMA_PDF.length).equals(FIRMA_PDF))
    return 'El archivo no es un PDF válido. Adjunte un PDF (no una foto ni un documento de Word renombrado).';
  if (buffer.subarray(Math.max(0, buffer.length - 2048)).indexOf('%%EOF') < 0)
    return 'El PDF está incompleto o dañado. Vuelva a generarlo.';
  // Contenido activo: un soporte no debe ejecutar nada al abrirse. Los nombres PDF admiten
  // escapes "#xx" (p. ej. /J#61vaScript): se normalizan antes de buscar.
  // LÍMITE CONOCIDO: no se descomprimen los flujos de objetos (ObjStm); por eso además el
  // documento se entrega con nosniff y CSP, y solo lo abren el dueño, el admin y (si no es
  // sensible) su director.
  const texto = buffer.toString('latin1').replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (/\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE|AA)\b/.test(texto)) {
    return 'El PDF contiene contenido activo (scripts, formularios o archivos incrustados) y no se puede aceptar por seguridad. Imprímalo como PDF o escanéelo de nuevo.';
  }
  return null;
}

export function crearDocumentos(ctx) {
  const { db, almacenamiento } = ctx;
  return {
    // Valida y guarda; devuelve { id, clave }. Se usa dentro de la transacción del llamador, que debe
    // llamar a descartar(clave) si su transacción falla después (para no dejar archivos huérfanos).
    // maxMb lo lee el llamador ANTES de abrir la transacción (en SQLite hay una sola conexión:
    // consultar parámetros dentro de la transacción la bloquearía).
    async guardar(trx, req, { buffer, nombreOriginal, colaboradorId, categoria, sensible = false, maxMb }) {
      const error = revisarPdf(buffer, maxMb);
      if (error) throw invalido(error, { soporte: error });
      const clave = await almacenamiento.guardar(buffer, 'pdf');
      try {
        const [fila] = await trx('documentos')
          .insert({
            colaborador_id: colaboradorId,
            categoria,
            storage_key: clave,
            nombre_original: String(nombreOriginal ?? 'documento.pdf')
              .replace(/[^\p{L}\p{N} ._-]/gu, '_')
              .slice(0, 200),
            mime: 'application/pdf',
            tamano: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
            sensible,
            subido_por: req.usuario.id,
            creado_en: ahora(),
          })
          .returning('id');
        return { id: typeof fila === 'object' ? fila.id : fila, clave };
      } catch (e) {
        await almacenamiento.eliminar(clave); // no deja archivos huérfanos si falla la BD
        throw e;
      }
    },
    descartar: (clave) => almacenamiento.eliminar(clave),
    porId: (id) => db('documentos').where({ id }).first(),
    leer: (doc) => almacenamiento.leer(doc.storage_key),
  };
}
