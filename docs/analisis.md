# Fase 0 – Análisis

Plataforma de Talento Humano · Masinero Compraventas
Fecha: 21/11/2026 · Estado: **para revisión**

> Este documento describe la **estructura** de los insumos. No contiene nombres, cédulas, cuentas ni salarios individuales reales. Los empleadores se citan como *Empleador A/B/C*.

---

## 1. Insumos recibidos

| Insumo | Ubicación | Estado |
|---|---|---|
| Imágenes de referencia (7 capturas) | `../Imagenes de referencia/` | Recibido |
| Archivo base de nómina | `../SISTEMA_NOMINA_MASINERO_2026 (2).xlsm` | Recibido (48 hojas, 9 módulos VBA) |

Ambos insumos están completos, así que se puede avanzar al plan.

---

## 2. Inventario de las imágenes de referencia

Las capturas son de un portal de autoservicio comercial de nómina (Kactus HCM / "TP Payroll"). **Se toman como referencia de módulos y estilo; no se copian logotipos, marcas ni textos de terceros.**

| # | Pantalla | Elementos observados | Módulo propio |
|---|---|---|---|
| 1 | Inicio de sesión | Usuario = cédula sin puntos ni espacios; contraseña con botón para ver/ocultar; captcha de imagen; botón "Ingresar"; panel lateral con carrusel de instrucciones ("¿Cómo acceder?") | M0 |
| 2 | Inicio (dashboard) | Saludo "Hola, NOMBRE" + fecha de hoy; barra superior con selector de rol ("EMPLEADO ▾"), Configuración, Notificaciones, Salir; tarjetas "Actividades a realizar", "Últimas noticias" (con "me gusta" y adjunto) y "¿Qué deseas hacer hoy?" con la píldora "Vacaciones disponibles: N días" y accesos a Vacaciones, Desprendible de pago, Certificado laboral, Certificado de ingresos y retenciones | M1, M2, M4, M7 |
| 3 | Menú lateral → Mis Solicitudes | Mis Licencias · Mis Cesantías · Mis Vacaciones · Cambio de cuenta | M3, M4, M6 |
| 4 | Mis Reportes | Buscador "¿Qué reporte desea generar?"; categorías: Desprendibles (comprobante de nómina), Certificados (ingresos y retenciones, laborales), Vacaciones (liquidación, pendientes, histórico), Cesantías, Aportes, Otros reportes | M2, M7 |
| 5 | Menú lateral → Mi Puesto de Trabajo | Información de Cuentas · Mis Reportes · Seguridad Social | M1 |
| 6 | Mis Datos Básicos | Fecha de nacimiento, nacionalidad, estado civil, sexo, ciudad de nacimiento, ciudad de residencia, dirección, barrio (país, departamento, municipio) | M1 |
| 7 | Cambiar clave | Contraseña actual, nueva y confirmación, cada una con ver/ocultar; botón "Aceptar" | M0 |

**Estructura de navegación de la referencia:** menú lateral izquierdo plegable (tarjeta con el nombre y el cargo del usuario, accesos Inicio y Reportes, buscador de opciones y acordeones) y contenido en tarjetas a la derecha.

**Estilo visual observado:**
- Color primario: morado intenso (≈ `#6E0A8C`), acentos lila (≈ `#9B59D0`) y botón primario relleno morado con texto blanco.
- Fondo: gris azulado muy claro (≈ `#E4E8EF`) con tarjetas blancas de esquinas muy redondeadas (≈ 16–24 px) y sin sombra marcada.
- Tipografía: sans-serif geométrica y redondeada (tipo Mulish/Muli). Títulos en negrita; las etiquetas de los formularios van en morado encima del campo.
- Iconos de trazo relleno morado (sombrilla = vacaciones, recibo = desprendible, documento = certificado).
- Campos con borde oscuro de 1 px, radio de 6 px e icono a la izquierda dentro de un bloque.

