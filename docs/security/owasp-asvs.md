# Checklist de seguridad (OWASP ASVS 4.0, nivel 1)

Estado al cierre de la versión 1.0. "Cumple" significa que hay código y pruebas automáticas que lo respaldan; "Operación" significa que depende de cómo se despliegue.

| Área ASVS | Control | Estado | Dónde |
|---|---|---|---|
| V2 Autenticación | Contraseñas de 10 a 128 caracteres y no iguales a la cédula; hash argon2id | Cumple | `src/core/security/claves.js` |
| V2 | Bloqueo por intentos (`LOGIN_MAX_INTENTOS`, `LOGIN_BLOQUEO_MIN`) y límite por IP en el ingreso, la recuperación y el cambio de clave | Cumple | `auth/routes.js`, `auth/service.js` |
| V2 | Mensaje de ingreso genérico y tiempo constante (verificación ficticia) | Cumple | `auth/service.js` |
| V2 | Recuperación con token aleatorio de 32 bytes, guardado como hash, de un solo uso y con vencimiento | Cumple | `auth/service.js`, tabla `tokens` |
| V2 | Contraseña temporal de un solo uso y cambio obligatorio al primer ingreso | Cumple | M0 |
| V3 Sesiones | Token aleatorio guardado como hash; se regenera al ingresar | Cumple | `core/security/sesion.js` |
| V3 | Cookie `__Host-`, `Secure`, `HttpOnly` y `SameSite=Lax` en producción | Cumple | prueba `revision-m0` |
| V3 | Vencimiento por inactividad (15 min) y absoluto (8 h); al bloquear o desactivar un usuario se cierran sus sesiones | Cumple | M0 |
| V4 Acceso | Roles y alcance validados en el servidor (colaborador, director por sedes, admincontable); recurso ajeno → 404 y auditoría | Cumple | pruebas de alcance en cada módulo |
| V4 | CSRF: token sincronizador y verificación de `Origin` en todo método que cambia datos | Cumple | `sesion.js` |
| V5 Validación | Esquemas zod en las rutas; validación de negocio en los servicios; errores por campo | Cumple | `*/routes.js`, `*/index.js` |
| V5 | Salida escapada en todas las vistas (`escapar`); CSP sin scripts ni estilos en línea | Cumple | `public/js/ui.js`, `core/app.js` |
| V5 | CSV: neutraliza las celdas que empiezan por `= + - @` | Cumple | `admin/reportes.js` |
| V7 Errores y logs | Errores genéricos al usuario; logs sin cédulas completas, salarios, diagnósticos ni valores SQL (`compileSqlOnError: false`) | Cumple | `core/logger.js`, `core/db.js` |
| V7 | Auditoría de lecturas y cambios sensibles, sin secretos ni diagnósticos | Cumple | `core/audit.js` |
| V8 Datos | Diagnósticos y cuentas bancarias cifrados con AES-256-GCM; datos de salud ocultos al director | Cumple | `cripto.js`, M5 |
| V8 | Sin datos reales en el repositorio; `.gitignore` y una prueba lo impiden | Cumple | `.gitignore`, pruebas |
| V9 Comunicaciones | HTTPS obligatorio en producción (`APP_URL`) y HSTS | Cumple, más operación (proxy con TLS) | `config.js` |
| V12 Archivos | Solo PDF con firma real, sin contenido activo, con tope de tamaño, nombre aleatorio, fuera de la carpeta pública y descarga con control de acceso | Cumple | `core/documentos.js`, `core/storage` |
| V13 API | REST con JSON; límites de tamaño del cuerpo y de multipart | Cumple | `core/app.js` |
| V14 Configuración | Secretos solo en variables de entorno; producción no arranca sin clave de cifrado, SMTP, https ni PostgreSQL | Cumple | `config.js` |
| V14 | Dependencias actualizadas y sin vulnerabilidades conocidas | Operación: correr `npm audit` antes de cada despliegue | — |

## Riesgos aceptados en la versión 1.0

- **Una sola instancia:** los límites de peticiones y el tiempo real (SSE) viven en memoria.
- **Bloqueo de cuentas:** cualquiera puede bloquear temporalmente una cédula con intentos fallidos. Es el precio del bloqueo por cuenta.
- **Clave de cifrado sin rotación:** perderla es perder las cuentas bancarias y los diagnósticos. Guárdela en un gestor de secretos y respáldela aparte de la base de datos.
- **Verificación de certificados:** solo confirma validez y fecha, por privacidad. No prueba el contenido del PDF. Está pendiente que el negocio y jurídica decidan si se muestran datos enmascarados.
