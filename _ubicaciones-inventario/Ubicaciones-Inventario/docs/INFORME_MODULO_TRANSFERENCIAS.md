# 📋 INFORME TÉCNICO: MÓDULO DE TRANSFERENCIAS
## Análisis Profundo de Funcionamiento y Lógica

**Fecha:** 23 de Enero, 2026  
**Sistema:** WMS - Módulo de Transferencias  
**Versión:** 1.0

---

## 🎯 OBJETIVO DEL MÓDULO

El módulo de **Transferencias** permite registrar y procesar transferencias de inventario entre ubicaciones ADM Cloud (LocationTransfers), actualizando el stock físico del WMS cuando se registran en el sistema.

**Propósito:**
- Registrar transferencias creadas en ADM Cloud
- Actualizar stock físico del WMS (`StockUbicacion`)
- Mantener trazabilidad de movimientos entre ubicaciones
- Sincronizar el estado físico del almacén con las transferencias de ADM Cloud

---

## 📊 ARQUITECTURA Y COMPONENTES

### **1. Backend (`routes/transferencias.py`)**

#### **Endpoints Principales:**

1. **`POST /api/transferencias/buscar`**
   - Busca una transferencia por DocID en ADM Cloud
   - Crea/actualiza registro en `TransferenciaProcesada`
   - Guarda `usuario_solicitante` (usuario que busca)

2. **`POST /api/transferencias/registrar`**
   - Registra la transferencia en el WMS
   - Actualiza `StockUbicacion` (resta de origen, suma a destino)
   - Crea movimientos tipo `TRANSFER`
   - Marca transferencia como `PROCESADA`

3. **`POST /api/transferencias/actualizar-solicitante`**
   - Actualiza el usuario solicitante de una transferencia

### **2. Frontend (`templates/transferencias.html`)**

- Interfaz de búsqueda por DocID
- Visualización de transferencia encontrada
- Muestra productos a transferir
- Botones para procesar transferencia

### **3. Modelos de Base de Datos**

#### **`TransferenciaProcesada`**
- Control de transferencias procesadas
- Estados: `PENDIENTE`, `PROCESADA`, `ERROR`
- Almacena productos en JSON
- Registra usuarios (solicitante y procesador)

#### **`Movimiento` (tipo TRANSFER)**
- Registro de cada movimiento de transferencia
- Trazabilidad completa

#### **`StockUbicacion`**
- Stock físico del WMS
- Se actualiza al registrar transferencia

---

## 🔄 FLUJO COMPLETO DEL PROCESO