**Lo que aparece en las imágenes y NO pide el alcance (se trata en las preguntas abiertas):** noticias, cesantías como solicitud, cambio de cuenta bancaria, certificado de ingresos y retenciones, aportes, captcha y selector de rol.

---

## 3. Inventario del archivo de nómina

### 3.1 Hojas

| Grupo | Hojas | Función |
|---|---|---|
| Navegación | MENU, INSTRUCCIONES | Botones de las macros y el procedimiento escrito |
| Parámetros | PARAMETROS | Tarifas, jornada, festivos, empleadores, sedes, quincenas y listas |
| Maestros | EMPLEADOS, FORM EMPLEADO | Matriz de 20 trabajadores activos (máx. 396 filas) y su formulario |
| Novedades | NOVEDADES, FORM NOVEDAD | Vacaciones, incapacidades, licencias, suspensiones, jornadas extra y préstamos |
| Préstamos | PRESTAMOS | Préstamos y anticipos; el saldo se actualiza al cerrar la quincena |
| Horas | HORAS RESUMEN + 12 hojas "HORAS <EMPLEADO>" | Marcaciones diarias, bloques semanales y resumen por quincena |
| Liquidadores | LIQ VACACIONES, LIQ CONTRATO, LIQ PRIMAS, LIQ CESANTIAS, LIQ INT CESANTIAS, COMPROBANTE | Liquidaciones y comprobante para imprimir |
| Nóminas | 21 hojas "NOMINA <MES> <d-d>" (ENE 1-15 … NOV 1-15 de 2026) | Nóminas quincenales guardadas como **valores** |

### 3.2 Organización
- **3 empleadores** (personas naturales, con C.C.), cada uno con razón social para las liquidaciones.
- **9 sedes** (compraventas en municipios del Atlántico). Cada sede pertenece a un empleador y la nómina se agrupa *empleador → sede*.
- No existen los conceptos "área" ni "rango o nivel salarial" (ver P1 y P2).

### 3.3 Matriz EMPLEADOS (columnas A–AA)
Cédula · Nombre (APELLIDOS NOMBRES) · Empleador · Sede · Cargo · Tipo de contrato · Fecha de ingreso · Fecha fin de contrato · Salario base · Aux. transporte (SI/NO) · EPS · AFP · Cesantías · Caja · Riesgo ARL · Banco · Tipo de cuenta · N.° de cuenta · Estado (ACTIVO/RETIRADO) · Fecha de retiro · Motivo de retiro · Celular · *Lista (calculada)* · Día de descanso pactado · Esquema de horas (SEMANA COMPLETA / PRORRATEO) · Lactancia (SI/NO) · Fin de lactancia.

**Faltan frente a M1:** fecha de nacimiento, estado civil, sexo, nacionalidad, ciudades, dirección y correo. El colaborador o el admincontable los completarán en la plataforma.

**Listas de valores** (PARAMETROS): tipos de contrato (5), EPS (9), AFP (5), bancos (8), tipo de cuenta (AHORRO/CORRIENTE), riesgo ARL (I–V), motivos de retiro (7), días de la semana y esquemas.

### 3.4 Hoja de nómina quincenal: el formato que se cargará

Nombre de la hoja: `NOMINA <MES3> <d-d>` (p. ej. `NOMINA NOV 1-15`). Las fechas de inicio y fin están en las celdas ocultas **S1 y T1**, que son la fuente fiable del año.

Esquema por bloques (repetido por empleador y sede):
```
[Encabezado empleador]   G: "LIQUIDACION NOMINA" / "<EMPLEADOR> C.C ..." / "DEL x AL y DE MES AAAA"
[Título de sede]         A: "COMPRAVENTA ..." | "MASINERO ..."
[Encabezado 2 filas]     columnas A–Q (abajo)
[Filas de empleado]      A = cédula numérica, B = nombre
SUBTOTAL / TOTAL
RESUMEN DE DESCUENTOS    (préstamo, saldo anterior, descuento, saldo a la fecha, ID préstamo)
LIQUIDACION DE EXTRAS    (opcional: jornadas extra pagadas aparte, "filas doradas")
NOM Y PREST / EXT Y REC / NETO
```

