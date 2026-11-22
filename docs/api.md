# API REST `/api/v1`

Todas las respuestas son JSON con `Cache-Control: no-store`. Errores:
```json
{ "error": { "codigo": "DATOS_INVALIDOS", "mensaje": "Revise los datos marcados.", "campos": { "cedula": "…" } } }
```
| Código HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS`, `TOKEN_INVALIDO`, `ARCHIVO_INVALIDO` | Validación |
| 401 | `NO_AUTENTICADO`, `CREDENCIALES`, `CLAVE_TEMPORAL_VENCIDA` | Sin sesión / ingreso fallido |
| 403 | `CSRF`, `PROHIBIDO`, `PRIMER_INGRESO` | Token, rol o primer ingreso pendiente |
| 404 | `NO_ENCONTRADO` | No existe o está fuera del alcance del usuario |
| 409 | `CONFLICTO` | Duplicado |
| 429 | `DEMASIADOS_INTENTOS` | Límite de intentos |

**Sesión:** cookie `th_sid` (`__Host-th_sid` en producción), HttpOnly, SameSite=Lax, Secure en producción. Vence a los 15 min de inactividad (`SESION_INACTIVIDAD_MIN`) o a las 8 h.
**CSRF:** todo método distinto de GET/HEAD/OPTIONS exige la cabecera `X-CSRF-Token`. El token se obtiene con `GET /auth/csrf` (o en la respuesta de `/auth/login` y `/auth/me`).
**Primer ingreso:** hasta cambiar la clave temporal y confirmar el correo, solo responden las rutas marcadas con *(primer ingreso)*; las demás devuelven 403 `PRIMER_INGRESO`.

## M0 – Autenticación (`auth`)
| Método | Ruta | Acceso | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/auth/csrf` | público | – | `{ csrf }` |
| POST | `/auth/login` | público, límite por IP | `{ cedula, clave }` | `{ csrf, primerIngreso }` + cookie |
| POST | `/auth/logout` | público | – | 204 |
| GET | `/auth/me` | sesión *(primer ingreso)* | – | `{ usuario, csrf, inactividadMin, restanteSeg, menu }` |
| POST | `/auth/cambiar-clave` | sesión *(primer ingreso)* | `{ actual, nueva, confirmacion }` | `{ ok }` (cierra las otras sesiones) |
| POST | `/auth/correo` | sesión *(primer ingreso, después de cambiar la clave)* | `{ correo }` | `{ ok, mensaje }` (envía enlace, 24 h) |
| POST | `/auth/verificar-correo` | público | `{ token }` | `{ ok }` |
| POST | `/auth/recuperar` | público, límite | `{ cedula }` | `{ ok, mensaje }` (siempre igual) |
| POST | `/auth/restablecer` | público, límite | `{ token, nueva, confirmacion }` | `{ ok }` (cierra todas las sesiones) |

Cabecera opcional `X-Sin-Renovar: 1`: la consulta no cuenta como actividad para la inactividad.

Límites por IP (ventana de 15 min): ingreso, 30 intentos **fallidos** (los exitosos no cuentan); recuperación y restablecimiento, 10 peticiones. Además, cada cuenta se bloquea 15 min tras 5 fallos (`LOGIN_MAX_INTENTOS`, `LOGIN_BLOQUEO_MIN`). `/auth/verificar-correo` se llama al pulsar el botón de la página, nunca automáticamente.

## M0 – Usuarios (`usuarios`, solo ADMIN)
| Método | Ruta | Cuerpo / consulta | Respuesta |
|---|---|---|---|
| GET | `/sedes` | – | `{ sedes: [{ id, nombre, empleador }] }` |
| GET | `/usuarios` | `?q&rol&activo&pagina` | `{ total, pagina, porPagina, usuarios }` |
| POST | `/usuarios` | `{ cedula, nombre, rol?, sedes? }` | 201 `{ usuario, claveTemporal, venceEnHoras }` |
| GET | `/usuarios/:id` | – | usuario con `sedes` (se audita la lectura) |
| PATCH | `/usuarios/:id` | `{ nombre?, rol?, activo?, sedes? }` | usuario |
| POST | `/usuarios/:id/reset-clave` | – | `{ claveTemporal, venceEnHoras }` |
| POST | `/usuarios/carga-masiva` | multipart: `archivo` (.xlsx/.xlsm, máx. 15 MB), `confirmar` (`true`/`false`) | vista previa `{ nuevos, yaExisten, omitidosRetirados, errores }` o, al confirmar, `{ creados: [{ cedula, nombre, claveTemporal }] }` |

