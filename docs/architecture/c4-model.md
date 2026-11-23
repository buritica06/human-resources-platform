# Arquitectura del Sistema — Modelo C4

Este documento describe la arquitectura de la **Plataforma de Talento Humano** siguiendo los cuatro niveles del **Modelo C4** (Contexto, Contenedores, Componentes y Despliegue).

---

## 1. Diagrama de Contexto del Sistema (Nivel 1)

Muestra los actores que interactúan con la plataforma y los sistemas externos con los que se integra.

```mermaid
flowchart TB
    COL["Colaborador\n(Autoservicio móvil/web)"]
    DIR["Director Administrativo\n(Aprobación por sede)"]
    ADM["Área Contable / Admin\n(Nómina, usuarios, parámetros)"]
    PUB["Tercero Verificador\n(Validación pública de certificados)"]

    SYS["Plataforma de Talento Humano\n(Monolito Modular Node.js + Express)"]

    SMTP["Servidor SMTP Corporativo\n(Correos transaccionales)"]
    XLS["Libro de Nómina Excel\n(.xlsx / .xlsm, carga puntual)"]

    COL -->|"HTTPS / Navegador"| SYS
    DIR -->|"HTTPS / Navegador"| SYS
    ADM -->|"HTTPS / Navegador"| SYS
    PUB -->|"HTTPS /verificar"| SYS
    ADM -.->|"Sube hojas EMPLEADOS y NOMINA"| XLS
    XLS -.->|"Lectura en memoria (ExcelJS)"| SYS
    SYS -->|"TLS / SMTP"| SMTP
```

---

## 2. Diagrama de Contenedores (Nivel 2)

Detalla los bloques ejecutables y almacenes de datos que conforman el sistema en producción.

```mermaid
flowchart LR
    USR["Navegador Web / Móvil\n(HTML5 + CSS3 + ES Modules)"]

    subgraph PROD["Entorno de Producción"]
        PROXY["Proxy Inverso HTTPS\n(Nginx / Caddy / Ingress)\nTLS 1.2+, HSTS, SSE sin buffering"]
        APP["Aplicación Web & API\nNode.js 24 + Express 5\n(Puerto interno 3000)"]
        DB[("PostgreSQL 17\n(SQLite WAL en local)\nTablas + Sesiones + Auditoría")]
        FS[("Almacenamiento Privado\n/app/uploads (PDF cifrado en reposo)\nFuera de public/")]
        BKP[("Respaldos Cifrados\n/app/backups (pg_dump)")]
    end

    SMTP["Servidor SMTP Externo"]

    USR -->|"HTTPS + Cookie __Host- + X-CSRF-Token"| PROXY
    PROXY -->|"HTTP interno (127.0.0.1:3000)"| APP
    APP -->|"Knex (SQL parametrizado)"| DB
    APP -->|"Adapter Storage (Local/Cloud)"| FS
    APP -->|"Nodemailer TLS"| SMTP
    DB -.->|"pg_dump diario"| BKP
```

---

## 3. Diagrama de Componentes (Nivel 3)

Representa la estructura interna del Monolito Modular (`src/core/` y `src/modules/`).

```mermaid
flowchart TB
    subgraph CORE["Núcleo (src/core/)"]
        APP["app.js\nComposition Root + Helmet + CSP"]
        CFG["config.js\nVariables .env + Reglas Prod"]
        REG["modules.js\nRegistro + Dependencias"]
        SEC["security/\nSesiones BD, CSRF, Argon2id, AES-256-GCM"]
        DB["db.js\nKnex SQLite / PostgreSQL"]
        AUD["audit.js + logger.js\nAuditoría y Enmascarado PII"]
        DOC["documentos.js + storage/\nValidación PDF + Almacenamiento"]
        NOT["notificaciones.js + mailer.js\nSSE en vivo + Correo"]
        PDF["pdf.js + excel.js + parametros.js"]
    end

    subgraph MODULES["Módulos de Dominio (src/modules/)"]
        M0["auth & usuarios (M0)"]
        M1["colaboradores (M1)"]
        M2["nomina (M2)"]
        M3["solicitudes & notificaciones (M3)"]
        M3P["permisos (M3)"]
        M4["vacaciones (M4)"]
        M5["incapacidades (M5)"]
        M6["licencias (M6)"]
        M7["certificados (M7)"]
        M8["admin (M8)"]
    end

    APP --> REG
    APP --> SEC
    REG --> M0 & M1 & M2 & M3 & M5 & M7 & M8
    M3P & M4 & M6 -->|"Registran tipoSolicitud"| M3
    M5 -->|"Hook ausenciasExtra"| M3
    M8 -->|"Hook diasNoLaborados"| M4
    MODULES --> DB & AUD & DOC & NOT & PDF
```

---

## 4. Diagrama de Despliegue (Nivel 4)

Ilustra la topología física/lógica recomendada con Docker Compose o Kubernetes detrás de un terminador TLS.

```mermaid
flowchart TB
    INTERNET["Internet / Red Corporativa"]

    subgraph EDGE["Capa Perimetral"]
        TLS["Proxy Inverso / Ingress Controller\nTLS 1.3 · HSTS · Rate Limit Edge\nTRUST_PROXY=1"]
    end

    subgraph COMPUTE["Nodo de Aplicación (Docker / Kubernetes)"]
        CONT["Contenedor App (node:24-bookworm-slim)\nUsuario no-root: node (UID 1000)\nHealthcheck: /api/v1/auth/csrf"]
    end

    subgraph DATA["Capa de Datos Privada"]
        PG["Contenedor / Servicio PostgreSQL 17\nRed privada interna"]
        VOL_UP["Volumen Privado: uploads/\n(Soportes PDF médicos y permisos)"]
        VOL_BKP["Volumen Externo Cifrado: backups/\n(Retención 14 días)"]
    end

    SECRETS["Gestor de Secretos\n(GitHub Secrets / Vault / KMS)\nDATA_ENCRYPTION_KEY, DB, SMTP"]

    INTERNET -->|"HTTPS :443"| TLS
    TLS -->|"HTTP :3000"| CONT
    CONT -->|"TCP :5432"| PG
    CONT --> VOL_UP
    PG -.->|"Respaldo diario"| VOL_BKP
    SECRETS -.->|"Inyección env en arranque"| CONT
```
