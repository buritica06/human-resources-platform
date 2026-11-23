# ADR-0001: Arquitectura de Monolito Modular con Registro Dinámico

- **Estado:** Aceptado
- **Fecha:** 2026-11-21
- **Contexto:** La plataforma cubre 9 áreas funcionales de Talento Humano (autenticación, expediente, nómina, solicitudes, permisos, vacaciones, incapacidades, licencias, certificados y administración) para una organización mediana (~20–200 colaboradores en múltiples sedes). Se requiere alta cohesión, despliegue simple y capacidad de activar/desactivar módulos sin acoplamiento destructivo.

## Decisión

Adoptar un **Monolito Modular** sobre Node.js + Express, donde cada dominio vive en `src/modules/<modulo>/` y se registra en `src/core/modules.js` bajo control de `MODULES_ENABLED`, interactuando mediante un `ctx` compartido y hooks explícitos (`inicializar`, `tiposSolicitud`, `ausenciasExtra`, `diasNoLaborados`, `widgetsInicio`, `pestanasExpediente`).

## Consecuencias

- **Positivas:** Transacciones ACID simples sobre una única base relacional, cero latencia de red entre módulos, curva de onboarding baja, validación explícita de dependencias entre módulos al arranque (`REQUIERE`) y facilidad para extraer módulos a servicios en el futuro.
- **Negativas / Riesgos:** Todos los módulos comparten el mismo proceso Node.js; un error no controlado podría afectar al conjunto (mitigado con middleware global de errores, `unhandledRejection` y pruebas exhaustivas).
