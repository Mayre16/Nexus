# Plan de implementación: automatización de sincronización en cPanel

**Contexto:** Sin SSH/consola. Solo cPanel + "Execute Python Script". Cron cada 5 min ejecuta `auto_sync.sh` que:
1. Llama al tick (timeout corto) → obtiene `ready` | `busy` | `idle`
2. Si `ready`, hace segundo curl a `/ubicacion/<id>` o `/lote` (timeout 20s) para disparar la sync

**Arquitectura:** El tick NO dispara nada internamente (sin threads, sin requests). Solo decide y responde.

---

## Guía paso a paso cPanel (para quien nunca ha creado un cron)

### Paso 1: Crear carpeta de logs

1. Entrar a **cPanel** → **Files** → **File Manager**
2. Navegar a `/home/TU_USUARIO/` (reemplazar TU_USUARIO por tu usuario de cPanel; aparece arriba a la derecha)
3. Clic en **+ Folder**
4. Nombre: `logs`
5. Crear la carpeta

**Resultado:** `/home/TU_USUARIO/logs/` existe.

### Paso 2: Crear carpeta scripts y subir auto_sync.sh

1. En File Manager, en `/home/TU_USUARIO/`, crear carpeta `scripts`
2. Subir el archivo `scripts/auto_sync.sh` desde tu proyecto (o crearlo manualmente pegando el contenido)
3. Clic derecho en `auto_sync.sh` → **Permissions** (o **Change Permissions**)
4. Marcar **Execute** para Owner (755 o al menos 700)

**Alternativa sin Execute:** Si no puedes dar permisos de ejecución, usa `bash /home/TU_USUARIO/scripts/auto_sync.sh` en el cron.

### Paso 3: Configurar variable CRON_TOKEN

1. **cPanel** → **Software** → **Setup Python App** (o **Application Manager**)
2. Seleccionar tu app WMS
3. En **Environment variables** (Variables de entorno), añadir:
   - Name: `CRON_TOKEN`
   - Value: un token secreto (ej: 32+ caracteres, generado con `openssl rand -hex 32` en tu PC o cualquier string largo)
4. **Save** y **Restart** la aplicación

### Paso 4: Crear el Cron Job

1. **cPanel** → **Advanced** → **Cron Jobs**
2. En **Add New Cron Job**:
   - **Minute:** `*/5` (cada 5 minutos)
   - **Hour:** `*`
   - **Day:** `*`
   - **Month:** `*`
   - **Weekday:** `*`
3. **Command:**
   ```
   /bin/bash /home/TU_USUARIO/scripts/auto_sync.sh "https://wms.adesa.com.do" "TU_TOKEN_AQUI" >> /home/TU_USUARIO/logs/auto_sync.log 2>&1
   ```
   Reemplazar:
   - `TU_USUARIO` por tu usuario cPanel
   - `https://wms.adesa.com.do` por la URL base de tu WMS (sin barra final)
   - `TU_TOKEN_AQUI` por el mismo valor de CRON_TOKEN
4. Clic en **Add New Cron Job**

### Paso 5: Probar manualmente (sin Terminal)

1. En File Manager, ir a `/home/TU_USUARIO/scripts/`
2. Si hay opción **Run** o **Execute** en el script, usarla
3. O crear un Cron Job **temporal** que se ejecute **una sola vez** (Minute: actual+1, Hour: actual) para verificar
4. Revisar `/home/TU_USUARIO/logs/auto_sync.log` o `auto_sync_YYYYMMDD.log` para ver la salida

### Paso 6: Verificar que corre

| Qué revisar | Dónde |
|-------------|-------|
| Log del cron | File Manager → `/home/TU_USUARIO/logs/auto_sync_*.log` |
| Estado en BD | Panel Admin → Sincronización (ubicaciones pasando running → done) |
| Email | Si email_estado_sync está activo, recibes correos al terminar cada sync |

---

## Fase 1: Mínimo viable (tick + cron + lock global + heartbeat)

### 1. Campos/modelos exactos a añadir

#### 1.1 Dónde guardar `last_heartbeat_at`

**Tabla:** `sync_locations_status` (modelo `SyncLocationStatus`)