### **FASE 1: Búsqueda de Transferencia**

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuario ingresa DocID de transferencia              │
│    Ejemplo: "244" o "00000244"                          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Frontend envía POST /api/transferencias/buscar      │
│    Body: { "docid": "244" }                            │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend valida DocID                                │
│    - Usa validar_factura_docid()                       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Consulta ADM Cloud                                   │
│    - adm_client.buscar_location_transfer_por_docid()   │
│    - Busca en lotes de 50 hasta 2000 transferencias    │
│    - Compara DocID en diferentes formatos              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Si encuentra, obtiene detalle completo              │
│    - adm_client.obtener_location_transfer_por_guid()    │
│    - Extrae: ID, DocID, LocationID, ReceptionLocationID│
│    - Extrae productos con obtener_productos_location_  │
│      transfer()                                         │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Obtiene nombres de ubicaciones                       │
│    - Usa obtener_nombre_ubicacion_por_id()             │
│    - Consulta SyncLocationStatus (cache)               │
│    - Fallback: usa LocationName del JSON               │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Verifica si ya existe en BD local                   │
│    - TransferenciaProcesada.query.filter_by(guid)       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Si NO existe: Crea registro PENDIENTE              │
│    - transferencia_docid, transferencia_guid            │
│    - location_id_origen, location_name_origen           │
│    - location_id_destino, location_name_destino         │
│    - fecha_transferencia                               │
│    - productos_json (JSON con productos)                │
│    - usuario_solicitante = usuario actual               │
│    - estado_procesamiento = 'PENDIENTE'                 │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 9. Si existe: Actualiza usuario_solicitante si falta   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 10. Retorna datos de transferencia                     │
│     - guid, docid, fecha                                │
│     - origen_nombre, destino_nombre                    │
│     - productos (array)                                 │
│     - estado_procesamiento                              │
│     - usuario_solicitante                              │
└─────────────────────────────────────────────────────────┘
```

### **FASE 2: Registro de Transferencia**

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuario asigna ubicaciones físicas por producto     │
│    (si aplica) y hace clic en "Registrar Transferencia" │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Frontend envía POST /api/transferencias/registrar  │
│    Body: {                                             │
│      transferencia_guid: "xxx",                        │
│      productos_ubicaciones: [                          │
│        {                                               │
│          sku: "PA-001",                                 │
│          ubicacion_origen: "2P1D01N1",                 │
│          ubicacion_destino: "2P1D01N2",                │
│          cantidad: 1.0,                                │
│          item_id: "xxx"                                │
│        }                                               │
│      ]                                                 │
│    }                                                   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend valida datos                              │
│    - Verifica que transferencia_guid existe            │
│    - Verifica que productos_ubicaciones no esté vacío   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Verifica si ya fue procesada                        │
│    - TransferenciaProcesada.query.filter_by(guid)       │
│    - Si estado = 'PROCESADA': Error (idempotencia)     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Consulta ADM Cloud para validar                     │
│    - adm_client.obtener_location_transfer_por_guid()    │
│    - Obtiene datos actualizados                        │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Procesa cada producto-ubicación                      │
│    Para cada producto:                                  │
│    a) Valida SKU, ubicaciones, cantidad                │
│    b) Verifica stock suficiente en origen              │
│       - StockUbicacion.query.filter_by(                │
│           sku=sku, ubicacion=ubicacion_origen)          │
│       - Si stock < cantidad: Error                     │
│    c) Actualiza stock origen (RESTA)                   │
│       - stock_ubic_origen.cantidad -= cantidad         │
│    d) Actualiza stock destino (SUMA)                   │
│       - stock_ubic_destino.cantidad += cantidad         │
│       - Si no existe, crea nuevo registro              │
│    e) Crea Movimiento tipo TRANSFER                    │
│       - tipo = "TRANSFER"                               │
│       - ubicacion_origen, ubicacion_destino            │
│       - cantidad, factura_guid, usuario_id              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Actualiza TransferenciaProcesada                    │
│    - estado_procesamiento = 'PROCESADA'                 │
│    - usuario_procesador = usuario actual               │
│    - fecha_procesamiento = ahora                       │
│    - productos_json = productos actualizados           │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Commit a base de datos                              │
│    - db.session.commit()                                │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 9. Retorna éxito con movimientos creados               │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 LÓGICA DETALLADA POR COMPONENTE

### **1. Búsqueda de Transferencia (`buscar_transferencia`)**

#### **Proceso de Búsqueda en ADM Cloud:**

```python
# 1. Normalizar DocID
docid_clean = docid.strip()
docid_normalizado = docid_clean.lstrip('0')  # "00000244" -> "244"
docid_con_ceros = docid_clean.zfill(8)       # "244" -> "00000244"

# 2. Buscar en lotes de 50
skip = 0
batch_size = 50
while skip < max_search:
    result = listar_location_transfers(skip=skip, take=50)
    
    # 3. Comparar DocID en diferentes formatos
    for transferencia in transferencias:
        if (transferencia_docid_clean == docid_original or 
            transferencia_docid_clean == docid_con_ceros or
            transferencia_docid_normalizado == docid_normalizado):
            # Encontrado: obtener detalle completo
            return obtener_location_transfer_por_guid(guid)
    
    skip += batch_size
```

**Características:**
- ✅ Búsqueda flexible de DocID (con/sin ceros a la izquierda)
- ✅ Búsqueda paginada (lotes de 50)
- ✅ Límite máximo de 2000 transferencias
- ✅ Obtiene detalle completo después de encontrar

#### **Extracción de Datos:**

```python
# Ubicaciones
location_id_origen = transfer_data.get("LocationID")
location_id_destino = transfer_data.get("ReceptionLocationID")

# Nombres (desde cache o JSON)
origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)

