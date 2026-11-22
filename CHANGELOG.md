# Cambios

## [0.3.0] – 2026-11-22 · Fase 4 – M2 Nómina y volantes de pago

### Hecho
- **Lector de la hoja "NOMINA …"** (`lector.js`, sin BD):
  - Reconoce cada tabla por su encabezado de dos filas, no por posición: nómina por sede y empleador, y liquidación de extras. Las demás tablas con cédulas (p. ej. vacaciones liquidadas) no se cargan y se avisan.
  - Toma el empleador del título "… C.C …" y la sede de "COMPRAVENTA/MASINERO …".
  - Lee las cédulas guardadas como texto con puntos o comas.
  - Toma el periodo de las celdas S1/T1.
  - Si la hoja HORAS RESUMEN es de la misma quincena, añade el desglose de horas por tipo (solo informativo).
- **La app no recalcula.** Valida:
  - fechas;
  - encabezados (con las variantes reales: "INCAPACIDAD - LCT", "INCAPACIDAD/LIC REM"…);
  - que cada cédula tenga expediente;
  - que el periodo no esté duplicado ni se cruce con otro;
  - por colaborador, que devengado − deducciones = neto (±1 peso);
  - en extras, que la suma = neto.
- **Flujo de carga:** subir el libro → elegir una o varias quincenas → validar. Si algo falla, se muestra el reporte y **no se guarda nada**; si todo está bien, el periodo queda en **BORRADOR**. Luego vista previa → **Publicar**.
- **Estados del periodo:**
  - Un borrador se elimina; un periodo publicado se **anula** con motivo, lo que oculta sus volantes y libera el periodo para recargarlo.
  - El índice único parcial impide que haya dos periodos vigentes con las mismas fechas.
- **Retirados que no están en EMPLEADOS:** con la confirmación explícita del admin, se crea un expediente básico (RETIRADO) para conservar su historial.
- **Volante detallado:** devengados, deducciones y pagos adicionales (liquidación de extras) con cantidad y valor, solo con los conceptos que tiene el colaborador, más el neto y las observaciones. Es una copia fiel de la hoja.
- **PDF del volante** generado en el servidor con PDFKit. La plantilla corporativa (`src/core/pdf.js`) la reutilizará M7.
- **Páginas:**
  - Mis volantes (por año) y detalle.
  - Nómina del admin: carga y lista de periodos.
  - Vista previa del periodo con publicar, eliminar y anular.
  - Pestaña "Nómina" del expediente.
  - Tarjeta "Último volante" en Inicio, aportada por el módulo (nuevo `widgetsInicio`).
- **Permisos:**
  - El colaborador solo ve sus volantes publicados; ver un borrador o el volante de otro da 404 y se audita.
  - El director no ve volantes (plan §4); su pestaña Nómina dice "información reservada".
  - Todo `/nomina/*` es solo para el admin.
  - Se auditan ver, descargar, cargar, publicar, anular y eliminar.

### Decisiones sobre el formato real (verificadas con el libro, solo con conteos)
- Fila con nombre pero sin cédula: se avisa y no se carga. Las filas solo con números (totales sin rótulo) se ignoran.
- "RESUMEN DE DESCUENTOS" cierra la tabla de nómina.
- Liquidación de extras:
  - Si una columna de valores trae texto (una nota) y el neto cuadra sin ella, se toma como vacía y se avisa.
  - Si el total está vacío pero hay cantidad y neto en un **único** concepto, el neto se atribuye a ese concepto y se avisa. No se calcula nada.
  - Cualquier otro descuadre es un error.

### Cambios frente al plan
- **No hay tabla `conceptos`:** el catálogo está en código (`conceptos.js`), porque los conceptos los fija el formato del archivo.
- **La carga queda directamente en BORRADOR,** en vez de un paso de "vista previa" sin guardar. Un borrador no es visible para nadie más que el admin y se reemplaza al recargar.
- **Volantes sin "valor unitario":** la hoja solo trae totales por concepto; calcularlo sería recalcular (supuesto P3).
- **Sin notificación por correo al publicar:** las notificaciones llegan con el motor de flujo de M3.

