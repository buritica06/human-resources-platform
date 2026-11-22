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

## Tiempo real y archivos subidos
- Las notificaciones en tiempo real usan **Server-Sent Events** con un emisor en memoria: funcionan con **una sola instancia** del servidor. Con varias instancias, cambie el emisor de `src/core/notificaciones.js` por un canal compartido (p. ej. `LISTEN/NOTIFY` de PostgreSQL). Si hay un proxy (Nginx), desactive el *buffering* para `/api/v1/eventos` (la app ya envía `X-Accel-Buffering: no`).
- Los PDF subidos se guardan en `STORAGE_DIR` (por defecto `./uploads`), **fuera** de la carpeta pública y con nombre aleatorio. Inclúyala en las copias de seguridad, cífrela en reposo y restrinja permisos: contiene incapacidades (datos de salud). Para pasar a almacenamiento en la nube, agregue un adaptador en `src/core/storage/` con la misma interfaz.

## Certificados (M7)

**Proxy inverso.** El límite de la verificación pública (`/api/v1/certificados/verificar/…`) se cuenta por IP. Detrás de un proxy, `TRUST_PROXY` debe ser exactamente el número de saltos de proxy:
- Si se deja en 0, todos comparten la IP del proxy, y cualquiera podría agotar el límite de todos.
- Si es mayor de lo real o `true`, se puede falsificar `X-Forwarded-For`.

El contador vive en memoria: es por proceso y se reinicia al reiniciar el servidor.

**Retención.** Cada certificado guarda una copia de lo que se imprimió: nombre, cédula, cargo y salario. Es el mismo nivel de protección que el expediente. Antes de producción hay que definir con el área jurídica cuánto tiempo se conservan y si se purga el contenido de los anulados (Ley 1581, finalidad y temporalidad).

**Firma.** Por defecto no se imprime el nombre de quien firma (`CERT_FIRMANTE_NOMBRE` está vacío) y la autenticidad se respalda con el código de verificación. Hay que configurar el firmante y la ciudad (`CERT_CIUDAD`) si la empresa lo requiere.