# Productos
productos = obtener_productos_location_transfer(transfer_data)
# Extrae: ItemID, SKU, Name, Quantity, Cost, etc.
```

#### **Gestión de Usuario Solicitante:**

```python
# Si no existe registro, crear con usuario_solicitante
if not transferencia_procesada:
    transferencia_procesada = TransferenciaProcesada(
        ...
        usuario_solicitante=usuario_actual_id  # Usuario que busca
    )
else:
    # Si existe pero no tiene usuario_solicitante, asignarlo
    if not transferencia_procesada.usuario_solicitante:
        transferencia_procesada.usuario_solicitante = usuario_actual_id
```

**Propósito:** Rastrear qué usuario buscó/solicitó la transferencia para auditoría.

---

### **2. Registro de Transferencia (`registrar_transferencia`)**

#### **Validaciones Previas:**

```python
# 1. Validar GUID
if not transferencia_guid:
    return error("GUID requerido")

# 2. Validar productos
if not productos_ubicaciones or len(productos_ubicaciones) == 0:
    return error("Debe especificar al menos un producto")

# 3. Verificar idempotencia
if transferencia_existente.estado_procesamiento == 'PROCESADA':
    return error("Ya fue procesada")
```

#### **Validación de Stock:**

```python
# Para cada producto:
stock_ubic_origen = StockUbicacion.query.filter_by(
    sku=sku,
    ubicacion=ubicacion_origen
).first()

# Verificar stock suficiente
if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < float(cantidad):
    return error("Stock insuficiente en ubicación origen")
```

**Importante:** El sistema **verifica stock físico del WMS**, no el stock ERP de ADM Cloud.

#### **Actualización de Stock:**

```python
# 1. RESTAR de origen
stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - float(cantidad)
stock_ubic_origen.updated_at = datetime.utcnow()

# 2. SUMAR a destino
stock_ubic_destino = StockUbicacion.query.filter_by(
    sku=sku,
    ubicacion=ubicacion_destino
).first()

if stock_ubic_destino:
    stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + float(cantidad)
    stock_ubic_destino.updated_at = datetime.utcnow()
else:
    # Crear nuevo registro si no existe
    stock_ubic_destino = StockUbicacion(
        product_id=item_id,
        sku=sku,
        ubicacion=ubicacion_destino,
        cantidad=float(cantidad)
    )
    db.session.add(stock_ubic_destino)
```

#### **Creación de Movimiento:**

```python
movimiento = Movimiento(
    tipo="TRANSFER",
    product_id=item_id,
    sku=sku,
    ubicacion_origen=ubicacion_origen,      # Ubicación física WMS origen
    ubicacion_destino=ubicacion_destino,    # Ubicación física WMS destino
    cantidad=float(cantidad),
    factura_id=transfer_data.get("DocID"),  # DocID de transferencia
    factura_guid=transferencia_guid,        # GUID de transferencia
    usuario_id=session.get('user_id'),       # Usuario que procesa
    notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}"
)
db.session.add(movimiento)
```

**Características:**
- ✅ Un movimiento por cada producto-ubicación
- ✅ Trazabilidad completa (origen, destino, cantidad, usuario, fecha)
- ✅ Vinculado a transferencia mediante `factura_guid`

#### **Actualización de Estado:**

```python
if transferencia_existente:
    transferencia_existente.estado_procesamiento = 'PROCESADA'
    transferencia_existente.usuario_procesador = session.get('user_id')
    transferencia_existente.fecha_procesamiento = datetime.utcnow()
else:
    # Crear nuevo registro PROCESADA
    transferencia_procesada = TransferenciaProcesada(
        ...
        estado_procesamiento='PROCESADA',
        usuario_procesador=session.get('user_id'),
        fecha_procesamiento=datetime.utcnow()
    )
```

---

### **3. Extracción de Productos (`obtener_productos_location_transfer`)**

```python
def obtener_productos_location_transfer(transfer_data):
    # Extraer Items del JSON de ADM Cloud
    items = transfer_data.get("Items", [])
    
    productos = []
    for item in items:
        producto = {
            "RowOrder": item.get("RowOrder"),
            "ItemID": item.get("ItemID"),           # GUID del producto
            "ItemSKU": item.get("ItemSKU", ""),     # SKU
            "SKU": item.get("SKU", item.get("ItemSKU", "")),
            "Name": item.get("Name", ""),           # Nombre
            "Quantity": float(item.get("Quantity", 0)),  # Cantidad
            "Cost": float(item.get("Cost", 0)),     # Costo
            "ExtendedCost": float(item.get("ExtendedCost", 0)),
            "UOMName": item.get("UOMName", ""),     # Unidad de medida
        }
        productos.append(producto)
    
    return productos
