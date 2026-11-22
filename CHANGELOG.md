# Cambios

## [0.9.0] – 2026-11-22 · Fase 10 – M8 Panel del admincontable

### Hecho
- **Panel**:
  - Muestra lo que está por aprobar, las incapacidades por revisar y la última nómina.
  - Muestra alertas: colaboradores sin saldo de vacaciones, contratos fijos por vencer, festivos del año siguiente sin cargar, correos sin confirmar, parámetros por verificar y parámetros por vencer.
  - Tiene accesos a toda la administración.
- **Parámetros con vigencia:**
  - Se ve lo que rige hoy, el historial y lo programado.
  - Los cambios se **programan** con fecha (hoy o futura): **un parámetro con fecha futura no afecta el presente** y el pasado no se reescribe.
  - Las versiones programadas se pueden borrar.
  - Hay validación por tipo y rangos, y validadores de los módulos.
- **Festivos** por año: se reemplazan con validaciones.
- **Flujos de aprobación** por tipo, en pantalla (sobre la API de M3, con versiones).
- **Anular solicitudes aprobadas** (vacaciones, permisos y licencias): con motivo y aviso al colaborador. Se devuelven los días.
- **Suspensiones (SUS):**
  - Las registra y anula el área contable.
  - Las ven el colaborador y el área contable, no el director.
  - No se cruzan con otras ausencias y restan días laborados para las vacaciones.
  - Se muestran dentro de la pestaña Licencias, porque el expediente conserva sus 7 pestañas.
- **Reporte de ausentismo** por sede y rango de fechas: totales y detalle, con días recortados al rango y descarga en **CSV** para Excel.
- **Auditoría** filtrable por actor (cédula), entidad, acción y fechas (hora de Colombia), paginada.

### Revisión independiente (corregido)
- **Parámetros:**
  - La fecha por defecto era la UTC: entre las 19:00 y las 24:00 regía antes de tiempo la versión de "mañana". Ahora es la de Colombia.
  - La validación era débil: faltaban enteros y rangos de nómina, se podía volver editables campos como salario o cuenta, y se podían poner tipos sensibles inexistentes.
  - Podían quedar huecos entre versiones.
  - No se podía corregir una versión creada hoy con inicio hoy.
  - La marca VERIFICAR nunca se quitaba.
  - No había alerta de parámetros por vencer.
  - Una carrera al programar daba 500.
- Se podía registrar una incapacidad sobre una suspensión.
- **Ausentismo:** los permisos nunca sumaban días ni horas y los decimales iban con punto en el CSV. Además, la licencia de maternidad aparecía por nombre.
- **Auditoría:** con fechas inválidas daba 500, no tenía tope de página y se auditaba cada página.
- **Suspensiones:** la anulación no era condicional y la consulta ajena no se auditaba.
- **Accesibilidad:** encabezados, etiquetas de festivos por fila y anuncio duplicado en el ausentismo.

### Pruebas
- `npm test`: **270/270**. Las nuevas son 12 del panel y 10 de regresión de la revisión. Cubren:
  - vigencia futura, borrar lo programado, pasado no editable, validaciones y auditoría;
  - festivos;
  - anular aprobadas con devolución de días;
  - suspensiones: cruces, días no laborados y alcance;
  - ausentismo por sede con CSV seguro;
  - auditoría con filtros;
  - acceso solo admin.
- `npm run lint` sin errores.
- En el navegador:
  - Panel, parámetros, festivos, flujos, ausentismo y auditoría.
  - Auditoría y parámetros a 375 px sin desbordamiento.
  - Botón "Anular aprobación" en una solicitud aprobada.

### Pendiente / riesgos
- Programar el SMMLV y el auxilio de transporte de 2027; vencen el 31/12/2026 y el panel lo alerta.
- Quitar de una lista (`LISTA_EPS`, bancos…) un valor que ya se usa hace que esos expedientes fallen al editarse; hay que revisarlo antes de quitarlo.
## [0.8.0] – 2026-11-22 · Fase 9 – M7 Certificados

