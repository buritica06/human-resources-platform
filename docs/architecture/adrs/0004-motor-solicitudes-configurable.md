# ADR-0004: Motor Genérico y Versionado de Solicitudes y Flujos

- **Estado:** Aceptado
- **Fecha:** 2026-11-22
- **Contexto:** Permisos (M3), Vacaciones (M4) y Licencias (M6) comparten reglas de aprobación por niveles, historial de eventos, notificaciones, validaciones de cruce de ausencias y adjuntos PDF.

## Decisión

Centralizar la máquina de estados en `src/modules/solicitudes/motor.js` respaldado por la tabla versionada `flujos`. Cada módulo especializado registra su tipo en `ctx.tiposSolicitud` con validadores y hooks específicos (`prepararEnvio`, `prepararAprobacion`, `revalidarAlAprobar`), y las transiciones usan bloqueo optimista (`estadoEsperado` → `409 Conflict`).

## Consecuencias

- **Positivas:** Cero duplicación de lógica de aprobación; cambiar un flujo desde el panel crea una nueva versión sin romper solicitudes en curso; garantiza separación de funciones y control de concurrencia.
- **Negativas / Riesgos:** Cambios en los contratos de hooks requieren pruebas de regresión sobre los tres módulos consumidores (cubierto por la suite de integración).
