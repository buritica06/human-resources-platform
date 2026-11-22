# Despliegue (borrador M0 – se completa en la fase de cierre)

## Variables obligatorias en producción
| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | URL pública con **https** (se usa en los enlaces de los correos y en la verificación de `Origin`) |
| `DB_CLIENT` / `DATABASE_URL` | `pg` y la cadena de conexión de PostgreSQL 15+ |
| `DATA_ENCRYPTION_KEY` | 64 caracteres hex (la app no arranca sin ella) |
| `MAIL_TRANSPORT=smtp` + `SMTP_*` | Servidor de correo (la app no arranca sin SMTP) |
| `TRUST_PROXY` | `1` si hay un proxy inverso (Nginx, hosting) delante |

En producción la cookie de sesión usa el prefijo `__Host-`, `Secure` y HSTS: **requiere HTTPS**.

## Primer arranque
```powershell
npm ci --omit=dev
npm run migrate
npm run seed                      # en producción solo carga parámetros y festivos
npm run crear-admin -- 12345678 "APELLIDOS NOMBRES"
npm start
```

## Copias de seguridad
`npm run backup` crea una copia en `backups/` y conserva las 14 más recientes (`BACKUP_DIR`, `BACKUP_KEEP`).
- SQLite: copia en caliente con la API de respaldo de SQLite (no copie el archivo `.sqlite` a mano con el servidor encendido).
- PostgreSQL: `pg_dump --format=custom` (debe estar instalado). Restaurar: `pg_restore --clean --dbname=<url> <archivo.dump>`.

Programe la tarea a diario (Programador de tareas de Windows o `cron`) y copie la carpeta `backups/` **fuera del servidor**: las copias contienen datos personales y deben guardarse cifradas y con acceso restringido.