### Hecho
- **Certificado laboral con o sin salario:**
  - Se genera al momento con los datos vigentes del expediente. El salario es el salario básico, sin recalcular, en número y en letras.
  - Usa la plantilla corporativa.
  - Se puede dirigir a una entidad ("A quien interese" por defecto).
  - Redacta correctamente los casos "labora" o "laboró… hasta…" (retirados) y contrato indefinido, fijo (con fecha de fin) u obra o labor.
- **Código de verificación:**
  - 12 caracteres aleatorios (60 bits, sin caracteres confusos).
  - Página pública `/verificar`, sin sesión y con límite de consultas, que **solo dice si es válido, el tipo y la fecha**: sin nombre, cédula, empresa ni salario.
  - El admincontable puede anular un certificado.
- El contenido emitido se guarda: volver a descargarlo produce el mismo texto aunque el expediente cambie. Se verifica su huella sha256.
- **Pantallas:**
  - "Certificados" en el menú: generar y volver a descargar.
  - Pestaña Documentos del expediente: el admin genera a nombre de otro (también de retirados) y anula. El director no tiene acceso.
- Números y fechas en letras (es-CO) con apócope correcta ("UN MILLÓN DE PESOS", "VEINTIÚN MIL", "CIENTO UN PESOS").

### Revisión independiente (corregido)
- Un retirado sin fecha de retiro quedaba certificado como "labora".
- Un contrato fijo sin fecha de fin o vencido se certificaba igual.
- Un salario con centavos no coincidía con su valor en letras.
- Un certificado anulado se podía seguir descargando. Ahora el colaborador recibe 410 y al admin le llega marcado "ANULADO".
- La huella del contenido no se verificaba.
- No había límite de emisión por usuario.
- `dirigidoA` aceptaba alfabetos que la fuente del PDF no puede dibujar.
- Pantallas: la descarga ya no se hace saliendo de la página; el foco queda en la lista tras emitir o anular; los errores no JSON del proxy se muestran en español.
- Se documentaron en `docs/despliegue.md` el ajuste de `TRUST_PROXY`, la retención y la firma.

### Pruebas
- `npm test`: **248/248**. Las nuevas son:
  - 3 unitarias de letras, con más de 25 casos.
  - 11 de certificados: formato del código, PDF válido, salario en letras, copia del contenido, alcance, retirados, verificación pública sin datos personales, anulación y límite.
  - 9 de regresión de la revisión.
- `npm run lint` sin errores.
- En el navegador:
  - Emisión desde "Certificados".
  - PDF revisado visualmente (texto, firma y bloque de verificación).
  - Verificación pública a 375 px.

### Pendiente / riesgos
- El certificado no lleva QR (no se agregó una librería; se escribe la URL).
- El firmante y la ciudad no están configurados.
- Falta definir la retención de los certificados.
## [0.7.0] – 2026-11-22 · Fase 8 – M6 Licencias

### Hecho
- **Licencias sobre el mismo motor de solicitudes**, sin duplicar código. Tienen el mismo flujo (director → admincontable), estados, notificaciones, cruces de fechas y documentos. Aparecen en el Inicio ("Solicitar licencia"), en "Mis licencias" y en la pestaña Licencias del expediente.
- **Tipos parametrizables** (`LISTA_TIPOS_LICENCIA`, con vigencia, VERIFICAR):

  | Tipo | Días |
  |---|---|
  | Maternidad | 126 calendario |
  | Paternidad | 14 calendario |
  | Luto | 5 hábiles |
  | Calamidad doméstica | sin máximo |
  | No remunerada | sin máximo |

  Cada tipo define su unidad (calendario u hábiles, con festivos y `SABADO_HABIL`), si exige soporte, si el soporte es sensible y si descuenta vacaciones.
- **Cálculo en vivo** de los días en el formulario, con las mismas reglas del servidor.
- **Vacaciones (pendiente de M4, resuelto):** las licencias no remuneradas aprobadas restan días laborados para causar vacaciones. El desglose de "¿Cómo se calcula?" lo muestra.
- **Motor:** `soporteObligatorio` puede depender del tipo, y el detalle indica `documentoVisible`.

