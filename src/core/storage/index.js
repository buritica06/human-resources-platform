// Capa de almacenamiento de archivos subidos. Hoy: disco local FUERA de la carpeta pública,
// con nombre aleatorio. Para pasar a la nube basta con otro adaptador con la misma interfaz
// ({ guardar(buffer, ext) → clave, leer(clave) → Buffer, eliminar(clave) }) y STORAGE_DRIVER.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function adaptadorLocal(dir) {
  const ruta = (clave) => {
    // La clave la genera el servidor; aun así se valida para que nunca salga de la carpeta.
    if (!/^[0-9a-f]{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(clave)) throw new Error('Clave de archivo no válida');
    return path.join(dir, clave);
  };
  return {
    async guardar(buffer, ext) {
      const id = crypto.randomUUID();
      const clave = `${id.slice(0, 2)}/${id}.${ext}`;
      await fs.mkdir(path.join(dir, id.slice(0, 2)), { recursive: true });
      await fs.writeFile(ruta(clave), buffer, { flag: 'wx', mode: 0o600 });
      return clave;
    },
    leer: (clave) => fs.readFile(ruta(clave)),
    async eliminar(clave) {
      await fs.rm(ruta(clave), { force: true });
    },
  };
}

export function crearAlmacenamiento(cfg) {
  if (cfg.almacenamiento.driver === 'local') return adaptadorLocal(cfg.almacenamiento.dir);
  throw new Error(`STORAGE_DRIVER no soportado: ${cfg.almacenamiento.driver}`);
}
