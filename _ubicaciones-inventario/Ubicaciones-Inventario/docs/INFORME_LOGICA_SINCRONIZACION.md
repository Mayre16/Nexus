# INFORME TÉCNICO: LÓGICA DE SINCRONIZACIÓN - ANÁLISIS COMPLETO

**Fecha:** 30 de Enero, 2026  
**Sistema:** WMS - Sincronización con ADM Cloud  
**Ubicación:** ADESA y otras ubicaciones

---

## 1. RESUMEN EJECUTIVO

El sistema de sincronización implementa un **sistema de staging cache** que permite cargar datos en un área temporal (NEW), validarlos, y luego hacer un "swap atómico" para convertirlos en datos en vivo (LIVE). Este diseño previene inconsistencias durante la sincronización, pero presenta **riesgos de timeout** debido a operaciones simultáneas de limpieza y escritura en la base de datos.

### Problema Identificado

El error `(2013, 'Lost connection to MySQL server during query')` ocurre durante operaciones DELETE dentro del loop de sincronización, causado por:

1. **Limpieza masiva inicial** que puede bloquear la tabla
2. **DELETEs redundantes** dentro del loop de procesamiento
3. **Operaciones simultáneas** de lectura, escritura y eliminación
4. **Timeouts de MySQL** (30 segundos) que se exceden con operaciones largas

---

## 2. ARQUITECTURA DEL SISTEMA DE STAGING

### 2.1 Concepto de Staging Cache

El sistema utiliza un patrón de **staging cache** con dos estados:

- **LIVE (current_run_id):** Datos actuales que usa la aplicación
- **NEW (running_run_id):** Datos nuevos que se están cargando

```
┌─────────────────────────────────────────────────────────┐
│                    ESTADO INICIAL                       │
│  LIVE: run_id=15 (datos actuales en uso)                │
│  NEW:  run_id=16 (en proceso de carga)                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              PROCESO DE SINCRONIZACIÓN                  │
│  1. Crear nuevo SyncRun (run_id=16)                     │
│  2. Limpiar registros antiguos                           │
│  3. Cargar datos en NEW (sync_run_id=16)                │
│  4. Validar discrepancias                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              SWAP ATÓMICO (si exitoso)                  │
│  LIVE: run_id=16 (nuevos datos activos)                 │
│  OLD:  run_id=15 (datos antiguos, se pueden limpiar)     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Modelos de Datos Clave

#### `SyncRun`
Registra cada ejecución de sincronización:
- `run_id`: Identificador único del run
- `location_id`: Ubicación sincronizada
- `status`: `running`, `done`, `partial`, `failed`
- `started_at`, `finished_at`: Timestamps
- `items_synced`, `total_items`: Contadores

#### `SyncLocationStatus`
Estado de sincronización por ubicación:
- `current_run_id`: Run que está LIVE (datos activos)
- `running_run_id`: Run que se está ejecutando (NEW)
- `status`: `pending`, `running`, `done`, `partial`, `error`, `paused`

#### `StockProductoADM`
Stock de productos con staging:
- `producto_id`: FK a ProductoADM
- `location_id`: Ubicación
- `sync_run_id`: FK a SyncRun (NULL = legacy, sin staging)
- `stock`: Cantidad
- **UniqueConstraint:** `(producto_id, location_id, sync_run_id)`

---

## 3. FLUJO COMPLETO DE SINCRONIZACIÓN

### 3.1 Fase 1: Inicialización y Preparación

**Líneas 1116-1201**

```python
# 1. Verificar si hay sync en curso
if estado_sync.status == 'running' and estado_sync.running_run_id:
    # Rechazar si hay sync activa (< 1 hora)
    return error 409

# 2. Crear nuevo SyncRun
nuevo_run = SyncRun(
    location_id=location_id,
    status='running',
    started_at=datetime.utcnow(),
    previous_run_id=run_id_anterior  # OLD
)
db.session.add(nuevo_run)
db.session.flush()  # Obtener run_id

