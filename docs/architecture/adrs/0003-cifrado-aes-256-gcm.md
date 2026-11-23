# ADR-0003: Cifrado de Campos Sensibles en Reposo con AES-256-GCM

- **Estado:** Aceptado
- **Fecha:** 2026-11-22
- **Contexto:** Bajo la Ley 1581 de Protección de Datos Personales y OWASP ASVS V8, los números de cuenta bancaria y los diagnósticos médicos de incapacidades requieren protección adicional frente a accesos no autorizados a la base de datos o a copias de seguridad.

## Decisión

Cifrar dichos campos en la capa de aplicación mediante `node:crypto` usando **AES-256-GCM** con IV aleatorio de 12 bytes por registro y autenticación de integridad (`authTag`), almacenando el formato versionado `v1:<iv>:<tag>:<ciphertext>` con la llave maestra inyectada exclusivamente vía variable de entorno `DATA_ENCRYPTION_KEY` (64 caracteres hex).

## Consecuencias

- **Positivas:** Confidencialidad e integridad verificada por registro; en producción la aplicación se niega a arrancar sin una llave válida y distinta a la de desarrollo.
- **Negativas / Riesgos:** La pérdida de `DATA_ENCRYPTION_KEY` imposibilita descifrar los datos; requiere gestión en Vault/Secret Manager y respaldo independiente. En v1.1 se añadirá rotación de llaves (`v2`).
