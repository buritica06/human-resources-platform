# Cambios

## [0.2.0] – 2026-11-22 · Fase 3 – M1 Expediente del colaborador

### Hecho
- **Expediente** con los datos del archivo de nómina (hoja EMPLEADOS: 26 columnas) más los datos personales y de contacto que no estaban (fecha de nacimiento, sexo, estado civil, ciudades, dirección, barrio, contacto de emergencia).
- **Catálogo único de campos** (`campos.js`): etiqueta, grupo, tipo, lista de valores y visibilidad para el director. De ahí salen la validación, los permisos y la interfaz.
- **Páginas:**
  - "Mi expediente" (`/expediente`).
  - "Colaboradores" (`/colaboradores`, para admincontable y director).
  - Detalle (`/colaboradores/ver?id=`) con las pestañas Datos | Nómina | Permisos | Vacaciones | Incapacidades | Licencias | Documentos. Las de módulos aún no activos muestran "próximamente"; cada módulo podrá aportar su pestaña (`pestanasExpediente`).
- **Permisos validados en el servidor:**
  - El colaborador solo edita los datos de `CAMPOS_EDITABLES_COLABORADOR` (parámetro); si envía otro, recibe 403 y no se aplica nada.
  - El director ve solo sus sedes, sin datos de pago y en solo lectura; fuera de su alcance recibe 404, que además se audita.
  - El admincontable edita todo menos la cédula.
- **Historial de cambios por dato** (quién, cuándo, antes, después y origen: colaborador, área contable o archivo de nómina), con valores legibles.
- **Número de cuenta** cifrado (AES-256-GCM), enmascarado en pantalla y en el historial. El admin lo puede ver al pedirlo, y esa consulta queda auditada.
- **Importación desde el libro de nómina:**
  - Lee la hoja PARAMETROS (empleadores y sedes) y la hoja EMPLEADOS (columnas ubicadas por su encabezado).
  - Muestra una vista previa con nuevos, cambios, errores por fila y advertencias, y confirma todo en una sola transacción.
  - El Excel no pisa los datos que mantiene el propio colaborador, salvo que estén vacíos.
- Listas de valores del archivo base (contratos, EPS, AFP, bancos, ARL, motivos de retiro, días y esquemas) cargadas como parámetros.
- El lector de Excel pasó al núcleo (`src/core/excel.js`) y lo comparten los módulos.

### Cambios frente al plan
- **El colaborador se enlaza con su usuario por la cédula, sin FK.** Así los módulos "usuarios" y "colaboradores" siguen siendo independientes.
- **La pestaña Documentos queda en "próximamente".** La carga de PDF (almacenamiento y validación de tipo real) llega con M3 y M5, como estaba en el plan.
- **El servidor carga los parámetros nuevos al arrancar** (`sembrarBase`, idempotente y sin datos de personas).
- **En desarrollo, sin `DATA_ENCRYPTION_KEY`, se usa una clave fija solo para datos ficticios.** En producción la clave sigue siendo obligatoria y se rechaza la de desarrollo.

### Pruebas
- `npm test`: **85/85**, de las cuales 20 son nuevas de M1:
  - Edición propia y rechazo de campos no editables sin aplicar nada parcial.
  - Campos editables configurables por parámetro.
  - Alcance del director: 404 fuera de su sede y sin datos de pago en la respuesta ni en el historial.
  - Reglas cruzadas, cifrado y auditoría de la cuenta.
  - Importación: vista previa, errores, alta, reimportación sin cambios, y que el Excel no pise el celular actualizado por el colaborador.