**Justificación:** El tick comprueba "¿alguna ubicación en running?" usando `SyncLocationStatus`. El heartbeat se actualiza desde los loops de sync (full y lote), que ya modifican `estado_sync` (SyncLocationStatus). Centralizar en esa tabla evita JOINs y mantiene la lógica en un solo modelo.

#### 1.2 Campo(s) exactos

| Tabla | Columna | Tipo | Default | Nullable | Índice |
|-------|---------|------|---------|----------|--------|
| `sync_locations_status` | `last_heartbeat_at` | DATETIME | NULL | YES | NO (no necesario para la lógica) |

**SQL DDL (MySQL):**
```sql
ALTER TABLE sync_locations_status
ADD COLUMN last_heartbeat_at DATETIME NULL
COMMENT 'Último heartbeat durante sync (para detectar zombies)';
```

**SQL DDL (SQLite):**
```sql
ALTER TABLE sync_locations_status ADD COLUMN last_heartbeat_at DATETIME;
```

**SQLAlchemy (añadir a `SyncLocationStatus` en `database/models.py`):**
```python
last_heartbeat_at = db.Column(db.DateTime, nullable=True)  # Heartbeat para detectar runs zombies
```

---

### 2. Diseño del lock global: tabla `scheduler_lock`

#### 2.1 Campos exactos

| Columna | Tipo | Default | Nullable | Descripción |
|---------|------|---------|----------|-------------|
| `id` | INT | - | NO, PK | Siempre 1 (una sola fila) |
| `locked_until` | DATETIME | NULL | YES | Si > now(), el lock está adquirido |
| `locked_by` | VARCHAR(64) | NULL | YES | Identificador (ej: "cron-tick") |
| `updated_at` | DATETIME | now() | NO | Última actualización |

#### 2.2 DDL completo (MySQL)

```sql
CREATE TABLE IF NOT EXISTS scheduler_lock (
    id INT PRIMARY KEY DEFAULT 1,
    locked_until DATETIME NULL,
    locked_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_single_row CHECK (id = 1)
);

INSERT INTO scheduler_lock (id, locked_until, locked_by, updated_at)
SELECT 1, NULL, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM scheduler_lock WHERE id = 1);
```

#### 2.3 DDL (SQLite)

```sql
CREATE TABLE IF NOT EXISTS scheduler_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    locked_until DATETIME,
    locked_by VARCHAR(64),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO scheduler_lock (id, locked_until, locked_by, updated_at) VALUES (1, NULL, NULL, datetime('now'));
```

#### 2.4 Modelo SQLAlchemy

```python
class SchedulerLock(db.Model):
    """Lock global para el tick automático (evitar dos crons simultáneos)"""
    __tablename__ = 'scheduler_lock'
    
    id = db.Column(db.Integer, primary_key=True, default=1)
    locked_until = db.Column(db.DateTime, nullable=True)
    locked_by = db.Column(db.String(64), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

#### 2.5 Lógica "adquirir lock"

**Duración del lock:** 2 minutos (el tick termina en segundos; si hay crash no bloqueamos indefinidamente).

```python
def try_acquire_scheduler_lock():
    """Intenta adquirir el lock. Retorna True si se adquirió, False si ya está tomado."""
    from datetime import datetime, timedelta
    from sqlalchemy import text
    
    now = datetime.utcnow()
    expires = now + timedelta(minutes=2)
    
    # UPDATE condicional: solo si locked_until es NULL o ya expiró
    result = db.session.execute(
        text("""
            UPDATE scheduler_lock 
            SET locked_until = :expires, locked_by = 'cron-tick', updated_at = :now
            WHERE id = 1 AND (locked_until IS NULL OR locked_until < :now)
        """),
        {"expires": expires, "now": now}
    )
    db.session.commit()
    return result.rowcount > 0
```

**Liberar lock (al final del tick, siempre en finally):**
```python
def release_scheduler_lock():
    db.session.execute(
        text("UPDATE scheduler_lock SET locked_until = NULL, locked_by = NULL WHERE id = 1")
    )
    db.session.commit()
