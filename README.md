# Human Resources Platform — Plataforma de Talento Humano

![Version](https://img.shields.io/badge/version-1.0.0-6A1B9A)
![Node](https://img.shields.io/badge/node-%3E%3D20.12-339933)
![Architecture](https://img.shields.io/badge/architecture-Modular%20Monolith-1F5FAD)
![Security](https://img.shields.io/badge/security-OWASP%20ASVS%20L1-1B7A3D)
![Coverage](https://img.shields.io/badge/coverage-%3E%3D95%25-1B7A3D)
![License](https://img.shields.io/badge/license-Proprietary-5A6070)

Plataforma web corporativa (*mobile-first* y accesible) para la gestión integral de **Talento Humano**, autoservicio del colaborador, flujos de aprobación configurables, volantes de nómina, vacaciones, incapacidades con protección de datos de salud (Ley 1581), licencias, certificados laborales verificables y panel de administración contable.

---

## Tabla de Contenidos

- [Módulos Funcionales](#módulos-funcionales)
- [Stack Tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Inicio Rápido](#inicio-rápido)
- [Comandos Disponibles](#comandos-disponibles)
- [Calidad, Testing y Seguridad](#calidad-testing-y-seguridad)
- [Estándares de Desarrollo](#estándares-de-desarrollo)
- [Documentación](#documentación)

---

## Módulos Funcionales

Todos los módulos se activan dinámicamente mediante `MODULES_ENABLED` en `.env`:

| Módulo | Código | Capacidades Principales |
|---|---|---|
| **M0 – Autenticación y Usuarios** | `auth`, `usuarios` | Login por cédula, `argon2id`, bloqueo por intentos, primer ingreso obligatorio, verificación de correo, recuperación, carga masiva Excel, gestión de roles y sedes |
| **M1 – Expediente** | `colaboradores` | Ficha completa del colaborador, edición controlada por parámetro, historial de cambios, cifrado AES-256-GCM de cuenta bancaria e importación desde nómina |
| **M2 – Nómina y Volantes** | `nomina` | Lector validado de hojas `NOMINA *` y `HORAS RESUMEN`, flujo Borrador → Publicado / Anulado, vista previa, volantes detallados y PDF corporativo |
| **M3 – Permisos y Motor de Flujo** | `solicitudes`, `permisos`, `notificaciones` | Motor de aprobación versionado (`director → admincontable`), validación de cruces de fechas, soportes PDF seguros, notificaciones en tiempo real (SSE) y correo |
| **M4 – Vacaciones** | `vacaciones` | Cálculo exacto (`DAYS360` + `WORKDAY.INTL` + festivos), saldo al corte, simulador en vivo y compensación en dinero con topes parametrizables |
| **M5 – Incapacidades** | `incapacidades` | Registro IGE/IRL, diagnóstico cifrado AES-256-GCM, PDF sensible, visibilidad restringida (el director solo ve fechas) y auditoría de lecturas |
| **M6 – Licencias** | `licencias` | Maternidad, paternidad, luto, calamidad doméstica y no remuneradas parametrizables sobre el motor común, con descuento de días laborados en vacaciones |
| **M7 – Certificados Laborales** | `certificados` | Generación instantánea en PDF con o sin salario (números en letras `es-CO`), snapshot inmutable con huella SHA-256 y verificación pública `/verificar` sin PII |
| **M8 – Panel Admincontable** | `admin` | Resumen operativo, alertas de vencimientos, parámetros con vigencia futura, festivos, editor de flujos, suspensiones, ausentismo (+CSV seguro) y auditoría |

---

## Stack Tecnológico

- **Backend:** Node.js `>=20.12` (ES Modules), Express `5.x`, Knex `3.x`, Zod `4.x`, Argon2id, Helmet, Multer, ExcelJS, PDFKit, Nodemailer.
- **Base de Datos:** SQLite (`better-sqlite3`, WAL mode) en desarrollo local · PostgreSQL 15–17 (`pg`) en producción.
- **Frontend:** HTML5 semántico, CSS3 con tokens de diseño propios y Vanilla ES Modules (*zero-framework*).
- **Calidad y DevOps:** ESLint, Prettier, Husky, Commitlint, SonarQube, Docker multietapa, Kubernetes, Terraform, GitHub Actions, CodeQL, Dependabot y MkDocs Material.

---

## Arquitectura

El sistema implementa un **Monolito Modular** con inyección de dependencias (`crearContexto`), registro desacoplado de módulos (`src/core/modules.js`) y capas claras por dominio (`routes` → `service` → `repository` + `validators` + `views`).

Consulta los diagramas completos del **Modelo C4** y flujos en [docs/architecture/c4-model.md](docs/architecture/c4-model.md) y [docs/architecture/flujos.md](docs/architecture/flujos.md).

---

## Inicio Rápido

```powershell
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (opcional en desarrollo local)
copy .env.example .env

# 3. Ejecutar migraciones y semillas ficticias
npm run setup

# 4. Iniciar servidor de desarrollo (http://localhost:3000)
npm run dev
```

### Usuarios Ficticios de Desarrollo

| Cédula | Rol | Contraseña por defecto |
|---|---|---|
| `1000000001` | `ADMIN` (Admincontable) | `Demo2026clave` |
| `1000000002` | `DIRECTOR` (Sedes Norte y Sur) | `Demo2026clave` |
| `1000000003` | `COLABORADOR` | `Demo2026clave` |
| `1000000004` | `COLABORADOR` | `Demo2026clave` |

> En `NODE_ENV=production` **nunca** se crean usuarios de demostración. Utilice `npm run crear-admin -- <cedula> "<NOMBRE>"`.

---

## Comandos Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática (`src/`) |
| `npm start` | Servidor en modo producción |
| `npm run setup` | Ejecuta migraciones Knex y semillas iniciales |
| `npm test` | Ejecuta la suite completa (unitarias, integración y E2E) en SQLite |
| `npm run test:coverage` | Ejecuta pruebas con reporte LCOV y umbral mínimo obligatorio del **80%** |
| `npm run test:pg` | Ejecuta la suite completa contra PostgreSQL (`TEST_DATABASE_URL`) |
| `npm run lint` | Análisis estático con ESLint |
| `npm run format` / `format:check` | Formateo y verificación con Prettier |
| `npm run backup` | Copia de seguridad en caliente (SQLite / `pg_dump`) con rotación |
| `npm run crear-admin -- <cedula> "<NOMBRE>"` | Crea el primer administrador en producción |

---

## Calidad, Testing y Seguridad

- **Cobertura automatizada:** > 95% en líneas y funciones, > 84% en ramas (umbral mínimo CI: **80%**).
- **Seguridad OWASP ASVS Nivel 1 & Top 10:** ver [docs/security/owasp-asvs.md](docs/security/owasp-asvs.md) y [docs/security/owasp-top-10.md](docs/security/owasp-top-10.md).
- **Protección de datos (Ley 1581):** nunca se versionan archivos `.env`, bases de datos ni libros Excel reales (validado automáticamente por `tests/unit/repositorio.test.js`).

---

## Estándares de Desarrollo

- **Ramas:** `main`, `develop`, `feature/*`, `bugfix/*`, `hotfix/*`, `release/*`.
- **Commits:** **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `build:`, `ci:`) validados por Husky + Commitlint.
- **Pull Requests:** Obligatorios hacia `main` y `develop`, con revisión de pares y validaciones automáticas en CI. Ver [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Documentación

- **Portal de Documentación (GitHub Pages):** `https://buritica06.github.io/human-resources-platform/`
- [Guía de Instalación](docs/development/instalacion.md)
- [Manual para Desarrolladores](docs/development/manual-desarrollador.md)
- [Arquitectura C4](docs/architecture/c4-model.md) · [Flujos del Sistema](docs/architecture/flujos.md) · [Modelo de Datos](docs/architecture/modelo-datos.md)
- [ADRs (Architecture Decision Records)](docs/architecture/adrs/0001-monolito-modular.md)
- [Referencia API REST](docs/api/rest-api.md)
- [Guía de Despliegue](docs/deployment/despliegue.md)
- [Manuales de Usuario](docs/user-manual/colaborador.md) (Colaborador · Director · Admincontable)
- [Roadmap del Producto](docs/requirements/roadmap.md) · [Changelog](CHANGELOG.md)