```

---

## 📊 ESTRUCTURA DE DATOS

### **1. Modelo `TransferenciaProcesada`**

```python
class TransferenciaProcesada:
    id: Integer (PK)
    transferencia_docid: String(50)      # "00000244"
    transferencia_guid: String(100)       # GUID único de ADM
    location_id_origen: String(100)       # GUID ubicación origen ADM
    location_name_origen: String(200)     # "ADESA", "P2-P1-AL-N2"
    location_id_destino: String(100)      # GUID ubicación destino ADM
    location_name_destino: String(200)    # "Mirador Sur", "ADESA"
    fecha_transferencia: DateTime         # Fecha en ADM Cloud
    estado_procesamiento: String(20)      # PENDIENTE, PROCESADA, ERROR
    ubicacion_fisica_origen: String(50)   # "2P1D01N1" (si aplica)
    ubicacion_fisica_destino: String(50)  # "2P1D01N2" (si aplica)
    usuario_procesador: Integer (FK)      # Usuario que procesó
    usuario_solicitante: Integer (FK)     # Usuario que buscó/solicitó
    fecha_procesamiento: DateTime         # Fecha de procesamiento
    productos_json: Text                  # JSON con productos
    created_at: DateTime
    updated_at: DateTime
```

**Estados:**
- `PENDIENTE`: Transferencia buscada pero no procesada
- `PROCESADA`: Transferencia registrada en WMS (stock actualizado)
- `ERROR`: Error al procesar (no implementado actualmente)

### **2. Modelo `Movimiento` (tipo TRANSFER)**

```python
class Movimiento:
    tipo: "TRANSFER"
    sku: String(100)
    ubicacion_origen: String(50)      # Ubicación física WMS origen
    ubicacion_destino: String(50)     # Ubicación física WMS destino
    cantidad: Numeric(10, 2)
    factura_id: String(100)           # DocID de transferencia
    factura_guid: String(100)         # GUID de transferencia
    usuario_id: Integer (FK)          # Usuario que procesó
    timestamp: DateTime
    notas: Text                       # "Transferencia desde X hacia Y"
```

### **3. Payload de Registro**

```json
{
    "transferencia_guid": "xxx-guid-xxx",
    "productos_ubicaciones": [
        {
            "sku": "PA-001",
            "ubicacion_origen": "2P1D01N1",
            "ubicacion_destino": "2P1D01N2",
            "cantidad": 1.0,
            "item_id": "xxx-item-id-xxx"
        }
    ]
}
```

---

## 🔄 DIFERENCIAS CON OTROS MÓDULOS

### **Transferencias vs Recepciones:**

| Aspecto | Transferencias | Recepciones |
|---------|----------------|-------------|
| **Origen** | Ubicación ADM → Ubicación ADM | ADM Cloud → WMS |
| **Stock Origen** | Se RESTA de ubicación origen | No aplica (entrada) |
| **Stock Destino** | Se SUMA a ubicación destino | Se SUMA a ubicación física |
| **Ubicaciones** | Requiere origen Y destino | Solo requiere destino |
| **Validación** | Verifica stock suficiente en origen | No verifica stock (entrada) |

### **Transferencias vs Despachos:**

| Aspecto | Transferencias | Despachos |
|---------|----------------|-----------|
| **Dirección** | Entre ubicaciones ADM | Desde ubicación ADM hacia cliente |
| **Stock** | Resta de origen, suma a destino | Solo resta de origen |
| **Propósito** | Reubicación interna | Venta/salida |

---

## ⚠️ CASOS ESPECIALES Y VALIDACIONES

### **1. Validación de Stock Insuficiente**

```python
# Si no hay stock suficiente en origen
if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < float(cantidad):
    return error("Stock insuficiente en ubicación origen {ubicacion_origen} para SKU {sku}")
```

**Comportamiento:**
- ❌ No permite transferir más de lo que hay en origen
- ✅ Previene stock negativo
- ✅ Valida stock físico del WMS, no ERP

### **2. Idempotencia**

```python
# Si ya fue procesada, no permite duplicar
if transferencia_existente.estado_procesamiento == 'PROCESADA':
    return error("Esta transferencia ya fue procesada anteriormente")