Reglas: un admin no puede desactivarse ni cambiar su propio rol; debe quedar al menos un ADMIN activo; solo los DIRECTOR tienen sedes; desactivar o cambiar el rol cierra las sesiones del afectado. La clave temporal vence en 72 h y se muestra una sola vez.

## M1 – Expediente (`colaboradores`)
| Método | Ruta | Acceso | Notas |
|---|---|---|---|
| GET | `/me/expediente` | cualquier rol con expediente | `{ colaborador, grupos, campos (con editable y opciones), pestanas }`. Cuenta bancaria enmascarada. 404 `SIN_EXPEDIENTE` si no tiene |
| PATCH | `/me/expediente` | propio | Solo los campos de `CAMPOS_EDITABLES_COLABORADOR`; cualquier otro → 403 `CAMPO_NO_EDITABLE` y no se aplica nada |
| GET | `/me/expediente/historial` | propio | Últimos 200 cambios |
| GET | `/colaboradores` | ADMIN (todos), DIRECTOR (sus sedes) | `?q&sede&estado&pagina` |
| GET | `/colaboradores/opciones` | ADMIN, DIRECTOR | Sedes de su alcance y estados |
| GET | `/colaboradores/:id` | ADMIN; DIRECTOR solo si es de su sede (si no, **404**) | El director no recibe banco, tipo ni número de cuenta. Se audita (`VER`) |
| PATCH | `/colaboradores/:id` | ADMIN | Cualquier dato menos la cédula; reglas cruzadas (sede del empleador, retiro con fecha, fechas coherentes) |
| GET | `/colaboradores/:id/historial` | ADMIN; DIRECTOR (sin cambios de datos de pago) | |
| GET | `/colaboradores/:id/cuenta` | ADMIN | Número de cuenta completo; se audita `VER_CUENTA` |
| POST | `/colaboradores/importar` | ADMIN | multipart `archivo` + `confirmar`. Vista previa: `{ nuevos, actualizar, sinCambios, empleadoresNuevos, sedesNuevas, errores, advertencias }`; al confirmar, todo en una transacción |

Formato de los valores: fechas `AAAA-MM-DD`, dinero en número (pesos), sí/no en booleano, sede y empleador por id.

## M2 – Nómina y volantes (`nomina`)
| Método | Ruta | Acceso | Notas |
|---|---|---|---|
| POST | `/nomina/hojas` | ADMIN | multipart `archivo`. Devuelve `{ huella, hojas: [{ nombre, inicio, fin, estadoEnPlataforma }] }` |
| POST | `/nomina/cargas` | ADMIN | multipart `archivo`, `hoja`, `huella` (la de `/nomina/hojas`), `crearCedulas` (cédulas confirmadas una por una como retirados: se les crea un expediente básico RETIRADO; cualquier otra cédula sin expediente bloquea). Respuesta `{ ok, errores, advertencias, faltantes, periodoId?, totales }`. Si `ok=false` **no se guarda nada**; si `ok=true` el periodo queda en BORRADOR (reemplaza un borrador previo del mismo periodo) |
| GET | `/nomina/periodos` | ADMIN | `?anio` |
| GET | `/nomina/periodos/:id` | ADMIN | Resumen, advertencias y volantes (vista previa) |
| POST | `/nomina/periodos/:id/publicar` | ADMIN | Solo desde BORRADOR (si no, 409) |
| POST | `/nomina/periodos/:id/anular` | ADMIN | `{ motivo }` (5–300 caracteres). Solo PUBLICADO. Oculta los volantes y libera el periodo para recargarlo |
| DELETE | `/nomina/periodos/:id` | ADMIN | Solo BORRADOR |
| GET | `/nomina/colaboradores/:id/volantes` | ADMIN | Pestaña Nómina del expediente (incluye borradores) |
| GET | `/me/volantes` | sesión | `?anio`. Solo periodos PUBLICADOS. `{ anios, anio, volantes }` |
| GET | `/me/volantes/ultimo` | sesión | Tarjeta de Inicio |
| GET | `/volantes/:id` | propio publicado o ADMIN; si no, **404** | Volante detallado: devengados, deducciones, adicionales (solo conceptos ≠ 0), neto |
| GET | `/volantes/:id/pdf` | igual | `?descargar=1` para descargar. Se audita `DESCARGAR` |

