# Despliegue y operación (versión 1.0)

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
## Panel del admincontable (M8)

- **Módulos:** un `.env` de producción ya existente debe agregar `admin` a `MODULES_ENABLED` para ver el panel (el valor por defecto ya lo incluye).
- **Caché de parámetros:** cada proceso guarda los parámetros 30 segundos. Con varias instancias, un cambio programado para hoy puede tardar hasta 30 segundos en verse en todas.
- **Anular aprobadas:** no hay límite de tiempo. Anular unas vacaciones ya pagadas en nómina, o días compensados en dinero, devuelve los días al saldo, así que el área contable debe ajustar la nómina por su cuenta.
- **Pendiente antes de producción:** programar el SMMLV y el auxilio de transporte de 2027; el panel lo alerta.
## Docker (opcional)

`Dockerfile` y `docker-compose.yml` levantan la app con PostgreSQL 17:
1. Cree `.env` desde `.env.example`. Defina `DATA_ENCRYPTION_KEY`, `APP_URL` (https), `MAIL_TRANSPORT=smtp` con sus `SMTP_*` y `POSTGRES_PASSWORD`.
2. Arránquelo con `docker compose up -d`. La app migra la base al arrancar y corre como usuario sin privilegios.
3. Cree el primer usuario: `docker compose exec app node scripts/crear-admin.js <cédula> "<NOMBRE>"`.
4. La app escucha solo en `127.0.0.1:3000`: publíquela con un proxy HTTPS (Nginx, Caddy) y `TRUST_PROXY=1`.
5. Los volúmenes `datos_pg`, `archivos` y `respaldos` guardan la base, los PDF y las copias. Respáldelos fuera del servidor.
6. **Copias con Docker:** la imagen de la app no trae `pg_dump`. Use el contenedor de la base: `docker compose exec db pg_dump -U talento_humano -Fc talento_humano > respaldo.dump`. Copie también el volumen `archivos`, que tiene los PDF.
7. **Contraseña de PostgreSQL:** use solo letras y números en `POSTGRES_PASSWORD`. Caracteres como `@ : / #` romperían la URL de conexión que arma el compose.

> En el equipo de desarrollo no estaba instalado Docker, así que **la imagen no se construyó ni se probó todavía**. Antes de producción, constrúyala y corra el humo: ingreso, carga de nómina ficticia y una solicitud completa.

## Pruebas contra PostgreSQL

La suite completa puede correr contra PostgreSQL. Cada entorno de prueba crea y borra su propio esquema:

```powershell
$env:TEST_DATABASE_URL = "postgres://usuario:clave@localhost:5432/th_pruebas"
npm run test:pg
```

- La base debe existir y el usuario debe poder crear esquemas.
- Por seguridad, el script se niega si el nombre contiene "prod".

> En el equipo de desarrollo no había PostgreSQL, así que **esta corrida está pendiente**. El código ya contempla las diferencias (bloqueos `FOR UPDATE`, decimales como texto, `RETURNING`), pero hay que confirmarlo corriendo `npm run test:pg` una vez antes de producción.