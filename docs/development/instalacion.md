# Guía de Instalación

## Requisitos Previos

- **Node.js** `>= 20.12` (recomendado Node 24 LTS) y `npm`.
- **Git** `>= 2.40`.
- **Opcional (producción / pruebas PG):** Docker Desktop o PostgreSQL 15–17.

> **Importante:** Evite alojar el repositorio local dentro de carpetas sincronizadas por OneDrive o Dropbox para prevenir bloqueos o corrupción de la base SQLite (`data/th.sqlite`).

## Instalación Local (Desarrollo)

```bash
# 1. Clonar el repositorio privado
git clone https://github.com/buritica06/human-resources-platform.git
cd human-resources-platform

# 2. Instalar dependencias y activar hooks de Git (Husky)
npm install

# 3. Copiar plantilla de variables de entorno
cp .env.example .env

# 4. Crear base SQLite local, aplicar migraciones y cargar datos ficticios
npm run setup

# 5. Iniciar servidor en modo desarrollo (http://localhost:3000)
npm run dev
```

## Verificación de la Instalación

```bash
npm run lint
npm run format:check
npm run test:coverage
```

## Instalación con Docker Compose (Producción / Staging)

```bash
cp .env.example .env
# Completar DATA_ENCRYPTION_KEY, APP_URL (https), SMTP_* y POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app node scripts/crear-admin.js <CEDULA> "<APELLIDOS NOMBRES>"
```

Consulta los requisitos completos de producción en [Guía de Despliegue](../deployment/despliegue.md).
