# Revisión de Seguridad — OWASP Top 10 (2021)

Estado de controles de la **Plataforma de Talento Humano** frente al estándar **OWASP Top 10** y prácticas de DevSecOps.

| Categoría OWASP Top 10 | Estado | Controles Implementados |
|---|---|---|
| **A01: Broken Access Control** | Mitigado | RBAC (`COLABORADOR`, `DIRECTOR`, `ADMIN`) + alcance por sedes validado en servidor; acceso fuera de alcance responde `404` y se audita; CSRF sincronizado + validación de `Origin`; datos de salud ocultos al director. |
| **A02: Cryptographic Failures** | Mitigado | Contraseñas con `argon2id`; sesiones en BD por hash SHA-256; cifrado `AES-256-GCM` para cuentas bancarias y diagnósticos médicos; HTTPS + HSTS + cookies `__Host-` obligatorias en producción. |
| **A03: Injection** | Mitigado | Consultas parametrizadas con Knex (sin SQL interpolado); validación estricta con `zod`; escape de salida HTML (`escapar`) + CSP estricta sin inline scripts; neutralización de fórmulas CSV (`= + - @`). |
| **A04: Insecure Design** | Mitigado | Separación de funciones en flujos de aprobación; bloqueo optimista (`estadoEsperado` → `409`); snapshots inmutables con huella SHA-256 en certificados; pruebas de regresión de auditoría por módulo. |
| **A05: Security Misconfiguration** | Mitigado | `helmet`, `x-powered-by` deshabilitado, `Permissions-Policy`, `Cache-Control: no-store`; validación bloqueante en `config.js` (impide arrancar producción sin HTTPS, SMTP, PostgreSQL ni `DATA_ENCRYPTION_KEY`); contenedor Docker con usuario no-root. |
| **A06: Vulnerable and Outdated Components** | Monitoreado | `npm audit --omit=dev` en CI, **Dependabot** semanal para npm, GitHub Actions y Docker, y **Trivy** en `security-scan.yml`. Nota: 2 vulnerabilidades moderadas transitivas en `uuid <11.1.1` vía `exceljs` monitoreadas activamente. |
| **A07: Identification and Authentication Failures** | Mitigado | Política de contraseñas (≥ 10 caracteres, distinta a cédula, no reutilizar anterior), clave temporal de 72 h con cambio obligatorio, bloqueo tras 5 fallos, rate-limit por IP, verificación en tiempo constante y vencimiento de sesión (15 min inactividad / 8 h absoluto). |
| **A08: Software and Data Integrity Failures** | Mitigado | `package-lock.json` + `npm ci`, verificación SHA-256 de archivos Excel confirmados y certificados emitidos, validación de firma real `%PDF-` y rechazo de contenido activo en PDFs subidos. |
| **A09: Security Logging and Monitoring Failures** | Mitigado | Tabla `auditoria` inmutable para accesos, cambios, descargas y rechazos; enmascarado de cédulas/correos en logs (`mascara`); `compileSqlOnError: false` en Knex. |
| **A10: Server-Side Request Forgery (SSRF)** | Mitigado | La aplicación no realiza peticiones HTTP salientes controladas por el usuario; todas las integraciones externas son únicamente SMTP configurado por variable de entorno. |

## Gestión de Secretos

- Ningún secreto, contraseña, API Key o archivo `.env` se almacena en el repositorio.
- En CI/CD los secretos se gestionan exclusivamente vía **GitHub Secrets**.
- En producción se inyectan mediante variables de entorno respaldadas por un Secret Manager / Vault.
- GitHub Secret Scanning + Push Protection y `tests/unit/repositorio.test.js` protegen el repositorio contra filtraciones accidentales.
