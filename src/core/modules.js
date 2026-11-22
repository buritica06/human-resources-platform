// Registro de módulos. Cada módulo exporta por defecto:
// {
//   nombre: 'auth',
//   api(router, ctx)            → monta sus rutas bajo /api/v1
//   paginas: { '/ruta': 'archivo.html' }  → páginas HTML de modules/<m>/views
//   menu: [{ texto, href, icono, roles }]  → entradas del menú lateral
// }
// Un módulo desactivado (MODULES_ENABLED) no monta rutas, páginas ni menú.
import auth from '../modules/auth/index.js';
import usuarios from '../modules/usuarios/index.js';

export const DISPONIBLES = [auth, usuarios];

export function modulosActivos(cfg) {
  const activos = DISPONIBLES.filter((m) => cfg.modulos.includes(m.nombre));
  if (!activos.some((m) => m.nombre === 'auth')) {
    throw new Error('El módulo "auth" es obligatorio.');
  }
  return activos;
}

export function menuPara(modulos, rol) {
  return modulos
    .flatMap((m) => m.menu ?? [])
    .filter((item) => !item.roles || item.roles.includes(rol))
    .sort((a, b) => (a.orden ?? 50) - (b.orden ?? 50))
    .map(({ texto, href, icono }) => ({ texto, href, icono }));
}
