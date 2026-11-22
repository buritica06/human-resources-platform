# Plataforma de Talento Humano – Masinero Compraventas

Aplicación web (primero móvil) para que los colaboradores consulten su información laboral y hagan solicitudes, y para que el área contable administre usuarios, nómina y aprobaciones.

> Estado: **M0 – Autenticación y cuentas** terminado. Ver [CHANGELOG.md](CHANGELOG.md) y el plan en [docs/plan.md](docs/plan.md).

## Requisitos
- Node.js 20.12 o superior (probado con Node 24)
- No necesita base de datos instalada en local: usa SQLite (un archivo en `data/`).

## Instalación local (4 comandos)
```powershell
npm install
copy .env.example .env      # opcional: sin .env se usan los valores por defecto de desarrollo
npm run setup               # crea la base de datos, carga parámetros, festivos y datos ficticios
npm run dev                 # http://localhost:3000
```

### Usuarios de prueba (ficticios, solo en desarrollo)
| Cédula | Rol |
|---|---|
| 1000000001 | Admincontable |
| 1000000002 | Director administrativo (sedes Norte y Sur) |
| 1000000003 | Colaborador |
| 1000000004 | Colaborador |

Contraseña de todos: `Demo2026clave` (se puede cambiar con la variable `SEED_PASSWORD` antes de `npm run setup`). En producción **no** se crean estos usuarios.

### Correos en desarrollo
No se envían: cada correo se guarda como `.eml` en `data/correos/` y el enlace (verificación, recuperación) aparece en la consola del servidor.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática (vigila solo `src/`) |
| `npm start` | Servidor sin recarga (producción) |
| `npm run setup` | Migraciones + datos iniciales |
| `npm run migrate` | Solo migraciones |
| `npm test` | Pruebas unitarias e integración (`node:test`) |
| `npm run lint` | ESLint |
| `npm run fixtures` | Regenera los Excel **ficticios** de `tests/fixtures/` |
| `npm run backup` | Copia de seguridad de la base de datos con rotación |
| `npm run crear-admin -- <cedula> "<NOMBRE>"` | Crea el primer admincontable (producción) |

## Estructura
```
src/core/          núcleo: configuración, BD, sesión, CSRF, roles, auditoría, correo, parámetros
src/modules/<m>/   un módulo por carpeta: routes, service, repository, validators, views
src/public/        sistema de diseño (css/) y utilidades de interfaz (js/)
migrations/        migraciones Knex (SQLite y PostgreSQL)
seeds/             parámetros del archivo de nómina, festivos y datos FICTICIOS
tests/             unit/, integration/, fixtures/ (Excel ficticio)
docs/              análisis, plan, modelo de datos, API
```
Los módulos se activan con `MODULES_ENABLED` en `.env`. Cada módulo se registra en `src/core/modules.js` y aporta sus rutas de API, páginas y entradas de menú sin tocar los demás.

## Datos personales
- El archivo de nómina real **no** se copia al repositorio (`.gitignore` excluye `*.xls*`, y una prueba automática falla si aparece un Excel que no sea ficticio).
- Las pruebas y semillas usan datos inventados con la misma estructura.
- Los logs enmascaran cédulas y correos.

## Aviso: carpeta dentro de OneDrive
OneDrive modifica archivos de `node_modules` mientras sincroniza (lo comprobamos: reiniciaba el servidor de desarrollo una y otra vez). `npm run dev` ya vigila solo `src/`, pero se recomienda **mover el proyecto fuera de OneDrive** o excluir `node_modules/`, `data/` y `backups/` de la sincronización: una base SQLite sincronizada puede corromperse.

## Documentación
- [docs/analisis.md](docs/analisis.md) – inventario de insumos, preguntas y supuestos
- [docs/plan.md](docs/plan.md) – arquitectura, plan por fases y criterios de aceptación
- [docs/modelo-datos.md](docs/modelo-datos.md) – tablas actuales
- [docs/api.md](docs/api.md) – endpoints disponibles
- [docs/despliegue.md](docs/despliegue.md) – producción y copias de seguridad
