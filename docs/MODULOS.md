# Módulos Nexus (estilo Odoo)

Nexus es la **plataforma**; cada aplicación es un **módulo** en `backend/modules/<nombre>/`.

## Módulos registrados

| Módulo | technicalName | API | UI | Estado |
|--------|---------------|-----|-----|--------|
| Core (plataforma) | `nexus_core` | `/api/auth` | — | oculto |
| Tickets / Helpdesk | `desk` | `/api/tickets` | `/desk.html` | instalado |
| Configuración | `settings` | `/api/settings` | `/settings.html` | instalado (admin) |
| CRM / Leads | `office` | `/api/office` | `/leads.html` | instalado |
| Tareas internas | `tasks` | `/api/tasks` | `/tasks.html` | instalado |
| Tienda online | `store` | `/api/store` | `/store.html` | instalado |
| Almacén / logística | `almacen` | `/api/almacen` | `/almacen.html` | instalado |
| Tracker BadBoy | `tracker` | `/api/performance` | `/tracker.html` | instalado |
| ERP contable | `ierp` | `/api/ierp` | `/modules/ierp` | addon |
| Grid energía | `grid` | — | — | en desarrollo |
| Hub membresías | `hub` | — | — | en desarrollo |

## Estructura de un módulo

```
backend/modules/mi-modulo/
  manifest.json    ← metadatos (como __manifest__.py en Odoo)
  proxy.js         ← solo addons externos (ej. ierp)
```

### manifest.json

```json
{
  "technicalName": "desk",
  "displayName": "Nexus Desk",
  "summary": "Tickets y helpdesk",
  "version": "0.1.0",
  "category": "service",
  "state": "installed",
  "depends": ["nexus_core"],
  "routes": { "ui": "/desk.html", "api": "/api/tickets" },
  "roles": ["admin", "empleado"],
  "icon": "🎫",
  "sortOrder": 10
}
```

Estados: `installed` | `development` | (futuro: `disabled`)

## API

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/modules` | Lista plana |
| `GET /api/modules/catalogo` | Instalados + en desarrollo + por categoría |
| `GET /api/modules/:nombre` | Detalle de un módulo |
| `GET /api/modules/ierp/estado` | Health del addon iERP |

## Dashboard

`frontend/dashboard.html` consume `/api/modules/catalogo` y muestra:
- **Aplicaciones instaladas** — Desk, Office, Store, Almacén, Tracker, iERP…
- **En desarrollo** — Grid, Hub

## Deshabilitar módulos

En `config/.env`:

```
MODULES_DISABLED=hub,grid
IERP_ENABLED=false
```

## Añadir un módulo nuevo

1. Crear `backend/modules/nuevo/manifest.json`
2. Si tiene API: `backend/routes/...` + `app.use` en `server.js`
3. Si es externo: añadir proxy en `loader.js`
4. UI: `frontend/nuevo.html` o app embebida
5. Aparece automáticamente en el dashboard
