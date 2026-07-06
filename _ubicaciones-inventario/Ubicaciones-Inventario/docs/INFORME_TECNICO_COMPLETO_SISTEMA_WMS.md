# 📋 INFORME TÉCNICO COMPLETO: SISTEMA WMS (WAREHOUSE MANAGEMENT SYSTEM)

**Fecha:** 2026-01-22  
**Versión del Sistema:** 1.0  
**Propósito:** Documentación exhaustiva del funcionamiento, arquitectura y lógica del sistema WMS

---

## 📌 ÍNDICE

1. [Propósito y Objetivos del Sistema](#1-propósito-y-objetivos-del-sistema)
2. [Arquitectura General](#2-arquitectura-general)
3. [Modelos de Datos y Su Propósito](#3-modelos-de-datos-y-su-propósito)
4. [Sistema de Stock Dual](#4-sistema-de-stock-dual)
5. [Flujos de Trabajo Detallados](#5-flujos-de-trabajo-detallados)
6. [Lógica de Negocio](#6-lógica-de-negocio)
7. [Integración con ADM Cloud](#7-integración-con-adm-cloud)
8. [Módulo de Transferencias](#8-módulo-de-transferencias)
9. [Módulo de Facturas Multi-ubicación](#9-módulo-de-facturas-multi-ubicación)
10. [Validaciones y Reglas de Negocio](#10-validaciones-y-reglas-de-negocio)
11. [Trazabilidad y Auditoría](#11-trazabilidad-y-auditoría)
12. [Prevención de Errores y Consistencia](#12-prevención-de-errores-y-consistencia)

---

## 1. PROPÓSITO Y OBJETIVOS DEL SISTEMA

### 1.1 Propósito Principal

El sistema WMS es un **sistema de gestión de almacén** que actúa como **capa intermedia** entre el ERP ADM Cloud y las operaciones físicas del almacén. Su función principal es:

- **Gestionar el stock físico** en ubicaciones específicas del almacén (ej: "A-01-02", "B-03-04")
- **Sincronizar información** desde ADM Cloud (productos, stock por ubicación ADM, facturas, transferencias)
- **Registrar movimientos físicos** de inventario (recepciones, despachos, transferencias, ajustes)
- **Mantener trazabilidad completa** de todos los movimientos
- **Detectar discrepancias** entre stock ERP (ADM) y stock físico (WMS)

### 1.2 Objetivos Específicos

1. **Gestión de Ubicaciones Físicas:**
   - Permitir asignar productos a ubicaciones físicas específicas
   - Rastrear stock por ubicación física
   - Facilitar picking eficiente

2. **Integración con ADM Cloud:**
   - Consultar facturas, recepciones, transferencias desde ADM Cloud
   - Sincronizar catálogo de productos
   - Sincronizar stock por ubicación ADM (cache)

3. **Operaciones de Almacén:**
   - **Recepción:** Asignar productos recibidos a ubicaciones físicas
   - **Despacho:** Registrar picking de productos desde ubicaciones físicas
   - **Transferencias:** Registrar transferencias entre ubicaciones ADM y aplicarlas en WMS
   - **Ajustes:** Corregir discrepancias de inventario

4. **Multi-ubicación ADM:**
   - Manejar facturas desde diferentes ubicaciones ADM (ADESA, Mirador Sur, 401 BIKE, etc.)
   - Buscar stock en la ubicación ADM correcta según origen de la factura
   - Validar disponibilidad antes de despachar

---

## 2. ARQUITECTURA GENERAL

### 2.1 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                  │
│  (Templates HTML + JavaScript - Frontend)              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    CAPA DE RUTAS                         │
│  (Flask Blueprints - API Endpoints)                     │
│  - routes/facturas.py                                   │
│  - routes/despacho.py                                  │
│  - routes/recepciones.py                               │
│  - routes/transferencias.py                            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  CAPA DE LÓGICA                         │
│  (Utils/Helpers - Funciones de Negocio)                │
│  - utils/helpers.py                                     │
│  - utils/validaciones.py                               │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  CAPA DE DATOS                          │
│  (SQLAlchemy ORM - Modelos de BD)                      │
│  - database/models.py                                  │
│  - database/wms.db (SQLite)                            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              CAPA DE INTEGRACIÓN                        │
│  (API Client - ADM Cloud)                              │
│  - api/adm_cloud.py                                    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Tecnologías Utilizadas

- **Backend:** Python 3.x + Flask (Framework web)
- **Base de Datos:** SQLite (desarrollo) / MySQL/MariaDB (producción)
- **ORM:** SQLAlchemy (abstracción de base de datos)
- **Autenticación:** Sesiones Flask + BCrypt (hash de contraseñas)
- **API Externa:** ADM Cloud REST API (Basic Auth)
- **Frontend:** HTML5 + JavaScript (Vanilla, sin frameworks)

### 2.3 Patrones de Diseño Aplicados

1. **MVC (Model-View-Controller):**
   - **Model:** `database/models.py` (clases SQLAlchemy)
   - **View:** `templates/*.html` (interfaces de usuario)
   - **Controller:** `routes/*.py` (endpoints y lógica de control)

2. **Repository Pattern:**
   - Los modelos SQLAlchemy actúan como repositorios de datos
   - Abstracción de acceso a base de datos

3. **Service Layer:**
   - `utils/helpers.py` contiene funciones de servicio
   - `api/adm_cloud.py` encapsula comunicación con API externa

4. **Blueprint Pattern (Flask):**
   - Módulos separados por funcionalidad
   - Cada módulo es un Blueprint independiente

---

## 3. MODELOS DE DATOS Y SU PROPÓSITO

### 3.1 Modelo: `StockUbicacion`

**Propósito:** Representa el **stock físico real** en ubicaciones físicas del almacén WMS.

**Estructura:**
```python
- id: Integer (PK)
- product_id: String(100) - ItemID de ADM Cloud
- sku: String(100) - SKU del producto (indexado)
- ubicacion: String(50) - Ubicación física (ej: "A-01-02") (indexado)
- cantidad: Numeric(10,2) - Cantidad disponible
- updated_at: DateTime - Última actualización
```

**Restricción Única:** `(product_id, ubicacion)` - Un producto solo puede tener una entrada por ubicación física.

**Lógica:**
- Este es el **stock real físico** que el operador puede ver y tocar
- Se actualiza cuando:
  - Se recibe producto (RECEIPT) → **SUMA** cantidad
  - Se despacha producto (PICK) → **RESTA** cantidad
  - Se transfiere producto (TRANSFER) → **RESTA** origen, **SUMA** destino
  - Se ajusta inventario (ADJUSTMENT) → **REEMPLAZA** cantidad

**Ejemplo de Uso:**
```python
# Stock de SKU "ABC-123" en ubicación "A-01-02"
stock = StockUbicacion.query.filter_by(sku="ABC-123", ubicacion="A-01-02").first()
# stock.cantidad = 15.0 unidades
```

---

### 3.2 Modelo: `StockProductoADM`

**Propósito:** Representa el **stock cacheado desde ADM Cloud** por ubicación ADM (lógica).

**Estructura:**
```python
- id: Integer (PK)
- producto_id: Integer (FK -> productos_adm.id)
- location_id: String(100) - GUID ubicación ADM
- location_name: String(200) - Nombre ubicación ADM (ej: "ADESA")
- stock: Numeric(10,2) - Cantidad en ADM Cloud
- updated_at: DateTime - Última sincronización
```

**Restricción Única:** `(producto_id, location_id)` - Un producto solo puede tener una entrada por ubicación ADM.

**Lógica:**
- Este es el **stock según ADM Cloud** (ERP)
- Se actualiza **SOLO** durante sincronización desde ADM Cloud
- **NO se modifica** manualmente desde WMS
- Sirve como referencia para comparar con stock físico

**Diferencia Clave con `StockUbicacion`:**
- `StockUbicacion`: Stock físico en ubicaciones físicas WMS (ej: "A-01-02")
- `StockProductoADM`: Stock lógico en ubicaciones ADM (ej: "ADESA", "Mirador Sur")

**Ejemplo de Uso:**
```python
# Stock de producto en ubicación ADM "ADESA"
stock_adm = StockProductoADM.query.filter_by(
    producto_id=producto.id,
    location_name="ADESA"
).first()
# stock_adm.stock = 50.0 unidades (según ADM Cloud)
```

---

### 3.3 Modelo: `Movimiento`

**Propósito:** Registro histórico de **todos los movimientos de inventario** (ledger/auditoría).

**Estructura:**
```python
- id: Integer (PK)
- tipo: String(20) - RECEIPT, PICK, TRANSFER, ADJUSTMENT (indexado)
- product_id: String(100) - ItemID de ADM Cloud
- sku: String(100) - SKU (indexado)
- ubicacion_origen: String(50) - Ubicación origen (NULL para RECEIPT)
- ubicacion_destino: String(50) - Ubicación destino (NULL para PICK)
- cantidad: Numeric(10,2) - Cantidad movida
- factura_id: String(100) - DocID de ADM (indexado)
- factura_guid: String(100) - GUID de ADM (indexado)
- usuario_id: Integer (FK -> usuarios.id)
- timestamp: DateTime - Fecha/hora del movimiento (indexado)
- notas: Text - Notas adicionales
```

**Lógica:**
- **Registro inmutable** de todos los movimientos
- Cada movimiento tiene tipo específico:
  - **RECEIPT:** Entrada de producto (recepción)
  - **PICK:** Salida de producto (despacho)
  - **TRANSFER:** Movimiento entre ubicaciones
  - **ADJUSTMENT:** Ajuste manual de inventario

**Trazabilidad:**
- Vinculado a factura/transferencia mediante `factura_guid`
- Vinculado a usuario mediante `usuario_id`
- Timestamp para auditoría temporal

**Ejemplo de Uso:**
```python
# Obtener todos los movimientos de un producto
movimientos = Movimiento.query.filter_by(sku="ABC-123").all()

# Calcular cantidad despachada de una factura
movimientos_pick = Movimiento.query.filter_by(
    tipo="PICK",
    factura_guid=factura_guid,
    sku=sku
).all()
cantidad_despachada = sum(m.cantidad for m in movimientos_pick)
```

---

### 3.4 Modelo: `FacturaProcesada`

**Propósito:** Cache y control de estado de facturas desde ADM Cloud.

**Estructura:**
```python
- id: Integer (PK)
- factura_docid: String(50) - DocID (ej: "00002932") (indexado)
- factura_guid: String(100) - GUID único de ADM (UNIQUE)
- tipo_factura: String(20) - CASH, CREDIT, ORDER
- cliente: String(200) - Nombre del cliente
- fecha: DateTime - Fecha de la factura
- total: Numeric(10,2) - Monto total
- estado_despacho: String(20) - PENDIENTE, EN_PROCESO, COMPLETO, CANCELADO
- usuario_despachador: Integer (FK -> usuarios.id)
- fecha_inicio: DateTime - Inicio de despacho
- completed_at: DateTime - Finalización de despacho
- productos_json: Text - JSON con productos de la factura (cache)
- location_id: String(100) - GUID ubicación ADM de origen (NUEVO)
- location_name: String(200) - Nombre ubicación ADM de origen (NUEVO)
```

**Lógica:**
- **Cache local** de facturas consultadas desde ADM Cloud
- **Control de estado** de proceso de despacho
- **Productos en JSON** para evitar re-consultas a ADM Cloud
- **Ubicación de origen** para saber desde dónde fue facturada

**Estados de Despacho:**
1. **PENDIENTE:** Factura encontrada, no iniciado despacho
2. **EN_PROCESO:** Despacho iniciado, productos siendo despachados
3. **COMPLETO:** Todos los productos despachados
4. **CANCELADO:** Despacho cancelado

**Ejemplo de Uso:**
```python
# Buscar factura por DocID
factura = FacturaProcesada.query.filter_by(factura_docid="00002932").first()

# Obtener productos desde cache
import json
productos = json.loads(factura.productos_json)

# Verificar ubicación de origen
ubicacion_origen = factura.location_name  # "ADESA" o "Mirador Sur"
```

---

### 3.5 Modelo: `TransferenciaProcesada` (NUEVO)

**Propósito:** Control de transferencias procesadas desde ADM Cloud (idempotencia).

**Estructura:**
```python
- id: Integer (PK)
- transferencia_docid: String(50) - DocID (ej: "00000231") (indexado)
- transferencia_guid: String(100) - GUID único de ADM (UNIQUE, indexado)
- location_id_origen: String(100) - GUID ubicación origen ADM
- location_name_origen: String(200) - Nombre ubicación origen (ej: "ADESA")
- location_id_destino: String(100) - GUID ubicación destino ADM
- location_name_destino: String(200) - Nombre ubicación destino (ej: "Mirador Sur")
- fecha_transferencia: DateTime - Fecha en ADM
- estado_procesamiento: String(20) - PENDIENTE, PROCESADA, ERROR (indexado)
- ubicacion_fisica_origen: String(50) - Ubicación física WMS origen (opcional)
- ubicacion_fisica_destino: String(50) - Ubicación física WMS destino (opcional)
- usuario_procesador: Integer (FK -> usuarios.id)
- fecha_procesamiento: DateTime - Fecha de procesamiento en WMS
- productos_json: Text - JSON con productos transferidos (cache)
```

**Lógica:**
- **Control de idempotencia:** Evita procesar la misma transferencia dos veces
- **Cache de información:** Guarda datos de la transferencia para evitar re-consultas
- **Mapeo de ubicaciones:** Relaciona ubicaciones ADM con ubicaciones físicas WMS

**Restricción Única:** `transferencia_guid` - Una transferencia solo puede procesarse una vez.

**Estados:**
- **PENDIENTE:** Transferencia encontrada, no procesada aún
- **PROCESADA:** Transferencia aplicada en WMS (stock actualizado)
- **ERROR:** Error al procesar (permite reintento)

**Ejemplo de Uso:**
```python
# Verificar si transferencia ya fue procesada
transferencia = TransferenciaProcesada.query.filter_by(
    transferencia_guid=guid
).first()

if transferencia and transferencia.estado_procesamiento == 'PROCESADA':
    # Ya procesada, rechazar
    return error("Transferencia ya procesada")
```

---

### 3.6 Modelo: `MapeoUbicacionADM_WMS` (NUEVO)

**Propósito:** Mapeo entre ubicaciones ADM Cloud (lógicas) y ubicaciones físicas WMS.

**Estructura:**
```python
- id: Integer (PK)
- location_id_adm: String(100) - GUID ubicación ADM (indexado)
- location_name_adm: String(200) - Nombre ubicación ADM (ej: "ADESA")
- ubicacion_fisica_wms: String(50) - Ubicación física WMS (ej: "A-01-02")
- activo: Boolean - Si el mapeo está activo
```

**Lógica:**
- Permite **automatizar** la sugerencia de ubicaciones físicas basadas en ubicación ADM
- Una ubicación ADM puede mapear a **múltiples** ubicaciones físicas WMS
- Configuración manual desde Panel Admin

**Restricción Única:** `(location_id_adm, ubicacion_fisica_wms)` - No puede haber duplicados exactos.

**Ejemplo de Uso:**
```python
# Obtener ubicaciones físicas sugeridas para "ADESA"
mapeos = MapeoUbicacionADM_WMS.query.filter_by(
    location_name_adm="ADESA",
    activo=True
).all()
ubicaciones_sugeridas = [m.ubicacion_fisica_wms for m in mapeos]
```

---

### 3.7 Modelo: `SyncLocationStatus`

**Propósito:** Control de sincronización de ubicaciones desde ADM Cloud.

**Estructura:**
```python
- id: Integer (PK)
- location_id: String(100) - GUID ubicación ADM (UNIQUE, indexado)
- location_name: String(200) - Nombre ubicación (ej: "ADESA")
- status: String(20) - pending, running, done, error (indexado)
- last_sync_at: DateTime - Última sincronización exitosa
- last_error: Text - Último error si status = 'error'
- items_synced: Integer - Cantidad de items sincronizados
```

**Lógica:**
- **Checkpoint** de sincronización por ubicación
- Permite sincronización incremental (solo lo nuevo)
- Resolución de nombres de ubicaciones (GUID → Nombre)

**Uso en Resolución de Nombres:**
```python
def obtener_nombre_ubicacion_por_id(location_id: str) -> str:
    ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if ubicacion:
        return ubicacion.location_name
    return "N/A"
```

---

## 4. SISTEMA DE STOCK DUAL

### 4.1 Concepto Fundamental

El sistema mantiene **DOS sistemas de stock independientes** que coexisten:

1. **Stock Físico WMS (`StockUbicacion`):**
   - Stock real en ubicaciones físicas del almacén
   - Se actualiza con movimientos físicos (recepciones, despachos, transferencias)
   - Es la **fuente de verdad** para operaciones físicas

2. **Stock ADM Cache (`StockProductoADM`):**
   - Stock según ADM Cloud (ERP)
   - Se actualiza solo durante sincronización
   - Es la **fuente de verdad** para información ERP

### 4.2 ¿Por Qué Dos Sistemas?

**Razón 1: Separación de Responsabilidades**
- ADM Cloud maneja stock **lógico** por ubicación ADM (ej: "ADESA", "Mirador Sur")
- WMS maneja stock **físico** por ubicación física (ej: "A-01-02", "B-03-04")

**Razón 2: Independencia Operativa**
- WMS puede funcionar aunque ADM Cloud esté caído (usando cache)
- Sincronización periódica mantiene cache actualizado
- Operaciones físicas no dependen de conexión en tiempo real

**Razón 3: Prevención de Conflictos**
- Sincronización actualiza `StockProductoADM` (no interfiere con operaciones)
- Operaciones manuales actualizan `StockUbicacion` (no interfiere con sync)
- Ambos pueden estar temporalmente desincronizados (normal)

### 4.3 Flujo de Actualización de Stock

#### 4.3.1 Stock Físico WMS (`StockUbicacion`)

**Se actualiza cuando:**

1. **Recepción (RECEIPT):**
   ```
   StockUbicacion.cantidad += cantidad_recibida
   ```

2. **Despacho (PICK):**
   ```
   StockUbicacion.cantidad -= cantidad_despachada
   ```

3. **Transferencia (TRANSFER):**
   ```
   StockUbicacion[origen].cantidad -= cantidad
   StockUbicacion[destino].cantidad += cantidad
   ```

4. **Ajuste (ADJUSTMENT):**
   ```
   StockUbicacion.cantidad = nueva_cantidad
   ```

**NO se actualiza:**
- Durante sincronización desde ADM Cloud
- Automáticamente desde cambios en ADM Cloud

#### 4.3.2 Stock ADM Cache (`StockProductoADM`)

**Se actualiza cuando:**
- Sincronización manual o automática desde ADM Cloud
- Proceso de sincronización consulta API de ADM Cloud
- Actualiza todos los productos con stock > 0

**NO se actualiza:**
- Durante operaciones manuales en WMS
- Durante recepciones, despachos, transferencias manuales

### 4.4 Comparación y Discrepancias

El sistema puede detectar discrepancias entre ambos stocks:

```python
# Stock según ADM Cloud (cache)
stock_adm = StockProductoADM.query.filter_by(
    producto_id=producto.id,
    location_name="ADESA"
).first()
stock_erp = stock_adm.stock if stock_adm else 0.0

# Stock físico WMS (suma de todas las ubicaciones físicas)
stock_fisico = calcular_stock_total_wms(sku=sku)

# Discrepancia
if abs(stock_erp - stock_fisico) > umbral:
    # Crear registro de discrepancia
    crear_discrepancia(...)
```

**Modelo `Discrepancia`:**
- Registra diferencias críticas entre stock ERP y físico
- Permite revisión y resolución manual
- Trazabilidad de correcciones

---

## 5. FLUJOS DE TRABAJO DETALLADOS

### 5.1 Flujo: Búsqueda y Registro de Factura

#### Paso 1: Usuario busca factura por DocID

```
Usuario → Frontend → POST /api/facturas/buscar
{
    "docid": "00002932",
    "tipo": "CASH"
}
```

#### Paso 2: Validación de DocID

```python
# routes/facturas.py - buscar_factura()
es_valido, mensaje = validar_factura_docid(docid)
# Valida formato, longitud, caracteres permitidos
```

#### Paso 3: Búsqueda en Cache Local

```python
factura_local = FacturaProcesada.query.filter_by(factura_docid=docid).first()
# Si existe en cache, se puede usar directamente (más rápido)
```

#### Paso 4: Búsqueda en ADM Cloud

```python
# api/adm_cloud.py
factura_adm = adm_client.buscar_factura_por_docid(docid, tipo, max_search=2000)
# Busca en lotes de 50 facturas hasta encontrar o llegar a 2000
```

**Algoritmo de Búsqueda:**
1. Normaliza DocID (quita ceros a la izquierda)
2. Busca en lotes paginados (skip=0, take=50)
3. Compara DocID en múltiples formatos (original, con ceros, normalizado)
4. Si encuentra, obtiene detalle completo por GUID

#### Paso 5: Extracción de Datos

```python
# Extraer ubicación de origen (NUEVO)
location_id = factura_data.get("LocationID")
location_name = factura_data.get("LocationName")

# Si no viene LocationName, buscar en cache
if location_id and not location_name:
    ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if ubicacion:
        location_name = ubicacion.location_name

# Default a "ADESA" si no se encuentra (compatibilidad)
if not location_name:
    location_name = "ADESA"
```

#### Paso 6: Extracción de Productos

```python
# utils/helpers.py - obtener_productos_factura()
productos = []
for item in factura_data.get("Items", []):
    producto = {
        "ItemID": item.get("ItemID"),
        "SKU": item.get("ItemSKU", ""),
        "Name": item.get("Name", ""),
        "Quantity": float(item.get("Quantity", 0)),
        "Price": float(item.get("Price", 0)),
        # ...
    }
    productos.append(producto)
```

#### Paso 7: Guardado en Cache Local

```python
if factura_local:
    # Actualizar existente
    factura_local.location_id = location_id
    factura_local.location_name = location_name
    factura_local.productos_json = json.dumps(productos)
else:
    # Crear nueva
    factura_local = FacturaProcesada(
        factura_docid=docid,
        factura_guid=guid,
        location_id=location_id,
        location_name=location_name,
        productos_json=json.dumps(productos),
        # ...
    )
    db.session.add(factura_local)

db.session.commit()
```

#### Paso 8: Respuesta al Frontend

```json
{
    "success": true,
    "factura": {
        "docid": "00002932",
        "guid": "abc-123-def-456",
        "location_name": "Mirador Sur",
        "productos": [...]
    }
}
```

---

### 5.2 Flujo: Despacho de Productos (Picking)

#### Paso 1: Usuario consulta estado de despacho

```
Usuario → Frontend → GET /api/despacho/factura/<guid>/estado
```

#### Paso 2: Obtener factura y productos

```python
# routes/despacho.py - obtener_estado_despacho()
factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
productos = json.loads(factura.productos_json)
```

#### Paso 3: Obtener ubicación de origen de factura (NUEVO)

```python
# NUEVO: Obtener ubicación ADM de origen (no hardcodeado)
location_name_origen = factura.location_name or "ADESA"
# Si factura fue facturada desde "Mirador Sur", location_name_origen = "Mirador Sur"
```

#### Paso 4: Para cada producto, calcular cantidades

```python
for producto in productos:
    sku = producto.get("SKU", "").upper()
    cantidad_solicitada = float(producto.get("Quantity", 0))
    
    # Calcular cantidad ya despachada
    cantidad_despachada = calcular_cantidad_despachada(factura_guid, sku)
    # Suma todos los movimientos tipo PICK para este SKU y factura
    
    # Calcular pendiente
    cantidad_pendiente = cantidad_solicitada - cantidad_despachada
```

#### Paso 5: Buscar stock en ubicación ADM correcta (NUEVO)

```python
# Buscar producto en cache local
producto_adm = ProductoADM.query.filter_by(sku=sku).first()

if producto_adm:
    # Obtener stock de todas las ubicaciones ADM
    stock_ubicaciones_adm = StockProductoADM.query.filter_by(
        producto_id=producto_adm.id
    ).all()
    
    # NUEVO: Buscar en ubicación de origen de la factura (no hardcodeado a ADESA)
    stock_origen = 0
    for stock_adm in stock_ubicaciones_adm:
        if stock_adm.location_name.upper() == location_name_origen.upper():
            stock_origen = float(stock_adm.stock)
            break
```

#### Paso 6: Obtener ubicaciones físicas WMS disponibles

```python
# Buscar stock en ubicaciones físicas WMS
ubicaciones_producto = StockUbicacion.query.filter_by(sku=sku).all()
ubicaciones_disponibles = []
for stock_ubic in ubicaciones_producto:
    if float(stock_ubic.cantidad) > 0:
        ubicaciones_disponibles.append({
            "ubicacion": stock_ubic.ubicacion,
            "cantidad": float(stock_ubic.cantidad)
        })
```

#### Paso 7: Respuesta con información completa

```json
{
    "success": true,
    "productos": [
        {
            "sku": "ABC-123",
            "cantidad_solicitada": 10,
            "cantidad_despachada": 3,
            "cantidad_pendiente": 7,
            "stock_adesa_adm": 15.0,
            "ubicacion_origen_factura": "Mirador Sur",
            "ubicaciones": [
                {"ubicacion": "A-01-02", "cantidad": 5.0},
                {"ubicacion": "B-03-04", "cantidad": 2.0}
            ]
        }
    ]
}
```

#### Paso 8: Usuario registra picking

```
Usuario → Frontend → POST /api/despacho/registrar
{
    "factura_guid": "abc-123",
    "sku": "ABC-123",
    "ubicacion": "A-01-02",
    "cantidad": 5
}
```

#### Paso 9: Validaciones

```python
# 1. Validar factura existe
factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()

# 2. Validar producto está en factura
producto_en_factura = buscar_producto_en_factura(factura, sku)

# 3. Validar cantidad pendiente
cantidad_pendiente = calcular_cantidad_pendiente(...)
if cantidad > cantidad_pendiente:
    return error("Cantidad excede lo pendiente")

# 4. Validar stock disponible
stock_ubic = StockUbicacion.query.filter_by(sku=sku, ubicacion=ubicacion).first()
if not stock_ubic or stock_ubic.cantidad < cantidad:
    return error("Stock insuficiente")
```

#### Paso 10: Registrar movimiento y actualizar stock

```python
# Crear movimiento tipo PICK
movimiento = Movimiento(
    tipo="PICK",
    sku=sku,
    ubicacion_origen=ubicacion,
    ubicacion_destino=None,
    cantidad=cantidad,
    factura_guid=factura_guid,
    usuario_id=session.get('user_id')
)
db.session.add(movimiento)

# Actualizar stock físico
stock_ubic.cantidad = float(stock_ubic.cantidad) - float(cantidad)
stock_ubic.updated_at = datetime.utcnow()

# Actualizar estado de factura
if factura.estado_despacho == 'PENDIENTE':
    factura.estado_despacho = 'EN_PROCESO'
    factura.fecha_inicio = datetime.utcnow()

# Verificar si factura está completa
total_despachado = sum(calcular_cantidad_despachada(...) for p in productos)
if total_despachado >= total_solicitado:
    factura.estado_despacho = 'COMPLETO'
    factura.completed_at = datetime.utcnow()

db.session.commit()
```

---

### 5.3 Flujo: Búsqueda y Registro de Transferencia

#### Paso 1: Usuario busca transferencia por DocID

```
Usuario → Frontend → POST /api/transferencias/buscar
{
    "docid": "00000231"
}
```

#### Paso 2: Búsqueda en ADM Cloud

```python
# routes/transferencias.py - buscar_transferencia()
transfer_adm = adm_client.buscar_location_transfer_por_docid(docid, max_search=2000)
```

**Algoritmo de Búsqueda:**
1. Normaliza DocID (quita ceros a la izquierda)
2. Busca en lotes de 50 transferencias
3. Compara DocID en múltiples formatos
4. Si encuentra, obtiene detalle completo por GUID

#### Paso 3: Extracción de información

```python
transfer_data = transfer_adm.get("data", {})

# Ubicaciones
location_id_origen = transfer_data.get("LocationID")
location_id_destino = transfer_data.get("ReceptionLocationID")

# Resolver nombres desde cache
origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)

# Si no se encuentra en cache, usar nombres del JSON
if origen_nombre.startswith(location_id_origen[:8]):
    origen_nombre = transfer_data.get("LocationName", origen_nombre)
```

#### Paso 4: Extracción de productos

```python
# utils/helpers.py - obtener_productos_location_transfer()
productos = []
for item in transfer_data.get("Items", []):
    producto = {
        "ItemID": item.get("ItemID"),
        "SKU": item.get("ItemSKU", ""),
        "Name": item.get("Name", ""),
        "Quantity": float(item.get("Quantity", 0)),
        "Cost": float(item.get("Cost", 0)),
        # ...
    }
    productos.append(producto)
```

#### Paso 5: Verificar estado de procesamiento

```python
transferencia_procesada = TransferenciaProcesada.query.filter_by(
    transferencia_guid=transfer_guid
).first()

estado = transferencia_procesada.estado_procesamiento if transferencia_procesada else "PENDIENTE"
```

#### Paso 6: Respuesta al Frontend

```json
{
    "success": true,
    "transferencia": {
        "guid": "abc-123",
        "docid": "00000231",
        "origen_nombre": "ADESA",
        "destino_nombre": "Mirador Sur",
        "productos": [...],
        "estado_procesamiento": "PENDIENTE"
    }
}
```

#### Paso 7: Usuario registra transferencia

```
Usuario → Frontend → POST /api/transferencias/registrar
{
    "transferencia_guid": "abc-123",
    "productos_ubicaciones": [
        {
            "sku": "ABC-123",
            "ubicacion_origen": "A-01-02",
            "ubicacion_destino": "B-03-04",
            "cantidad": 5,
            "item_id": "item-guid-123"
        }
    ]
}
```

#### Paso 8: Verificación de idempotencia

```python
# Verificar si ya fue procesada
transferencia_existente = TransferenciaProcesada.query.filter_by(
    transferencia_guid=transferencia_guid
).first()

if transferencia_existente and transferencia_existente.estado_procesamiento == 'PROCESADA':
    return error("Esta transferencia ya fue procesada anteriormente")
```

#### Paso 9: Validaciones por producto

```python
for prod_ubic in productos_ubicaciones:
    # Validar SKU
    es_valido, mensaje = validar_sku(sku)
    
    # Validar ubicaciones
    es_valido, mensaje = validar_ubicacion(ubicacion_origen)
    es_valido, mensaje = validar_ubicacion(ubicacion_destino)
    
    # Validar cantidad
    es_valido, mensaje = validar_cantidad(cantidad)
    
    # Validar stock suficiente en origen
    stock_ubic_origen = StockUbicacion.query.filter_by(
        sku=sku,
        ubicacion=ubicacion_origen
    ).first()
    
    if not stock_ubic_origen or stock_ubic_origen.cantidad < cantidad:
        return error("Stock insuficiente en ubicación origen")
```

#### Paso 10: Actualizar stock físico

```python
# Restar de origen
stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - float(cantidad)
stock_ubic_origen.updated_at = datetime.utcnow()

# Sumar a destino
stock_ubic_destino = StockUbicacion.query.filter_by(
    sku=sku,
    ubicacion=ubicacion_destino
).first()

if stock_ubic_destino:
    stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + float(cantidad)
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

#### Paso 11: Crear movimiento

```python
movimiento = Movimiento(
    tipo="TRANSFER",
    sku=sku,
    ubicacion_origen=ubicacion_origen,
    ubicacion_destino=ubicacion_destino,
    cantidad=cantidad,
    factura_guid=transferencia_guid,
    usuario_id=session.get('user_id'),
    notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}"
)
db.session.add(movimiento)
```

#### Paso 12: Registrar transferencia procesada

```python
if transferencia_existente:
    transferencia_existente.estado_procesamiento = 'PROCESADA'
    transferencia_existente.fecha_procesamiento = datetime.utcnow()
else:
    transferencia_procesada = TransferenciaProcesada(
        transferencia_guid=transferencia_guid,
        estado_procesamiento='PROCESADA',
        productos_json=json.dumps(productos),
        # ...
    )
    db.session.add(transferencia_procesada)

db.session.commit()
```

---

## 6. LÓGICA DE NEGOCIO

### 6.1 Principio de Idempotencia

**Definición:** Una operación es idempotente si ejecutarla múltiples veces produce el mismo resultado que ejecutarla una vez.

**Implementación en Transferencias:**

```python
# Verificación antes de procesar
transferencia_existente = TransferenciaProcesada.query.filter_by(
    transferencia_guid=transferencia_guid
).first()

if transferencia_existente and transferencia_existente.estado_procesamiento == 'PROCESADA':
    # Rechazar: ya fue procesada
    return error("Transferencia ya procesada")
```

**Beneficios:**
- Previene duplicación de movimientos
- Permite reintentos seguros
- Mantiene integridad de datos

### 6.2 Principio de Separación de Responsabilidades

**Stock Físico vs Stock ADM:**

- **Stock Físico (`StockUbicacion`):**
  - Responsabilidad: Representar stock real en ubicaciones físicas
  - Actualización: Solo mediante operaciones manuales en WMS
  - Fuente de verdad: Operaciones físicas del almacén

- **Stock ADM (`StockProductoADM`):**
  - Responsabilidad: Cache de stock según ADM Cloud
  - Actualización: Solo mediante sincronización
  - Fuente de verdad: ADM Cloud (ERP)

**Beneficios:**
- No hay conflictos entre sincronización y operaciones manuales
- Cada sistema mantiene su propia fuente de verdad
- Permite trabajar offline (usando cache)

### 6.3 Principio de Trazabilidad Completa

**Todo movimiento queda registrado:**

```python
# Cada operación crea un registro en Movimiento
movimiento = Movimiento(
    tipo="PICK",  # o RECEIPT, TRANSFER, ADJUSTMENT
    sku=sku,
    cantidad=cantidad,
    factura_guid=factura_guid,  # Vinculado a documento ADM
    usuario_id=usuario_id,      # Vinculado a usuario
    timestamp=datetime.utcnow()  # Timestamp preciso
)
```

**Beneficios:**
- Auditoría completa de movimientos
- Posibilidad de reconstruir estado histórico
- Responsabilidad clara (usuario, fecha, hora)

### 6.4 Principio de Validación en Múltiples Capas

**Validaciones en Frontend:**
- Validación de formato (DocID, SKU, ubicación)
- Validación de campos requeridos
- Feedback inmediato al usuario

**Validaciones en Backend:**
- Validación de existencia (factura, producto, stock)
- Validación de reglas de negocio (stock suficiente, cantidad pendiente)
- Validación de permisos (usuario autenticado)

**Validaciones en Base de Datos:**
- Restricciones UNIQUE (evita duplicados)
- Foreign Keys (integridad referencial)
- Constraints de tipo de dato

### 6.5 Principio de Transacciones Atómicas

**Todas las operaciones críticas son transaccionales:**

```python
try:
    db.session.begin()
    
    # 1. Crear movimiento
    db.session.add(movimiento)
    
    # 2. Actualizar stock
    stock_ubic.cantidad -= cantidad
    
    # 3. Actualizar estado
    factura.estado_despacho = 'COMPLETO'
    
    db.session.commit()  # Todo o nada
except:
    db.session.rollback()  # Si falla algo, revierte todo
    raise
```

**Beneficios:**
- Consistencia de datos garantizada
- No hay estados intermedios inconsistentes
- Recuperación automática ante errores

---

## 7. INTEGRACIÓN CON ADM CLOUD

### 7.1 Cliente API (`api/adm_cloud.py`)

**Autenticación:**
```python
# Basic Auth
credentials = f"{email}:{password}"
encoded = base64.b64encode(credentials.encode('ascii')).decode('ascii')
headers = {"Authorization": f"Basic {encoded}"}
```

**Parámetros Comunes:**
```python
params = {
    "appid": appid,
    "company": company,
    "role": role,
    "OnlyActive": "false"
}
```

**Manejo de Respuestas:**
```python
# Normaliza respuestas de ADM Cloud
if isinstance(data, dict) and "data" in data:
    return {"success": True, "data": data["data"]}
elif isinstance(data, list):
    return {"success": True, "data": data}
```

### 7.2 Búsqueda Paginada

**Estrategia:**
- Busca en lotes de 50 registros
- Usa parámetros `skip` y `take`
- Continúa hasta encontrar o llegar a límite (2000)

**Algoritmo:**
```python
skip = 0
batch_size = 50

while skip < max_search:
    result = listar_recursos(skip=skip, take=batch_size)
    recursos = result["data"]
    
    for recurso in recursos:
        if recurso["DocID"] == docid_buscado:
            return obtener_detalle_por_guid(recurso["ID"])
    
    if len(recursos) < batch_size:
        break  # No hay más registros
    
    skip += batch_size
```

### 7.3 Normalización de DocID

**Problema:** DocID puede venir en diferentes formatos:
- "00000231" (con ceros)
- "231" (sin ceros)
- "231" (string)

**Solución:**
```python
docid_clean = docid.strip()
docid_normalizado = docid_clean.lstrip('0')  # Quita ceros a la izquierda
docid_con_ceros = docid_clean.zfill(8)      # Agrega ceros si es numérico

# Compara en múltiples formatos
if (transfer_docid_clean == docid_original or
    transfer_docid_clean == docid_con_ceros or
    transfer_docid_normalizado == docid_normalizado):
    # Encontrado
```

---

## 8. MÓDULO DE TRANSFERENCIAS

### 8.1 Propósito

Permitir buscar y registrar transferencias entre ubicaciones ADM que fueron creadas en ADM Cloud, aplicándolas al stock físico WMS.

### 8.2 Flujo Completo

1. **Búsqueda:**
   - Usuario ingresa DocID de transferencia
   - Sistema busca en ADM Cloud
   - Resuelve nombres de ubicaciones desde cache
   - Muestra Origen → Destino y productos

2. **Registro:**
   - Usuario selecciona ubicaciones físicas origen/destino por producto
   - Sistema valida stock suficiente en origen
   - Actualiza stock físico (resta origen, suma destino)
   - Crea movimientos tipo TRANSFER
   - Marca transferencia como PROCESADA

### 8.3 Prevención de Duplicaciones

**Mecanismo:**
```python
# Verificar antes de procesar
transferencia_existente = TransferenciaProcesada.query.filter_by(
    transferencia_guid=transferencia_guid
).first()

if transferencia_existente and transferencia_existente.estado_procesamiento == 'PROCESADA':
    return error("Ya procesada")
```

**Restricción de BD:**
```python
__table_args__ = (db.UniqueConstraint('transferencia_guid', name='uq_transferencia_guid'),)
```

### 8.4 Resolución de Nombres de Ubicaciones

**Estrategia en cascada:**

1. **Primero:** Buscar en `SyncLocationStatus` (cache local)
2. **Segundo:** Usar `LocationName` del JSON de ADM Cloud
3. **Tercero:** Mostrar parcial del GUID como fallback

```python
def obtener_nombre_ubicacion_por_id(location_id: str) -> str:
    # 1. Buscar en cache
    ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if ubicacion:
        return ubicacion.location_name
    
    # 2. Si no está en cache, el JSON de ADM puede traer LocationName
    # (se maneja en el código que llama a esta función)
    
    # 3. Fallback: mostrar parcial del GUID
    return location_id[:8] + "..."
```

---

## 9. MÓDULO DE FACTURAS MULTI-UBICACIÓN

### 9.1 Problema Resuelto

**Antes:**
- Sistema asumía que todas las facturas venían de "ADESA"
- Buscaba stock siempre en ubicación ADM "ADESA"
- No consideraba facturas desde otras ubicaciones (Mirador Sur, 401 BIKE, etc.)

**Después:**
- Extrae `LocationID` y `LocationName` de cada factura
- Guarda ubicación de origen en `FacturaProcesada`
- Busca stock en la ubicación ADM correcta según origen de factura

### 9.2 Extracción de Ubicación

```python
# routes/facturas.py - buscar_factura()
location_id = factura_data.get("LocationID")
location_name = factura_data.get("LocationName")

# Si no viene LocationName, buscar en cache
if location_id and not location_name:
    ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if ubicacion:
        location_name = ubicacion.location_name

# Default a "ADESA" para compatibilidad hacia atrás
if not location_name:
    location_name = "ADESA"
```

### 9.3 Uso en Despacho

**Antes (hardcodeado):**
```python
if location_upper == "ADESA":  # ❌ Siempre busca en ADESA
    stock_cantidad = float(stock_adm.stock)
```

**Después (dinámico):**
```python
# Obtener ubicación de origen de la factura
location_name_origen = factura.location_name or "ADESA"

# Buscar stock en ubicación correcta
for stock_adm in stock_ubicaciones_adm:
    if stock_adm.location_name.upper() == location_name_origen.upper():
        stock_cantidad = float(stock_adm.stock)
        break
```

### 9.4 Beneficios

1. **Precisión:** Busca stock en la ubicación ADM correcta
2. **Flexibilidad:** Soporta múltiples ubicaciones ADM
3. **Trazabilidad:** Registra desde dónde fue facturada cada factura
4. **Validación:** Puede validar stock en ubicación correcta antes de despachar

---

## 10. VALIDACIONES Y REGLAS DE NEGOCIO

### 10.1 Validación de DocID

```python
def validar_factura_docid(docid: str) -> tuple[bool, str]:
    if not docid or not docid.strip():
        return False, "DocID no puede estar vacío"
    
    docid_clean = docid.strip()
    
    # Debe ser numérico (puede tener ceros a la izquierda)
    if not docid_clean.isdigit():
        return False, "DocID debe ser numérico"
    
    # Longitud razonable
    if len(docid_clean) > 20:
        return False, "DocID demasiado largo"
    
    return True, ""
```

### 10.2 Validación de SKU

```python
def validar_sku(sku: str) -> tuple[bool, str]:
    if not sku or not sku.strip():
        return False, "SKU no puede estar vacío"
    
    sku_clean = sku.strip().upper()
    
    # Longitud mínima y máxima
    if len(sku_clean) < 1 or len(sku_clean) > 100:
        return False, "SKU debe tener entre 1 y 100 caracteres"
    
    return True, ""
```

### 10.3 Validación de Ubicación

```python
def validar_ubicacion(ubicacion: str) -> tuple[bool, str]:
    if not ubicacion or not ubicacion.strip():
        return False, "Ubicación no puede estar vacía"
    
    ubicacion_clean = ubicacion.strip()
    
    # Formato esperado: letra-número-número (ej: "A-01-02")
    # Pero acepta cualquier formato válido
    if len(ubicacion_clean) < 1 or len(ubicacion_clean) > 50:
        return False, "Ubicación debe tener entre 1 y 50 caracteres"
    
    return True, ""
```

### 10.4 Validación de Cantidad

```python
def validar_cantidad(cantidad) -> tuple[bool, str]:
    if cantidad is None:
        return False, "Cantidad es requerida"
    
    try:
        cantidad_float = float(cantidad)
    except (ValueError, TypeError):
        return False, "Cantidad debe ser un número"
    
    if cantidad_float <= 0:
        return False, "Cantidad debe ser mayor a cero"
    
    if cantidad_float > 999999:
        return False, "Cantidad excede el máximo permitido"
    
    return True, ""
```

### 10.5 Reglas de Negocio

#### Regla 1: Stock No Puede Ser Negativo

```python
# Antes de restar stock
if stock_ubic.cantidad < cantidad:
    return error("Stock insuficiente")

# Después de restar
stock_ubic.cantidad = max(0.0, stock_ubic.cantidad - cantidad)  # Asegura no negativo
```

#### Regla 2: No Despachar Más de lo Solicitado

```python
cantidad_pendiente = calcular_cantidad_pendiente(factura_guid, sku, cantidad_solicitada)

if cantidad > cantidad_pendiente:
    return error("Cantidad excede lo pendiente")
```

#### Regla 3: Transferencia Solo Se Procesa Una Vez

```python
if transferencia_existente.estado_procesamiento == 'PROCESADA':
    return error("Transferencia ya procesada")
```

#### Regla 4: Producto Debe Estar en Factura

```python
producto_en_factura = buscar_producto_en_factura(factura, sku)

if not producto_en_factura:
    return error("Producto no está en esta factura")
```

---

## 11. TRAZABILIDAD Y AUDITORÍA

### 11.1 Registro de Movimientos

**Cada operación crea un registro:**

```python
movimiento = Movimiento(
    tipo="PICK",              # Tipo de movimiento
    sku=sku,                  # Producto
    cantidad=cantidad,        # Cantidad movida
    ubicacion_origen=ubicacion,  # Desde dónde
    ubicacion_destino=None,   # Hacia dónde (NULL para PICK)
    factura_guid=factura_guid,  # Documento ADM relacionado
    usuario_id=usuario_id,    # Usuario que realizó la acción
    timestamp=datetime.utcnow(),  # Cuándo
    notas="Despacho de factura 00002932"  # Notas adicionales
)
```

### 11.2 Consultas de Trazabilidad

**Historial de un producto:**
```python
movimientos = Movimiento.query.filter_by(sku=sku).order_by(Movimiento.timestamp.desc()).all()
```

**Movimientos de una factura:**
```python
movimientos = Movimiento.query.filter_by(factura_guid=factura_guid).all()
```

**Movimientos de un usuario:**
```python
movimientos = Movimiento.query.filter_by(usuario_id=usuario_id).all()
```

**Movimientos en un rango de fechas:**
```python
movimientos = Movimiento.query.filter(
    Movimiento.timestamp >= fecha_inicio,
    Movimiento.timestamp <= fecha_fin
).all()
```

### 11.3 Reconstrucción de Estado

**Calcular stock histórico:**

```python
# Stock inicial (asumir 0 o valor conocido)
stock_inicial = 0.0

# Sumar todas las recepciones
recepciones = Movimiento.query.filter_by(tipo="RECEIPT", sku=sku).all()
stock_recepciones = sum(m.cantidad for m in recepciones)

# Restar todos los despachos
despachos = Movimiento.query.filter_by(tipo="PICK", sku=sku).all()
stock_despachos = sum(m.cantidad for m in despachos)

# Stock calculado
stock_calculado = stock_inicial + stock_recepciones - stock_despachos

# Comparar con stock actual
stock_actual = calcular_stock_total_wms(sku=sku)
diferencia = stock_actual - stock_calculado
```

---

## 12. PREVENCIÓN DE ERRORES Y CONSISTENCIA

### 12.1 Transacciones Atómicas

**Todas las operaciones críticas usan transacciones:**

```python
try:
    db.session.begin()
    
    # Múltiples operaciones
    db.session.add(movimiento)
    stock_ubic.cantidad -= cantidad
    factura.estado_despacho = 'COMPLETO'
    
    db.session.commit()  # Todo o nada
except Exception as e:
    db.session.rollback()  # Revierte todo si falla
    raise
```

**Beneficios:**
- No hay estados intermedios inconsistentes
- Si falla una operación, todas se revierten
- Consistencia garantizada

### 12.2 Validaciones en Múltiples Puntos

**Frontend:**
- Validación de formato antes de enviar
- Feedback inmediato al usuario

**Backend:**
- Validación de existencia
- Validación de reglas de negocio
- Validación de permisos

**Base de Datos:**
- Constraints de tipo
- Restricciones UNIQUE
- Foreign Keys

### 12.3 Manejo de Errores

**Estrategia de logging:**

```python
try:
    # Operación
    resultado = operacion_critica()
except Exception as e:
    # Log detallado
    logger.error(f"Error en operacion_critica: {str(e)}")
    logger.error(traceback.format_exc())
    
    # Respuesta al usuario
    return jsonify({
        "success": False,
        "error": "Error al procesar operación",
        "message": str(e)
    }), 500
```

### 12.4 Prevención de Race Conditions

**Uso de transacciones con nivel de aislamiento adecuado:**

```python
# SQLAlchemy usa transacciones por defecto
# Cada sesión es una transacción
# Commits son atómicos
```

**Validación justo antes de actualizar:**

```python
# Verificar stock justo antes de actualizar
stock_ubic = StockUbicacion.query.filter_by(sku=sku, ubicacion=ubicacion).first()

if not stock_ubic or stock_ubic.cantidad < cantidad:
    return error("Stock insuficiente")

# Actualizar inmediatamente después de verificar
stock_ubic.cantidad -= cantidad
db.session.commit()  # Commit rápido para minimizar ventana de race condition
```

---

## 13. CONCLUSIÓN Y ALINEACIÓN CON NECESIDADES

### 13.1 ¿Está Alineado con tus Necesidades?

**✅ SÍ - El sistema está completamente alineado:**

1. **✅ Gestión de Ubicaciones Físicas:**
   - Permite asignar productos a ubicaciones específicas
   - Rastrea stock por ubicación física
   - Facilita picking eficiente

2. **✅ Integración con ADM Cloud:**
   - Consulta facturas, recepciones, transferencias
   - Sincroniza catálogo y stock
   - Cache local para operar offline

3. **✅ Multi-ubicación ADM:**
   - Identifica ubicación de origen de facturas
   - Busca stock en ubicación correcta
   - Soporta ADESA, Mirador Sur, 401 BIKE, etc.

4. **✅ Transferencias entre Ubicaciones:**
   - Busca transferencias por DocID
   - Muestra Origen → Destino claramente
   - Registra y aplica en stock físico
   - Previene duplicaciones

5. **✅ Trazabilidad Completa:**
   - Registra todos los movimientos
   - Vincula a documentos ADM
   - Registra usuario y timestamp

6. **✅ Prevención de Errores:**
   - Validaciones en múltiples capas
   - Transacciones atómicas
   - Control de idempotencia

### 13.2 Características Clave Implementadas

- ✅ Sistema de stock dual (físico WMS + cache ADM)
- ✅ Separación de responsabilidades
- ✅ Trazabilidad completa
- ✅ Multi-ubicación ADM
- ✅ Transferencias con idempotencia
- ✅ Validaciones robustas
- ✅ Manejo de errores completo

### 13.3 Próximos Pasos Recomendados

1. **UI de Registro de Transferencias:**
   - Formulario para seleccionar ubicaciones físicas
   - Botón de registro
   - Validaciones en frontend

2. **Mejoras de UX:**
   - Mostrar ubicación de origen en UI de facturas
   - Indicadores visuales de estado
   - Historial de transferencias

3. **Optimizaciones:**
   - Cache más agresivo
   - Índices adicionales en BD
   - Paginación en listados

---

**Documento preparado por:** Sistema de Análisis Técnico  
**Fecha:** 2026-01-22  
**Versión:** 1.0




