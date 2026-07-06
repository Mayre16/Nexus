# INFORME TÉCNICO: MÓDULO DE SINCRONIZACIÓN DE PRODUCTOS
## Análisis en Profundidad de Funcionamiento y Detección de Ubicaciones

**Fecha:** 23 de Enero, 2026  
**Módulo:** Sistema de Sincronización de Productos y Stock (WMS)  
**Estado:** Análisis Completo

---

## 1. RESUMEN EJECUTIVO

El módulo de sincronización permite mantener actualizado el catálogo de productos y el stock por ubicación desde ADM Cloud al sistema WMS local. Utiliza un sistema inteligente de detección de ubicaciones que identifica automáticamente nuevas ubicaciones creadas en ADM Cloud y permite sincronizarlas de forma individual o masiva.

---

## 2. ARQUITECTURA DEL MÓDULO

### 2.1 Componentes Principales

#### Backend (Python/Flask)
- **`routes/sincronizar.py`**: Endpoints principales del módulo de sincronización
- **`api/adm_cloud.py`**: Cliente para comunicación con ADM Cloud API
- **`database/models.py`**: Modelos de datos relacionados

#### Modelos de Datos
- **`ProductoADM`**: Catálogo de productos (nombre, SKU, código de barras)
- **`StockProductoADM`**: Stock por producto y ubicación ADM (cache de stock ERP)
- **`SyncLocationStatus`**: Estado de sincronización por ubicación
- **`StockUbicacion`**: Stock físico del WMS por ubicación física
- **`Discrepancia`**: Discrepancias entre stock ERP y stock físico WMS

### 2.2 Endpoints Principales

| Endpoint | Método | Descripción | Permisos |
|----------|--------|-------------|----------|
| `/api/sincronizar/ubicaciones` | GET | Lista todas las ubicaciones con estado | Admin |
| `/api/sincronizar/ubicacion/<location_id>` | POST | Sincroniza stock de una ubicación específica | Admin |
| `/api/sincronizar/ubicacion/<location_id>/contar` | POST | Cuenta productos con stock > 0 | Admin |
| `/api/sincronizar/ubicacion/<location_id>/lote` | POST | Sincroniza un lote de 1000 productos | Admin |
| `/api/sincronizar/catalogo` | POST | Sincroniza catálogo (nombre, SKU, código de barras) | Admin |
| `/api/sincronizar/productos` | POST | Sincronización masiva completa (legacy) | Auth |
| `/api/sincronizar/progreso` | GET | Obtiene progreso de sincronización | Auth |
| `/api/sincronizar/estado` | GET | Estado de última sincronización | Auth |

---

## 3. DETECCIÓN DE UBICACIONES EN ADM CLOUD

### 3.1 Proceso de Obtención de Ubicaciones

#### Paso 1: Consulta a ADM Cloud API
**Método:** `ADMCloudClient.obtener_ubicaciones()`

**Endpoint ADM Cloud:** `GET /api/Locations/`

**Parámetros:**
- `skip`: Número de registros a saltar (paginación)
- `take`: Número de registros a obtener (máximo recomendado: 100)

**Código:**
```python
def obtener_ubicaciones(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
    return self._make_request("Locations/", {"skip": skip, "take": take})
```

#### Paso 2: Estructura de Respuesta de ADM Cloud

Cada ubicación en la respuesta tiene la siguiente estructura:
```json
{
  "ID": "cbf352cd-2fda-4cb0-da97-08de4d22d171",  // GUID único
  "Name": "P2-P1-AR-N1",                          // Nombre de la ubicación
  // ... otros campos posibles
}
```

**Campos Extraídos:**
- `ID` → `location_id` (GUID único de la ubicación)
- `Name` → `location_name` (Nombre de la ubicación: "ADESA", "P2-P1-AR-N1", etc.)

### 3.2 Cómo se Detectan Nuevas Ubicaciones

#### Mecanismo de Detección

El sistema **NO compara** explícitamente ubicaciones nuevas vs. existentes. En su lugar:

1. **Consulta siempre todas las ubicaciones** desde ADM Cloud
2. **Combina con estados locales** de sincronización
3. **Si una ubicación no tiene estado local** → se considera "pending" (nueva o no sincronizada)

#### Flujo de Detección

```
1. Sistema consulta ADM Cloud: GET /api/Locations/
   ↓
2. ADM Cloud devuelve TODAS las ubicaciones (ej: 26 ubicaciones)
   ↓
3. Sistema consulta estados locales: SyncLocationStatus.query.all()
   ↓
4. Para cada ubicación de ADM Cloud:
   - Busca estado local por location_id
   - Si NO existe → status = "pending" (NUEVA o NO SINCRONIZADA)
   - Si existe → usa el status guardado (done, running, error, paused)
   ↓
5. Sistema devuelve lista combinada con estados
```

#### Código de Detección