```

**Propósito:** Evitar procesar la misma transferencia dos veces y duplicar movimientos.

### **3. Ubicaciones Físicas vs Ubicaciones ADM**

**Importante:** El sistema diferencia entre:
- **Ubicaciones ADM:** `LocationID` (GUID) y `LocationName` (ej: "ADESA", "Mirador Sur")
- **Ubicaciones Físicas WMS:** `ubicacion` en `StockUbicacion` (ej: "2P1D01N1", "2P1D01N2")

**Ejemplo:**
- Transferencia ADM: Desde "P2-P1-AL-N2" hacia "ADESA"
- Transferencia WMS: Desde "2P1D01N1" (física) hacia "2P1D01N2" (física)

El usuario debe mapear las ubicaciones ADM a ubicaciones físicas WMS al registrar.

### **4. Múltiples Productos**

El sistema permite transferir múltiples productos en una sola transferencia:

```json
{
    "productos_ubicaciones": [
        { "sku": "PA-001", "ubicacion_origen": "A1", "ubicacion_destino": "B1", "cantidad": 5 },
        { "sku": "PB-002", "ubicacion_origen": "A2", "ubicacion_destino": "B2", "cantidad": 10 }
    ]
}
```

**Resultado:**
- 2 movimientos TRANSFER creados
- 2 actualizaciones de stock origen (resta)
- 2 actualizaciones de stock destino (suma)

---

## 🔍 INTEGRACIÓN CON ADM CLOUD

### **API Endpoints Utilizados:**

1. **`GET /api/LocationTransfers`**
   - Lista transferencias (paginado)
   - Usado para búsqueda por DocID

2. **`GET /api/LocationTransfers/{guid}`**
   - Obtiene detalle completo de transferencia
   - Incluye Items (productos)

### **Estructura de Datos ADM Cloud:**

```json
{
    "ID": "guid-transferencia",
    "DocID": "00000244",
    "DocType": "INV_TRA",
    "LocationID": "guid-origen",
    "LocationName": "P2-P1-AL-N2",
    "ReceptionLocationID": "guid-destino",
    "ReceptionLocationName": "ADESA",
    "DocDate": "2026-01-23T...",
    "Items": [
        {
            "ItemID": "guid-item",
            "ItemSKU": "PA-001",
            "Name": "Prueba Almacén",
            "Quantity": 1.0,
            "Cost": 100.0
        }
    ]
}
```

---

## 📈 FLUJO DE DATOS EN BASE DE DATOS

### **Antes de Registrar Transferencia:**

```
TransferenciaProcesada:
  - estado_procesamiento: PENDIENTE
  - usuario_solicitante: Usuario A
  - usuario_procesador: NULL
  - fecha_procesamiento: NULL

StockUbicacion:
  - SKU: PA-001, ubicacion: 2P1D01N1, cantidad: 1.00
  - SKU: PA-001, ubicacion: 2P1D01N2, cantidad: 0.00

Movimiento:
  - (ninguno relacionado)
```

### **Después de Registrar Transferencia:**

```
TransferenciaProcesada:
  - estado_procesamiento: PROCESADA ✅
  - usuario_solicitante: Usuario A
  - usuario_procesador: Usuario B ✅
  - fecha_procesamiento: 2026-01-23 10:30:00 ✅

StockUbicacion:
  - SKU: PA-001, ubicacion: 2P1D01N1, cantidad: 0.00 ✅ (restado)
  - SKU: PA-001, ubicacion: 2P1D01N2, cantidad: 1.00 ✅ (sumado)

Movimiento:
  - tipo: TRANSFER ✅
  - sku: PA-001
  - ubicacion_origen: 2P1D01N1
  - ubicacion_destino: 2P1D01N2
  - cantidad: 1.00
  - factura_guid: guid-transferencia
  - usuario_id: Usuario B
