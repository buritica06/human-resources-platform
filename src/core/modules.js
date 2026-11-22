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
import colaboradores from '../modules/colaboradores/index.js';
import nomina from '../modules/nomina/index.js';
import notificaciones from '../modules/notificaciones/index.js';
import solicitudes from '../modules/solicitudes/index.js';
import permisos from '../modules/permisos/index.js';
import vacaciones from '../modules/vacaciones/index.js';

export const DISPONIBLES = [auth, usuarios, colaboradores, nomina, notificaciones, solicitudes, permisos, vacaciones];

// Dependencias entre módulos: si falta una, la app no arranca (mensaje claro)
const REQUIERE = {
  solicitudes: ['colaboradores', 'notificaciones'],
  permisos: ['solicitudes'],
  vacaciones: ['solicitudes'],
  nomina: ['colaboradores'],
};

// Tarjetas que cada módulo aporta a la página de Inicio
export function widgetsPara(modulos, rol) {
  return modulos
    .flatMap((m) => m.widgetsInicio ?? [])
    .filter((w) => !w.roles || w.roles.includes(rol))
    .sort((a, b) => (a.orden ?? 50) - (b.orden ?? 50))
    .map(({ script }) => script);
}

export function modulosActivos(cfg) {
  const activos = DISPONIBLES.filter((m) => cfg.modulos.includes(m.nombre));
  if (!activos.some((m) => m.nombre === 'auth')) {
    throw new Error('El módulo "auth" es obligatorio.');
  }
  for (const m of activos) {
    for (const dep of REQUIERE[m.nombre] ?? []) {
      if (!cfg.modulos.includes(dep)) throw new Error(`El módulo "${m.nombre}" necesita el módulo "${dep}" en MODULES_ENABLED.`);
    }
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