Validaciones de la carga: fechas en S1/T1; encabezados de la tabla de nómina; cada cédula con expediente; periodo no duplicado ni cruzado con otro vigente; por colaborador, devengado − deducciones = neto (±1 peso); en la liquidación de extras, suma = neto.

## M3 – Solicitudes, aprobaciones y permisos (`solicitudes`, `permisos`, `notificaciones`)
| Método | Ruta | Acceso | Notas |
|---|---|---|---|
| GET | `/solicitudes/tipos` | sesión | Tipos activos (según módulos) para los botones de Inicio |
| POST | `/solicitudes` | colaborador con expediente ACTIVO | multipart: `tipo`, campos del tipo, `soporte` (PDF opcional, ≤ `UPLOAD_MAX_MB`, se valida el contenido real y se rechaza contenido activo), `enviar` (`false` = borrador). 201 con el detalle |
| GET | `/me/solicitudes` | sesión | `?tipo&estado` (`EN_CURSO` = no terminadas) |
| GET | `/solicitudes/:id` | dueño, ADMIN, DIRECTOR de la sede (los borradores solo el dueño); si no, **404** | Detalle con `pasos` (HECHO/OMITIDO/RECHAZADO/CANCELADO/ACTUAL/PENDIENTE), `eventos` (historial) y `acciones` permitidas a quien consulta |
| POST | `/solicitudes/:id/enviar` | dueño | Solo BORRADOR. Revalida que no se cruce con otra ausencia |
| POST | `/solicitudes/:id/cancelar` | dueño | `{ motivo? }`. Solo si no ha terminado |
| POST | `/solicitudes/:id/aprobar` | quien pueda actuar en el paso | `{ comentario?, estadoEsperado }`: el estado que veía; si cambió, **409** |
| POST | `/solicitudes/:id/rechazar` | igual | `{ motivo, estadoEsperado }`; motivo **obligatorio** (5–500) |
| GET | `/aprobaciones` · `/aprobaciones/resumen` | DIRECTOR, ADMIN | Bandeja: pasos que el usuario puede atender |
| GET | `/colaboradores/:id/solicitudes` | dueño, ADMIN, DIRECTOR de la sede | `?tipo` (pestañas del expediente) |
| GET/PUT | `/flujos/:tipo` | ADMIN | `PUT { pasos: [{ rol: 'DIRECTOR'|'ADMIN', etiqueta? }] }` (1–2 pasos, sin roles repetidos) crea una **nueva versión**; las solicitudes en curso siguen con la suya |
| GET | `/documentos/:id` | dueño, ADMIN; DIRECTOR de la sede solo si **no** es sensible | `?ver=1` para abrir en el navegador. Se audita |
| GET | `/solicitudes/flujo/:tipo` | sesión | Nombres de los pasos del flujo vigente (para la confirmación antes de enviar) |
| GET | `/permisos/opciones` | sesión | Tipos de permiso (`LISTA_TIPOS_PERMISO`), máximo de días, tamaño máximo |
| GET | `/notificaciones` · `/notificaciones/resumen` | sesión | Solo las propias |
| POST | `/notificaciones/leer` | sesión | `{ ids }` o `{ todas: true }` (solo las propias) |
| GET | `/eventos` | sesión | **Server-Sent Events**: `event: cambio` con `{ tipo: 'notificacion'|'solicitud', id? }` |

**Reglas del flujo (separación de funciones):** en cada paso actúa solo quien tiene ese rol (el director, solo en sus sedes); el admincontable no atiende el paso del director. Nadie aprueba dos pasos de la misma solicitud ni aprueba lo propio, **excepto el admincontable en el paso contable**, que aprueba sus propias solicitudes (decisión del negocio; queda como "Autoaprobación del área contable" en el historial y `autoaprobacion: true` en la auditoría; lo propio no se rechaza, se cancela). Si no hay un director elegible (la sede no tiene, o el solicitante es el director), ese paso se **omite** automáticamente (evento `OMITIR`) y pasa al área contable. Si no hay ningún admincontable activo, no se puede enviar (400). Cada transición es una actualización condicionada (409 si cambió mientras tanto). Las fallas de correo o notificación se registran en el log y no deshacen la acción.

