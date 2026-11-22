# Cambios

## [0.1.0] – 2026-11-21 · Fase 2 – M0 Autenticación y cuentas

### Hecho
- Núcleo modular: registro de módulos (`MODULES_ENABLED`), configuración por `.env`, Knex con migraciones (SQLite local / PostgreSQL), parámetros con vigencia, auditoría y correo (consola en desarrollo, SMTP en producción).
- Seguridad:
  - Sesiones en servidor con cookie HttpOnly/SameSite (y `__Host-`/Secure en producción).
  - CSRF con token sincronizado y verificación de `Origin`.
  - helmet con CSP estricta.
  - argon2id, límite de intentos por IP y bloqueo por cuenta (5 intentos → 15 min).
  - Cierre por inactividad (15 min), con aviso al usuario 2 minutos antes, y vencimiento absoluto (8 h).
  - Enmascarado de datos en los logs; cifrado AES-256-GCM listo para los datos sensibles.
- Cuentas:
  - El admincontable crea usuarios individualmente o en carga masiva desde la hoja EMPLEADOS del libro de nómina (vista previa → confirmación en una transacción). La contraseña temporal se muestra una sola vez y vence en 72 h.
  - Primer ingreso obligatorio: cambio de clave y verificación del correo por enlace.
  - Recuperación de contraseña por correo y página "Mi cuenta".
  - El admincontable puede activar o desactivar usuarios, cambiar su rol y las sedes de los directores, y restablecer la contraseña temporal.
- Sistema de diseño (tokens, componentes) con el estilo de las imágenes de referencia; primero móvil y accesible (foco visible, etiquetas, navegación con teclado, estados con icono y texto).
- Datos iniciales: 25 registros de parámetros con vigencia (tomados del archivo de nómina; la Ley 2466 queda escalonada) y 36 festivos 2026–2027. Organización y usuarios **ficticios** para desarrollo.
- Scripts: `setup`, `backup` (con rotación), `crear-admin` y `fixtures` (Excel ficticio).

### Cambios frente al plan
- **No se usan `express-session` ni `connect-session-knex`.** Una tabla `sesiones` propia (unas 100 líneas) permite cerrar todas las sesiones de un usuario al bloquearlo, desactivarlo o cambiar su clave, y controlar la inactividad sin depender de esas librerías.
- **No se usa `@faker-js/faker`.** Los datos ficticios son listas fijas y bastan para las pruebas.
- **`npm run dev` vigila solo `src/`.** OneDrive modificaba archivos de `node_modules` y reiniciaba el servidor en bucle.
- **Recuperación de contraseña:** el enlace se valida sin gastarlo hasta que la nueva clave cumple la política. Así un error al escribir no obliga a pedir otro enlace.

### Pruebas
- `npm test`: **54/54 pasan**: unitarias (política de claves, argon2, cifrado, parámetros por vigencia, lector de Excel, salvaguarda contra archivos de nómina en el repositorio) e integración de la API (ingreso, bloqueo, límite 429, CSRF, cabeceras, inactividad, vencimiento, primer ingreso, verificación de correo, recuperación, y permisos: colaborador y director reciben 403 y anónimo 401 en todas las rutas de administración).
- `npm run lint`: sin errores.
- Compatibilidad con el libro real `.xlsm`: lee la hoja EMPLEADOS (20 filas, 0 errores). Solo se imprimieron conteos; no se copió ningún dato.
- Prueba manual en el navegador, escritorio (1280 px) y móvil (375 px): ingreso, inicio, usuarios (crear, ver la clave temporal, tabla convertida en tarjetas), primer ingreso completo (clave → correo → enlace → inicio) y menú lateral en móvil. Sin errores de CSP en la consola.

### Pendiente / riesgos
- Proyecto dentro de OneDrive (riesgo comprobado; ver README).
- Los parámetros marcados VERIFICAR deben revisarse con un asesor laboral.
- Docker y la prueba con PostgreSQL real quedan para la fase de cierre (el código es portátil, pero hasta ahora solo se probó con SQLite).