### Revisión independiente (corregido)
- Un borrador enviado tarde saltaba las validaciones. Ahora se revalida todo al enviar: días atrás, tipo, días, soporte y expediente activo.
- El parámetro se leía con la vigencia de hoy y no con la de la fecha de inicio.
- Los booleanos del parámetro no se validaban (por ejemplo, `"false"` contaba como verdadero), ni los nombres repetidos ni el código.
- El descuento en vacaciones mezclaba días calendario con DAYS360.
- Al director se le mostraba un enlace al soporte sensible de maternidad que devolvía 404. Ya no se muestra, y el motivo de los tipos sensibles le aparece reservado.
- El aviso de festivos faltantes ahora lista todos los años.

### Pruebas
- `npm test`: **225/225**. Las nuevas son:
  - 9 de licencias: luto en días hábiles, maternidad sensible, flujo, alcance, cruces y descuento en vacaciones.
  - 5 de regresión de la revisión.
- `npm run lint` sin errores.
- En el navegador:
  - Formulario de luto a 375 px: regla visible, cálculo de 5 días hábiles del 23 al 29/12/2026 sin contar Navidad ni el domingo, y soporte obligatorio.
  - Confirmación y envío.
  - Paso del director omitido (sede sin director).
  - Detalle con duración y remuneración.

### Pendiente / riesgos
- Una licencia aprobada no se puede revertir (M8).
- Una no remunerada aprobada después de unas vacaciones ya aprobadas puede dejar el saldo negativo.
- Las suspensiones (SUS) se registrarán desde el panel del admincontable (M8).
- Una incapacidad puede caer sobre una licencia aprobada; el admin ve el aviso.
## [0.6.0] – 2026-11-22 · Fase 7 – M5 Incapacidades

### Hecho
- **Registro de incapacidades** por el colaborador. El admincontable también puede registrarlas a nombre de otro, desde el expediente. Se piden:
  - Tipo: IGE (enfermedad general) o IRL (accidente o enfermedad laboral).
  - EPS o ARL.
  - Fechas. Los días calendario se calculan solos.
  - Si es prórroga y número de certificado (opcionales).
  - Diagnóstico (opcional).
  - Certificado PDF (**obligatorio**).
- **Datos de salud (Ley 1581):**
  - Diagnóstico cifrado con AES-256-GCM.
  - PDF guardado como documento sensible.
  - El **director recibe solo nombre, sede, fechas y días** de sus sedes. Se verificó en el JSON del servidor.
  - Cada lectura del detalle (diagnóstico) y del PDF se audita.
  - Nada de esto va en correos, notificaciones, auditoría ni logs.
- **Revisión del área contable:**
  - Pasos posibles: validar, devolver con motivo o anular.
  - El colaborador puede anular la suya mientras está en revisión.
  - Se usa `estadoEsperado` (409 si la incapacidad cambió).
- **Ausencias sin cruces:**
  - Una incapacidad no se cruza con otra.
  - Permisos y vacaciones no pueden cruzarse con una incapacidad vigente (hook `ausenciasExtra` del motor). Se revalida al enviar y al aprobar.
  - Una incapacidad sí puede caer sobre unas vacaciones aprobadas (las interrumpe); el admin ve el aviso.
- **Pantallas:**
  - Mis incapacidades y Subir incapacidad.
  - Detalle.
  - Incapacidades del equipo: para el director solo fechas; para el admin, con filtro por estado.
  - Pestaña del expediente.
  - Tarjeta en Inicio con "Subir incapacidad" y, para el admin, cuántas hay por revisar.
- **Parámetros nuevos:** `INC_MAX_DIAS` (180) e `INC_REGISTRO_MAX_DIAS_ATRAS` (60), ambos con VERIFICAR.