```python
# Obtener ubicaciones desde ADM Cloud
ubicaciones_result = adm_client.obtener_ubicaciones(skip=0, take=100)
ubicaciones_adm = ubicaciones_result.get("data", [])

# Obtener estados de sincronización desde BD
estados_sync = {}
for estado in SyncLocationStatus.query.all():
    estados_sync[estado.location_id] = estado

# Combinar ubicaciones ADM con estados de sincronización
for ubicacion in ubicaciones_adm:
    location_id = ubicacion.get("ID")
    location_name = ubicacion.get("Name", "")
    
    estado = estados_sync.get(location_id)  # Buscar en estados locales
    
    # Si NO existe estado → es nueva o no sincronizada
    status = estado.status if estado else "pending"
```

### 3.3 Estados de Sincronización

La tabla `SyncLocationStatus` almacena el estado de cada ubicación:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `location_id` | String (GUID) | ID único de la ubicación en ADM Cloud |
| `location_name` | String | Nombre de la ubicación |
| `status` | String | Estado: `pending`, `running`, `done`, `error`, `paused` |
| `last_sync_at` | DateTime | Última sincronización exitosa |
| `last_error` | Text | Último error si status = 'error' |
| `items_synced` | Integer | Cantidad de items con stock > 0 sincronizados |
| `total_items` | Integer | Total de items encontrados en ADM |
| `skip_actual` | Integer | Skip actual (para continuar sincronización) |
| `lote_actual` | Integer | Lote actual (1, 2, 3...) |

#### Estados Posibles

- **`pending`**: Ubicación nunca sincronizada (nueva o pendiente)
- **`running`**: Sincronización en curso
- **`done`**: Sincronización completada exitosamente
- **`error`**: Error durante la sincronización
- **`paused`**: Sincronización pausada (para ubicaciones grandes, se sincroniza por lotes)

---

## 4. TIPOS DE SINCRONIZACIÓN

### 4.1 Sincronización por Ubicación (Recomendada)

#### Endpoint: `POST /api/sincronizar/ubicacion/<location_id>`

**Propósito:** Sincronizar el stock de una ubicación específica desde ADM Cloud.

**Proceso:**

1. **Obtener información de la ubicación**
   - Consulta ADM Cloud para obtener `location_name`
   - Verifica que la ubicación existe

2. **Actualizar estado a "running"**
   - Crea o actualiza registro en `SyncLocationStatus`
   - Marca status como "running"

3. **Obtener stock con paginación**
   - Usa endpoint `/api/Stock` de ADM Cloud
   - Procesa en lotes de 50 items (límite de ADM Cloud)
   - Solo procesa items con `stock > 0`

4. **Procesar cada item:**
   - Extrae: `ItemID`, `SKU`, `Stock`
   - Busca o crea `ProductoADM` en BD local
   - Crea o actualiza `StockProductoADM` (stock ERP por ubicación)

5. **Detectar productos desaparecidos**
   - Compara items en BD local vs. items en sync actual
   - Si un producto tenía stock > 0 pero NO viene en sync → stock ERP = 0
   - Crea `Discrepancia` si hay stock físico WMS pero stock ERP = 0

6. **Actualizar estado a "done"**
   - Marca status como "done"
   - Guarda `last_sync_at`, `items_synced`

**Características:**
- ✅ Eficiente: solo sincroniza una ubicación a la vez
- ✅ Permite control granular
- ✅ Maneja ubicaciones grandes con paginación
- ✅ Detecta productos desaparecidos automáticamente

### 4.2 Sincronización por Lotes (Para Ubicaciones Grandes)

#### Endpoint: `POST /api/sincronizar/ubicacion/<location_id>/lote`

**Propósito:** Sincronizar un lote de 1000 productos con stock > 0.

**Proceso:**

1. **Verificar estado previo**
   - Debe existir registro en `SyncLocationStatus`
   - Debe tener `total_items` > 0 (debe haberse contado primero)

2. **Continuar desde `skip_actual`**
   - Usa `skip_actual` para continuar donde quedó
   - Procesa hasta 1000 items con stock > 0

3. **Actualizar contadores**
   - `skip_actual`: skip donde quedó
   - `lote_actual`: número de lote procesado
   - `items_synced`: total acumulado

4. **Determinar siguiente estado:**
   - Si `items_synced >= total_items` → `status = "done"`
   - Si procesó 1000 items pero hay más → `status = "paused"`
   - Si no hay más items → `status = "done"`

**Uso:**
- Para ubicaciones con muchos productos (ej: ADESA con 4583+ items)
- Permite sincronizar en múltiples sesiones
- Evita timeouts

### 4.3 Conteo de Productos

#### Endpoint: `POST /api/sincronizar/ubicacion/<location_id>/contar`

**Propósito:** Contar cuántos productos tienen stock > 0 en una ubicación.

**Proceso:**