| Col | Encabezado | Tipo | Signo |
|---|---|---|---|
| A | CEDULA | identificador | – |
| B | EMPLEADO | texto | – |
| C | DIAS LAB | días del periodo − días de novedad | – |
| D | SALARIO BASE | mensual | – |
| E | SALARIO | devengado = D/30 × C | + |
| F | RECARGO NOCTURNO | devengado | + |
| G | AUXILIO DE TRANSP. | devengado = aux/30 × C | + |
| H | HORAS EXTRAS, DOM-FES | devengado **agregado** (extras + dominicales + festivos) | + |
| I | INCAPACIDAD (/ LICENCIA) | devengado | + |
| J | SALUD | deducción | − (negativo) |
| K | PENSION | deducción | − (negativo) |
| L | PRESTAMO | deducción | − (negativo) |
| M | NETO NOMINA | = SUM(E:L) | – |
| N, O | SALUD, PENSION | nombre de la EPS y la AFP (texto) | – |
| P | FIRMAS | vacío | – |
| Q | OBSERVACIONES | texto (vacaciones, incapacidad, ingreso, retiro…) solo en las hojas generadas por la macro | – |

**Validación comprobada:** `E+F+G+H+I+J+K+L = M`, con las deducciones ya en negativo (el aux. de transporte da medios pesos, ver S4). La tabla "LIQUIDACION DE EXTRAS" (cédula, salario, recargos, horas extras, jornadas extra, total jornadas, neto) es un **pago aparte** que no suma en M.

Variaciones entre hojas: las importadas del libro anterior usan el encabezado "INCAPACIDAD" y no tienen la columna Q; las generadas por la macro dicen "INCAPACIDAD / LICENCIA" y sí tienen Q. El lector ubicará las columnas **por posición, validando el texto del encabezado**, igual que la macro `ParseNomina` del comparativo.

### 3.5 Conceptos
- **Devengados:** salario, recargo nocturno, auxilio de transporte, horas extras y dominicales/festivos (agregado), incapacidad/licencia remunerada y, aparte, jornadas extra.
- **Deducidos:** salud 4 %, pensión 4 % y préstamos/anticipos.
- **Informativos:** días laborados, salario base, EPS, AFP y observaciones.
- **Detalle de horas** (solo en las hojas HORAS, por quincena): horas trabajadas, R.N., DOM/FEST, H.E.D., H.E.N., H.E.D. DOM/FEST, H.E.N. DOM/FEST, lactancia, valor R.N., valor extras + dom y total.

### 3.6 Periodicidad
Quincenal: 1–15 y 16–fin de mes, con mes comercial de 30 días (16–31 = 15 días; feb 16–28 = 15 días). PARAMETROS define 48 quincenas (ene-2026 a dic-2027) con los estados IMPORTADA / ABIERTA / CERRADA.

### 3.7 Reglas de liquidación encontradas (solo como referencia: **la app no recalcula**)