### Revisión independiente (corregido)
- Los correos llevaban el nombre, las fechas y el motivo de la devolución, que puede describir la enfermedad. Ahora son genéricos, y el motivo no va en ninguna notificación.
- Aprobar una solicitud no revalidaba el cruce con una incapacidad registrada mientras estaba en trámite.
- El PDF se validaba después del chequeo de fechas, lo que obligaba a dos intentos.
- La lista del admin se auditaba en cada carga de Inicio. Se añadió un conteo sin datos.
- Un colaborador que enviaba `colaborador_id` no dejaba rastro. Ahora recibe 403 y queda auditado.
- Al director le llegaban también el id y el cargo.
- La prórroga se validaba fuera de la transacción y sin exigir el mismo tipo.
- El admin anulaba sin motivo, y al director no se le avisaba que la ausencia se retiraba.
- Un error al borrar un archivo huérfano ocultaba el error original.
- Accesibilidad: fieldset con `aria-describedby`; el diálogo se cierra ante un 409.

### Pruebas
- `npm test`: **211/211**. Las nuevas son:
  - 11 de incapacidades. Cubren: PDF falso renombrado, archivo de más de 5 MB, el JSON del director solo con fechas, auditoría de lecturas, cifrado en la BD y alcance por rol.
  - 6 de regresión de la revisión.
- `npm run lint` sin errores.
- En el navegador:
  - Registro con confirmación y detalle.
  - Vista del director a 375 px, solo con fechas y sin desbordamiento.
  - Validación por el admincontable con el foco en el título.
  - Tarjeta de Inicio.

### Pendiente / riesgos
- El tope de carga en memoria es de 25 MB por petición. El límite real lo pone `UPLOAD_MAX_MB`.
- Anular una incapacidad no anula sus prórrogas: el admin debe revisarlas.
## [0.5.0] – 2026-11-22 · Fase 6 – M4 Vacaciones

### Hecho
- **Cálculo igual al del archivo** (verificado en las fórmulas de LIQ VACACIONES, sin leer datos personales):
  - Días laborados: DAYS360 + 1.
  - Último día: WORKDAY.INTL(inicio − 1, días).
  - Regreso: siguiente día hábil.
  - Se excluyen domingos y festivos (tabla `festivos`), y los sábados si `SABADO_HABIL` es falso.
- **Saldo:**
  - Fórmula: saldo al corte + causado (`VAC_DIAS_HABILES_ANIO` / 360 por día laborado) − disfrutado − compensado.
  - Lo que está en trámite queda reservado.
  - En "Mis vacaciones", el Inicio y el expediente se muestra con el desglose de "¿Cómo se calcula?".
- **Saldo al corte (P8):** el admincontable lo registra desde la pestaña Vacaciones del expediente. Se guarda con historial y auditoría. Sin saldo registrado no se puede solicitar, y se explica por qué.
- **Solicitud:**
  - Se pide el primer día y los días hábiles, más una compensación en dinero opcional.
  - Un **cálculo en vivo** muestra el último día, el regreso, los festivos del periodo y el saldo antes y después.
  - Antes de enviar se pide confirmación en lenguaje claro, con los pasos de aprobación.
  - Usa el mismo motor y flujo de M3: director → admincontable.
- **Validaciones:**
  - El inicio debe ser un día hábil (si no, se sugiere el siguiente), desde hoy y hasta un año adelante.
  - Compensación ≤ `VAC_COMPENSACION_MAX_PCT` % del total.
  - No se puede superar el saldo.
  - No puede cruzarse con otras ausencias.
  - Si faltan los festivos de un año, se muestra un aviso claro.
  - Al enviar un borrador se recalcula todo, y **al aprobar** se revalida el saldo (409 si ya no alcanza).
- **Motor:**
  - Hooks `prepararEnvio` y `prepararAprobacion`, que leen los parámetros antes de la transacción, y `revalidarAlAprobar`.
  - En PostgreSQL, el colaborador queda bloqueado al enviar y al aprobar.
- **Decisión del negocio:** el admincontable aprueba sus propias solicitudes en el paso contable (autoaprobación marcada en el historial y la auditoría).