1. **Consulta ADM Cloud con paginación**
   - Usa `/api/Stock` con `location_id`
   - Procesa en lotes de 50 items
   - Cuenta solo items con `stock > 0`

2. **Guarda total en `SyncLocationStatus`**
   - `total_items`: total de productos con stock > 0
   - Resetea: `skip_actual = 0`, `lote_actual = 0`, `items_synced = 0`

3. **Sincronización Automática (si aplica)**
   - Si `total_items <= 1000` → sincroniza automáticamente
   - Si `total_items > 1000` → marca como `paused` para sincronización manual por lotes

**Lógica de Auto-sincronización:**
```python
if total_items > 0 and total_items <= 1000:
    # Sincronizar automáticamente
    sincronizar_lote_ubicacion_interno(...)
    status = 'done'
else:
    # Más de 1000 productos, requiere sincronización por lotes
    status = 'paused'
```

### 4.4 Sincronización de Catálogo

#### Endpoint: `POST /api/sincronizar/catalogo`

**Propósito:** Sincronizar información del catálogo (nombre, SKU, código de barras) sin tocar stock.

**Proceso:**

1. **Obtener productos con paginación**
   - Usa `/api/items/` de ADM Cloud
   - Procesa en lotes de 50 productos
   - Límite máximo: 10,000 productos

2. **Actualizar o crear `ProductoADM`**
   - Actualiza: `nombre`, `sku`, `codigo_barras`
   - **NO toca stock** (eso viene de sync por ubicación)

3. **Commits periódicos**
   - Cada 100 productos para evitar pérdida de datos

**Características:**
- ✅ Separado de sincronización de stock
- ✅ Puede ejecutarse independientemente
- ✅ Actualiza información básica de productos

### 4.5 Sincronización Masiva (Legacy)

#### Endpoint: `POST /api/sincronizar/productos`

**Propósito:** Sincronización completa de productos y stock de todas las ubicaciones (método antiguo).

**Proceso:**

1. Obtener todos los productos desde `/api/items/`
2. Obtener todas las ubicaciones desde `/api/Locations/`
3. Para cada ubicación, obtener stock desde `/api/Stock`
4. Crear/actualizar productos y stock en BD local

**Estado:** 
- ⚠️ Método legacy, puede ser lento para muchas ubicaciones
- ✅ Útil para sincronización inicial completa

---

## 5. LÓGICA DE DETECCIÓN DE NUEVAS UBICACIONES

### 5.1 ¿Cómo se Detecta una Nueva Ubicación?

#### Método Actual

El sistema **NO hace comparación explícita**. En su lugar:

1. **Cada vez que se consulta `/api/sincronizar/ubicaciones`:**
   - Obtiene TODAS las ubicaciones desde ADM Cloud
   - Compara con estados locales por `location_id`
   - Si `location_id` NO existe en `SyncLocationStatus` → es "pending" (nueva o no sincronizada)

2. **Ventaja:**
   - Detecta automáticamente nuevas ubicaciones sin necesidad de comparar
   - Si ADM Cloud devuelve una ubicación nueva, automáticamente aparece como "pending"

3. **Limitación:**
   - No distingue entre "nueva" y "nunca sincronizada"
   - Una ubicación que existía pero nunca se sincronizó también aparece como "pending"

### 5.2 Flujo Completo de Detección

```
┌─────────────────────────────────────────────────────────┐
│ Usuario accede a "Sincronización de Productos"         │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend llama: GET /api/sincronizar/ubicaciones       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Backend: adm_client.obtener_ubicaciones(skip=0, take=100)│
│ Endpoint ADM: GET /api/Locations/                       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ ADM Cloud devuelve lista de ubicaciones:                │
│ [                                                       │
│   {ID: "guid1", Name: "ADESA"},                        │
│   {ID: "guid2", Name: "Mirador Sur"},                 │
│   {ID: "guid3", Name: "P2-P1-AR-N1"},  ← NUEVA        │
│   ...                                                  │
│ ]                                                      │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Backend consulta estados locales:                      │
│ SyncLocationStatus.query.all()                          │
│                                                         │
│ estados_sync = {                                        │
│   "guid1": {status: "done", ...},                      │
│   "guid2": {status: "done", ...},                     │
│   // guid3 NO existe → es nueva                        │
│ }                                                      │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Backend combina datos:                                 │
│                                                         │
│ Para cada ubicación de ADM:                            │
│   - Si location_id existe en estados_sync:             │
│     → Usa status guardado                              │
│   - Si location_id NO existe:                          │
│     → status = "pending" (NUEVA)                       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend muestra lista con:                            │
│ - ADESA: SINCRONIZADA (done)                           │
│ - Mirador Sur: SINCRONIZADA (done)                     │
│ - P2-P1-AR-N1: PENDIENTE (pending) ← NUEVA            │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Ejemplo Práctico

**Escenario:** Se crea una nueva ubicación "P2-P1-AR-N1" en ADM Cloud.

**Proceso:**

1. **Antes de crear la ubicación:**
   - ADM Cloud devuelve 25 ubicaciones
   - Sistema tiene 25 registros en `SyncLocationStatus`
   - "P2-P1-AR-N1" NO aparece en la lista

2. **Después de crear la ubicación en ADM Cloud:**
   - ADM Cloud ahora devuelve 26 ubicaciones (incluye "P2-P1-AR-N1")
   - Sistema consulta estados locales: sigue teniendo 25 registros
   - Al combinar: "P2-P1-AR-N1" NO tiene estado local
   - **Resultado:** Aparece como `status = "pending"` (NUEVA)

3. **Usuario puede sincronizar:**
   - Hace clic en "Contar Productos" o "Re-sincronizar"
   - Sistema crea registro en `SyncLocationStatus` con `status = "running"`
   - Sincroniza stock de la nueva ubicación
   - Al completar: `status = "done"`

---

## 6. PROCESO DE SINCRONIZACIÓN DETALLADO

### 6.1 Sincronización de Stock por Ubicación

#### Flujo Paso a Paso

```
1. Usuario selecciona ubicación y hace clic en "Re-sincronizar"
   ↓
