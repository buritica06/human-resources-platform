# Infraestructura como Código (Terraform)

Esta carpeta contiene la plantilla base de Terraform para aprovisionar el entorno productivo de la **Plataforma de Talento Humano**.

## Componentes objetivo recomendados

1. **Red privada (VPC)** con subredes privadas para PostgreSQL 17 y almacenamiento de documentos.
2. **Base de datos administrada PostgreSQL 17** con cifrado en reposo (KMS), TLS obligatorio y copias automáticas (≥ 14 días).
3. **Almacenamiento privado cifrado** para soportes PDF (`uploads/` / S3 o GCS privado sin acceso público).
4. **Gestor de Secretos** para `DATA_ENCRYPTION_KEY`, `DATABASE_URL` y credenciales `SMTP_*`.
5. **Balanceador HTTPS / Proxy inverso** con TLS 1.2+, HSTS y `proxy_buffering off` para `/api/v1/eventos` (SSE).

## Uso base

```bash
cd infrastructure/terraform
terraform init
terraform validate
terraform plan -var="environment=production" -var="app_domain=th.tuempresa.com"
```
