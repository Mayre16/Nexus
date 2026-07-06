# ADESA Nexus

Suite empresarial unificada y **multi-tenant** (ERP / CRM / Ticketing / Monitoreo)
para las dos divisiones de ADESA: **Energía** y **Deportes**. Pensada para
correr en **cPanel** (Node.js + MySQL) con frontend responsivo (TailwindCSS,
apto para Capacitor iOS/Android).

> 🔐 La seguridad es de primera clase. Lee **`SECURITY-NEXUS.md`** antes de
> exponer cualquier módulo a producción (incluye el análisis de "puertas abiertas").

## Árbol del proyecto

```
Nexus/
├─ backend/                  # API Node.js/Express (blindada)
│  ├─ config/
│  │  ├─ env.js              # Carga y validación fail-fast de variables de entorno
│  │  └─ database.js         # Pool MySQL (mysql2) — consultas parametrizadas
│  ├─ middleware/
│  │  ├─ authMiddleware.js   # JWT en cookie HttpOnly + RBAC + división
│  │  ├─ rateLimiter.js      # Rate limiting (general / login / tracker)
│  │  ├─ csrfProtection.js   # CSRF double-submit token
│  │  └─ errorHandler.js     # 404 + errores genéricos en prod
│  ├─ utils/
│  │  ├─ crypto.js           # AES-256-GCM (cifrado de datos sensibles)
│  │  ├─ tokens.js           # Firma/verificación JWT + cookies seguras
│  │  └─ securityLogger.js   # Auditoría de eventos de seguridad
│  ├─ routes/                # Routers por módulo
│  ├─ server.js              # Punto de entrada blindado
│  └─ package.json
├─ frontend/                 # Web responsiva (TailwindCSS / Capacitor)
├─ config/
│  └─ .env.example           # Plantilla de variables (copiar a config/.env)
├─ database/
│  └─ nexus_master.sql       # Esquema MySQL unificado
├─ SECURITY-NEXUS.md         # Reglas de seguridad y gaps críticos
├─ .gitignore
└─ README.md
```

## Puesta en marcha (desarrollo) — un solo comando

La base de datos corre en **Docker** (MariaDB), así no necesitas instalar MySQL.

```powershell
# Levanta Docker + MariaDB + backend (que también sirve el frontend):
./dev.ps1
```

O por partes con npm:

```bash
npm run db:up        # MariaDB + Adminer en Docker (carga el esquema la 1ª vez)
npm run backend:dev  # backend con recarga automática
npm run db:reset     # reinicio limpio de la BD (BORRA datos y recarga el esquema)
```

Accesos locales:

| Servicio | URL | Notas |
|---|---|---|
| App (frontend + API) | http://localhost:3000 | Pantalla de acceso branded |
| API health | http://localhost:3000/api/health | Verifica que el backend vive |
| Adminer (visor BD) | http://localhost:8080 | Sistema MySQL · Servidor `mariadb` · user `nexus_app` |

> En el primer arranque, `cd backend && npm install`. Las credenciales locales
> van en `config/.env` (ignorado por git — usar `config/.env.example` como plantilla).
> Para producción genera secretos nuevos (`npm run gen:secret`, `npm run gen:enckey`).

## Branding

Identidad tomada de [adesa.com.do](https://adesa.com.do/): rojo `#be1622`, rayo
dorado `#fcb900`, negro y blanco. Assets en `frontend/assets/`.

## Roles (RBAC)

`admin` · `empleado` (técnico) · `cliente_externo` · `cliente_suscriptor`.
La autorización se valida **siempre en el servidor** (`authMiddleware.js`).

## Módulos

1. **Nexus Desk** — Helpdesk (IMAP), portal cliente, base de conocimientos.
2. **Nexus Office** — CRM, proyectos/Gantt.
3. **Nexus Tracker** — Telemetría del agente BadBoy.
4. **Nexus Grid** — Monitoreo EasyMetering.
5. **Nexus Store / iERP** — ERP integrado.
6. **Nexus Hub** — Suscripciones (Power Quality, Scrapibids).