2. Frontend llama: POST /api/sincronizar/ubicacion/<location_id>
   ↓
3. Backend obtiene información de ubicación desde ADM Cloud
   ↓
4. Backend crea/actualiza SyncLocationStatus:
   - location_id: GUID de la ubicación
   - location_name: Nombre de la ubicación
   - status: "running"
   ↓
5. Backend consulta stock desde ADM Cloud:
   - Endpoint: /api/Stock?LocationID=<location_id>
   - Paginación: skip=0, take=50 (límite de ADM Cloud)
   ↓
6. Para cada lote de 50 items:
   a. Procesa cada item:
      - Extrae ItemID, SKU, Stock
      - Solo procesa si stock > 0
      - Busca o crea ProductoADM
      - Crea o actualiza StockProductoADM
   b. Commit periódico cada 50 items
   c. Incrementa skip += 50
   ↓
7. Cuando no hay más items:
   a. Detecta productos desaparecidos:
      - Compara items en BD vs. items en sync
      - Si producto tenía stock > 0 pero NO viene en sync:
        → Actualiza stock ERP a 0
        → Crea Discrepancia si hay stock físico WMS
   b. Actualiza SyncLocationStatus:
      - status: "done"
      - last_sync_at: ahora
      - items_synced: total procesado
   ↓
8. Backend devuelve resultado al frontend
   ↓
9. Frontend actualiza UI mostrando estado "SINCRONIZADA"
```

### 6.2 Extracción de Datos de Stock

#### Campos Extraídos de `/api/Stock`

El sistema intenta múltiples campos para máxima compatibilidad:

**ItemID:**
```python
item_id = (
    item.get("ItemID") or
    item.get("ID") or
    item.get("Item").get("ID") if isinstance(item.get("Item"), dict) else None or
    item.get("Item")
)
```

**SKU:**
```python
item_sku = (
    item.get("ItemSKU") or
    item.get("SKU") or
    item.get("Item").get("SKU") if isinstance(item.get("Item"), dict) else ""
).upper()
```

**Stock:**
```python
# Prioridad de campos (en orden):
stock = (
    item.get("Stock") or                    # Campo principal
    item.get("QuantityOnHand") or
    item.get("Quantity") or
    item.get("QuantityAvailable") or
    item.get("OnHand") or
    item.get("Qty") or
    item.get("AvailableQuantity") or
    item.get("Item").get("Stock") if isinstance(item.get("Item"), dict) else None
)
```

### 6.3 Detección de Productos Desaparecidos

#### Lógica de Detección

**Problema:** Un producto puede tener stock > 0 en BD local pero ya no tener stock en ADM Cloud.

**Solución:**

1. **Durante la sincronización:**
   - Se mantiene un conjunto `item_ids_en_sync` con todos los `ItemID` que vienen en la sync actual

2. **Al finalizar la sincronización:**
   - Se consultan todos los productos que tienen `stock > 0` en BD local para esta ubicación
   - Se compara: si `item_id` NO está en `item_ids_en_sync` → producto desapareció

3. **Acción:**
   - Actualizar `StockProductoADM.stock = 0` (stock ERP ahora es 0)
   - Si hay stock físico WMS (`StockUbicacion.cantidad > 0`):
     - Crear `Discrepancia` de tipo "critica"
     - Estado: "pendiente"
     - Para que el usuario la revise

**Código:**
```python
# Lista de item_id que vienen en esta sincronización
item_ids_en_sync = set()

# Durante sync, agregar cada item_id procesado
item_ids_en_sync.add(item_id)

# Al finalizar, detectar desaparecidos
stock_existentes = StockProductoADM.query.filter_by(
    location_id=location_id,
    stock > 0
).all()

