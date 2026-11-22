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
