# Imagen de producción de la plataforma de Talento Humano (opcional: también corre sin Docker).
# Construir:  docker build -t talento-humano .
# Requiere las variables de .env (ver .env.example y docs/despliegue.md).
FROM node:24-bookworm-slim AS dependencias
WORKDIR /app
# Herramientas para compilar módulos nativos (argon2, better-sqlite3) si no hay binario precompilado
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds
COPY scripts ./scripts
# Carpetas de datos (montar como volúmenes): archivos subidos y, si se usa SQLite, la base
RUN mkdir -p /app/uploads /app/data /app/backups && chown -R node:node /app/uploads /app/data /app/backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/v1/auth/csrf').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]