| Regla | Valor en el archivo |
|---|---|
| SMMLV 2026 | 1.750.905 |
| Auxilio de transporte 2026 | 249.095 (solo si salario ≤ 2 SMMLV) |
| Jornada | 42 h/semana, 7 h/día, 210 h/mes (desde 15-jul-2026) |
| Valor hora | salario / 210 |
| Franja nocturna | 19:00 a 06:00 |
| Recargo nocturno | 35 % |
| Recargo dominical/festivo | 90 % |
| H.E. diurna / nocturna | ×1,25 / ×1,75 |
| H.E. diurna / nocturna dom-fest | ×2,15 / ×2,65 |
| Extras | lo que pase de 42 h en la semana (lunes a domingo); modo SEMANAL |
| Día de descanso pactado | Las horas de ese día se pagan como dominicales (algunos descansan el martes) |
| Esquema PRORRATEO | Para la jornada nocturna, la semana se reparte por días entre quincenas |
| Salud / pensión | 4 % de (salario + recargo + extras + incapacidad), redondeado a 100 |
| Incapacidad general (IGE) | 66,67 % con mínimo 1 SMMLV/30 diario |
| Incapacidad laboral (IRL), licencia de maternidad/paternidad (LMA) y licencia remunerada (LR) | 100 % |
| Licencia no remunerada (LNR) y suspensión (SUS) | Descuentan días sin pago |
| Préstamos | Cuota quincenal hasta agotar el saldo; si la cuota supera lo devengado, se ajusta |
| Lactancia | +0,5 h H.E.D. por día trabajado hasta la fecha fin |
| Vacaciones | 15 días **hábiles**; sábado hábil = SI; se excluyen domingos y festivos; base = salario + promedio de recargo nocturno de 12 meses; salud y pensión 4 % |
| Prima / cesantías | (salario + aux. + promedio de variables) × días / 360 |
| Intereses de cesantías | cesantías × días × 12 % / 360 |
| Vacaciones en la liquidación de contrato | base × días / 720 |
| Días | DAYS360 (comercial) |
| Festivos | Lista en PARAMETROS!S6:S55 (2026–2027) |

**Tipos de novedad del archivo:** VAC, IGE, IRL, LMA, LR, LNR, SUS, JEX (jornada extra) y PRE (préstamo).

### 3.8 Contraste con la ley vigente (por confirmar con asesor laboral)
- **Ley 2466 de 2025:** jornada nocturna desde las 19:00 (desde el 25-dic-2025) y recargo dominical/festivo gradual: 80 % (jul-2025), **90 % (jul-2026)** y 100 % (jul-2027). Los valores del archivo coinciden con el tramo vigente. Por eso los parámetros llevan **fecha de vigencia** y debe preverse el cambio a 100 % el 01/07/2027.
- **Ley 2101 de 2021:** 42 h/semana desde el 15-jul-2026. Coincide.
- **CST art. 189 (mod. Ley 1429 de 2010):** se puede compensar en dinero **hasta la mitad** de las vacaciones (7 de 15 días hábiles), por acuerdo escrito. El archivo no trae una regla de compensación, así que se parametriza en 50 %.
- **CST art. 186:** 15 días hábiles consecutivos por año de servicio. Coincide.
- Estos valores los verifiqué con conocimiento propio, no contra la fuente oficial. Antes de producción debe validarlos un asesor laboral o contable.

### 3.9 Certificados y comprobantes que exige el archivo (M7)
1. Certificado laboral (con o sin salario).
2. Volante o desprendible quincenal.
3. Liquidación de vacaciones.
4. Liquidación de contrato (al retiro).
5. Comprobante de prima de servicios (semestral).
6. Comprobante de cesantías (anual).
7. Comprobante de intereses de cesantías (anual).

Del 3 al 7 la app **no calcula**: puede publicar el PDF o el valor que entregue el Excel (ver P7).

---

## 4. Datos personales y sensibles (Ley 1581 de 2012)
- El archivo contiene cédulas, nombres, salarios, cuentas bancarias, celulares, EPS y AFP de personas reales. **No se copia al repositorio, ni a las semillas, ni a los logs, ni a las pruebas.** El `.gitignore` excluirá `*.xls*` y la carpeta de cargas.
- Las semillas y las pruebas usarán datos ficticios con la misma estructura, generados con una semilla fija.
- Los diagnósticos de incapacidad y los números de cuenta bancaria se tratan como sensibles: cifrado en reposo, acceso restringido y auditoría de lectura.

---

## 5. Preguntas abiertas