for stock_existente in stock_existentes:
    if stock_existente.producto.item_id not in item_ids_en_sync:
        # Producto desapareció de ADM Cloud
        stock_existente.stock = 0.0  # Actualizar stock ERP
        
        # Verificar si hay stock físico WMS
        stock_fisico_wms = StockUbicacion.query.filter_by(
            sku=stock_existente.producto.sku
        ).all()
        
        if sum(float(s.cantidad) for s in stock_fisico_wms) > 0:
            # Crear discrepancia crítica
            Discrepancia(...)
```

---

## 7. ORDENAMIENTO Y PRIORIZACIÓN DE UBICACIONES

### 7.1 Lógica de Ordenamiento

El sistema ordena las ubicaciones con la siguiente prioridad:

1. **Ubicaciones sincronizando (`running`)** → Siempre primero
2. **ADESA y Mirador Sur (sincronizadas)** → Siguientes
3. **Otras ubicaciones sincronizadas (`done`)** → Después
4. **Ubicaciones pausadas (`paused`)** → Después de sincronizadas
5. **Ubicaciones pendientes (`pending`)** → Casi al final
6. **Ubicaciones con error (`error`)** → Al final

### 7.2 Código de Ordenamiento

```python
def sort_key(u):
    es_running = u["status"] == "running"
    es_adesa = u["location_name"].upper() == "ADESA"
    es_mirador = u["location_name"].upper() == "MIRADOR SUR"
    es_done = u["status"] == "done"
    
    # Si está sincronizando, siempre primero
    if es_running:
        return (0, 0, u["location_name"])
    
    # Si está sincronizada (done)
    if es_done:
        # ADESA y Mirador Sur primero entre las sincronizadas
        if es_adesa:
            return (1, 0, u["location_name"])
        elif es_mirador:
            return (1, 1, u["location_name"])
        else:
            return (1, 2, u["location_name"])
    
    # Si está pausada, después de las sincronizadas
    if u["status"] == "paused":
        if es_adesa:
            return (2, 0, u["location_name"])
        elif es_mirador:
            return (2, 1, u["location_name"])
        else:
            return (2, 2, u["location_name"])
    
    # Pendientes y errores al final
    status_order = {"pending": 3, "error": 4}
    return (status_order.get(u["status"], 99), 99, u["location_name"])
```

---

## 8. SISTEMA DE LOTES PARA UBICACIONES GRANDES

### 8.1 ¿Por Qué se Usan Lotes?

**Problema:** Ubicaciones grandes (ej: ADESA con 4583+ productos) pueden causar:
- Timeouts en la sincronización
- Pérdida de progreso si falla
- Carga excesiva en el servidor

**Solución:** Sincronización por lotes de 1000 productos con stock > 0.

### 8.2 Proceso de Sincronización por Lotes

#### Paso 1: Contar Productos
```
Usuario hace clic en "Contar Productos"
↓
Sistema cuenta productos con stock > 0
↓
Si total <= 1000:
  → Sincroniza automáticamente (1 lote)
Si total > 1000:
  → Marca como "paused"
  → Usuario debe sincronizar por lotes manualmente
```

#### Paso 2: Sincronizar Lote
```
Usuario hace clic en "Continuar Lote"
↓
Sistema sincroniza 1000 productos desde skip_actual
↓
Actualiza:
  - skip_actual: donde quedó
  - lote_actual: número de lote
  - items_synced: total acumulado
↓
Si items_synced >= total_items:
  → status = "done" (completado)
Si procesó 1000 pero hay más:
  → status = "paused" (continuar con siguiente lote)
