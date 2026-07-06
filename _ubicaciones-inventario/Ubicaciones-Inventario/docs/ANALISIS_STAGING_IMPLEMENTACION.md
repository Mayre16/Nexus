# Análisis de Implementación Staging Cache / Runs

## A) CONFIRMACIÓN DE IMPLEMENTACIÓN

### DB / Modelos

**¿Agregaste sync_run_id a StockProductoADM?** ✅ **SÍ**

```python
# database/models.py línea 235
sync_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True, index=True)
```

**¿Creaste SyncRun?** ✅ **SÍ**

```python
# database/models.py línea 473-502
class SyncRun(db.Model):
    """Registro de cada ejecución de sincronización (staging)"""
    __tablename__ = 'sync_runs'
    
    run_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='running', nullable=False, index=True)
    # ... más campos
```

**¿Agregaste SyncLocationStatus.current_run_id y running_run_id?** ✅ **SÍ**

```python
# database/models.py línea 272-273
current_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True)  # LIVE
running_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True)  # Run en ejecución
```

**¿Creaste EnRevision?** ✅ **SÍ**

```python
# database/models.py línea 528-557
class EnRevision(db.Model):
    """SKUs que requieren revisión después de sincronización"""
    __tablename__ = 'en_revision'
    # ... campos completos
```

**¿Aplicaste índices/unique constraint?** ✅ **SÍ**

```python
# database/models.py línea 239
__table_args__ = (db.UniqueConstraint('producto_id', 'location_id', 'sync_run_id', name='uq_producto_location_run_adm'),)

# sync_run_id tiene índice (línea 235)
# location_id tiene índice en SyncRun (línea 478)
# status tiene índice en SyncRun (línea 481)
```

**SQL/Migration aplicado:**
- Se usó `migrar_tablas.py` para agregar columnas a tablas existentes (SQLite)
- Se migró a MySQL con `migrar_sqlite_a_mysql_simple.py`
- Se crearon índices con `crear_indices.py`

### Helper obligatorio

**¿Creaste obtener_stock_vigente() y lo usas en operaciones?** ✅ **SÍ**

```python
# utils/helpers.py línea 346-379
def obtener_stock_vigente(producto_id: int, location_id: str):
    """
    ÚNICA función para obtener stock vigente (LIVE) en operaciones.
    SIEMPRE retorna stock del current_run_id (LIVE).
    """
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    if not estado_sync or not estado_sync.current_run_id:
        # Fallback: registros sin sync_run_id (migración gradual)
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=None
        ).first()
    
    # SIEMPRE LIVE (current_run_id)
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=estado_sync.current_run_id
    ).first()
```

**Archivos donde se usa:**
- ✅ `routes/ajustes.py` (líneas 353, 356, 362, 556, 565)
- ✅ `routes/transferencias.py` (líneas 551, 554, 587, 588, 670, 671)
- ✅ `routes/productos.py` (líneas 121, 132)

**¿Dejaste algún endpoint consultando StockProductoADM directo sin sync_run_id?** ⚠️ **SÍ - PROBLEMA DETECTADO**

```python
# routes/ajustes.py línea 571-574
stock_ubicaciones_adm = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    sync_run_id=None  # ⚠️ PROBLEMA: Consulta directa sin usar helper
).all()
```

**Este es un problema crítico:** Esta query busca registros con `sync_run_id=None` (legacy) en lugar de usar `obtener_stock_vigente()`.

### Flujo de sync / staging

**¿running_run_id se setea al iniciar sync y se limpia al final?** ✅ **SÍ**

```python
# routes/sincronizar.py línea 1193
estado_sync.running_run_id = nuevo_run.run_id  # Al iniciar

# línea 1885 (swap exitoso)
estado_sync.running_run_id = None

# línea 1894 (sync parcial)
estado_sync.running_run_id = None

# línea 1910 (error)
estado_sync.running_run_id = None
```

**¿current_run_id solo cambia en el swap atómico?** ✅ **SÍ**