### Revisión independiente (corregido)
- Saldos con decimales como 1,15 o 4,35 se rechazaban por un error de redondeo binario.
- Un corte con fecha anterior al vigente se aceptaba sin efecto.
- Días vacíos se registraban como 0.
- Un parámetro no numérico desactivaba en silencio las validaciones. Ahora falla con un error de configuración.
- Aprobar no revalidaba el saldo.
- Se podía enviar un borrador de alguien retirado.
- El simulador no avisaba de cruces con otras ausencias.
- No quedaba auditada la consulta del saldo ajeno.
- El autorregistro del saldo del admincontable no quedaba marcado.
- El texto de la compensación era ambiguo.
- Validación en vivo: ya no marca `aria-invalid` mientras se escribe; al enviar enfoca el error o muestra un aviso.
- En "Mis vacaciones", un fallo de la tarjeta de saldo ya no oculta la lista.

### Pruebas
- `npm test`: **194/194**. Las nuevas son:
  - 7 unitarias del calendario: festivo en lunes, cambio de año, sábado hábil sí y no, bisiesto y DAYS360.
  - 17 de integración de vacaciones.
  - 10 de regresión de la revisión.
- `npm run lint` sin errores.
- En el navegador:
  - Cálculo en vivo (15 días del 23/12/2026 → 12/01/2027, regreso 13/01/2027, con Navidad, Año Nuevo y Reyes).
  - Tope de compensación.
  - Confirmación, envío y detalle con regreso y festivos.
  - Aprobación.
  - Pestaña del expediente con registro de saldo al corte.
  - Inicio y "Mis vacaciones" a 375 px sin desbordamiento.

### Pendiente / riesgos
- M6 debe restar del causado las licencias no remuneradas y las suspensiones.
- Una solicitud aprobada no se puede revertir (pendiente para M8).
- Hay que cargar los festivos de 2028 antes de 2027-12 (el sistema avisa si faltan).
- Si el inicio y el fin son fin de febrero, DAYS360 puede diferir de Excel en hasta 2 días sobre 360. Falta verificarlo en Excel.
## [0.4.1] – 2026-11-22 · M3 – Correcciones de la revisión independiente

### Corregido
- **Separación de funciones en el flujo:**
  - El admincontable ya no aprueba el paso del director.
  - Nadie aprueba dos pasos de la misma solicitud.
  - Un flujo tiene 1 o 2 pasos y no repite roles (400).
- **Paso sin director elegible:** si la sede no tiene director, o quien pide es el director, el paso se omite automáticamente. Queda en el historial como "Paso omitido automáticamente" y la solicitud pasa al área contable.
- **Concurrencia:** aprobar y rechazar exigen el estado que veía el usuario (`estadoEsperado`). Si cambió, se responde 409 y la pantalla se recarga.
- **Notificaciones que fallan** (correo caído) ya no convierten en error una aprobación que sí quedó hecha. La falla se registra en el log.
  - Cancelar ahora avisa también a los aprobadores.
- **Privacidad:**
  - Los borradores solo los ve su dueño.
  - El soporte de los permisos por cita médica (`LISTA_TIPOS_PERMISO_SENSIBLES`) es dato de salud y el director no puede descargarlo.
- **Revisión de PDF más estricta:**
  - Debe empezar con `%PDF-`.
  - Se detecta contenido activo escondido con escapes `#xx` (p. ej. `/J#61vaScript`) y más acciones (`/AA`, `/SubmitForm`, `/GoToR`…).
  - El tamaño máximo sale siempre del parámetro `UPLOAD_MAX_MB`.
- **Lectura de parámetros fuera de transacciones** (evita bloqueos con SQLite).
- **Tiempo real (SSE):** máximo 5 conexiones por usuario, cierre al vencer la sesión y errores controlados. Se registran las promesas rechazadas sin manejar.
- **Pantallas:**
  - Los pasos muestran hecho, omitido, rechazado o cancelado, con icono y texto.
  - La confirmación de "Nuevo permiso" dice por qué pasos pasará la solicitud.
  - La bandeja de aprobaciones no vuelve a pintar el filtro en cada aviso, para no perder el foco.
  - Los enlaces de notificaciones se validan por origen.

