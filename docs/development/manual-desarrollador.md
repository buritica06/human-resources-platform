# Manual para Desarrolladores

## Estructura del Código

```text
src/
├── server.js          # Punto de entrada HTTP, migraciones y limpieza de sesiones
├── core/              # Núcleo transversal (app, config, db, security, audit, mailer, storage, pdf)
├── modules/<dominio>/ # Módulos desacoplados (routes, service, repository, validators, views)
└── public/            # Sistema de diseño CSS (tokens, base, componentes) y JS compartido
```

## Cómo Crear un Nuevo Módulo

1. Cree la carpeta `src/modules/<mi-modulo>/` con `index.js`, `routes.js`, `service.js`, `repository.js`, `validators.js` y `views/`.
2. Exporte el descriptor del módulo desde `index.js`:
   ```js
   export default {
     nombre: 'mi-modulo',
     inicializar(ctx) { /* hooks opcionales */ },
     api(router, ctx) { /* montar rutas bajo /api/v1 */ },
     paginas: { '/mi-ruta': 'vista.html' },
     menu: [{ texto: 'Mi Módulo', href: '/mi-ruta', icono: 'doc', orden: 50, roles: ['ADMIN'] }],
   };
   ```
3. Regístrelo en `src/core/modules.js` (`DISPONIBLES` y `REQUIERE` si depende de otro módulo) y agréguelo a `MODULES_ENABLED` en `.env.example` y `src/core/config.js`.
4. Cree su migración en `migrations/YYYYMMDD_NNN_<nombre>.js` compatible con SQLite y PostgreSQL.
5. Agregue pruebas unitarias (`tests/unit/`) y de integración (`tests/integration/`), incluyendo verificación de control de acceso y alcance.

## Reglas de Ingeniería y Seguridad

- **Entradas:** validar siempre con `zod` antes de invocar servicios.
- **SQL:** usar Knex parametrizado; nunca interpolar variables en `.raw()`.
- **Autorización:** aplicar `autenticado()` y `rol(...)` + validación de alcance por sede en servidor; responder `404` ante recursos ajenos.
- **Privacidad:** usar `mascara()` y `mascaraCorreo()` en logs; nunca loguear diagnósticos, salarios ni cuentas.
- **Pruebas:** mantener cobertura **≥ 80%** en líneas, ramas y funciones (`npm run test:coverage`).
- **Commits:** seguir **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `build:`, `ci:`).
