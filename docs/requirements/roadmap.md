# Roadmap del Producto

## v1.0.0 — Plataforma Base y Gobierno Enterprise (Completado)
- M0–M8 completos: Autenticación, Expediente, Nómina y Volantes, Permisos/Motor de Aprobación, Vacaciones, Incapacidades (Ley 1581), Licencias, Certificados Laborales verificables y Panel Admincontable.
- Reestructuración empresarial del repositorio, Modelo C4, ADRs, Portal de Documentación (MkDocs Material + GitHub Pages).
- Pipelines CI/CD (SQLite + PostgreSQL 17, Cobertura ≥ 80%, Docker Build), Seguridad (CodeQL, Trivy, Dependabot, `npm audit`) y Quality Gates (ESLint, Prettier, Husky, Commitlint, SonarQube).

## v1.1.0 — Operación Productiva y Hardening (Q1 2027)
- [ ] Ejecución de piloto en entorno productivo con PostgreSQL 17 y proxy HTTPS (Nginx/Caddy).
- [ ] Rotación versionada de `DATA_ENCRYPTION_KEY` (`v1` → `v2`) con script de re-cifrado en caliente.
- [ ] Pruebas E2E de interfaz en navegador real con Playwright (375 px y 1280 px) y auditoría Lighthouse (Accesibilidad ≥ 95).
- [ ] Políticas de retención y purga automática de certificados, soportes y auditoría (Ley 1581).
- [ ] Código QR opcional en certificados laborales.

## v1.2.0 — Escalabilidad Horizontal y Nube (Q2 2027)
- [ ] Adaptador de almacenamiento en la nube (`src/core/storage/s3.js` / GCS) con cifrado KMS.
- [ ] Emisor SSE distribuido mediante PostgreSQL `LISTEN/NOTIFY` o Redis Pub/Sub para despliegues multi-instancia (HPA).
- [ ] Rate limiting distribuido (Redis Store) para entornos con múltiples réplicas en Kubernetes.
- [ ] Observabilidad avanzada: métricas Prometheus (`/metrics`), trazas OpenTelemetry y tableros Grafana.

## v2.0.0 — Expansión Funcional de Talento Humano (H2 2027)
- [ ] Módulo de Certificados de Ingresos y Retenciones.
- [ ] Gestión de préstamos y anticipos integrada con el libro de nómina.
- [ ] Firma electrónica simple / estampado cronológico en certificados y aprobaciones.
- [ ] Integración SSO corporativo (OIDC / SAML) opcional para personal administrativo.