```

---

### 3. Token de protección para el endpoint

#### 3.1 Dónde guardar el token

**Opción recomendada (sin migración):** Variable de entorno `CRON_TOKEN`.

En `config.py` (clase `Config`), añadir:
```python
CRON_TOKEN = os.environ.get('CRON_TOKEN')  # Si vacío, el endpoint auto/tick queda deshabilitado
```

**Alternativa con BD:** Añadir columna `cron_token` a `notificaciones_config` o crear tabla `system_config`. Más complejo; recomendamos env var.

#### 3.2 Configurar en cPanel

- **Setup Python App** → Variables de entorno → Añadir `CRON_TOKEN` = valor secreto (ej: 32+ caracteres alfanuméricos).
- Reiniciar la aplicación después de añadir la variable.

#### 3.3 Validación en el endpoint

```python
token = request.headers.get('X-CRON-TOKEN')
expected = current_app.config.get('CRON_TOKEN')
if not expected or token != expected:
    return jsonify({"success": False, "error": "Unauthorized"}), 401
```

---

### 4. Lógica exacta del endpoint `POST /api/sincronizar/auto/tick`

**Orden de operaciones:**

```
1. Validar X-CRON-TOKEN
2. Si no hay CRON_TOKEN configurado → 503 "Auto sync no configurado"
3. try_acquire_scheduler_lock() → si False, return {"status": "busy", "reason": "lock"}
4. try/finally para garantizar release_scheduler_lock()
5. Limpieza zombies: ubicaciones con status='running' Y (last_heartbeat_at NULL Y started_at > 60 min, O last_heartbeat_at < now - 15 min)
   → marcar run como failed, estado_sync.status='error', running_run_id=None, last_error='Zombie cleanup'
6. Check running real: alguna ubicación con status='running' Y heartbeat reciente (last_heartbeat_at >= now - 15 min) O (last_heartbeat_at NULL Y started_at >= now - 15 min)?
   → Si sí: return {"status": "busy", "reason": "sync_in_progress"}
7. Obtener ubicaciones de ADM (adm_client.obtener_ubicaciones)
8. Combinar con estados de BD; ordenar por prioridad: partial primero (ADESA > MIRADOR SUR > resto), luego pending/error (ADESA > MIRADOR SUR > resto)
9. Elegir la primera del orden que no esté "running"
10. Si la elegida tiene status IN ('partial','paused') Y total_items > 0 Y skip_actual < total_items:
       → target = 'lote', url = /api/sincronizar/ubicacion/<id>/lote
    Si no:
       → target = 'full', url = /api/sincronizar/ubicacion/<id>
11. Hacer requests.post(url, timeout=2) — solo para "disparar", timeout 2s para no esperar
    O usar threading.Thread(target=lambda: requests.post(...)).start() y retornar de inmediato
