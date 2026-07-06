# Informe completo: Módulo de Sincronización WMS

## Índice

1. [Visión general del módulo](#1-visión-general-del-módulo)
2. [Arquitectura y componentes](#2-arquitectura-y-componentes)
3. [Flujo de sincronización](#3-flujo-de-sincronización)
4. [Configuración del sistema](#4-configuración-del-sistema)
5. [Automatización vía cron](#5-automatización-vía-cron)
6. [Inconvenientes con la sync vía cron](#6-inconvenientes-con-la-sync-vía-cron)
7. [Posibles causas identificadas](#7-posibles-causas-identificadas)
8. [Resumen y recomendaciones](#8-resumen-y-recomendaciones)

---

## 1. Visión general del módulo

El módulo de sincronización es el componente del WMS que mantiene actualizado el inventario ERP (ADM Cloud) en la base de datos local. Su función principal es:

- **Obtener stock por ubicación** desde la API de ADM Cloud (`/api/Stock`)
- **Almacenar los datos** en tablas locales (staging cache con runs)
- **Hacer swap atómico** para que los datos nuevos pasen a ser los datos en vivo (LIVE)
- **Detectar discrepancias** entre stock ERP y stock físico WMS
- **Sincronizar el catálogo** de productos (nombre, SKU, código de barras) de forma independiente

El módulo soporta **sincronización manual** (desde el panel de administración) y **sincronización automática** (disparada por cron cada 5 minutos).

---

## 2. Arquitectura y componentes

### 2.1 Modelos de datos

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| **ProductoADM** | `productos_adm` | Cache de productos (item_id, sku, nombre, codigo_barras) desde ADM Cloud |
| **StockProductoADM** | `stock_productos_adm` | Stock por producto/ubicación, asociado a un `sync_run_id` |
| **SyncRun** | `sync_runs` | Registro de cada ejecución de sync (run_id, status, items_synced, started_at, etc.) |
| **SyncLocationStatus** | `sync_locations_status` | Estado por ubicación: `current_run_id` (LIVE), `running_run_id` (en curso), `last_heartbeat_at`, status, items_synced, total_items |
| **SchedulerLock** | `scheduler_lock` | Lock global para evitar que dos ticks procesen a la vez |
| **Discrepancia** | `discrepancias` | Discrepancias críticas entre stock ERP y stock físico |
| **StockUbicacion** | `stock_ubicacion` | Stock físico en ubicaciones WMS (A-01-02, etc.) |

### 2.2 Conceptos clave: staging y swap

- **NEW (staging):** Durante una sync, los datos se guardan en `StockProductoADM` con `sync_run_id = nuevo_run.run_id`. Estos datos son temporales hasta el swap.
- **LIVE:** Los datos activos que usa la aplicación. Se identifican por `sync_run_id = current_run_id` en `SyncLocationStatus`.
- **Swap atómico:** Al completar la sync exitosamente, se hace `current_run_id = nuevo_run.run_id`. Los datos NEW pasan a ser LIVE de forma instantánea.
- **Heartbeat:** `last_heartbeat_at` se actualiza cada 50 items procesados. Sirve para detectar procesos zombies (syncs que murieron sin terminar).

### 2.3 Endpoints del módulo

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/sincronizar/productos` | POST | require_auth | Sync masiva legacy (productos + stock todas ubicaciones) |
| `/api/sincronizar/catalogo` | POST | require_admin | Actualiza nombre, SKU, código de barras de productos (no toca stock) |
| `/api/sincronizar/ubicacion/<id>` | POST | admin o cron | Sync completa de una ubicación (full) |
| `/api/sincronizar/ubicacion/<id>/lote` | POST | admin o cron | Sync por lotes (continuar desde skip_actual) |
| `/api/sincronizar/ubicacion/<id>/contar` | POST | admin o cron | Cuenta productos en ADM para una ubicación |
| `/api/sincronizar/ubicacion/<id>/estado` | GET | auth | Estado de sync de una ubicación |
| `/api/sincronizar/ubicaciones` | GET | auth | Lista ubicaciones ADM con estado de sync |
| `/api/sincronizar/auto/tick` | POST | X-CRON-TOKEN | Tick para cron: decide si disparar sync y cuál ubicación |
| `/api/sincronizar/progreso` | GET | auth | Progreso de sync en curso (polling) |
| `/api/sincronizar/estado` | GET | auth | Estado general de sincronización |

---

## 3. Flujo de sincronización

### 3.1 Sync por ubicación (full)

1. **Inicio:** Se crea un `SyncRun` con `status=running`, se actualiza `SyncLocationStatus` con `running_run_id`, `status=running`, `last_heartbeat_at`.
2. **Limpieza previa:** Se eliminan registros de `StockProductoADM` de runs anteriores para esa ubicación.
3. **Loop principal:** Por lotes de 50 items:
   - Llamada a ADM Cloud `obtener_stock(location_id, skip, take=50, show_no_stock=True)`
   - Para cada item: buscar/crear `ProductoADM`, crear/actualizar `StockProductoADM` con `sync_run_id=nuevo_run.run_id`
   - Cada 50 items: actualizar `estado_sync.items_synced`, `total_items`, `last_heartbeat_at` y hacer commit
   - Cada 200 items: commit periódico
   - Verificar caps: max_requests (800 ADESA, 300 Mirador Sur), max_minutos (25/15), max_items_procesados
4. **Post-procesamiento:**
   - Detectar productos desaparecidos (tenían stock en OLD, no vienen en NEW → crear registro stock=0 en NEW)
   - Crear discrepancias críticas si ERP=0 y Físico>0
   - Validar NEW vs OLD, ADM vs Físico (solo ADESA)
   - Poblar EnRevision, enviar emails (discrepancias, estado)
5. **Swap:** Si `sync_completa`: `current_run_id = nuevo_run.run_id`, `running_run_id = None`, `status=done`
6. **Respuesta:** JSON con items_synced, total_items, status, etc.

### 3.2 Caps por ubicación

| Ubicación | max_requests | max_minutos | max_items_procesados |
|-----------|--------------|-------------|----------------------|
| ADESA | 800 | 25 | 50,000 |
| MIRADOR SUR | 300 | 15 | 20,000 |
| Otras | (default ADESA) | | |

### 3.3 Sincronización de catálogo

- Endpoint: `POST /api/sincronizar/catalogo`
- Paginación: 50 productos por llamada, hasta 10,000
- Actualiza: `ProductoADM` (nombre, sku, codigo_barras, activo, UOM)
- **No toca stock.** Al final normaliza `StockUbicacion.sku` para que coincida con `ProductoADM.sku`.

---

## 4. Configuración del sistema

### 4.1 Variables de entorno (config.py)

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Conexión MySQL/MariaDB (producción) o SQLite (desarrollo) |
| `ADM_API_BASE` | URL base API ADM Cloud (ej: https://api.admcloud.net/api/) |
| `ADM_EMAIL`, `ADM_PASSWORD` | Credenciales ADM Cloud |
| `ADM_APPID`, `ADM_COMPANY`, `ADM_ROLE` | Parámetros de integración ADM |
| `CRON_TOKEN` | Token secreto para que el cron autentique en `/api/sincronizar/auto/tick` y en los endpoints de sync |
| `SECRET_KEY` | Clave de sesión Flask |
| `DB_USE_NULLPOOL` | Si `true`, usa NullPool para evitar "packet sequence wrong" en cPanel |

### 4.2 .htaccess (Passenger + LiteSpeed)

```apache
PassengerAppRoot /home2/adesa/wms.adesa.com.do
PassengerBaseURI /
PassengerAppType wsgi
PassengerStartupFile passenger_wsgi.py
PassengerMaxRequestTime 600

<IfModule Litespeed>
    RewriteEngine On
    RewriteRule ^api/sincronizar/ubicacion - [E=noabort:1, E=noconntimeout:1]
</IfModule>
```

- **PassengerMaxRequestTime 600:** Máximo 10 minutos por request.
- **noabort / noconntimeout:** Evitar que LiteSpeed mate la sync cuando el cliente (curl) cierra la conexión.

### 4.3 Autenticación para cron

- El cron envía `X-CRON-TOKEN: <valor>` en los headers.
- El endpoint `auto_tick` y los de sync usan `require_admin_or_cron`: permiten acceso si el token coincide con `CRON_TOKEN` o si el usuario es admin.

---

## 5. Automatización vía cron

### 5.1 Script auto_sync.sh

**Ubicación:** `scripts/auto_sync.sh`

**Uso:**
```bash
./auto_sync.sh "https://wms.adesa.com.do" "TU_CRON_TOKEN" [LOG_DIR]
```

**Configuración en cPanel Cron Jobs (cada 5 minutos):**
```
*/5 * * * * /home/USUARIO/scripts/auto_sync.sh "https://wms.adesa.com.do" "TU_TOKEN" >> /home/USUARIO/logs/auto_sync.log 2>&1
```

### 5.2 Flujo del script

1. **Tick (timeout 10s):** `curl -m 10 -X POST /api/sincronizar/auto/tick -H "X-CRON-TOKEN: $TOKEN"`
2. **Parsear respuesta:** `status`, `location_id`, `target` (full|lote)
3. **Si status=ready y location_id presente:** `curl -m 20 -X POST /api/sincronizar/ubicacion/<id>` (o `/lote`)
4. **Log:** Escribe en `logs/auto_sync_YYYYMMDD.log`

### 5.3 Lógica del auto_tick

1. **Validar X-CRON-TOKEN:** Si no coincide o no está configurado → 401/503
2. **Adquirir scheduler_lock:** Evitar que dos ticks procesen a la vez. Si no se puede → `status=busy`
3. **Limpieza de zombies:** Ubicaciones con `status=running` y `last_heartbeat_at` > 15 min sin actualizar → marcar como `error`, `last_error = "Sync detenida (zombie cleanup - sin heartbeat 15 min)"`
4. **¿Hay sync viva?** Si alguna ubicación tiene `running` con heartbeat reciente → `status=busy`
5. **Obtener ubicaciones ADM** y ordenar por prioridad:
   - `partial`/`paused` primero (para continuar)
   - Luego por `last_sync_at` (más antiguas primero)
   - Excluir `error` reciente (cooldown 30 min)
6. **Siguiente candidata:** Devolver `status=ready`, `location_id`, `target` (full o lote)
7. **Si todas listas:** `status=idle`

---

## 6. Inconvenientes con la sync vía cron

### 6.1 Síntomas observados

| Síntoma | Descripción |
|---------|-------------|
| **Sync nunca completa** | Las syncs disparadas por cron no terminan correctamente |
| **Error "zombie cleanup"** | Tras ~15 minutos aparece "Sync detenida (zombie cleanup - sin heartbeat 15 min)" |
| **Progreso 100% pero ERROR** | Algunas ubicaciones muestran "2100 de 2100" o "2200 de 2200" pero estado ERROR |
| **Curl timeout constante** | En todos los logs: `curl: (28) Operation timed out after 20000 milliseconds with 0 bytes received` |
| **Ciclo repetitivo** | ready → disparo → timeout → busy 15 min → zombie cleanup → ready → … |
| **status vacío en tick** | A veces `Tick response: status= location_id=` (vacío) |

### 6.2 Contraste con sync manual

| Aspecto | Sync vía cron | Sync manual (panel) |
|---------|---------------|----------------------|
| Cliente HTTP | curl con timeout 20s | Navegador |
| Comportamiento conexión | Cierra a los 20s | Mantiene hasta respuesta |
| Resultado | Falla, zombie cleanup | Completa correctamente (ej: JUAMER MOTORS 5810/5810) |

### 6.3 Impacto operativo

- Las ubicaciones no se actualizan de forma automática.
- El ciclo ready → busy → zombie → ready se repite sin que ninguna sync termine.
- Se depende de ejecución manual desde el panel para tener datos actualizados.
- Los emails de estado pueden reportar fallos repetidos.

---

## 7. Posibles causas identificadas

### 7.1 Causa principal: abort al desconectar el cliente

**Hipótesis:** LiteSpeed (o el stack web) mata el proceso cuando el cliente cierra la conexión.

**Secuencia:**
1. Cron hace `curl -m 20` a `/api/sincronizar/ubicacion/<id>`
2. A los 20 segundos curl cierra la conexión (timeout)
3. LiteSpeed interpreta que el cliente se desconectó
4. Por defecto, LiteSpeed aborta la petición y envía SIGTERM al proceso
5. El worker de Passenger/Python muere
6. La sync queda a medias: `status=running`, `last_heartbeat_at` congelado
7. 15 minutos después, el tick hace zombie cleanup y marca `error`

**Evidencia:** Documentación LiteSpeed indica que cuando el cliente se desconecta, LSWS aborta el procesamiento. La regla `noabort` está pensada para evitar esto.

### 7.2 noabort no efectivo o no desplegado

**Posibles razones:**
- La regla `noabort` en `.htaccess` no está desplegada en producción
- `IfModule Litespeed` no coincide (ej: el servidor usa Apache puro o otro módulo)
- La directiva no se aplica a las rutas de Passenger/WSGI
- El hosting no permite modificar este comportamiento vía .htaccess

### 7.3 Timeouts del script

| Timeout | Valor | Efecto |
|---------|-------|--------|
| Tick | 10s | Si el servidor tarda más, curl devuelve vacío → `status=` vacío |
| Sync | 20s | Curl cierra la conexión → posible abort del proceso |

### 7.4 Otras posibles causas (secundarias)

- **PassengerMaxRequestTime:** 600 segundos (10 min). Si la sync supera ese tiempo, Passenger podría matarla (menos probable que el abort por desconexión).
- **Límites de memoria o CPU** del hosting que matan procesos largos.
- **Conexiones DB:** Si hay problemas de pool o reconexión, la sync podría fallar antes del swap.

---

## 8. Resumen y recomendaciones

### 8.1 Resumen del módulo

El módulo de sincronización:
- Sincroniza stock por ubicación desde ADM Cloud usando staging (NEW) y swap atómico (LIVE)
- Soporta sync manual y automática vía cron cada 5 minutos
- Usa heartbeat para detectar zombies y caps por ubicación para evitar timeouts
- La sync manual funciona correctamente; la automática vía cron falla de forma sistemática

### 8.2 Resumen de inconvenientes

- Curl cierra a los 20s → servidor mata el proceso
- Zombie cleanup marca como error tras 15 min sin heartbeat
- Ciclo repetitivo sin syncs completadas
- Tick a veces devuelve status vacío por timeout de 10s

### 8.3 Recomendaciones priorizadas

| Prioridad | Acción |
|-----------|--------|
| **Alta** | Verificar que la regla `noabort` en `.htaccess` está desplegada y que LiteSpeed la aplica |
| **Alta** | Si no aplica vía .htaccess, configurar `noabort` en WebAdmin de LiteSpeed para las rutas de sync |
| **Media** | Aumentar timeout del tick de 10s a 30–60s para reducir `status=` vacío |
| **Alternativa** | Implementar sync por CLI en el servidor (script Python que llame a la lógica sin HTTP), evitando el problema de desconexión del cliente |

---

*Documento generado a partir del análisis del código y los logs de auto_sync (Feb 2026).*