- Libro real: la importación de prueba en una base temporal creó 20 expedientes completos, con 0 errores y 1 advertencia (un tipo de contrato fuera de la lista, que se conserva). Solo se imprimieron conteos.
- Prueba en el navegador a 1280 y 375 px, sin desbordamiento horizontal:
  - Colaborador: editar con error por campo, confirmar, guardar y ver el historial.
  - Director: lista de su sede y detalle sin datos de pago ni edición.
  - Admin: los 36 campos editables, sedes filtradas por empleador y ver la cuenta.

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
- `npm test` (antes de la revisión): **54/54 pasan**: unitarias (política de claves, argon2, cifrado, parámetros por vigencia, lector de Excel, salvaguarda contra archivos de nómina en el repositorio) e integración de la API (ingreso, bloqueo, límite 429, CSRF, cabeceras, inactividad, vencimiento, primer ingreso, verificación de correo, recuperación, y permisos: colaborador y director reciben 403 y anónimo 401 en todas las rutas de administración).
- `npm run lint`: sin errores.
- Compatibilidad con el libro real `.xlsm`: lee la hoja EMPLEADOS (20 filas, 0 errores). Solo se imprimieron conteos; no se copió ningún dato.
- Prueba manual en el navegador, escritorio (1280 px) y móvil (375 px): ingreso, inicio, usuarios (crear, ver la clave temporal, tabla convertida en tarjetas), primer ingreso completo (clave → correo → enlace → inicio) y menú lateral en móvil. Sin errores de CSP en la consola.

### Revisión independiente (agente distinto del implementador)
Veredicto inicial: "sí con correcciones" (2 altos, 5 medios, 8 bajos). Todos corregidos, con pruebas de regresión en `tests/integration/revision-m0.test.js`:
1. **ALTO.** El límite por IP ahora solo cuenta ingresos **fallidos** (30 por IP cada 15 min), así una sede detrás de un NAT no se bloquea a sí misma. La recuperación sigue contando todas las peticiones (10).
2. **ALTO.** El contador de intentos fallidos usa un incremento atómico en la BD. Probado con 10 intentos simultáneos.
3. **MEDIO.** La recuperación envía el correo en segundo plano: ni el tiempo de respuesta ni un fallo de SMTP revelan si la cédula existe.
4. **MEDIO.** La app no arranca si `APP_URL` es https sin `NODE_ENV=production`, y los usuarios demo solo se crean con `APP_URL` local. Probado: cookie `__Host-`, Secure y HSTS en producción.
5. **MEDIO.** La carga masiva valida el nombre igual que el alta manual (máx. 150 caracteres, sin fórmulas), y el CSV de claves neutraliza `= + - @`.
6. **MEDIO.** La inactividad consulta al servidor (`restanteSeg`, sin renovar) antes de avisar o cerrar: una pestaña quieta ya no cierra la sesión de otra que sí se está usando.
7. **MEDIO.** El menú lateral cerrado en móvil queda fuera del orden de tabulación (`visibility: hidden`).
8. **BAJO.** Las cookies se borran con los mismos atributos con que se crearon (necesario para `__Host-`).
9. **BAJO.** Al volver a ingresar en el mismo navegador se elimina la sesión anterior.
10. **BAJO.**
    - El restablecimiento hecho por el admin anula los enlaces de recuperación pendientes.
    - La recuperación rechaza la contraseña anterior y las cuentas inactivas.
11. **BAJO.** Las cédulas guardadas como texto con ".0" se leen bien.
12. **BAJO.** La búsqueda funciona con ñ y tildes.
13. **BAJO.** El error de "sedes" ahora se muestra.
14. **BAJO.** El foco pasa al título en el asistente de bienvenida.
15. **BAJO.** La confirmación del correo exige pulsar un botón, para que los escáneres de enlaces no gasten el token.

Resultado final: **65/65 pruebas**, lint sin errores, libro real compatible (20 filas, 0 errores) y verificación manual en el navegador (menú móvil y confirmación de correo).

### Pendiente / riesgos
- **Criterio "Lighthouse Accesibilidad ≥ 95 en login" sin medir**: no hay Lighthouse en este entorno. Lo que sí se verificó a mano: etiquetas, foco visible, navegación con teclado y contraste de los tokens. Para medirlo: Chrome → DevTools → Lighthouse → Accesibilidad sobre `http://localhost:3000/login`.
- Proyecto dentro de OneDrive (riesgo comprobado; ver README).
- Los parámetros marcados VERIFICAR deben revisarse con un asesor laboral.
- Docker y la prueba con PostgreSQL real quedan para la fase de cierre (el código es portátil, pero hasta ahora solo se probó con SQLite).