```

### 8.3 Campos de Control de Lotes

En `SyncLocationStatus`:

- **`total_items`**: Total de productos con stock > 0 encontrados
- **`skip_actual`**: Skip actual (desde dónde continuar)
- **`lote_actual`**: Número de lote procesado (1, 2, 3...)
- **`items_synced`**: Total acumulado de items sincronizados

**Ejemplo:**
- `total_items = 4583`
- `skip_actual = 1500` (ya procesó hasta skip 1500)
- `lote_actual = 2` (ya procesó 2 lotes)
- `items_synced = 2000` (2000 productos sincronizados)
- `status = "paused"` (pendiente continuar con lote 3)

---

## 9. ESTRUCTURA DE DATOS

### 9.1 Tabla: `SyncLocationStatus`

**Propósito:** Almacenar estado de sincronización por ubicación.

**Campos Clave:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `location_id` | String (GUID) | ID único de ubicación en ADM Cloud (UNIQUE) |
| `location_name` | String | Nombre de la ubicación |
| `status` | String | Estado: pending, running, done, error, paused |
| `last_sync_at` | DateTime | Última sincronización exitosa |
| `last_error` | Text | Último error si status = 'error' |
| `items_synced` | Integer | Items con stock > 0 sincronizados |
| `total_items` | Integer | Total de items encontrados |
| `skip_actual` | Integer | Skip actual (para continuar) |
| `lote_actual` | Integer | Lote actual procesado |

**Índices:**
- `location_id` (UNIQUE, INDEX)
- `status` (INDEX)

### 9.2 Tabla: `StockProductoADM`

**Propósito:** Cache de stock ERP por producto y ubicación ADM.

**Campos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `producto_id` | Integer (FK) | ID del producto |
| `location_id` | String | GUID de ubicación ADM |
| `location_name` | String | Nombre de ubicación ADM |
| `stock` | Numeric | Stock en ADM Cloud (ERP) |

**Relación:**
- Un producto puede tener stock en múltiples ubicaciones ADM
- Índice único: `(producto_id, location_id)`

### 9.3 Tabla: `Discrepancia`

**Propósito:** Registrar discrepancias entre stock ERP y stock físico WMS.

**Campos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `producto_id` | Integer (FK) | ID del producto |
| `sku` | String | SKU del producto |
| `location_id` | String | GUID de ubicación ADM |
| `location_name` | String | Nombre de ubicación ADM |
| `ubicacion_fisica` | String | Ubicación física WMS |
| `stock_erp` | Numeric | Stock en ADM Cloud (ERP) |
| `stock_fisico_wms` | Numeric | Stock físico en WMS |
| `tipo` | String | Tipo: "critica", "normal" |
| `estado` | String | Estado: "pendiente", "resuelta" |
| `fecha_deteccion` | DateTime | Fecha de detección |

---

## 10. FLUJOS COMPLETOS

### 10.1 Flujo: Detectar y Sincronizar Nueva Ubicación

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuario accede a "Sincronización de Productos"     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Frontend: GET /api/sincronizar/ubicaciones          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend consulta ADM Cloud: GET /api/Locations/     │
│    ADM devuelve: [ADESA, Mirador Sur, P2-P1-AR-N1]     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Backend consulta estados locales                     │
│    Solo encuentra: [ADESA, Mirador Sur]                │
│    P2-P1-AR-N1 NO existe → status = "pending"          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Frontend muestra:                                    │
│    - ADESA: SINCRONIZADA                                │
│    - Mirador Sur: SINCRONIZADA                          │
│    - P2-P1-AR-N1: PENDIENTE ← NUEVA                    │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Usuario hace clic en "Contar Productos"             │
│    Frontend: POST /api/sincronizar/ubicacion/.../contar│
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Backend cuenta productos con stock > 0               │
│    Total encontrado: 6 productos                        │
│    Como total <= 1000 → sincroniza automáticamente      │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Backend sincroniza stock:                            │
│    - Crea SyncLocationStatus (status = "running")      │
│    - Obtiene stock desde /api/Stock                     │
│    - Crea/actualiza StockProductoADM                   │
│    - Actualiza status = "done"                          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 9. Frontend actualiza UI:                               │
│    P2-P1-AR-N1: SINCRONIZADA                           │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Flujo: Sincronización de Ubicación Grande (por Lotes)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuario hace clic en "Contar Productos" (ADESA)     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Backend cuenta: total_items = 4583                   │
│    Como total > 1000 → status = "paused"                │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Usuario hace clic en "Continuar Lote"                │
│    Frontend: POST /api/sincronizar/ubicacion/.../lote  │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Backend sincroniza lote 1:                           │
│    - Procesa 1000 productos desde skip=0                │
│    - Actualiza: skip_actual=1500, lote_actual=1        │
│    - Actualiza: items_synced=1000                       │
│    - status = "paused" (hay más productos)              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Usuario hace clic en "Continuar Lote" (otra vez)     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Backend sincroniza lote 2:                           │
│    - Procesa 1000 productos desde skip=1500             │
│    - Actualiza: skip_actual=3000, lote_actual=2        │
│    - Actualiza: items_synced=2000                       │
│    - status = "paused" (aún hay más)                    │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Usuario continúa hasta completar todos los lotes    │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Último lote:                                         │
│    - items_synced = 4583                                │
│    - items_synced >= total_items                        │
│    - status = "done" (completado)                        │
└─────────────────────────────────────────────────────────┘
```

---

## 11. CARACTERÍSTICAS ESPECIALES

### 11.1 Commits Periódicos

**Problema:** Si la sincronización falla, se pierde todo el progreso.

**Solución:** Commits periódicos cada 50 items sincronizados.

```python
if items_synced > 0 and items_synced % 50 == 0:
    try:
        db.session.commit()
        logger.debug(f"Commit periódico: {items_synced} items sincronizados")
    except Exception as e:
        logger.error(f"Error en commit periódico: {e}")
        db.session.rollback()
```

**Beneficio:**
- Si falla, solo se pierden los últimos 50 items
- Permite continuar desde el último commit exitoso

### 11.2 Manejo de Errores

**Si hay error durante sincronización:**

