# INSTRUCCIONES DE DESPLIEGUE: Sistema de Staging Cache

**Fecha:** 2026-01-29  
**Versión:** 1.0

---

## ⚠️ IMPORTANTE: HACER RESPALDO ANTES DE DESPLEGAR

1. **Respaldar base de datos:**
   ```bash
   # En cPanel o SSH
   cp database/wms.db database/wms.db.backup_$(date +%Y%m%d_%H%M%S)
   ```

2. **Respaldar archivos modificados:**
   - Todos los archivos en `routes/`
   - `database/models.py`
   - `config.py`
   - `utils/`

---

## PASO 1: CONFIGURAR VARIABLES DE ENTORNO (cPanel)

1. Ir a **Setup Python App** en cPanel
2. Seleccionar la aplicación WMS
3. Ir a **Environment Variables**
4. Agregar las siguientes variables:

```
SMTP_HOST=mail.adesa.com.do
SMTP_PORT=465
SMTP_USER=notificacioneswms@adesa.com.do
SMTP_PASS=<contraseña del email - configurar manualmente>
```

**Nota:** `SMTP_PASS` debe configurarse manualmente, NO va en el código.

---

## PASO 2: CREAR ÍNDICES EN BASE DE DATOS (SQLite)

**IMPORTANTE:** Estamos usando SQLite, por lo que los índices se crean de forma diferente.

### Opción A: Usar el Administrador de Archivos de cPanel + SQLite CLI

1. **Conectar por SSH o usar Terminal en cPanel:**
   ```bash
   cd /home2/adesa/wms.adesa.com.do
   sqlite3 database/wms.db
   ```

2. **Ejecutar los siguientes comandos SQL:**
   ```sql
   -- Índices para StockProductoADM
   CREATE INDEX IF NOT EXISTS idx_stock_producto_run 
   ON stock_productos_adm(producto_id, location_id, sync_run_id);
   
   CREATE INDEX IF NOT EXISTS idx_stock_run_id 
   ON stock_productos_adm(sync_run_id);
   
   CREATE INDEX IF NOT EXISTS idx_stock_location_run 
   ON stock_productos_adm(location_id, sync_run_id);
   
   -- Índices para EnRevision
   CREATE INDEX IF NOT EXISTS idx_en_revision_location 
   ON en_revision(location_id, estado, severidad);
   
   CREATE INDEX IF NOT EXISTS idx_en_revision_sku 
   ON en_revision(sku);
   
   CREATE INDEX IF NOT EXISTS idx_en_revision_fecha 
   ON en_revision(fecha_deteccion DESC);
   
   -- Índices para SyncRun
   CREATE INDEX IF NOT EXISTS idx_sync_run_location_status 
   ON sync_runs(location_id, status, started_at DESC);
   
   -- Verificar que se crearon
   .indexes
   
   -- Salir
   .quit
   ```

### Opción B: Crear script Python temporal

1. **Crear archivo temporal `crear_indices.py` en la raíz del proyecto:**
   ```python
   from app_wms import app
   from database import db
   
   with app.app_context():
       # Crear índices
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_stock_producto_run 
           ON stock_productos_adm(producto_id, location_id, sync_run_id);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_stock_run_id 
           ON stock_productos_adm(sync_run_id);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_stock_location_run 
           ON stock_productos_adm(location_id, sync_run_id);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_en_revision_location 
           ON en_revision(location_id, estado, severidad);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_en_revision_sku 
           ON en_revision(sku);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_en_revision_fecha 
           ON en_revision(fecha_deteccion DESC);
       """)
       
       db.engine.execute("""
           CREATE INDEX IF NOT EXISTS idx_sync_run_location_status 
           ON sync_runs(location_id, status, started_at DESC);
       """)
       
       print("Índices creados exitosamente")
   ```

2. **Ejecutar:**
   ```bash
   cd /home2/adesa/wms.adesa.com.do
   python crear_indices.py
   ```

3. **Eliminar el archivo temporal después:**
   ```bash
   rm crear_indices.py
   ```

### Opción C: Las tablas se crearán automáticamente, índices después

Las tablas `sync_runs` y `en_revision` se crearán automáticamente cuando Flask inicie (por `db.create_all()`).

**Los índices NO se crean automáticamente**, por lo que debes crearlos manualmente usando una de las opciones anteriores.

**Nota:** En SQLite, los índices mejoran significativamente el rendimiento de las consultas, especialmente para:
- Búsquedas por `sync_run_id`
- Filtros en `EnRevision` por `location_id`, `estado`, `severidad`
- Ordenamiento por `fecha_deteccion`

---

## PASO 3: SUBIR ARCHIVOS A cPanel

Subir todos los archivos modificados/creados:

**Archivos nuevos:**
- `utils/email.py`
- `utils/discrepancias.py`
- `utils/limpieza.py`
- `routes/admin.py`

**Archivos modificados:**
- `database/models.py`
- `config.py`
- `utils/helpers.py`
- `routes/sincronizar.py`
- `routes/productos.py`
- `routes/transferencias.py`
- `routes/ajustes.py`
- `routes/__init__.py`
- `app_wms.py`

