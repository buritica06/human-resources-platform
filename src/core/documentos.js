// Documentos PDF de los colaboradores (soportes de permisos, incapacidades…).
// Solo PDF, validando el contenido real (no la extensión), con tamaño máximo parametrizable.
import { ahora } from './db.js';
import { invalido } from './errors.js';
import crypto from 'node:crypto';

const FIRMA_PDF = Buffer.from('%PDF-');

// Devuelve el mensaje de error en lenguaje claro, o null si el PDF es aceptable.
export function revisarPdf(buffer, maxMb) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'El archivo está vacío.';
  if (buffer.length > maxMb * 1024 * 1024) return `El archivo supera ${maxMb} MB. Reduzca su tamaño (por ejemplo, escaneando en blanco y negro).`;
  // El encabezado %PDF- debe estar al inicio (se toleran hasta 1 KB de basura antes, como permite la norma)
  const inicio = buffer.subarray(0, 1024).indexOf(FIRMA_PDF);
  if (inicio < 0) return 'El archivo no es un PDF válido. Adjunte un PDF (no una foto ni un documento de Word renombrado).';
  if (buffer.subarray(Math.max(0, buffer.length - 2048)).indexOf('%%EOF') < 0) return 'El PDF está incompleto o dañado. Vuelva a generarlo.';
  // Contenido activo: un soporte no debe ejecutar nada al abrirse
  const texto = buffer.toString('latin1');
  if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(texto)) return 'El PDF contiene contenido activo (scripts o archivos incrustados) y no se puede aceptar por seguridad.';
  return null;
}

export function crearDocumentos(ctx) {
  const { db, almacenamiento, params } = ctx;
  return {
    // Valida y guarda; devuelve { id, clave }. Se usa dentro de la transacción del llamador, que debe
    // llamar a descartar(clave) si su transacción falla después (para no dejar archivos huérfanos).
    async guardar(trx, req, { buffer, nombreOriginal, colaboradorId, categoria, sensible = false }) {
      const max = Number(await params.valor('UPLOAD_MAX_MB'));
      const error = revisarPdf(buffer, max);
      if (error) throw invalido(error, { soporte: error });
      const clave = await almacenamiento.guardar(buffer, 'pdf');
      try {
        const [fila] = await trx('documentos').insert({
          colaborador_id: colaboradorId, categoria, storage_key: clave,
          nombre_original: String(nombreOriginal ?? 'documento.pdf').replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 200),
          mime: 'application/pdf', tamano: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          sensible, subido_por: req.usuario.id, creado_en: ahora(),
        }).returning('id');
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