1. Se hace `rollback()` de la transacción
2. Se actualiza `SyncLocationStatus`:
   - `status = "error"`
   - `last_error = mensaje del error`
3. Se guarda el error para que el usuario lo vea
4. El usuario puede intentar nuevamente

### 11.3 Actualización de Nombres de Ubicación

**Problema:** El nombre de una ubicación puede cambiar en ADM Cloud.

**Solución:** Cada vez que se sincroniza, se actualiza `location_name`:

```python
estado_sync.location_name = location_name  # Actualizar nombre por si cambió
```

**Beneficio:**
- Los nombres siempre están actualizados
- No requiere sincronización manual de nombres

### 11.4 Progreso de Sincronización

**Sistema de Progreso en Tiempo Real:**

- Almacenado en memoria: `sync_progress = {user_id: {porcentaje, mensaje}}`
- Thread-safe con `sync_progress_lock`
- Actualizado durante la sincronización
- Consultable via `GET /api/sincronizar/progreso`

**Uso:**
- Frontend puede consultar progreso cada X segundos
- Muestra barra de progreso y mensaje al usuario

---

## 12. CASOS DE USO

### 12.1 Caso 1: Nueva Ubicación Creada en ADM Cloud

**Escenario:**
- Se crea ubicación "P2-P1-AR-N1" en ADM Cloud
- Usuario accede a "Sincronización de Productos"

**Proceso:**
1. Sistema consulta ADM Cloud → encuentra 26 ubicaciones (incluye nueva)
2. Sistema consulta estados locales → encuentra 25 registros
3. Al combinar: "P2-P1-AR-N1" NO tiene estado → aparece como "pending"
4. Usuario puede sincronizar haciendo clic en "Contar Productos"

**Resultado:** ✅ Nueva ubicación detectada automáticamente

### 12.2 Caso 2: Ubicación con Pocos Productos (Auto-sync)

**Escenario:**
- Ubicación "LOURDES de la CRUZ" tiene 6 productos con stock > 0
- Usuario hace clic en "Contar Productos"

**Proceso:**
1. Sistema cuenta: `total_items = 6`
2. Como `6 <= 1000` → sincroniza automáticamente
3. Procesa los 6 productos
4. Marca como `status = "done"`

**Resultado:** ✅ Sincronización automática completada

### 12.3 Caso 3: Ubicación Grande (Sincronización por Lotes)

**Escenario:**
- Ubicación "ADESA" tiene 4583 productos con stock > 0
- Usuario hace clic en "Contar Productos"

**Proceso:**
1. Sistema cuenta: `total_items = 4583`
2. Como `4583 > 1000` → marca como `status = "paused"`
3. Usuario hace clic en "Continuar Lote" (5 veces)
4. Cada lote procesa 1000 productos
5. Al completar todos los lotes: `status = "done"`

**Resultado:** ✅ Sincronización por lotes completada

### 12.4 Caso 4: Producto Desaparece de ADM Cloud

**Escenario:**
- Producto "PA-001" tenía stock = 5 en ADESA
- Se vende todo el stock en ADM Cloud
- Stock en ADM Cloud ahora = 0
- Sincronización de ADESA

**Proceso:**
1. Sistema sincroniza ADESA
2. "PA-001" NO viene en la respuesta de `/api/Stock` (porque stock = 0)
3. Sistema detecta: "PA-001" tenía stock > 0 en BD pero NO viene en sync
4. Actualiza `StockProductoADM.stock = 0`
5. Si hay stock físico WMS → crea `Discrepancia` crítica

**Resultado:** ✅ Stock ERP actualizado, discrepancia creada si aplica

---

## 13. CONSIDERACIONES TÉCNICAS

### 13.1 Límites de ADM Cloud API

**Límites Conocidos:**
- `/api/Stock`: Máximo 50 items por solicitud
- `/api/items/`: Máximo 50 productos por solicitud
- `/api/Locations/`: Máximo recomendado 100 ubicaciones por solicitud

**Impacto:**
- Requiere paginación para ubicaciones grandes
- Puede ser lento para muchas ubicaciones

### 13.2 Optimizaciones Implementadas

1. **Solo procesa items con stock > 0**
   - Reduce cantidad de registros a procesar
   - Más eficiente

2. **Commits periódicos**
   - Evita pérdida de datos si falla
   - Permite continuar desde último commit

3. **Sincronización por ubicación**
   - Permite control granular
   - No requiere sincronizar todas las ubicaciones

4. **Sistema de lotes**
   - Permite sincronizar ubicaciones grandes sin timeout
   - Puede continuar en múltiples sesiones

### 13.3 Separación de Responsabilidades

**Sincronización de Catálogo vs. Stock:**

- **Catálogo (`/api/sincronizar/catalogo`):**
  - Actualiza: nombre, SKU, código de barras
  - NO toca stock
  - Puede ejecutarse independientemente