---

## PASO 4: REINICIAR APLICACIÓN

1. En cPanel → **Setup Python App**
2. Seleccionar la aplicación WMS
3. Hacer clic en **Restart**

---

## PASO 5: VERIFICAR QUE TODO FUNCIONE

### 5.1. Verificar Email
1. Iniciar sesión como administrador
2. Acceder a: `GET /api/test-email`
3. Verificar que llegue el email a `luis.useche@adesa.com.do`
4. Revisar logs si hay errores

### 5.2. Verificar Modelos
1. Verificar que las tablas se crearon:
   - `sync_runs`
   - `en_revision`
2. Verificar que `stock_productos_adm` tiene columna `sync_run_id`
3. Verificar que `sync_locations_status` tiene columnas `current_run_id` y `running_run_id`

### 5.3. Probar Sincronización
1. Sincronizar una ubicación pequeña primero (ej: Mirador Sur)
2. Verificar en logs que se cree `SyncRun`
3. Verificar que los registros tengan `sync_run_id`
4. Verificar que al terminar se actualice `current_run_id`

---

## PASO 6: EJECUTAR SCRIPT DE ÍNDICES (SQLite)

**IMPORTANTE:** Después de reiniciar la aplicación, ejecutar el script para crear los índices.

### Opción A: Usar Terminal en cPanel

1. Ir a **Terminal** en cPanel
2. Ejecutar:
   ```bash
   cd /home2/adesa/wms.adesa.com.do
   python crear_indices.py
   ```
3. Verificar que todos los índices se crearon correctamente
4. Eliminar el script temporal:
   ```bash
   rm crear_indices.py
   ```

### Opción B: Usar SSH (si tienes acceso)

Mismo proceso que la Opción A.

**Nota:** Si no tienes acceso a Terminal/SSH, puedes usar la Opción A del PASO 2 (SQLite CLI) o esperar a que las tablas se creen y luego crear los índices manualmente.

---

## PASO 7: CONFIGURAR CRON JOB (Limpieza Automática)

1. En cPanel → **Cron Jobs**
2. Agregar nuevo cron job:

**Comando:**
```bash
cd /home2/adesa/wms.adesa.com.do && python -c "from app_wms import app; from utils.limpieza import limpiar_runs_antiguos; app.app_context().push(); limpiar_runs_antiguos()"
```

**Frecuencia:** Diaria (una vez al día, por ejemplo a las 2:00 AM)

**Nota:** Ajustar la ruta según la ubicación real del proyecto. El comando incluye el contexto de Flask necesario para acceder a la base de datos.

---

## VERIFICACIÓN POST-DESPLIEGUE

### Checklist:
- [ ] Variables de entorno configuradas en cPanel (✅ Ya hecho)
- [ ] Archivos actualizados en cPanel (✅ Ya hecho)
- [ ] Aplicación reiniciada
- [ ] Script `crear_indices.py` ejecutado (o índices creados manualmente)
- [ ] Email de prueba funciona (`/api/test-email`)
- [ ] Tablas creadas (`sync_runs`, `en_revision`) - Verificar en SQLite
- [ ] Columnas agregadas (`sync_run_id`, `current_run_id`, `running_run_id`) - Verificar en SQLite
- [ ] Índices creados - Verificar con `.indexes` en SQLite CLI
- [ ] Sincronización funciona con staging
- [ ] Swap atómico funciona (NEW → LIVE)
- [ ] Detección de discrepancias funciona
- [ ] Email de discrepancias se envía
- [ ] Endpoints `/api/en-revision` y `/api/sync-runs` funcionan
- [ ] Cron job configurado para limpieza

### Verificar tablas e índices en SQLite:

```bash
cd /home2/adesa/wms.adesa.com.do
sqlite3 database/wms.db

-- Verificar tablas
.tables

-- Verificar estructura de sync_runs
.schema sync_runs

-- Verificar estructura de en_revision
.schema en_revision

-- Verificar índices
.indexes

-- Verificar columnas de stock_productos_adm
.schema stock_productos_adm

-- Verificar columnas de sync_locations_status
.schema sync_locations_status

-- Salir
.quit
```

---

## ROLLBACK (Si algo falla)

1. **Restaurar base de datos:**
   ```bash
   cp database/wms.db.backup_YYYYMMDD_HHMMSS database/wms.db
   ```

2. **Restaurar archivos:**
   - Revertir cambios en Git o restaurar desde backup

3. **Reiniciar aplicación**

---

## NOTAS IMPORTANTES

1. **Migración Gradual:** Los registros sin `sync_run_id` se consideran vigentes (compatibilidad hacia atrás)
2. **Primera Sincronización:** La primera vez que sincronices, no habrá `run_id_anterior`, por lo que no se comparará NEW vs OLD
3. **Limpieza:** Configurar el cron job para evitar crecimiento de BD
4. **Logs:** Revisar logs después del despliegue para detectar errores

---

**Fin de las Instrucciones**

