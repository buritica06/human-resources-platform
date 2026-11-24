# Despliegue en PaaS (Render, Railway y Fly.io)

La **Plataforma de Talento Humano** requiere un entorno con **Node.js 24** y **PostgreSQL 17** (no puede ejecutarse en GitHub Pages porque Pages solo aloja sitios estáticos). Este repositorio incluye configuración lista para desplegar en **Render**, **Railway** y **Fly.io** usando la imagen Docker de producción (`infrastructure/docker/Dockerfile`).

---

## Requisitos Previos (Comunes a los 3 Proveedores)

1. **Generar `DATA_ENCRYPTION_KEY` (64 caracteres hex):**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Guárdela en un gestor de secretos. **Nunca** la suba al repositorio.
2. **Credenciales SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`): puede usar Brevo, Resend SMTP, Mailgun, Postmark o el correo corporativo.

---

## Opción 1: Render (Despliegue en 1 Clic con Blueprint)

El archivo `render.yaml` aprovisiona automáticamente el servicio web Docker y la base **PostgreSQL 17**.

1. Abre el enlace de despliegue directo:
   - **Deploy to Render:** `https://render.com/deploy?repo=https://github.com/buritica06/human-resources-platform`
2. Render detectará `render.yaml` y te pedirá las variables marcadas `sync: false`:
   - `DATA_ENCRYPTION_KEY` (64 hex)
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
3. `APP_URL` toma automáticamente `RENDER_EXTERNAL_URL` (`https://<tu-servicio>.onrender.com`) si no se sobreescribe.
4. Al finalizar el primer arranque (las migraciones corren automáticamente), abre la **Shell** del servicio en Render y crea el primer administrador:
   ```bash
   node scripts/crear-admin.js 1000000001 "ADMIN INICIAL"
   ```

> **Nota sobre archivos subidos en Render Free:** El plan gratuito de Render no incluye disco persistente; para conservar PDFs de incapacidades/permisos tras reinicios, agrega un **Persistent Disk** montado en `/app/uploads` (plan Starter) o implementa un adaptador S3/R2 en `src/core/storage/`.

---

## Opción 2: Railway

El archivo `railway.toml` configura el build Docker y el healthcheck automáticamente.

1. En [railway.app](https://railway.app), selecciona **New Project → Deploy from GitHub repo → `buritica06/human-resources-platform`**.
2. Agrega un servicio **PostgreSQL** en el mismo proyecto (`+ New → Database → PostgreSQL`).
3. En las variables del servicio de la app configura:
   - `NODE_ENV=production`
   - `DB_CLIENT=pg`
   - `DB_SSL=true`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `APP_URL=https://<tu-dominio>.up.railway.app`
   - `TRUST_PROXY=1`
   - `DATA_ENCRYPTION_KEY=<64-hex>`
   - `MAIL_TRANSPORT=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`
4. Agrega un **Volume** montado en `/app/uploads` para persistir soportes PDF.
5. Ejecuta una vez el comando de creación del admin inicial:
   ```bash
   railway run node scripts/crear-admin.js 1000000001 "ADMIN INICIAL"
   ```

---

## Opción 3: Fly.io

El archivo `fly.toml` configura la región `bog` (Bogotá), HTTPS forzado, volumen persistente `/app/uploads` y healthcheck.

```bash
# 1. Instalar CLI y autenticar
fly auth login

# 2. Crear app y base PostgreSQL
fly launch --no-deploy --copy-config
fly postgres create --name hr-platform-db --region bog
fly postgres attach hr-platform-db

# 3. Crear volumen persistente para PDFs
fly volumes create hr_uploads --size 1 --region bog

# 4. Configurar secretos
fly secrets set \
  DATA_ENCRYPTION_KEY="<64-hex>" \
  APP_URL="https://human-resources-platform.fly.dev" \
  MAIL_FROM="Talento Humano <no-responder@tuempresa.com>" \
  SMTP_HOST="smtp.tuproveedor.com" \
  SMTP_PORT="587" \
  SMTP_USER="usuario" \
  SMTP_PASS="clave"

# 5. Desplegar
fly deploy

# 6. Crear primer admincontable
fly ssh console -C 'node scripts/crear-admin.js 1000000001 "ADMIN INICIAL"'
```