- **Stock (`/api/sincronizar/ubicacion/<id>`):**
  - Actualiza: stock por ubicación
  - NO toca catálogo (usa datos existentes)
  - Puede ejecutarse independientemente

**Beneficio:**
- Flexibilidad para actualizar solo lo necesario
- Evita sincronizaciones largas innecesarias

---

## 14. DETECCIÓN DE NUEVAS UBICACIONES: RESUMEN

### 14.1 ¿Cómo Funciona?

**Respuesta Corta:**
El sistema **NO compara explícitamente**. Simplemente:
1. Consulta TODAS las ubicaciones desde ADM Cloud
2. Compara con estados locales por `location_id`
3. Si `location_id` NO existe en estados locales → es "pending" (nueva o no sincronizada)

### 14.2 Ventajas de este Enfoque

✅ **Automático:** Detecta nuevas ubicaciones sin configuración adicional  
✅ **Simple:** No requiere comparar listas complejas  
✅ **Eficiente:** Solo consulta estados locales (rápido)  
✅ **Confiable:** Si ADM Cloud devuelve una ubicación, el sistema la detecta

### 14.3 Limitaciones

⚠️ **No distingue:** No diferencia entre "nueva" y "nunca sincronizada"  
⚠️ **Requiere consulta:** Debe consultar ADM Cloud cada vez para detectar nuevas  
⚠️ **Depende de ADM Cloud:** Si ADM Cloud no devuelve la ubicación, no se detecta

### 14.4 Cuándo se Detecta una Nueva Ubicación

**Momento de Detección:**
- Cuando el usuario accede a "Sincronización de Productos"
- El frontend llama `GET /api/sincronizar/ubicaciones`
- El backend consulta ADM Cloud y compara con estados locales
- Si encuentra `location_id` que NO existe localmente → es nueva

**Frecuencia:**
- Cada vez que se carga la página de sincronización
- No hay polling automático (solo cuando el usuario accede)

---

## 15. RECOMENDACIONES Y MEJORAS FUTURAS

### 15.1 Mejoras Sugeridas

1. **Notificación de Nuevas Ubicaciones**
   - Mostrar badge o notificación cuando hay ubicaciones nuevas
   - Opción de sincronizar todas las nuevas automáticamente

2. **Sincronización Programada**
   - Permitir programar sincronizaciones automáticas
   - Ej: Sincronizar ADESA cada noche

3. **Historial de Sincronizaciones**
   - Guardar historial de cada sincronización
   - Mostrar estadísticas (productos nuevos, desaparecidos, etc.)

4. **Validación de Ubicaciones**
   - Verificar que ubicaciones físicas WMS existen antes de sincronizar
   - Validar formato de nombres de ubicaciones

5. **Sincronización Incremental**
   - Solo sincronizar cambios desde última sync
   - Reducir tiempo de sincronización

---

## 16. CONCLUSIÓN

El módulo de sincronización de productos es un sistema robusto que:

✅ **Detecta automáticamente** nuevas ubicaciones creadas en ADM Cloud  
✅ **Sincroniza eficientemente** stock por ubicación con paginación  
✅ **Maneja ubicaciones grandes** con sistema de lotes  
✅ **Detecta productos desaparecidos** automáticamente  
✅ **Mantiene estados** de sincronización para control granular  
✅ **Separa responsabilidades** entre catálogo y stock  

La detección de nuevas ubicaciones es **automática y transparente**: simplemente consulta ADM Cloud y compara con estados locales. Si una ubicación no tiene estado local, se considera "pending" (nueva o no sincronizada) y está lista para sincronizarse.

---

## 17. ANEXOS

### 17.1 Endpoints del Módulo

- `GET /api/sincronizar/ubicaciones` - Lista ubicaciones con estado
- `POST /api/sincronizar/ubicacion/<location_id>` - Sincroniza ubicación completa
- `POST /api/sincronizar/ubicacion/<location_id>/contar` - Cuenta productos
- `POST /api/sincronizar/ubicacion/<location_id>/lote` - Sincroniza un lote
- `POST /api/sincronizar/catalogo` - Sincroniza catálogo
- `POST /api/sincronizar/productos` - Sincronización masiva (legacy)
- `GET /api/sincronizar/progreso` - Obtiene progreso
- `GET /api/sincronizar/estado` - Estado de última sincronización

### 17.2 Archivos Clave

- `routes/sincronizar.py` - Lógica principal del módulo
- `api/adm_cloud.py` - Cliente ADM Cloud (método `obtener_ubicaciones`)
- `database/models.py` - Modelos: `SyncLocationStatus`, `StockProductoADM`, `Discrepancia`
- `templates/admin.html` - Interfaz de usuario

### 17.3 Dependencias

- Flask (Framework web)
- SQLAlchemy (ORM)
- Requests (HTTP client para ADM Cloud API)
- Threading (Para progreso thread-safe)

---

**Fin del Informe**