| # | Pregunta | Supuesto por defecto si no hay respuesta |
|---|---|---|
| P1 | El archivo no tiene **área**. ¿Qué agrupa a los colaboradores de un director administrativo? | **Área = sede.** Cada director se asigna a una o varias sedes |
| P2 | El archivo no tiene **rango o nivel salarial**. ¿Existe una escala? | Se muestra **Cargo + Salario base**; el campo "rango" queda opcional y parametrizable, vacío por defecto |
| P3 | El archivo agrega en una sola columna "HORAS EXTRAS, DOM-FES". El volante pide cantidad y valor por concepto (HED, HEN, RN, DOM…). | El volante muestra el **valor agregado** de la hoja NOMINA. Si el libro cargado trae HORAS RESUMEN con esa quincena, se añaden las **horas por tipo** como informativas, sin calcular valores por concepto (no se recalcula) |
| P4 | ¿Qué se sube cada quincena: el libro `.xlsm` completo o solo la hoja? | Se sube el **libro completo** (.xlsm/.xlsx), se elige la hoja `NOMINA …` y la app lee también EMPLEADOS para validar cédulas. Las macros nunca se ejecutan |
| P5 | La "LIQUIDACION DE EXTRAS" (jornadas extra pagadas aparte), ¿va en el volante? | Sí, como sección **"Pagos adicionales"** separada del neto de nómina |
| P6 | ¿Quiénes serán los directores administrativos y cuántos admincontables hay? | Se crean desde el panel; la semilla trae usuarios ficticios de cada rol |
| P7 | Primas, cesantías, intereses y liquidaciones: ¿se publican en la app? | Fuera del alcance inicial (M7 solo hace el certificado laboral y los volantes). Queda como extensión: cargar el PDF o el valor desde el Excel |
| P8 | Saldo de vacaciones: el archivo no guarda los días disfrutados antes de 2026. | El admincontable registra un **saldo inicial con fecha de corte** por colaborador. Desde ahí, causados = días laborados × 15/360 − disfrutados − compensados |
| P9 | Imágenes con funciones fuera de alcance: noticias, cesantías, cambio de cuenta, certificado de ingresos y retenciones, aportes y captcha | **No se construyen** en esta versión. Se registran como extensiones futuras (el certificado de ingresos y retenciones necesita retención en la fuente, que el archivo no tiene). En lugar de captcha: límite de intentos y bloqueo |
| P10 | ¿Identidad visual propia de Masinero (logo, colores)? | Se usa la paleta morada de la referencia con un logo de texto genérico, cambiable por variables CSS |
| P11 | ¿Qué campos puede editar el colaborador? | Correo, celular, dirección, barrio, ciudad de residencia, estado civil y contacto de emergencia. Todo lo demás lo edita el admincontable. La lista es parametrizable |
| P12 | Hosting de destino | Genérico: Node 20+ y PostgreSQL 15+ (Docker opcional) |
| P13 | ¿Los permisos se miden en horas o en días? ¿Tienen tipos fijos? | Tipos parametrizables: cita médica, diligencia personal, estudio y otro, con fecha y hora de inicio y fin |
| P14 | Carpeta del proyecto: está dentro de OneDrive, que sincroniza `node_modules` y la BD SQLite y puede corromperla | Se crea en `plataforma-th/` dentro de esta carpeta. **Recomiendo** moverla fuera de OneDrive o excluirla de la sincronización |

## 6. Supuestos adoptados (del enunciado)
- S1. Aprobaciones **secuenciales**: director → admincontable. Cualquiera de los dos puede rechazar, con motivo obligatorio.
- S2. "Rango" = nivel salarial del archivo. Como no existe, aplica P2.
- S3. Interfaz solo en español (Colombia), montos en COP (`$ 1.234.567`) y fechas DD/MM/AAAA.
- S4. Tolerancia de ±1 peso en la validación devengado − deducciones = neto, por los medios pesos del auxilio de transporte.
- S5. Un periodo se identifica por (fecha inicio, fecha fin), tomadas de S1 y T1. Si ya existe un periodo **publicado** con esas fechas, la carga se rechaza; si está en borrador, se puede reemplazar.
- S6. Una cédula de la hoja que no exista como colaborador en la plataforma es un **error** y bloquea la publicación.
- S7. La sesión expira tras 15 min de inactividad; la cuenta se bloquea 15 min tras 5 intentos fallidos (parametrizable).
- S8. Correos en local: transporte a consola o archivo `.eml` (sin SMTP real).