12. return {"status": "started", "location_id": "...", "location_name": "...", "target": "lote"|"full"}
```

**Nota sobre "disparar y no esperar":** El cron hace `curl -m 20` al tick. El tick debe responder rápido. Si el tick hace un `requests.post` interno a su propio servidor (localhost o la URL de la app), ese POST puede tardar muchos minutos. Por eso:

- **Opción A:** El tick NO hace el POST él mismo. En vez de eso, retorna `{"action": "sync", "location_id": "xxx", "target": "lote"}` y el cron ejecuta un segundo curl a esa URL. Así el tick solo decide y responde; el cron dispara.
- **Opción B:** El tick hace `requests.post(..., timeout=2)` y corta a los 2s. La request al servidor ya está en curso y el worker de Passenger la seguirá procesando aunque nosotros soltemos la conexión. Esto funciona si el servidor acepta la conexión antes del timeout.

La opción más limpia: **cron hace 2 curls en secuencia:**
1. `curl -s -m 20 -X POST .../auto/tick` → obtiene JSON
2. Si `status == "started"`, hace `curl -s -m 5 -X POST .../ubicacion/<id>` o `.../ubicacion/<id>/lote` (solo para iniciar, no esperar respuesta larga)

Pero eso requiere que el cron ejecute lógica (parsear JSON, segundo curl). En cron esto es más fácil con un script wrapper.

**Alternativa más simple:** El tick hace internamente el POST a la URL de sync (usando la base URL de la app desde config) con `timeout=3`. Así solo un curl al tick. El tick:
1. Decide la ubicación
2. Lanza en un Thread `requests.post(app_base_url + "/api/sincronizar/ubicacion/" + loc_id, ...)` (o /lote)
3. Retorna inmediatamente `{"status": "started", ...}`

El Thread sigue en el proceso del worker. Si Passenger mantiene el worker vivo hasta que el request hijo termine, funcionaría. Riesgo: algunos hosts matan el proceso cuando el request principal termina. En cPanel/Passenger típicamente el worker sigue vivo para otros requests.

**Recomendación:** Implementar el tick para que haga el POST interno con Thread + return inmediato. Si en producción el POST no se ejecuta, pasar a la opción de dos curls en un script bash.

---

### 5. Pseudocódigo completo del tick

```python
@sincronizar_bp.route('/api/sincronizar/auto/tick', methods=['POST'])
def auto_tick():
    # 1. Token
    token = request.headers.get('X-CRON-TOKEN')
    if not current_app.config.get('CRON_TOKEN'):
        return jsonify({"success": False, "error": "Auto sync no configurado", "status": "disabled"}), 503
    if token != current_app.config['CRON_TOKEN']:
        return jsonify({"success": False, "error": "Unauthorized", "status": "unauthorized"}), 401
    
    lock_acquired = try_acquire_scheduler_lock()
    if not lock_acquired:
        return jsonify({"success": True, "status": "busy", "reason": "lock"}), 200
    
    try:
        # 2. Zombie cleanup
        now = datetime.utcnow()
        zombie_threshold = now - timedelta(minutes=15)
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            is_zombie = False
            if estado.last_heartbeat_at:
                is_zombie = estado.last_heartbeat_at < zombie_threshold
            elif estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at < zombie_threshold:
                    is_zombie = True
            if is_zombie:
                # Cleanup
                if estado.running_run_id:
                    run = SyncRun.query.get(estado.running_run_id)
                    if run:
                        run.status = 'failed'
                        run.finished_at = now
                        run.notas = (run.notas or '') + ' | Zombie cleanup'
                estado.status = 'error'
                estado.last_error = 'Sync detenida (zombie cleanup - sin heartbeat 15 min)'
                estado.running_run_id = None
        db.session.commit()
        
        # 3. Check running real
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            if estado.last_heartbeat_at and estado.last_heartbeat_at >= zombie_threshold:
                return jsonify({"success": True, "status": "busy", "reason": "sync_in_progress"}), 200
            if estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at >= zombie_threshold:
                    return jsonify({"success": True, "status": "busy", "reason": "sync_in_progress"}), 200
        
        # 4. Obtener ubicaciones y ordenar
        adm_client = get_adm_client()
        ub_result = adm_client.obtener_ubicaciones(skip=0, take=100)
        if not ub_result.get("success"):
            return jsonify({"success": False, "error": "ADM no disponible", "status": "error"}), 500
        
        estados = {e.location_id: e for e in SyncLocationStatus.query.all()}
        
        def priority(u):
            loc_name = u.get("Name", "").upper()
            est = estados.get(u.get("ID"))
            st = est.status if est else "pending"
            is_partial = st in ('partial', 'paused')
            is_adesa = loc_name == "ADESA"
            is_mirador = loc_name == "MIRADOR SUR"
            if is_partial:
                return (0, 0 if is_adesa else 1 if is_mirador else 2, loc_name)
            return (1, 0 if is_adesa else 1 if is_mirador else 2, loc_name)
        
        ubicaciones = sorted(ub_result.get("data", []), key=priority)
        
        for ub in ubicaciones:
            loc_id = ub.get("ID")
            loc_name = ub.get("Name", "")
            est = estados.get(loc_id)
            st = est.status if est else "pending"
            if st == "running":
                continue
            # Esta es la siguiente
            if st in ('partial', 'paused') and est and est.total_items > 0 and est.skip_actual < est.total_items:
                target = "lote"
                path = f"/api/sincronizar/ubicacion/{loc_id}/lote"
            else:
                target = "full"
                path = f"/api/sincronizar/ubicacion/{loc_id}"
            
            base_url = request.host_url.rstrip('/')  # o desde config
            url = base_url + path
            
            def _fire():
                try:
                    requests.post(url, headers={"Content-Type": "application/json"}, timeout=3)
                except Exception:
                    pass
            
            import threading
            threading.Thread(target=_fire, daemon=True).start()
            
            return jsonify({
                "success": True,
                "status": "started",
                "location_id": loc_id,
                "location_name": loc_name,
                "target": target
            }), 200
        
        return jsonify({"success": True, "status": "idle", "reason": "all_done"}), 200
    finally:
        release_scheduler_lock()
