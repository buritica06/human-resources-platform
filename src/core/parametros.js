// Parámetros de negocio con fecha de vigencia. Nada de valores fijos en el código:
// los servicios piden el valor vigente a una fecha.
const CACHE_MS = 30_000;

export function crearParametros(db) {
  let cache = null;
  let cargadoEn = 0;

  async function todos() {
    if (!cache || Date.now() - cargadoEn > CACHE_MS) {
      cache = await db('parametros')
        .select('*')
        .orderBy([{ column: 'clave' }, { column: 'vigente_desde', order: 'desc' }]);
      cargadoEn = Date.now();
    }
    return cache;
  }

  function convertir(fila) {
    const v = JSON.parse(fila.valor);
    return v;
  }

  return {
    invalidar() {
      cache = null;
    },
    // Valor vigente en la fecha (AAAA-MM-DD). Lanza error si no existe: un parámetro
    // faltante es un error de configuración, no se inventa un valor por defecto.
    // Por defecto, la fecha de HOY en Colombia (UTC−5): entre las 19:00 y las 24:00 la fecha UTC ya es
    // mañana y una versión programada regiría antes de tiempo.
    async valor(clave, fecha = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)) {
      const filas = (await todos()).filter(
        (p) => p.clave === clave && p.vigente_desde <= fecha && (!p.vigente_hasta || p.vigente_hasta >= fecha),
      );
      if (!filas.length) throw new Error(`Parámetro no configurado: ${clave} (${fecha})`);
      return convertir(filas[0]);
    },
    async listar() {
      return (await todos()).map((p) => ({ ...p, valor: convertir(p) }));
    },
  };
}
