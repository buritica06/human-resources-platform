# Guía de Contribución

Gracias por contribuir a la **Plataforma de Talento Humano (Human Resources Platform)**. Este proyecto sigue estándares empresariales de ingeniería de software, seguridad (OWASP ASVS Nivel 1 / Ley 1581) y flujo de trabajo GitOps.

## Flujo de Ramas (GitFlow Simplificado)

- `main`: Rama de producción. Protegida; solo recibe merges desde `release/*`, `hotfix/*` o `develop` mediante Pull Request aprobado.
- `develop`: Rama de integración continua para nuevas funcionalidades.
- `feature/<nombre-corto>`: Nuevas funcionalidades a partir de `develop`.
- `bugfix/<nombre-corto>`: Correcciones sobre `develop`.
- `hotfix/<nombre-corto>`: Correcciones urgentes desde `main` (se integran de vuelta en `main` y `develop`).
- `release/<vX.Y.Z>`: Preparación de liberación y actualización de `CHANGELOG.md`.

## Estándar de Commits (Conventional Commits)

Todos los commits son validados automáticamente con **Husky + Commitlint**:

```text
<tipo>(<alcance opcional>): <descripción en imperativo>
```

Tipos permitidos:
- `feat:` nueva funcionalidad (ej. `feat(vacaciones): employee balance projection`)
- `fix:` corrección de error (ej. `fix(nomina): payroll validation bug`)
- `refactor:` cambio interno sin alterar comportamiento
- `docs:` documentación técnica o de usuario
- `test:` pruebas unitarias, integración o E2E
- `chore:` mantenimiento general
- `build:` dependencias, Docker o scripts de construcción
- `ci:` workflows de GitHub Actions

## Requisitos antes de abrir un Pull Request

1. Ejecutar `npm run lint` y `npm run format:check`.
2. Ejecutar `npm run test:coverage` y confirmar que la cobertura se mantiene **≥ 80%**.
3. Verificar que no existan secretos, archivos `.env` ni libros de Excel reales (la prueba `tests/unit/repositorio.test.js` valida esta regla).
4. Completar la plantilla de Pull Request y solicitar al menos **2 revisiones** de pares.
5. El merge a `main` y `develop` se realiza preferiblemente con **Squash and Merge**.

## Estándares de Código

- **Clean Code y SOLID:** funciones pequeñas, cohesión alta por módulo y bajo acoplamiento mediante `ctx` y hooks.
- **Seguridad por defecto:** validar entradas con `zod`, usar consultas parametrizadas con Knex, escapar salidas HTML y auditar acciones sensibles.
- **Privacidad:** nunca imprimir cédulas completas, cuentas bancarias, salarios ni diagnósticos en logs o mensajes de error.