```

**Problema:** El POST interno requiere autenticación (require_admin). El tick es un endpoint interno; si lo llamamos desde el mismo servidor, no hay sesión. Opciones:
- Crear un bypass para requests con X-CRON-TOKEN a los endpoints de sync cuando vienen de localhost.
- O que el tick retorne la URL y el cron haga el segundo curl con el mismo header X-CRON-TOKEN, y los endpoints de sync acepten ese token como alternativa a session admin.

Recomendación: Crear decorador `require_admin_or_cron` que permita el acceso si:
- `X-CRON-TOKEN` coincide con `CRON_TOKEN` configurado, O
- el usuario tiene sesión admin (`user_rol == 'admin'`).

```python
# En routes/auth.py - añadir (usa request, session, jsonify ya importados; añadir current_app)
from flask import current_app

def require_admin_or_cron(f):
    from functools import wraps
    @wraps(f)
    def wrapped(*args, **kwargs):
        token = request.headers.get('X-CRON-TOKEN')
        cfg = current_app.config.get('CRON_TOKEN')
        if token and cfg and token == cfg:
            return f(*args, **kwargs)
        if 'user_id' not in session or session.get('user_rol') != 'admin':
            return jsonify({"success": False, "error": "Requiere administrador"}), 401
        return f(*args, **kwargs)
    return wrapped
```

Usar `@require_admin_or_cron` en lugar de `@require_admin` en:
- `sincronizar_ubicacion` (POST /api/sincronizar/ubicacion/<id>)
- `sincronizar_lote_ubicacion` (POST /api/sincronizar/ubicacion/<id>/lote)

---

### 6. Heartbeat en los loops de sync

En `sincronizar_ubicacion`, dentro del `while` (después del bloque de actualizar progreso cada 50 items, ~línea 1620):

```python
if total_items_procesados > 0 and total_items_procesados % 50 == 0:
    estado_sync.items_synced = total_items_procesados
    estado_sync.total_items = stock_items_count
    estado_sync.last_heartbeat_at = datetime.utcnow()  # <-- AÑADIR
    ...
```

En `sincronizar_lote_ubicacion`, dentro del `while` (cada N items, similar): añadir `estado_sync.last_heartbeat_at = datetime.utcnow()` en el punto donde se hace commit/update de progreso.

En `contar_productos_ubicacion`, si la cuenta tarda mucho: opcional, cada 500 items podría actualizar heartbeat si usamos el mismo estado. Para Fase 1 no es crítico.

---

## Migración: Execute Python Script (ANTES del cron)

Ejecutar **una sola vez** el script `scripts/migrate_auto_sync.py` para crear `scheduler_lock` y añadir `last_heartbeat_at`.

**Cómo ejecutarlo en cPanel:**
- **Setup Python App** → tu app → **Run script** (si existe) y seleccionar `migrate_auto_sync.py`
- O desde tu app: crear temporalmente una ruta admin que importe y ejecute `main()` del script
- O si tienes acceso a ejecutar Python: desde el directorio del proyecto, `python scripts/migrate_auto_sync.py`

El script es **idempotente**: no rompe si las tablas/columnas ya existen.

---

### Contenido de migrate_auto_sync.py (resumen)

```python
#!/usr/bin/env python3
"""
Script de migración para automatización de sync.
Ejecutar desde cPanel Execute Python Script o: python scripts/migrate_auto_sync.py
"""
import sys
import os