# 3. Actualizar estado
estado_sync.running_run_id = nuevo_run.run_id  # NEW
estado_sync.status = 'running'
db.session.commit()
```

**¿Por qué?**
- Previene sincronizaciones concurrentes
- Crea el contexto del nuevo run antes de procesar datos
- Marca el run como "running" para tracking

**Riesgos de Timeout:**
- ⚠️ **BAJO:** Operaciones simples de INSERT y UPDATE

---

### 3.2 Fase 2: Limpieza Masiva Inicial ⚠️ **ALTO RIESGO**

**Líneas 1205-1214**

```python
# ✅ STAGING: Limpiar registros legacy (sin sync_run_id) de esta ubicación
registros_legacy_eliminados = StockProductoADM.query.filter(
    StockProductoADM.location_id == location_id,
    StockProductoADM.sync_run_id != nuevo_run.run_id  # Eliminar todos excepto el run actual
).delete()

if registros_legacy_eliminados > 0:
    logger.info(f"Eliminados {registros_legacy_eliminados} registros legacy...")
    db.session.commit()
```

**¿Qué hace?**
- Elimina **TODOS** los registros de `StockProductoADM` para esta ubicación que **NO** pertenecen al nuevo run
- Esto incluye:
  - Registros legacy (sin `sync_run_id`)
  - Registros de runs anteriores (OLD)

**¿Por qué?**
- Evita conflictos con el `UniqueConstraint (producto_id, location_id, sync_run_id)`
- Limpia datos antiguos antes de cargar nuevos
- Prepara un "espacio limpio" para el nuevo run

**Riesgos de Timeout:**
- ⚠️ **MUY ALTO:** 
  - Para ADESA con ~40,000 items, puede eliminar decenas de miles de registros
  - Operación bloqueante que puede tardar **varios segundos o minutos**
  - Si hay índices, MySQL debe actualizarlos
  - Puede bloquear la tabla para otras operaciones

**Ejemplo de Impacto:**
```
ADESA tiene ~40,000 productos
Si hay 2 runs anteriores (OLD) = ~80,000 registros a eliminar
DELETE masivo puede tardar 10-30+ segundos
MySQL timeout = 30 segundos → ❌ TIMEOUT
```

---

### 3.3 Fase 3: Obtención de Datos desde ADM Cloud

**Líneas 1242-1630**

```python
# Configuración de caps por ubicación
CAPS_POR_UBICACION = {
    "ADESA": {
        "max_requests": 800,      # ~40,000 items (800 * 50)
        "max_minutos": 25,
        "max_items_procesados": 50000
    }
}

# Loop de paginación
while skip < max_items and not se_alcanzo_cap:
    # Verificar caps (requests, tiempo, items)
    if requests_realizados >= caps["max_requests"]:
        se_alcanzo_cap = True
        break
    
    # Obtener lote de 50 items desde ADM Cloud
    stock_result = adm_client.obtener_stock(
        location_id=location_id,
        skip=skip,
        take=50,
        show_no_stock=True  # Incluir items con stock=0
    )
    
    items_stock = stock_result.get("data", [])
    
    # Procesar cada item...
    for item in items_stock:
        # ... procesamiento individual ...
    
    skip += 50