### Pruebas
- `npm test`: **159/159**. Se añadió `tests/integration/revision-m3.test.js` con 11 pruebas, una por hallazgo, y se ajustaron las de permisos a las nuevas reglas.
- `npm run lint` sin errores.
- En el navegador: la aprobación del director envía el estado esperado y el detalle muestra "hecho" y "en curso".

### Decisión del negocio (aplicada)
- **El admincontable aprueba sus propias solicitudes** en el paso contable. Queda marcado como "Autoaprobación del área contable" en el historial y en la auditoría. Lo propio no se rechaza, se cancela. El director y el colaborador siguen sin poder aprobar lo propio.
## [0.4.0] – 2026-11-22 · Fase 5 – M3 Solicitud de permisos y motor de aprobación

### Hecho
- **Motor de solicitudes genérico** (`solicitudes/motor.js`), que reutilizarán vacaciones (M4) y licencias (M6):
  - Estados: Borrador → pasos del flujo → Aprobada, Rechazada o Cancelada.
  - **Flujo como configuración:** tabla `flujos` con versiones. Por defecto, director → admincontable (S1). `PUT /flujos/:tipo` crea una versión nueva y las solicitudes en curso siguen con la suya. Probado: cambiar a un solo paso contable cambia el comportamiento sin tocar código.
  - Puede actuar en un paso quien tenga el rol (el director solo en sus sedes) o el admincontable (superusuario). Si la sede no tiene director, atiende el admincontable. **Nadie aprueba ni rechaza su propia solicitud.**
  - Rechazar exige motivo.
  - Cada transición es una actualización condicionada (409 ante carreras), queda en el historial con quién, cuándo y el comentario, y se audita.
  - Las ausencias aprobadas o en trámite **no se pueden cruzar** (se revalida al enviar).
- **Permisos** (módulo `permisos`, que registra su tipo en el motor):
  - Tipos parametrizables (`LISTA_TIPOS_PERMISO`, P13): fecha y hora de inicio y fin, motivo y soporte PDF opcional.
  - Duración máxima configurable (`PERMISO_MAX_DIAS` = 3). Se pueden registrar hasta 30 días hacia atrás.
- **Documentos PDF:**
  - Se valida el contenido real (no la extensión), con un máximo de 5 MB (`UPLOAD_MAX_MB`).
  - **Se rechazan los PDF con contenido activo** (JavaScript, Launch, archivos incrustados).
  - El archivo se guarda fuera de la carpeta pública con nombre aleatorio, mediante una capa de almacenamiento intercambiable (`src/core/storage`). Si la transacción falla, el archivo se borra.
  - Descarga con control de acceso y auditoría. El director solo ve los documentos no sensibles de su sede.
- **Notificaciones:**
  - Campana con contador en todas las páginas.
  - Correo en cada cambio de estado (en local, `.eml` y consola).
  - **Tiempo real** con Server-Sent Events: el colaborador ve cómo avanza su solicitud sin recargar, y la bandeja del aprobador se actualiza sola.
- **Pantallas:**
  - Mis permisos y Nueva solicitud, con confirmación en lenguaje claro antes de enviar.
  - Detalle con pasos, historial y acciones según el rol.
  - Bandeja de aprobaciones y Notificaciones.
  - Pestaña "Permisos" del expediente.
  - Inicio: botón grande "Solicitar permiso", solicitudes en curso y, para quienes aprueban, cuántas esperan su aprobación.
- **Núcleo:**
  - Gancho `inicializar(ctx)` para que los módulos registren tipos de solicitud.
  - Dependencias entre módulos validadas al arrancar.
  - Componente común de estado con color, icono y texto.

### Pruebas
- `npm test`: **148/148**, de las cuales 19 son nuevas de M3:
  - Validaciones y soporte PDF: falso, con JavaScript, extensión distinta o de más de 5 MB.
  - Usuario sin expediente.
  - Flujo completo (colaborador → director → admin) con notificaciones y correo.
  - Cruce de fechas.
  - Rechazo con motivo obligatorio, cancelación y borrador.
  - Alcance: el director no ve otra sede (404) ni sus documentos.
  - Bandejas por rol.
  - Flujo configurable con versiones.
  - Notificaciones solo propias.
  - Evento SSE entregado en vivo.