```

---

## 🎯 CASOS DE USO

### **Caso 1: Transferencia Simple (1 producto, 1 ubicación)**

**Escenario:**
- Transferencia #244: PA-001 desde P2-P1-AL-N2 hacia ADESA
- Cantidad: 1 unidad

**Proceso:**
1. Usuario busca transferencia #244
2. Sistema muestra: PA-001, 1 unidad
3. Usuario asigna:
   - Origen físico: `2P1D01N1`
   - Destino físico: `2P1D01N2`
4. Usuario registra transferencia
5. Sistema:
   - Resta 1 de `2P1D01N1`
   - Suma 1 a `2P1D01N2`
   - Crea 1 movimiento TRANSFER

**Resultado:**
- ✅ Stock físico actualizado
- ✅ Trazabilidad completa
- ✅ Transferencia marcada como PROCESADA

### **Caso 2: Transferencia Múltiple (varios productos)**

**Escenario:**
- Transferencia #245: 3 productos diferentes
- PA-001: 5 unidades
- PB-002: 10 unidades
- PC-003: 2 unidades

**Proceso:**
1. Usuario busca transferencia #245
2. Sistema muestra 3 productos
3. Usuario asigna ubicaciones físicas para cada producto
4. Usuario registra transferencia
5. Sistema:
   - Crea 3 movimientos TRANSFER
   - Actualiza stock para cada producto

**Resultado:**
- ✅ 3 movimientos creados
- ✅ 6 actualizaciones de stock (3 restas, 3 sumas)

### **Caso 3: Stock Insuficiente**

**Escenario:**
- Transferencia intenta mover 10 unidades de PA-001
- Stock físico en origen: 5 unidades

**Proceso:**
1. Usuario intenta registrar transferencia
2. Sistema valida stock
3. Sistema detecta: 5 < 10
4. Sistema retorna error: "Stock insuficiente"

**Resultado:**
- ❌ Transferencia NO se registra
- ✅ Stock NO se modifica
- ✅ Movimientos NO se crean

### **Caso 4: Transferencia Ya Procesada (Idempotencia)**

**Escenario:**
- Transferencia #244 ya fue procesada anteriormente
- Usuario intenta procesarla de nuevo

**Proceso:**
1. Usuario intenta registrar transferencia #244
2. Sistema verifica estado
3. Sistema detecta: `estado_procesamiento = 'PROCESADA'`
4. Sistema retorna error: "Ya fue procesada"

**Resultado:**
- ❌ Transferencia NO se procesa de nuevo
- ✅ Previene duplicación de movimientos
- ✅ Previene modificación incorrecta de stock

---

## 🔐 AUDITORÍA Y TRAZABILIDAD

### **Campos de Auditoría:**

1. **`usuario_solicitante`**
   - Usuario que buscó la transferencia
   - Se guarda cuando se busca por primera vez
   - Permite rastrear quién solicitó procesar la transferencia

2. **`usuario_procesador`**
   - Usuario que registró/procesó la transferencia
   - Se guarda cuando se marca como PROCESADA
   - Permite rastrear quién ejecutó la transferencia

3. **`fecha_procesamiento`**
   - Fecha/hora exacta de procesamiento
   - Permite auditoría temporal

4. **`Movimiento.timestamp`**
   - Fecha/hora de cada movimiento individual
   - Trazabilidad detallada

### **Vista de Detalles:**

El endpoint `/api/detalles/transferencia/<guid>` proporciona:
- Información completa de la transferencia
- Productos originales (desde ADM Cloud)
- Productos transferidos (con movimientos)
- Usuarios (solicitante y procesador)
- Fechas (transferencia y procesamiento)

---

## ⚙️ VALIDACIONES Y REGLAS DE NEGOCIO

### **1. Validación de SKU**

```python
es_valido, mensaje = validar_sku(sku)
# Verifica: no vacío, formato válido
```

### **2. Validación de Ubicaciones**

```python
es_valido, mensaje = validar_ubicacion(ubicacion_origen)
es_valido, mensaje = validar_ubicacion(ubicacion_destino)
# Verifica: no vacío, formato válido
```

### **3. Validación de Cantidad**

```python
es_valido, mensaje = validar_cantidad(cantidad)
# Verifica: > 0, numérico válido
```

### **4. Validación de Stock**

```python
# Stock suficiente en origen
if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < float(cantidad):
    return error("Stock insuficiente")
```

### **5. Regla de Idempotencia**

```python
# No procesar dos veces
if estado_procesamiento == 'PROCESADA':
    return error("Ya fue procesada")
