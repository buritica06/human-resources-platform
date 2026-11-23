# Flujos de Arquitectura y Operación

Este documento detalla los flujos críticos de **Autenticación**, **Negocio** y **CI/CD**.

---

## 1. Flujo de Autenticación, Sesión y Primer Ingreso

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario (Navegador)
    participant API as Express API (/api/v1/auth)
    participant SEC as Sesiones / CSRF / Argon2id
    participant DB as Base de Datos (usuarios, sesiones, tokens)
    participant MAIL as Mailer (SMTP / .eml)

    U->>API: GET /auth/csrf
    API-->>U: 200 { csrf } + Cookie HttpOnly th_csrf

    U->>API: POST /auth/login { cedula, clave } + X-CSRF-Token
    API->>SEC: Valida Rate-Limit IP + Bloqueo cuenta (5 fallos)
    SEC->>DB: Busca usuario por cédula
    SEC->>SEC: Verifica Argon2id (tiempo constante)
    alt Credenciales válidas
        SEC->>DB: Crea sesión (id_hash = sha256(token), csrf)
        API-->>U: 200 { csrf, primerIngreso } + Cookie __Host-th_sid (HttpOnly, Secure, SameSite=Lax)
    else Fallo
        SEC->>DB: Incrementa intentos_fallidos + registra auditoría
        API-->>U: 401 "Usuario o contraseña incorrectos"
    end

    opt primerIngreso === true
        U->>API: POST /auth/cambiar-clave
        API->>DB: Actualiza hash + cierra otras sesiones
        U->>API: POST /auth/correo { correo }
        API->>DB: Genera token sha256 (24h)
        API->>MAIL: Envía enlace de verificación
        U->>API: POST /auth/verificar-correo { token }
        API->>DB: Marca correo_verificado_en (cuentaLista = true)
    end
```

---

## 2. Flujo de Negocio: Motor de Solicitudes y Aprobaciones

```mermaid
stateDiagram-v2
    [*] --> BORRADOR: Colaborador guarda borrador
    [*] --> PENDIENTE_DIRECTOR: Colaborador envía solicitud (valida fechas, saldo y cruces)
    BORRADOR --> PENDIENTE_DIRECTOR: Enviar (revalida reglas y cruces)
    BORRADOR --> CANCELADA: Colaborador cancela

    PENDIENTE_DIRECTOR --> PENDIENTE_CONTABLE: Director aprueba paso 1 (con estadoEsperado)
    PENDIENTE_DIRECTOR --> PENDIENTE_CONTABLE: Omitido automáticamente (sede sin director o solicitante es director)
    PENDIENTE_DIRECTOR --> RECHAZADA: Director rechaza (motivo obligatorio)
    PENDIENTE_DIRECTOR --> CANCELADA: Colaborador cancela

    PENDIENTE_CONTABLE --> APROBADA: Admincontable aprueba (revalida saldo/cruces + notifica SSE y correo)
    PENDIENTE_CONTABLE --> RECHAZADA: Admincontable rechaza (motivo obligatorio)
    PENDIENTE_CONTABLE --> CANCELADA: Colaborador cancela

    APROBADA --> CANCELADA: Admincontable anula aprobación (devuelve días y notifica)
    RECHAZADA --> [*]
    CANCELADA --> [*]
```

---

## 3. Flujo CI/CD y Seguridad (GitHub Actions)

```mermaid
flowchart LR
    DEV["Developer\nfeature/* → PR a develop/main"]
    HOOK["Husky Local\nlint + format + commitlint"]

    subgraph CI["ci.yml (Integración Continua)"]
        LINT["ESLint + Prettier Check"]
        TEST_SQ["Tests + Coverage ≥ 80%\n(SQLite + LCOV)"]
        TEST_PG["Tests de Integración\n(PostgreSQL 17 Service)"]
        DOCKER["Docker Build Verification\n(infrastructure/docker/Dockerfile)"]
    end

    subgraph SEC["security-scan.yml"]
        AUDIT["npm audit --omit=dev"]
        CODEQL["GitHub CodeQL SAST"]
        TRIVY["Trivy FS Vulnerability Scan"]
    end

    subgraph CD["cd.yml & github-pages.yml"]
        REL["Semantic Tag / Release"]
        GHCR["Publicar Imagen GHCR"]
        PAGES["Build & Deploy MkDocs\nGitHub Pages"]
    end

    DEV --> HOOK --> CI
    DEV --> SEC
    CI -->|"Merge aprobado (Squash)"| CD
```