### Pruebas
- `npm test`: **115/115**, de las cuales 18 son nuevas de M2 sobre un libro de nómina **ficticio** con la estructura real (`npm run fixtures`):
  - Validación: descuadre, encabezado, fechas, cédula faltante, periodo cruzado y huella del archivo.
  - Borrador invisible para el colaborador; publicar dos veces → 409.
  - Volante con solo los conceptos que tiene y con el desglose de horas.
  - Permisos (colaborador, director y anónimo).
  - PDF válido y auditado.
  - Anular y recargar.
- Con el libro real, en una base temporal ya borrada: **21 de 21 quincenas** cargadas y publicadas, 444 volantes, 0 descuadres, 4 expedientes básicos de retirados y el PDF generado. Solo se imprimieron conteos.
- En el navegador:
  - Admin: lista de periodos, vista previa y publicar. Aquí se encontró y corrigió un error: el botón quedaba `null` después de la confirmación.
  - Colaborador: tarjeta de Inicio, Mis volantes, detalle a 375 px sin desbordamiento, PDF y pestaña Nómina.
- Se corrigió además un ciclo infinito en el pie de página del PDF.

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

### Revisión independiente de M1
Veredicto inicial: "sí con correcciones". El control de acceso, el cifrado de la cuenta y el historial no tenían hallazgos. Se corrigieron los 3 altos, los 5 medios y los 8 bajos, con 12 pruebas de regresión en `tests/integration/revision-m1.test.js`:
1. **ALTO.** Un valor fuera de la lista que no cabe en su columna (p. ej. ARL "RIESGO MUY ALTO" en 5 caracteres) se omite con advertencia. Antes daba 500 en PostgreSQL. Cada campo de lista tiene su `max`.
2. **ALTO.** La hoja PARAMETROS se valida en la vista previa:
   - Las claves repetidas se ignoran.
   - Una clave de más de 30 caracteres, una sede de un empleador inexistente o una sede desactivada salen como error.
   - Nada de esto puede fallar ya en la confirmación.
3. **ALTO.** La clave de cifrado de desarrollo solo se usa con `NODE_ENV` en development o test **y** `APP_URL` en localhost. El servidor avisa al arrancar si la está usando o si no hay ninguna.
4. **MEDIO.** Las reglas entre campos se aplican si cambia cualquiera de sus fechas. Por ejemplo, mover la fecha de ingreso después del retiro ahora se rechaza.
5. **MEDIO.** En la reimportación, una celda vacía no borra el dato guardado (cuenta, salario, EPS…), y un retirado con ESTADO vacío sigue RETIRADO.
6. **MEDIO.** Solo se confirma el mismo archivo que se revisó: la vista previa devuelve una huella SHA-256 y la confirmación la exige. Además, cambiar de archivo en la interfaz borra la revisión anterior.
7. **MEDIO.** Se auditan también la consulta del historial (`VER_HISTORIAL`) y las búsquedas de la lista (`BUSCAR`, con sus filtros).
8. **MEDIO.** Las columnas se mapean con alias ("TIPO DE CONTRATO", "Nº CUENTA" con º ordinal…). "ESTADO" exige coincidencia exacta, así que no se confunde con "ESTADO CIVIL", y la vista previa avisa qué columnas faltan.
9. **BAJO.**
   - Las fechas de Excel con hora no saltan al día siguiente.
   - No se asigna a sedes inactivas.
   - Si la sede actual no es del empleador elegido, se pide elegirla en vez de cambiarla en silencio.
   - Sin `?id` sale un mensaje claro.
   - La cuenta revelada se anuncia al lector de pantalla.
   - Una cuenta que no se puede descifrar muestra "(no se puede leer)" en lugar de un 500.
   - Las diferencias del historial se calculan dentro de la transacción (con bloqueo en PostgreSQL).

Resultado: **97/97 pruebas** y lint sin errores. El libro real se sigue importando completo (20 expedientes, 0 errores). Verificación en el navegador de los cambios de interfaz.

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