```python
# routes/sincronizar.py línea 1884
if sync_completa:
    # Transacción atómica: NEW → LIVE
    estado_sync.current_run_id = nuevo_run.run_id  # NEW → LIVE
    estado_sync.running_run_id = None
    estado_sync.status = 'done'
    estado_sync.last_sync_at = datetime.utcnow()
    if not db_commit_with_retry(max_retries=5, retry_delay=0.5):
        raise Exception("Error al hacer commit del swap atómico después de reintentos")
```

**¿Swap protegido por status='done'?** ✅ **SÍ**

El swap solo ocurre si `sync_completa == True`, y luego se marca `status='done'`.

### Operaciones (transferencias / ajustes / actualizaciones)

**En ajustes/transferencias: ¿se valida con LIVE (current_run_id) siempre?** ✅ **SÍ** (en la mayoría de casos)

- ✅ `routes/transferencias.py`: Usa `obtener_stock_vigente()` (líneas 554, 588, 671)
- ✅ `routes/ajustes.py`: Usa `obtener_stock_vigente()` (líneas 356, 362, 565)
- ⚠️ **EXCEPCIÓN:** `routes/ajustes.py` línea 571 tiene query directa con `sync_run_id=None`

**¿Las operaciones modifican StockProductoADM o solo StockUbicacion + Movimiento?**

**ADESA:** ✅ Solo `StockUbicacion` (no modifica `StockProductoADM`)

```python
# routes/transferencias.py línea 563
# Restar stock de origen
stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - cantidad_origen
# No toca StockProductoADM
```

**NO-ADESA:** ⚠️ **SÍ modifica StockProductoADM temporalmente**

```python
# routes/transferencias.py línea 591-595
if stock_adm_origen:
    stock_anterior = float(stock_adm_origen.stock) if stock_adm_origen.stock else 0.0
    stock_nuevo = max(0.0, stock_anterior - cantidad_total)
    stock_adm_origen.stock = stock_nuevo  # ⚠️ Modifica LIVE directamente
    stock_adm_origen.updated_at = datetime.utcnow()
```

**PROBLEMA:** Esto modifica el registro LIVE, que será sobrescrito en la próxima sync. Esto puede causar inconsistencias.

### EnRevision / discrepancias

**¿Se está creando EnRevision en sync post-validación?** ✅ **SÍ**

```python
# routes/sincronizar.py línea 1809
poblar_en_revision(discrepancias_detectadas, nuevo_run.run_id, location_id, location_name)
```

**¿Se está limitando a top N para evitar timeout?** ✅ **SÍ**

```python
# routes/sincronizar.py línea 1803-1807
top_discrepancias = sorted(
    discrepancias_detectadas,
    key=lambda x: {'critica': 4, 'alta': 3, 'media': 2, 'baja': 1}.get(x.get('severidad', 'media'), 1),
    reverse=True
)[:50]  # Top 50
```

### Email

**¿Activaste email ya o quedó pendiente?** ✅ **SÍ - Activado**

```python
# routes/sincronizar.py línea 1846
if config_notif.email_estado_sync_activo:
    enviar_estado_sincronizacion(...)
```

**¿Dónde se guardó SMTP?** ✅ **Variables de entorno**

```python
# utils/email.py línea 16-19
SMTP_HOST = os.getenv('SMTP_HOST', 'mail.adesa.com.do')
SMTP_PORT = int(os.getenv('SMTP_PORT', '465'))
SMTP_USER = os.getenv('SMTP_USER', 'notificacioneswms@adesa.com.do')
SMTP_PASS = os.getenv('SMTP_PASS', '')  # DEBE estar en cPanel
```

---

## B) PROBLEMAS IDENTIFICADOS

### Problema 1: Query directa sin helper en ajustes.py

**Acción exacta:** Consultar stock de producto en múltiples ubicaciones ADM

**Pantalla/endpoint:** `routes/ajustes.py` - función que lista ubicaciones ADM con stock

**Mensaje de error:** No hay error visible, pero puede retornar datos incorrectos (legacy en lugar de LIVE)

**Error real del backend:** No hay excepción, pero la lógica es incorrecta:

```python
# routes/ajustes.py línea 571-574
stock_ubicaciones_adm = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    sync_run_id=None  # ⚠️ Busca registros legacy, no LIVE
).all()
```

**Request que falló:** GET `/api/ajustes/producto/{id}` o similar

**Frecuencia:** Siempre que se consulte stock de un producto en múltiples ubicaciones

**Fix propuesto:**
```python
# Reemplazar con:
from utils.helpers import obtener_stock_vigente
# O iterar sobre ubicaciones y usar obtener_stock_vigente() para cada una
```

### Problema 2: Modificación directa de StockProductoADM LIVE en transferencias NO-ADESA

**Acción exacta:** Transferencia desde ubicación NO-ADESA

**Pantalla/endpoint:** `routes/transferencias.py` - POST `/api/transferencias/crear`

**Mensaje de error:** No hay error inmediato, pero causa inconsistencia

**Error real del backend:** No hay excepción, pero modifica LIVE que será sobrescrito:

```python
# routes/transferencias.py línea 591-595
if stock_adm_origen:
    stock_adm_origen.stock = stock_nuevo  # ⚠️ Modifica LIVE directamente
    stock_adm_origen.updated_at = datetime.utcnow()
```

**Request que falló:** POST `/api/transferencias/crear` con origen NO-ADESA

**Frecuencia:** Siempre que se transfiera desde NO-ADESA

**Fix propuesto:**
- Opción A: NO modificar `StockProductoADM` para NO-ADESA (solo `StockUbicacion`)
- Opción B: Crear un registro temporal con `sync_run_id=None` que se limpie después
- Opción C: Marcar el registro como "modificado localmente" y no sobrescribirlo en la próxima sync

### Problema 3: Fallback a sync_run_id=None puede retornar datos legacy

**Acción exacta:** Cualquier operación que use `obtener_stock_vigente()` cuando `current_run_id` es None

**Pantalla/endpoint:** Cualquier operación de transferencia/ajuste cuando la ubicación no tiene `current_run_id`

**Mensaje de error:** Puede retornar stock incorrecto (legacy)

**Error real del backend:** Lógica de fallback:

```python
# utils/helpers.py línea 365-372
if not estado_sync or not estado_sync.current_run_id:
    # Fallback: registros sin sync_run_id (migración gradual)
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=None  # ⚠️ Puede retornar datos legacy/duplicados
    ).first()
```

**Request que falló:** Cualquier operación cuando `current_run_id` es None

**Frecuencia:** Ubicaciones que no han completado una sync exitosa después de la migración

**Fix propuesto:**
- Validar que solo haya UN registro con `sync_run_id=None` por producto/location
- O retornar None y manejar el caso en el código que llama

---

## C) ¿QUÉ CAMBIÓ?

### Endpoints modificados:

1. ✅ `routes/sincronizar.py` - Lógica completa de staging
2. ✅ `routes/transferencias.py` - Usa `obtener_stock_vigente()` (pero modifica LIVE para NO-ADESA)
3. ✅ `routes/ajustes.py` - Usa `obtener_stock_vigente()` (pero tiene query directa en línea 571)
4. ✅ `routes/productos.py` - Usa `obtener_stock_vigente()`
5. ✅ `utils/helpers.py` - Nuevo helper `obtener_stock_vigente()`
6. ✅ `database/models.py` - Nuevos modelos y campos

### Migraciones ejecutadas:

1. `migrar_tablas.py` - Agregó columnas a SQLite
2. `crear_indices.py` - Creó índices
3. `migrar_sqlite_a_mysql_simple.py` - Migración a MySQL
4. `corregir_registros_sin_run_id.py` - Limpió registros legacy

### Cambios en transacciones/commit/rollback:

- ✅ Se agregó `db_commit_with_retry()` y `db_query_with_retry()` para manejar errores de MySQL
- ✅ El swap atómico usa `db_commit_with_retry()` con 5 reintentos

### Crecimiento de tabla StockProductoADM:

- ⚠️ **SÍ:** Ahora hay múltiples registros por producto/location (uno por run)
- Esto puede causar lentitud si no se limpian runs antiguos
- Se implementó limpieza agresiva (últimos 3 runs + runs >7 días)

---

## D) HIPÓTESIS - CONFIRMACIÓN

**¿Hay errores por unique constraint (duplicados por run)?** ✅ **SÍ - RESUELTO**

- Se agregó manejo de `IntegrityError` para duplicados
- Se eliminan registros legacy antes de crear nuevos

**¿Hay errores por sync_run_id NULL mezclando datos legacy?** ⚠️ **SÍ - PARCIALMENTE**

- El fallback en `obtener_stock_vigente()` puede retornar legacy
- La query directa en `ajustes.py` línea 571 busca legacy explícitamente

**¿Hay errores por consultas sin índice (slow query / timeout)?** ✅ **NO**

- Todos los campos críticos tienen índices

**¿running_run_id quedó zombie y está bloqueando operaciones?** ✅ **NO**

- Se limpia correctamente en todos los casos (éxito, parcial, error)

**¿Los ajustes ahora intentan leer NEW o OLD por error?** ✅ **NO**

- Usan `obtener_stock_vigente()` que siempre lee LIVE
- EXCEPTO: la query directa en línea 571

---

## E) ENTREGABLE MÍNIMO

### Lista "Implementado / No Implementado"

✅ **Implementado:**
- sync_run_id en StockProductoADM
- SyncRun model
- current_run_id y running_run_id
- EnRevision model
- Índices y unique constraints
- obtener_stock_vigente() helper
- Swap atómico
- Email de notificaciones
- Limpieza de runs antiguos

⚠️ **Parcialmente implementado:**
- Uso de obtener_stock_vigente() (hay 1 query directa en ajustes.py)

❌ **No implementado correctamente:**
- Modificación de StockProductoADM para NO-ADESA (debería ser solo StockUbicacion)

### Top 3 errores reales

**Error 1: Query directa sin helper en ajustes.py línea 571**
- **Stack trace:** No hay excepción, pero lógica incorrecta
- **Fix:** Reemplazar con iteración usando `obtener_stock_vigente()`

**Error 2: Modificación de StockProductoADM LIVE en transferencias NO-ADESA**
- **Stack trace:** No hay excepción, pero causa inconsistencia
- **Fix:** NO modificar StockProductoADM para NO-ADESA, solo StockUbicacion

**Error 3: Fallback a sync_run_id=None puede retornar datos legacy**
- **Stack trace:** No hay excepción, pero puede retornar datos incorrectos
- **Fix:** Validar unicidad o retornar None y manejar en el código llamador

### Plan corto: Qué revertir / qué parchear primero

**PRIORIDAD 1 (Crítico - Parchear inmediatamente):**

1. **Fix query directa en ajustes.py línea 571:**
```python
# Reemplazar:
stock_ubicaciones_adm = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    sync_run_id=None
).all()

# Con:
from utils.helpers import obtener_stock_vigente
# Obtener todas las ubicaciones ADM y usar obtener_stock_vigente() para cada una
```

2. **Fix modificación de StockProductoADM en transferencias NO-ADESA:**
```python
# routes/transferencias.py línea 591-595
# ELIMINAR la modificación de stock_adm_origen.stock
# Solo modificar StockUbicacion
```

**PRIORIDAD 2 (Importante - Parchear pronto):**

3. **Mejorar fallback en obtener_stock_vigente():**
```python
# Validar que solo haya UN registro con sync_run_id=None
# O retornar None y manejar en el código llamador
```

**PRIORIDAD 3 (Revisar - No crítico):**

4. Revisar si hay más queries directas a StockProductoADM sin helper
5. Verificar que todas las operaciones usen obtener_stock_vigente()

---

## F) ARCHIVOS A MODIFICAR

1. `routes/ajustes.py` - Línea 571: Reemplazar query directa
2. `routes/transferencias.py` - Línea 591-595: Eliminar modificación de StockProductoADM para NO-ADESA
3. `utils/helpers.py` - Línea 365-372: Mejorar fallback de obtener_stock_vigente()