# Asegurar que el directorio del proyecto está en path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    from app_wms import app
    from database import db
    from sqlalchemy import text
    
    with app.app_context():
        print("Iniciando migración para auto-sync...")
        
        # 1. Añadir last_heartbeat_at a sync_locations_status (si no existe)
        try:
            db.session.execute(text("""
                ALTER TABLE sync_locations_status 
                ADD COLUMN last_heartbeat_at DATETIME NULL
            """))
            db.session.commit()
            print("  OK: Columna last_heartbeat_at añadida a sync_locations_status")
        except Exception as e:
            if "Duplicate column" in str(e) or "already exists" in str(e).lower():
                print("  SKIP: last_heartbeat_at ya existe")
                db.session.rollback()
            else:
                db.session.rollback()
                raise
        
        # 2. Crear tabla scheduler_lock
        is_mysql = 'mysql' in str(db.engine.url).lower() or 'mariadb' in str(db.engine.url).lower()
        try:
            if is_mysql:
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS scheduler_lock (
                        id INT PRIMARY KEY DEFAULT 1,
                        locked_until DATETIME NULL,
                        locked_by VARCHAR(64) NULL,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                """))
            else:
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS scheduler_lock (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        locked_until DATETIME,
                        locked_by VARCHAR(64),
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            db.session.commit()
            print("  OK: Tabla scheduler_lock creada")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("  SKIP: scheduler_lock ya existe")
                db.session.rollback()
            else:
                db.session.rollback()
                raise
        
        # 3. Insertar fila inicial en scheduler_lock
        try:
            if is_mysql:
                db.session.execute(text("""
                    INSERT IGNORE INTO scheduler_lock (id, locked_until, locked_by, updated_at)
                    VALUES (1, NULL, NULL, NOW())
                """))
            else:
                db.session.execute(text("""
                    INSERT OR IGNORE INTO scheduler_lock (id, locked_until, locked_by, updated_at)
                    VALUES (1, NULL, NULL, datetime('now'))
                """))
            db.session.commit()
            print("  OK: Fila inicial en scheduler_lock")
        except Exception as e:
            db.session.rollback()
            print("  SKIP o ERROR:", str(e))
        
        print("Migración completada.")
        
        # 4. Validar CRON_TOKEN
        token = os.environ.get('CRON_TOKEN')
        if token:
            print(f"CRON_TOKEN configurado: {token[:8]}...")
        else:
            print("ADVERTENCIA: CRON_TOKEN no configurado. Configúralo en cPanel Variables de entorno.")

if __name__ == '__main__':
    main()
```

**Para SQLite** (desarrollo), sustituir el CREATE TABLE por la versión SQLite del apartado 2.3 y usar `INSERT OR IGNORE`.

---

### Comando Cron (resumen)

Usar el script `auto_sync.sh` que hace tick + segundo curl si status=ready:

```bash
/bin/bash /home/TU_USUARIO/scripts/auto_sync.sh "https://wms.adesa.com.do" "TU_TOKEN" >> /home/TU_USUARIO/logs/auto_sync.log 2>&1
```

---

### Paso 3: Probar sin cron (manualmente)

1. **Desde cPanel:** Si hay **Terminal**, ejecutar:
   ```bash
   curl -s -m 20 -X POST "https://TU_DOMINIO/api/sincronizar/auto/tick" \
     -H "X-CRON-TOKEN: TU_TOKEN"
   ```

2. **Sin Terminal:** Crear una página temporal en la app que haga un fetch a ese endpoint (solo para pruebas, en desarrollo). O usar Postman/Insomnia apuntando a la URL del tick con el header `X-CRON-TOKEN`.

3. **Respuestas esperadas:**
   - `{"status":"busy", "reason":"sync_in_progress"}` si hay una sync en curso
   - `{"status":"started", "location_id":"...", "location_name":"ADESA", "target":"full"}` si disparó una sync
   - `{"status":"idle", "reason":"all_done"}` si todo está al día

---

### Paso 4: Verificar que funciona

| Método | Qué revisar |
|--------|-------------|
| **Log del cron** | `/home/USUARIO/logs/cron_auto_sync.log` — debe tener líneas con JSON cada 5 min |
| **Base de datos** | `sync_locations_status.last_sync_at` y `status` van cambiando |
| **UI Admin** | Sección sincronización: ubicaciones pasan de running a done |
| **Email** | Si `email_estado_sync_activo` está activo, recibes correos al terminar cada sync |

---

### Paso 5: Si el curl se corta (timeout 20s)

- El curl cierra la conexión, pero el proceso del tick en el servidor puede haber empezado o completado.
- La sync que el tick dispara (vía Thread o segundo curl) se ejecuta en el worker; si ya se inició, suele seguir hasta el final.
- En el siguiente cron (5 min), el tick verá `status=running` con heartbeat reciente → `busy`, y no iniciará otra.
- Al terminar la sync, el siguiente tick verá que no hay ninguna en running y elegirá la siguiente ubicación.

---

## Consideraciones (sin consola)

### Migraciones de tablas/columnas

- **Opción 1:** Migración automática al arrancar la app: en `app_wms.py`, dentro del `with app.app_context()`, ejecutar DDL condicional (comprobar si existe la columna antes de ALTER). Añade lógica al arranque.
- **Opción 2 (recomendada):** Script `scripts/migrate_auto_sync.py` ejecutado una vez desde **Execute Python Script** en cPanel. En "Setup Python App" suele haber "Run script" o similar; seleccionar ese script y ejecutarlo. O exponer temporalmente una ruta admin que lo invoque (protegida y solo para setup).

---

## Checklist de seguridad y estabilidad

| Tema | Valor recomendado |
|------|-------------------|
| Heartbeat máximo sin actualizar | 15 min → considerar zombie |
| Condición zombie | `(last_heartbeat_at < now - 15 min) OR (last_heartbeat_at IS NULL AND started_at < now - 15 min)` |
| Backoff/retry | No en Fase 1; si el tick responde busy, el siguiente cron reintentará en 5 min |
| Manual vs automático | Si manual inicia una sync, automático verá `running` y devolverá busy. No hay choque. Regla: el que primero ponga `running` gana |
| Timeout curl cron | `-m 20` segundos |
| Duración lock | 2 minutos |

---

## Fase 2 (opcional): Sync time-bounded

Si Passenger u otro componente corta requests largas (p. ej. 300 s):

1. Añadir parámetro `max_seconds=60` (o `max_requests=20`) al endpoint de sync.
2. Dentro del loop, cada iteración: si `(now - tiempo_inicio).total_seconds() > max_seconds`, hacer `break`, guardar `skip_actual`, `status='partial'`, `running_run_id=None` y responder 200.
3. El siguiente tick verá `partial` y llamará a `/lote` o a un nuevo endpoint "resume from skip" para continuar.

---

## Resumen de archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `database/models.py` | Añadir `last_heartbeat_at` a `SyncLocationStatus`, añadir modelo `SchedulerLock` |
| `config.py` | Añadir `CRON_TOKEN = os.environ.get('CRON_TOKEN')` |
| `routes/sincronizar.py` | Añadir endpoint `/api/sincronizar/auto/tick`, lógica de lock, zombies, prioridad, disparar sync; añadir heartbeat en los loops de sync |
| `scripts/migrate_auto_sync.py` | Crear script de migración (ALTER TABLE, CREATE TABLE) |
| `routes/auth.py` o decorador | Añadir `require_admin_or_cron` para que los endpoints de sync acepten X-CRON-TOKEN cuando aplica |
| cPanel | Variable de entorno `CRON_TOKEN`, cron cada 5 min con curl |

---

## Orden de implementación sugerido

1. Añadir `CRON_TOKEN` en `config.py`.
2. Crear `scripts/migrate_auto_sync.py` y ejecutarlo una vez.
3. Añadir `last_heartbeat_at` a `SyncLocationStatus` y `SchedulerLock` al modelo.
4. Implementar el endpoint `POST /api/sincronizar/auto/tick`.
5. Añadir heartbeat en los loops de sync (full y lote).
6. Añadir bypass para X-CRON-TOKEN en los endpoints de sync (o decorador).
7. Configurar `CRON_TOKEN` en cPanel.
8. Crear el cron job.
9. Probar manualmente el tick y luego observar logs y BD durante unas horas.