```

**¿Qué hace?**
- Obtiene datos de stock desde ADM Cloud en lotes de 50 items
- Respeta límites de seguridad (caps) para evitar timeouts
- Procesa items con stock > 0 y stock = 0 (si `ShowNoStock=true`)

**¿Por qué?**
- ADM Cloud limita a 50 items por request
- Los caps previenen sincronizaciones infinitas
- `ShowNoStock=true` permite detectar productos que desaparecieron

**Riesgos de Timeout:**
- ⚠️ **BAJO:** Operaciones de red, no de BD

---

### 3.4 Fase 4: Procesamiento Individual de Items ⚠️ **ALTO RIESGO**

**Líneas 1309-1595**

Para cada item recibido desde ADM Cloud:

#### 4.1 Items con Stock > 0

**Líneas 1358-1468**

```python
if stock > 0 and item_id:
    # 1. Buscar o crear ProductoADM
    producto = db_query_with_retry(
        lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
        max_retries=3
    )
    
    if not producto:
        # Crear nuevo producto
        producto = ProductoADM(item_id=item_id, sku=item_sku, ...)
        db.session.add(producto)
        db.session.flush()
    
    # 2. Buscar stock en NEW (sync_run_id = nuevo_run.run_id)
    stock_obj = db_query_with_retry(
        lambda: StockProductoADM.query.filter_by(
            producto_id=producto.id,
            location_id=location_id,
            sync_run_id=nuevo_run.run_id  # NEW
        ).first(),
        max_retries=3
    )
    
    if stock_obj:
        # Actualizar existente
        stock_obj.stock = stock
    else:
        # ⚠️ PROBLEMA: DELETE redundante aquí
        StockProductoADM.query.filter_by(
            producto_id=producto.id,
            location_id=location_id
        ).filter(
            StockProductoADM.sync_run_id != nuevo_run.run_id
        ).delete()  # ❌ REDUNDANTE - ya se limpió al inicio
        
        # Crear nuevo registro
        stock_obj = StockProductoADM(
            producto_id=producto.id,
            location_id=location_id,
            stock=stock,
            sync_run_id=nuevo_run.run_id  # NEW
        )
        db.session.add(stock_obj)
```

**¿Qué hace?**
- Busca o crea el producto en `ProductoADM`
- Busca o crea el registro de stock en `StockProductoADM` con `sync_run_id = nuevo_run.run_id`
- Si no existe, hace un DELETE antes de crear (líneas 1451-1456)

**¿Por qué el DELETE?**
- **Teóricamente:** Evita conflictos con el `UniqueConstraint`
- **Realidad:** Es **REDUNDANTE** porque ya se hizo limpieza masiva al inicio

**Riesgos de Timeout:**
- ⚠️ **MUY ALTO:**
  - **DELETE individual por cada item nuevo** (líneas 1451-1456)
  - Para 40,000 items = 40,000 DELETEs individuales
  - Cada DELETE puede tardar milisegundos, pero acumulado = **varios minutos**
  - Si la limpieza masiva inicial aún está ejecutándose, puede haber **bloqueos de tabla**
  - **Operaciones simultáneas:**
    - DELETE masivo inicial (puede estar ejecutándose)
    - DELETEs individuales en el loop
    - INSERTs de nuevos registros
    - Commits periódicos

#### 4.2 Items con Stock = 0

**Líneas 1469-1593**

Mismo proceso que items con stock > 0, pero con `stock=0.0`. También tiene el DELETE redundante (líneas 1576-1581).

---

### 3.5 Fase 5: Commits Periódicos

**Líneas 1597-1616**

```python
# Actualizar progreso cada 50 items
if total_items_procesados % 50 == 0:
    estado_sync.items_synced = total_items_procesados
    estado_sync.total_items = stock_items_count
    db_commit_with_retry(max_retries=3, retry_delay=0.3)

# Commit de datos cada 200 items
if total_items_procesados % 200 == 0:
    db_commit_with_retry(max_retries=3, retry_delay=0.3)
```

**¿Qué hace?**
- Actualiza el progreso en BD cada 50 items (para polling del frontend)
- Hace commit de datos cada 200 items (para no perder datos si hay error)

**¿Por qué?**
- Balance entre frecuencia de commits y rendimiento
- Permite que el frontend vea progreso en tiempo real

**Riesgos de Timeout:**
- ⚠️ **MEDIO:**
  - Commits cada 200 items pueden acumular transacciones grandes
  - Si hay DELETEs pendientes, el commit puede tardar
  - `db_commit_with_retry` tiene retry, pero si el timeout es muy largo, puede fallar

---

### 3.6 Fase 6: Detección de Productos Desaparecidos

**Líneas 1646-1758**

```python
if sync_completa:
    # Buscar productos que tenían stock > 0 en OLD pero NO están en NEW
    stock_existentes = StockProductoADM.query.join(ProductoADM).filter(
        StockProductoADM.location_id == location_id,
        StockProductoADM.sync_run_id == run_id_anterior,  # OLD
        StockProductoADM.stock > 0
    ).all()
    
    for stock_existente in stock_existentes:
        if stock_existente.producto.item_id not in item_ids_en_sync:
            # Producto desapareció → crear registro con stock=0 en NEW
            stock_new = StockProductoADM(
                producto_id=producto_existente.producto_id,
                location_id=location_id,
                stock=0.0,
                sync_run_id=nuevo_run.run_id  # NEW
            )
            db.session.add(stock_new)