**Documentos sensibles:** el soporte de los permisos de tipos en `LISTA_TIPOS_PERMISO_SENSIBLES` (por defecto, CITA MÉDICA) es dato de salud: el director no lo ve. Un PDF debe empezar con `%PDF-`; se rechaza contenido activo aunque venga escondido con escapes `#xx`.

## M4 – Vacaciones (`vacaciones`)

Crear, enviar, aprobar, rechazar y cancelar usan las rutas genéricas de solicitudes con `tipo=VACACIONES` y los campos `fecha_inicio`, `dias` (hábiles a disfrutar, entero ≥ 1), `dias_compensar` (entero ≥ 0, opcional) y `motivo` (observaciones, opcional). El servidor calcula `fecha_fin`, el regreso y el saldo; no se aceptan desde el cliente.

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/vacaciones/opciones` | sesión | `{ hoy, sabadoHabil, pctCompensacion, diasPorAnio, festivos[] }` (festivos del próximo año) |
| GET | `/me/vacaciones/saldo` | sesión | Saldo propio: `{ registrado, fechaCorte, diasAlCorte, diasLaborados, causadosDesdeCorte, disfrutados, compensados, enTramite, disponibles, paraSolicitar, calculadoAl, diasPorAnio }` |
| POST | `/vacaciones/simular` | sesión con expediente | `{ fecha_inicio, dias, dias_compensar? }` → `{ fechaInicio, fechaFin, regreso, diasCalendario, festivos[], saldoAntes, saldoDespues, maxCompensar }`. Mismas validaciones que al crear (400 con errores por campo); no guarda nada |
| GET | `/colaboradores/:id/vacaciones` | el propio, ADMIN, DIRECTOR de la sede; si no, **404** | `{ saldo, cortes[], puedeRegistrar }` (`cortes` solo para director y admin) |
| POST | `/colaboradores/:id/vacaciones/corte` | ADMIN | `{ fecha_corte, dias, observacion }`: registra el saldo al corte (historial; vale el de fecha más reciente). Auditado como `REGISTRAR_SALDO_VACACIONES` con antes y después |

**Reglas (parámetros con vigencia):**
- **Causados** = saldo al corte + (DAYS360(corte, hoy) + 1) × `VAC_DIAS_HABILES_ANIO` / 360. Es la misma fórmula de LIQ VACACIONES.
- **Disfrutados y compensados:** solicitudes APROBADAS que empiezan desde la fecha de corte.
- **En trámite:** las pendientes reservan sus días.
- **Para solicitar** = disponibles − en trámite.
- **Días hábiles:** excluyen domingos, festivos (tabla `festivos`) y sábados si `SABADO_HABIL` es falso.
  - Fin = WORKDAY.INTL(inicio − 1, días).
  - Regreso = siguiente día hábil.
  - Si faltan los festivos de algún año del rango, no se calcula (400).
- **Validaciones:**
  - El inicio debe ser un día hábil, desde hoy y hasta un año adelante. Si no es hábil, se sugiere el siguiente.
  - Compensación ≤ `VAC_COMPENSACION_MAX_PCT` % de los días de la solicitud.
  - Disfrute + compensación ≤ saldo para solicitar.
  - Sin cruce con otras ausencias.
  - Sin saldo al corte registrado no se puede solicitar.
- **Al enviar**, también un borrador viejo, se recalcula todo dentro de la transacción y se actualizan fin, regreso y saldo. En PostgreSQL, el colaborador queda bloqueado (`FOR UPDATE`) para que dos envíos simultáneos no gasten el mismo saldo.
- **Al aprobar** (cada paso), el saldo se recalcula sin contar la solicitud. Si ya no alcanza (por ejemplo, porque el área contable registró un saldo menor) o el colaborador se retiró, se responde **409** y la solicitud sigue pendiente.
- **Compensación (interpretación de CST art. 189):** lo compensado puede ser hasta `VAC_COMPENSACION_MAX_PCT` % del **total** de la solicitud (disfrute + dinero). Con 50 %, se compensan como máximo tantos días como los que se disfrutan.
- **Saldo al corte:**
  - No se acepta una fecha anterior al corte vigente. Para corregir, se usa la misma fecha o una posterior.
  - Los días se registran con hasta 2 decimales (se acepta coma).
  - Si el admincontable registra su propio saldo, la auditoría lo marca con `autoregistro: true`.
  - Consultar el saldo de otro colaborador se audita como `VER_VACACIONES`.
- Una solicitud **aprobada** no se cancela desde la plataforma (decisión pendiente: reversión por el admincontable, M8).
- **Pendiente M6:** restar de los días laborados las licencias no remuneradas y las suspensiones.
## M5 – Incapacidades (`incapacidades`)

Dato de salud (Ley 1581 de 2012). Las incapacidades no pasan por el flujo de aprobación: el colaborador las registra y el área contable las revisa.

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/incapacidades/opciones` | sesión (`?colaborador=ID` solo ADMIN) | Tipos (IGE, IRL), EPS del expediente, `maxDias`, `diasAtras`, `maxMb` y las incapacidades prorrogables |
| POST | `/incapacidades` | colaborador con expediente ACTIVO; solo ADMIN puede enviar `colaborador_id` (otro rol → 403 auditado) | multipart: `tipo`, `entidad`, `fecha_inicio`, `fecha_fin`, `numero_certificado?`, `diagnostico?` (se cifra), `prorroga_de?` y `soporte` (PDF **obligatorio**, sensible). 201 con el detalle |
| GET | `/me/incapacidades` | sesión | Las propias, completas (sin diagnóstico en la lista) |
| GET | `/incapacidades` | DIRECTOR, ADMIN | `?estado&desde&hasta`. **Director:** `{ soloFechas: true, incapacidades: [{ colaborador:{nombre,sede}, fechaInicio, fechaFin, dias }] }`, solo de sus sedes y vigentes. **Admin:** todo menos el diagnóstico. Se audita (`VER_INCAPACIDADES`) |
| GET | `/incapacidades/:id` | dueño o ADMIN; si no, **404** | Detalle con el diagnóstico descifrado. Cada lectura se audita (`VER_INCAPACIDAD`). Para el admin incluye `crucesSolicitudes` |
| POST | `/incapacidades/:id/validar` | ADMIN | `{ estadoEsperado }` (409 si cambió) |
| POST | `/incapacidades/:id/devolver` | ADMIN | `{ motivo (5–500), estadoEsperado }` |
| POST | `/incapacidades/:id/anular` | dueño (solo si está EN REVISIÓN) o ADMIN | `{ motivo }`, obligatorio cuando el admin anula una ajena. Si estaba vigente, se avisa al director (solo fechas) |
| GET | `/incapacidades/pendientes` | ADMIN | `{ pendientes }` (conteo para Inicio; no expone datos y no se audita) |
| GET | `/colaboradores/:id/incapacidades` | dueño, ADMIN, DIRECTOR de la sede (solo fechas) | Pestaña del expediente |