- En el navegador:
  - Formulario y confirmación.
  - Detalle con pasos.
  - **Actualización en vivo** al aprobar el director desde otra sesión, con la campana subiendo a 2.
  - Bandeja del admin y aprobación final.
  - Vista a 375 px sin desbordamiento.

### Pendiente / riesgos
- La pantalla para editar flujos llega con el panel del admincontable (M8); hoy se configuran por API.
- El tiempo real asume una sola instancia del servidor (ver `docs/despliegue.md`).

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
- **Retirados que no están en EMPLEADOS:** con la confirmación del admin, cédula por cédula, se crea un expediente básico (RETIRADO) para conservar su historial.
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

### Revisión independiente de M2
Veredicto inicial: "sí con correcciones". No hubo hallazgos en control de acceso, XSS, PDF ni rendimiento (21 hojas × 250 filas en menos de 0,3 s). Se corrigió todo, con 14 pruebas de regresión (`tests/unit/lector-nomina.test.js` y `nomina.test.js`):
1. **ALTO – Publicación parcial silenciosa.** Una cédula con letras ("CC 1000000002"), con decimales o fuera de rango cerraba la tabla y descartaba sin aviso esa fila y las siguientes. Ahora:
   - Una fila con nombre y valores sin cédula válida es un **error**, y la tabla sigue leyéndose.
   - Un encabezado con otra palabra en A ("IDENTIFICACIÓN") es un error.
   - Una cédula con valores fuera de una tabla reconocida es un error.
   - Los cierres de tabla se reconocen por rótulo (SUBTOTAL, TOTAL, RESUMEN…).
2. **ALTO – Carrera al reemplazar un borrador.** Ahora:
   - El cruce de periodos se revalida dentro de la transacción.
   - Solo se borra un periodo si **sigue** en BORRADOR, así que nunca uno publicado.
   - Dos cargas simultáneas ya no dan 500 (el índice único → 409).
3. **MEDIO – Expedientes básicos de retirados.** Ahora:
   - Se confirman **cédula por cédula**; cualquier otra sigue bloqueando (S6).
   - Eliminar el borrador borra los expedientes que creó, si no tienen nada más (nueva columna `colaboradores.creado_por_periodo_id`, migración 004).
4. **MEDIO – Fechas imposibles** en S1/T1 (30 de febrero, mes 13…): ahora son error.
5. **MEDIO – Devengado negativo:** ahora es error, en vez de mostrarse como positivo.
6. **MEDIO – Extras que solo traen el neto:** ya no se atribuyen a un concepto. Se muestran como "Pago adicional (la hoja solo trae el neto)", con las cantidades como dato informativo. Si además hay texto en alguna columna, es un error.
7. **MEDIO – Sede y empleador:**
   - Cada tabla toma la sede de su título; no se hereda del bloque anterior.
   - Quien solo aparece en extras no hereda el empleador: se usan los datos del expediente.
8. **BAJO:**
   - Celdas con error de Excel (#N/A) → error, en vez de cero.
   - Longitud de la cédula numérica y del documento.
   - Fila en cero → advertencia; tabla sin colaboradores → error.
   - Cédulas enmascaradas en los mensajes.
   - Foco en el título tras publicar o anular.
   - "Eliminar" protegido contra doble clic.
   - Se quitó `role="status"` del neto.

Resultado: **129/129 pruebas** y lint sin errores. El libro real sigue cargando 21/21 quincenas con 0 errores y 444 volantes; ahora todas las tablas reales tienen su sede.

### Decisiones sobre el formato real (verificadas con el libro, solo con conteos)
- Fila con nombre pero sin cédula: se avisa y no se carga. Las filas solo con números (totales sin rótulo) se ignoran.
- "RESUMEN DE DESCUENTOS" cierra la tabla de nómina.
- Liquidación de extras:
  - Si una columna de valores trae texto (una nota) y el neto cuadra sin ella, se toma como vacía y se avisa.
  - Si la fila solo trae el neto, se muestra como pago adicional sin desglose (ver revisión, punto 6).
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