```

**¿Qué hace?**
- Compara productos en OLD vs NEW
- Si un producto tenía stock > 0 en OLD pero no viene en la sync actual → stock = 0 en NEW
- Crea discrepancias si hay stock físico en WMS pero stock ADM = 0

**¿Por qué?**
- Detecta productos que desaparecieron del catálogo ADM
- Mantiene consistencia entre OLD y NEW

**Riesgos de Timeout:**
- ⚠️ **MEDIO:**
  - Query JOIN puede ser costosa si hay muchos productos
  - Loop sobre `stock_existentes` puede ser largo

---

### 3.7 Fase 7: Validación y Detección de Discrepancias

**Líneas 1787-1821**

```python
# Validar cambios NEW vs OLD
discrepancias_detectadas = validar_cambios_new_vs_old(
    nuevo_run.run_id,      # NEW
    run_id_anterior,       # OLD
    location_id,
    location_name
)

# Validar ADM vs Físico (solo ADESA)
if "ADESA" in location_name.upper():
    discrepancias_fisico = validar_adm_vs_fisico(
        nuevo_run.run_id,
        location_id,
        location_name
    )

# Poblar EnRevision con top 50 discrepancias
poblar_en_revision(discrepancias_detectadas, ...)

# Enviar email de discrepancias (si está activo)
if config_notif.email_discrepancias_activo:
    enviar_resumen_discrepancias(...)
```

**¿Qué hace?**
- Compara stock entre NEW y OLD para detectar cambios significativos
- Compara stock ADM vs stock físico WMS (solo ADESA)
- Crea registros en `EnRevision` para revisión manual
- Envía email con resumen de discrepancias

**Riesgos de Timeout:**
- ⚠️ **BAJO-MEDIO:**
  - Queries de comparación pueden ser costosas
  - Envío de email es asíncrono (no bloquea)

---

### 3.8 Fase 8: Swap Atómico (NEW → LIVE)

**Líneas 1880-1917**

```python
if sync_completa:
    # Transacción atómica: NEW → LIVE
    estado_sync.current_run_id = nuevo_run.run_id  # NEW → LIVE
    estado_sync.running_run_id = None
    estado_sync.status = 'done'
    estado_sync.last_sync_at = datetime.utcnow()
    
    if not db_commit_with_retry(max_retries=5, retry_delay=0.5):
        raise Exception("Error al hacer commit del swap atómico")
    
    logger.info(f"Swap completado: run_id={nuevo_run.run_id} ahora es LIVE")
else:
    # Sync parcial: NO hacer swap
    estado_sync.status = 'partial'
    estado_sync.running_run_id = None
    estado_sync.skip_actual = skip  # Checkpoint
    db_commit_with_retry(max_retries=5, retry_delay=0.5)
```

**¿Qué hace?**
- Si la sync fue completa: cambia `current_run_id` de OLD a NEW (swap atómico)
- Si la sync fue parcial: mantiene OLD como LIVE, guarda checkpoint para continuar después

**¿Por qué?**
- El swap atómico asegura que el cambio de LIVE es instantáneo
- No hay período donde los datos estén inconsistentes
- Si la sync fue parcial, no se activan datos incompletos

**Riesgos de Timeout:**
- ⚠️ **BAJO:** Operación simple de UPDATE

---

## 4. ANÁLISIS DE PROCESOS SIMULTÁNEOS Y RIESGOS DE TIMEOUT

### 4.1 Operaciones Simultáneas Identificadas

#### Escenario 1: Limpieza Masiva + Loop de Procesamiento

```
Tiempo 0s:  DELETE masivo inicia (elimina ~40,000 registros)
            ↓ (puede tardar 10-30+ segundos)