```

---

## 🔄 RELACIÓN CON OTROS MÓDULOS

### **1. Módulo de Sincronización**

**Relación:**
- La sincronización actualiza `StockProductoADM` (stock ERP)
- Las transferencias actualizan `StockUbicacion` (stock físico)
- Ambos deben estar sincronizados para evitar discrepancias

**Flujo:**
1. Transferencia en ADM Cloud → Stock ERP cambia
2. Sincronización → Detecta cambio en stock ERP
3. Registro en WMS → Actualiza stock físico
4. Consulta → Muestra ambos stocks (ERP y físico)

### **2. Módulo de Consulta de Productos**

**Relación:**
- La consulta muestra stock físico desde `StockUbicacion`
- Las transferencias modifican `StockUbicacion`
- Después de registrar transferencia, la consulta refleja el cambio

### **3. Módulo de Historiales**

**Relación:**
- El historial muestra transferencias desde `TransferenciaProcesada`
- Los movimientos se muestran desde `Movimiento` (tipo TRANSFER)
- Permite rastrear todas las transferencias procesadas

---

## 🐛 PROBLEMAS CONOCIDOS Y LIMITACIONES

### **1. No Actualiza Stock ERP Automáticamente**

**Problema:**
- El registro de transferencia solo actualiza `StockUbicacion` (físico)
- No actualiza `StockProductoADM` (ERP)
- El stock ERP se actualiza solo durante sincronización

**Impacto:**
- Si haces transferencia en ADM Cloud y la registras en WMS:
  - Stock físico WMS: ✅ Actualizado
  - Stock ERP (cache): ⚠️ Se actualiza en próxima sincronización

**Solución Actual:**
- Sincronizar ubicaciones después de registrar transferencias

### **2. No Valida Ubicaciones Físicas vs ADM**

**Problema:**
- El sistema no valida que las ubicaciones físicas WMS correspondan a las ubicaciones ADM
- Usuario puede asignar cualquier ubicación física

**Impacto:**
- Posible inconsistencia entre ubicación ADM y ubicación física asignada

**Mitigación:**
- Validación manual del usuario
- Auditoría mediante movimientos

### **3. No Maneja Transferencias Parciales**

**Problema:**
- No se puede registrar transferencia parcial (ej: transferir 5 de 10 unidades)
- Debe transferir toda la cantidad o nada

**Impacto:**
- Si solo quieres transferir parte, debes crear ajuste manual

### **4. No Reversión Automática**

**Problema:**
- No hay función para revertir transferencia procesada
- Solo se puede revertir manualmente con ajustes

**Impacto:**
- Si se registra incorrectamente, requiere intervención manual

---

## 📊 DIAGRAMA DE FLUJO COMPLETO

```
                    ┌─────────────────────┐
                    │ Usuario busca      │
                    │ Transferencia #244 │
                    └──────────┬────────┘
                               ↓
                    ┌─────────────────────┐
                    │ POST /buscar        │
                    │ { docid: "244" }    │
                    └──────────┬────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Consulta ADM Cloud  │
                    │ LocationTransfers   │
                    └──────────┬────────┘
                               ↓
                    ┌─────────────────────┐
                    │ ¿Encontrada?       │
                    └───┬─────────────┬───┘
                        │ NO          │ SÍ
                        ↓             ↓
            ┌───────────────┐  ┌──────────────────┐
            │ Error 404     │  │ Crea/Actualiza    │
            │ No encontrada │  │ Transferencia    │
            └───────────────┘  │ PENDIENTE        │
                               └──────────┬───────┘
                                          ↓
                               ┌──────────────────┐
                               │ Muestra productos│
                               │ y ubicaciones    │
                               └──────────┬───────┘
                                          ↓
                               ┌──────────────────┐
                               │ Usuario asigna   │
                               │ ubicaciones fís. │
                               └──────────┬───────┘
                                          ↓
                               ┌──────────────────┐
                               │ POST /registrar  │
                               │ productos_ubic.   │
                               └──────────┬───────┘
                                          ↓
                               ┌──────────────────┐
                               │ Valida stock     │
                               │ suficiente?      │
                               └───┬──────────┬───┘
                                   │ NO       │ SÍ
                                   ↓          ↓
                        ┌──────────────┐  ┌──────────────┐
                        │ Error: Stock │  │ Procesa cada │
                        │ insuficiente │  │ producto     │
                        └──────────────┘  └──────┬───────┘
                                                  ↓
                                          ┌──────────────┐
                                          │ Resta origen │
                                          │ Suma destino │
                                          └──────┬───────┘
                                                  ↓
                                          ┌──────────────┐
                                          │ Crea Movim.  │
                                          │ tipo TRANSFER│
                                          └──────┬───────┘
                                                  ↓
                                          ┌──────────────┐
                                          │ Marca como   │
                                          │ PROCESADA    │
                                          └──────┬───────┘
                                                  ↓
                                          ┌──────────────┐
                                          │ Retorna éxito│
                                          └──────────────┘