**Estados:**
- REGISTRADA ("En revisión") pasa a VALIDADA o a DEVUELTA (con motivo).
- Cualquiera puede pasar a ANULADA.

**Reglas:**
- Días calendario con ambos extremos incluidos.
- Máximo `INC_MAX_DIAS` por certificado.
- El colaborador registra hasta `INC_REGISTRO_MAX_DIAS_ATRAS` días después del inicio; el admin, sin límite.
- No se cruza con otra incapacidad vigente.
- Una prórroga empieza el día siguiente a la anterior.
- Permisos, vacaciones y licencias no pueden cruzarse con una incapacidad vigente (hook `ctx.ausenciasExtra` del motor). Una incapacidad sí puede caer sobre unas vacaciones aprobadas, porque las interrumpe; el admin ve el aviso.

**Privacidad:**
- El PDF es un documento sensible: solo lo descargan el dueño y el admin, y cada descarga se audita.
- Los correos, las notificaciones, la auditoría y los logs nunca llevan el diagnóstico.
- Los **correos** de incapacidades son genéricos ("Tiene una novedad sobre incapacidades…"), sin nombre, fechas ni motivo, porque llegan a buzones externos. El detalle se ve en la campana o en la plataforma.
- El motivo de una devolución o anulación solo se lee en la plataforma.
- Al aprobar una solicitud se revalida que no se cruce con una incapacidad registrada mientras estaba en trámite.
- Una prórroga debe ser del mismo tipo que la anterior.
- Al director solo se le avisan las fechas.