Tiempo 5s:  Loop de procesamiento inicia
            ↓
Tiempo 10s: DELETE masivo aún ejecutándose
            Loop intenta DELETE individual (línea 1451)
            ↓
            ❌ BLOQUEO DE TABLA o TIMEOUT
```

**Riesgo:** ⚠️ **MUY ALTO**

#### Escenario 2: Múltiples DELETEs Individuales Acumulados

```
Item 1:   DELETE + INSERT (2ms)
Item 2:   DELETE + INSERT (2ms)
...
Item 1000: DELETE + INSERT (2ms)
...
Item 40000: DELETE + INSERT (2ms)

Total: 40,000 DELETEs + 40,000 INSERTs = 80,000 operaciones
Tiempo estimado: 80,000 * 2ms = 160 segundos (2.6 minutos)
```

**Riesgo:** ⚠️ **MUY ALTO**

#### Escenario 3: Commits Periódicos con Transacciones Grandes

```
Item 200:  Commit (puede incluir 200 DELETEs + 200 INSERTs pendientes)
Item 400:  Commit (puede incluir 200 DELETEs + 200 INSERTs pendientes)
...
Item 40000: Commit final (puede incluir miles de operaciones pendientes)
```

**Riesgo:** ⚠️ **MEDIO-ALTO**

#### Escenario 4: Queries de Validación Durante Procesamiento

```
Mientras el loop procesa items:
- Query de validación (NEW vs OLD) puede ejecutarse
- Query de detección de desaparecidos puede ejecutarse
- Queries de discrepancias pueden ejecutarse

Si hay bloqueos de tabla, estas queries pueden timeout
```

**Riesgo:** ⚠️ **MEDIO**

---

### 4.2 Configuración de Timeouts Actual

**`config.py` líneas 29-31:**

```python
'connect_args': {
    'connect_timeout': 10,   # 10 segundos para conectar
    'read_timeout': 30,      # 30 segundos para leer
    'write_timeout': 30,      # 30 segundos para escribir
}
```

**Problema:**
- `write_timeout: 30` segundos es **insuficiente** para:
  - DELETE masivo de 40,000 registros (puede tardar 10-30+ segundos)
  - Commits con miles de operaciones pendientes (puede tardar 10-20+ segundos)
  - DELETEs individuales acumulados (puede exceder 30 segundos en total)

---

### 4.3 Puntos Críticos de Timeout

| Fase | Operación | Tiempo Estimado | Timeout Actual | Riesgo |
|------|-----------|-----------------|----------------|--------|
| 3.2 | DELETE masivo inicial | 10-30+ seg | 30 seg | ⚠️ **MUY ALTO** |
| 3.4 | DELETE individual (x40,000) | 2ms c/u = 80 seg total | 30 seg | ⚠️ **MUY ALTO** |
| 3.5 | Commit cada 200 items | 1-5 seg | 30 seg | ⚠️ **MEDIO** |
| 3.6 | Query de desaparecidos | 5-15 seg | 30 seg | ⚠️ **MEDIO** |
| 3.7 | Validación NEW vs OLD | 10-20 seg | 30 seg | ⚠️ **MEDIO** |

---

## 5. CAUSA RAÍZ DEL ERROR OBSERVADO

### Error Específico

```
(pymysql.err.OperationalError) (2013, 'Lost connection to MySQL server during query')
[SQL: DELETE FROM stock_productos_adm 
      WHERE stock_productos_adm.producto_id = %(producto_id_1)s 
      AND stock_productos_adm.location_id = %(location_id_1)s 
      AND stock_productos_adm.sync_run_id != %(sync_run_id_1)s]