```

---

## 🔍 ANÁLISIS DE LA PREGUNTA DEL USUARIO

### **Pregunta Original:**

> "Cuando un artículo se pone en 0 en ADM (transferencia), entiendo que en ADM no es detectado en la sincronización. ¿Cómo resuelve esto? Saca el único artículo que había en P2-P1-AL-N2 con un documento de transferencia interna, pero cuando consulto el producto el sistema aún ve stock en esa ubicación a pesar de haber sincronizado."

### **Análisis:**

**Lo que está pasando:**

1. ✅ **Transferencia en ADM Cloud:**
   - Usuario transfiere PA-001 de P2-P1-AL-N2 hacia otra ubicación
   - ADM Cloud actualiza stock: P2-P1-AL-N2 = 0

2. ✅ **Sincronización:**
   - Regla de Oro #1 detecta que PA-001 desapareció de `/api/Stock` para P2-P1-AL-N2
   - Actualiza `StockProductoADM.stock = 0` para esa ubicación ✅

3. ❌ **Stock Físico WMS:**
   - `StockUbicacion` sigue mostrando stock porque:
     - La transferencia NO se registró en el WMS
     - El WMS no sabe que hubo una transferencia
     - Solo se actualiza cuando registras movimientos en el WMS

4. ❌ **Consulta de Producto:**
   - Muestra stock físico desde `StockUbicacion`
   - Como no se registró la transferencia, el stock físico no cambió

### **Solución:**

**El sistema NO espera el registro del documento en el módulo de transferencias automáticamente.**

**Debes:**
1. Buscar la transferencia #244 en el módulo de Transferencias
2. Registrar la transferencia en el WMS
3. Esto actualizará `StockUbicacion` correctamente

**Alternativa:**
- Crear un ajuste manual para reducir el stock en P2-P1-AL-N2

---

## 📝 RESUMEN EJECUTIVO

### **Funcionamiento del Módulo:**

1. **Búsqueda:** Consulta ADM Cloud y crea registro PENDIENTE
2. **Registro:** Valida stock, actualiza `StockUbicacion`, crea movimientos
3. **Trazabilidad:** Registra usuarios, fechas, y movimientos completos

### **Características Clave:**

- ✅ **Idempotencia:** No permite procesar dos veces
- ✅ **Validación de Stock:** Verifica stock suficiente antes de transferir
- ✅ **Auditoría:** Registra usuario solicitante y procesador
- ✅ **Trazabilidad:** Movimientos completos con origen, destino, cantidad

### **Limitaciones:**

- ⚠️ **No actualiza stock ERP automáticamente** (solo físico)
- ⚠️ **No valida mapeo ADM ↔ WMS** (validación manual)
- ⚠️ **No permite transferencias parciales**
- ⚠️ **No tiene reversión automática**

### **Respuesta a la Pregunta:**

**El sistema NO espera automáticamente el registro del documento.** 

**Flujo correcto:**
1. Transferencia en ADM Cloud → Stock ERP cambia
2. Sincronización → Detecta cambio (Regla de Oro #1) → Actualiza `StockProductoADM`
3. **Registro en WMS** → Actualiza `StockUbicacion` (físico)
4. Consulta → Muestra ambos stocks actualizados

**Si no registras la transferencia en el WMS:**
- Stock ERP: ✅ Actualizado (por sincronización)
- Stock Físico: ❌ No actualizado (porque no se registró)
- Resultado: **DISCREPANCIA** (Regla de Oro #3)

---

**Fin del Informe**



