# ADR-0002: Sesiones Revocables en Base de Datos y Protección CSRF Propia

- **Estado:** Aceptado
- **Fecha:** 2026-11-21
- **Contexto:** Una plataforma de Talento Humano maneja datos sensibles (salarios, cuentas bancarias, diagnósticos médicos). Al bloquear un usuario, desactivarlo o cambiar su contraseña, todas sus sesiones deben invalidarse de inmediato. Además, `csurf` está deprecado.

## Decisión

Implementar sesiones en servidor almacenadas en la tabla `sesiones` (`id_hash = sha256(token)`) con cookie `HttpOnly`, `SameSite=Lax` y prefijo `__Host-` + `Secure` en producción, vencimiento por inactividad (15 min) y absoluto (8 h), junto con un token CSRF sincronizado en cabecera `X-CSRF-Token` y verificación estricta de `Origin`.

## Consecuencias

- **Positivas:** Revocación instantánea de sesiones por usuario, cero exposición de tokens en `localStorage` (inmune a robo de token por XSS), control preciso de inactividad sin renovar en consultas `X-Sin-Renovar: 1`, y eliminación de dependencias deprecadas.
- **Negativas / Riesgos:** Requiere una consulta ligera a la tabla `sesiones` por petición autenticada (indexada por PK `id_hash`, impacto mínimo para el volumen esperado).