[parameters: {'producto_id_1': 4112, 'location_id_1': 'fdb149a8-...', 'sync_run_id_1': 16}]
```

### Análisis

1. **Ubicación del Error:** Línea 1451 o 1576 (DELETE dentro del loop)
2. **Momento:** Durante el procesamiento de items (fase 3.4)
3. **Causa Probable:**
   - DELETE masivo inicial aún ejecutándose (bloqueo de tabla)
   - O múltiples DELETEs individuales acumulados (timeout de write)
   - O commit previo tardó mucho (conexión cerrada por MySQL)

### Secuencia de Eventos Probable

```
1. DELETE masivo inicia (línea 1208) → puede tardar 10-30+ segundos
2. Loop de procesamiento inicia (línea 1309)
3. Item 1-1000: Procesados normalmente
4. Item 1001: Intenta DELETE individual (línea 1451)
   → Tabla aún bloqueada por DELETE masivo
   → O conexión cerrada por timeout de write (30 seg)
5. ❌ ERROR 2013: Lost connection
```

---

## 6. RECOMENDACIONES

### 6.1 Eliminar DELETEs Redundantes (CRÍTICO)

**Problema:** Los DELETEs individuales en las líneas 1451-1456 y 1576-1581 son **redundantes** porque ya se hizo limpieza masiva al inicio.

**Solución:**
- Eliminar los DELETEs dentro del loop
- Confiar en la limpieza masiva inicial
- Si hay conflicto de `UniqueConstraint`, manejarlo con `get_or_create` o `ON DUPLICATE KEY UPDATE`

**Impacto:** Reduciría ~40,000 operaciones DELETE innecesarias

### 6.2 Optimizar Limpieza Masiva Inicial

**Problema:** DELETE masivo puede tardar mucho y bloquear la tabla.

**Soluciones:**
1. **Hacer limpieza en lotes:**
   ```python
   # Eliminar en lotes de 5,000 registros
   while True:
       eliminados = StockProductoADM.query.filter(...).limit(5000).delete()
       if eliminados == 0:
           break
       db.session.commit()
   ```

2. **Agregar índices:**
   - `(location_id, sync_run_id)` para acelerar el DELETE

3. **Hacer limpieza asíncrona:**
   - Limpiar runs antiguos en un proceso separado (no durante sync)

### 6.3 Aumentar Timeouts de MySQL

**Problema:** `write_timeout: 30` segundos es insuficiente.

**Solución:**
```python
'connect_args': {
    'read_timeout': 120,   # 2 minutos para leer
    'write_timeout': 120,  # 2 minutos para escribir
}
```

**Nota:** También configurar en MySQL:
```sql
SET GLOBAL wait_timeout = 300;
SET GLOBAL interactive_timeout = 300;
```

### 6.4 Commits Más Frecuentes

**Problema:** Commits cada 200 items pueden acumular transacciones grandes.

**Solución:**
- Reducir a commits cada 50-100 items
- O hacer commits después de cada lote de 50 items desde ADM Cloud

### 6.5 Usar Transacciones Más Pequeñas

**Problema:** Una transacción puede incluir miles de operaciones.

**Solución:**
- Hacer commit después de cada lote de 50 items (no cada 200)
- Esto reduce el tamaño de cada transacción

---

## 7. CONCLUSIÓN

El sistema de sincronización implementa correctamente el patrón de staging cache, pero presenta **riesgos críticos de timeout** debido a:

1. **Limpieza masiva inicial** que puede bloquear la tabla
2. **DELETEs redundantes** dentro del loop (40,000+ operaciones innecesarias)
3. **Timeouts insuficientes** (30 segundos) para operaciones largas
4. **Operaciones simultáneas** que compiten por recursos de BD

El error `(2013, 'Lost connection to MySQL server')` es consecuencia directa de estos problemas, especialmente el DELETE redundante dentro del loop que intenta ejecutarse mientras otras operaciones bloquean la tabla o exceden el timeout.

**Prioridad de Soluciones:**
1. ⚠️ **CRÍTICO:** Eliminar DELETEs redundantes (líneas 1451-1456, 1576-1581)
2. ⚠️ **ALTO:** Optimizar limpieza masiva (lotes o asíncrona)
3. ⚠️ **ALTO:** Aumentar timeouts de MySQL (120 segundos)
4. ⚠️ **MEDIO:** Commits más frecuentes (cada 50-100 items)

---

**Fin del Informe**

