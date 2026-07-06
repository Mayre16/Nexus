# INFORME COMPLETO: Sincronización y Gestión de Cache en WMS

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Autor:** Análisis del Sistema WMS

---

## ÍNDICE

1. [Arquitectura de Datos y Cache](#1-arquitectura-de-datos-y-cache)
2. [Proceso de Sincronización](#2-proceso-de-sincronización)
3. [Impacto de Módulos en Cache](#3-impacto-de-módulos-en-cache)
4. [Análisis de Problemas: Transacciones en ADM Antes de Sincronización](#4-análisis-de-problemas-transacciones-en-adm-antes-de-sincronización)
5. [Reglas de Oro del Sistema](#5-reglas-de-oro-del-sistema)
6. [Soluciones Propuestas](#6-soluciones-propuestas)
7. [Impacto de Soluciones en Reglas de Oro](#7-impacto-de-soluciones-en-reglas-de-oro)

---

## 1. ARQUITECTURA DE DATOS Y CACHE

### 1.1. Estructura de Tablas de Stock

El sistema WMS mantiene **DOS fuentes de verdad** para el stock:

#### A) `StockUbicacion` (Stock Físico WMS)
- **Propósito:** Stock físico en ubicaciones físicas dentro de ADESA
- **Ejemplos de ubicaciones:** `P2-P1-AL-N2`, `P1-A1-B2-C3`, etc.
- **Uso:** Validación de transferencias desde ADESA, ajustes físicos, recepciones en ADESA
- **Actualización:** Solo se actualiza mediante:
  - Transferencias desde/hacia ADESA
  - Ajustes de ubicaciones físicas
  - Recepciones en ADESA
  - **NO se actualiza automáticamente con sincronización**

#### B) `StockProductoADM` (Cache de ADM Cloud)
- **Propósito:** Cache del stock de ADM Cloud por ubicación ADM
- **Ejemplos de ubicaciones:** `ADESA`, `MIRADOR SUR`, `PUNTA CANA`, etc.
- **Uso:** Visualización en búsqueda de productos, validación de ajustes ADM
- **Actualización:** Se actualiza mediante:
  - Sincronización desde ADM Cloud (principal)
  - Ajustes de ubicaciones ADM (temporal, luego sobrescrito por sync)
  - Transferencias desde/hacia ubicaciones NO-ADESA (temporal)

### 1.2. Relación entre Tablas

```
ProductoADM (catálogo)
    ├── StockProductoADM (stock por ubicación ADM)
    └── StockUbicacion (stock por ubicación física, solo ADESA)
```

**Punto crítico:** No hay sincronización automática entre `StockUbicacion` y `StockProductoADM`. Son sistemas independientes.

---

## 2. PROCESO DE SINCRONIZACIÓN

### 2.1. Sincronización de Catálogo (`sincronizar_catalogo`)

**Endpoint:** `POST /api/sincronizar/catalogo`

**Proceso:**
1. Consulta `/api/Items?OnlyActive=false` (paginado)
2. Para cada producto:
   - Crea o actualiza `ProductoADM`:
     - `item_id`, `nombre`, `sku`, `codigo_barras`
     - `activo = not Inactive` (mapeo desde ADM)
     - `synced_at = datetime.utcnow()`
   - **NO modifica stock** (solo catálogo)

**Tablas afectadas:**
- `ProductoADM`: Creada/actualizada
- `StockProductoADM`: **NO se modifica**

**Frecuencia:** Manual (botón en admin panel)

---

### 2.2. Sincronización de Stock por Ubicación (`sincronizar_ubicacion`)

**Endpoint:** `POST /api/sincronizar/ubicacion/<location_id>`

**Proceso detallado:**

#### Fase 1: Inicialización
- Resetea contadores: `items_synced=0`, `total_items=0`, `skip_actual=0`, `lote_actual=0`
- Crea/actualiza `SyncLocationStatus` con `status='running'`
- Define caps por ubicación (`CAPS_POR_UBICACION`):
  - `max_requests`: Límite de requests HTTP
  - `max_minutos`: Límite de tiempo
  - `max_items_procesados`: Límite de items

#### Fase 2: Obtención de Stock (Paginado)
- Consulta `/api/Stock?LocationID=<location_id>&ShowNoStock=true&skip=<skip>&take=50`
- Procesa lotes de 50 items
- Para cada item:
  - **Si `stock > 0`:**
    - Busca `ProductoADM` por `item_id`
    - Crea/actualiza `StockProductoADM`:
      - `stock = stock_adm`
      - `updated_at = datetime.utcnow()`
  - **Si `stock == 0` (con `ShowNoStock=true`):**
    - Agrega `item_id` a `item_ids_con_stock_cero`
    - Actualiza `StockProductoADM` a `stock=0`
    - Incrementa `items_cero_synced`

#### Fase 3: Actualización Periódica de Progreso
- Cada 50 items procesados:
  - Actualiza `SyncLocationStatus.items_synced`
  - Actualiza `SyncLocationStatus.total_items`
  - Commit intermedio para que el frontend vea progreso

#### Fase 4: Regla de Oro #1 - Productos Desaparecidos
- **Solo si `sync_completa == True`:**
  - Busca productos en `StockProductoADM` con `stock > 0` para esta ubicación
  - Si el `item_id` NO está en `item_ids_en_sync`:
    - Actualiza `StockProductoADM.stock = 0`
    - **Regla de Oro #3:** Si hay `StockUbicacion > 0`, crea `Discrepancia` crítica

#### Fase 5: Finalización
- Actualiza `SyncLocationStatus`:
  - `status = 'done'` (si completa) o `'partial'` (si alcanzó cap)
  - `items_synced = total_items_procesados_final`
  - `total_items = stock_items_count`
  - `last_sync_at = datetime.utcnow()`
- Commit final

**Tablas afectadas:**
- `StockProductoADM`: Actualizada (sobrescribe valores anteriores)
- `ProductoADM`: No se modifica directamente
- `StockUbicacion`: **NO se modifica** (punto crítico)
- `Discrepancia`: Creada si ADM=0 y Físico>0
- `SyncLocationStatus`: Actualizada con progreso y estado

**Frecuencia:** Manual por ubicación (botón en admin panel)

---

### 2.3. Detección de Nuevas Ubicaciones

**Proceso:**
- Al cargar el admin panel, se consulta `/api/Locations`
- Se comparan con `SyncLocationStatus` existentes
- Si hay ubicaciones nuevas, se crean registros en `SyncLocationStatus` con `status='pending'`

**Frecuencia:** Cada vez que se carga el admin panel

---

## 3. IMPACTO DE MÓDULOS EN CACHE

### 3.1. Módulo: AJUSTES (`routes/ajustes.py`)

#### Ajuste de Ubicación Física (ADESA)
**Endpoint:** `POST /api/ajustes/registrar`

**Proceso:**
1. Valida que la ubicación física existe y está activa
2. Calcula diferencia: `diferencia = cantidad_nueva - stock_actual_StockUbicacion`
3. Si `diferencia != 0`:
   - Actualiza `StockUbicacion.cantidad = cantidad_nueva`
   - Crea `Movimiento` tipo `ADJUSTMENT`

**Tablas afectadas:**
- `StockUbicacion`: **Modificada** (aumenta o disminuye)
- `Movimiento`: Creado
- `StockProductoADM`: **NO se modifica**

**Impacto en cache:** El ajuste físico NO afecta el cache de ADM. La próxima sincronización sobrescribirá cualquier inconsistencia.

---

#### Ajuste de Ubicación ADM (NO-ADESA)
**Endpoint:** `POST /api/ajustes/registrar`

**Proceso:**
1. Busca `StockProductoADM` por `producto_id` y `location_id`
2. Calcula diferencia: `diferencia = cantidad_nueva - stock_adm_actual`
3. Si `diferencia != 0`:
   - Actualiza `StockProductoADM.stock = cantidad_nueva` (temporal)
   - Actualiza `StockProductoADM.updated_at = datetime.utcnow()`
   - Crea `Movimiento` tipo `ADJUSTMENT`

**Tablas afectadas:**
- `StockProductoADM`: **Modificada temporalmente** (será sobrescrita en próxima sync)
- `Movimiento`: Creado
- `StockUbicacion`: **NO se modifica**

**Impacto en cache:** El ajuste ADM se refleja inmediatamente en la UI, pero será sobrescrito por la próxima sincronización.

---

### 3.2. Módulo: TRANSFERENCIAS (`routes/transferencias.py`)

#### Transferencia: Origen ADESA → Destino ADESA
**Endpoint:** `POST /api/transferencias/registrar`

**Proceso:**
1. **Origen ADESA:**
   - Valida stock en `StockUbicacion` (debe ser >= cantidad)
   - Resta de `StockUbicacion.cantidad`
2. **Destino ADESA:**
   - Suma a `StockUbicacion.cantidad` (puede ser múltiple)
3. Crea `Movimiento` tipo `TRANSFER`

**Tablas afectadas:**
- `StockUbicacion`: **Modificada** (origen resta, destino suma)
- `Movimiento`: Creado
- `StockProductoADM`: **NO se modifica**

**Impacto en cache:** La transferencia física NO afecta el cache de ADM. La próxima sincronización reflejará el estado real de ADM.

---

#### Transferencia: Origen NO-ADESA → Destino ADESA
**Endpoint:** `POST /api/transferencias/registrar`

**Proceso:**
1. **Origen NO-ADESA:**
   - **NO valida stock** (línea 553: "Origen NO-ADESA: no validar stock")
   - Actualiza `StockProductoADM`:
     - Resta `cantidad` del stock origen
     - `stock_nuevo = max(0.0, stock_anterior - cantidad)`
2. **Destino ADESA:**
   - Suma a `StockUbicacion.cantidad`
3. Crea `Movimiento` tipo `TRANSFER`

**Tablas afectadas:**
- `StockProductoADM`: **Modificada** (origen resta)
- `StockUbicacion`: **Modificada** (destino suma)
- `Movimiento`: Creado

**Impacto en cache:** El origen ADM se actualiza temporalmente. El destino físico se actualiza permanentemente.

---

#### Transferencia: Origen ADESA → Destino NO-ADESA
**Endpoint:** `POST /api/transferencias/registrar`

**Proceso:**
1. **Origen ADESA:**
   - Valida stock en `StockUbicacion` (debe ser >= cantidad)
   - Resta de `StockUbicacion.cantidad`
2. **Destino NO-ADESA:**
   - Actualiza `StockProductoADM`:
     - Suma `cantidad` al stock destino
3. Crea `Movimiento` tipo `TRANSFER`

**Tablas afectadas:**
- `StockUbicacion`: **Modificada** (origen resta)
- `StockProductoADM`: **Modificada** (destino suma)
- `Movimiento`: Creado

**Impacto en cache:** El origen físico se actualiza permanentemente. El destino ADM se actualiza temporalmente.

---

#### Transferencia: Origen NO-ADESA → Destino NO-ADESA
**Endpoint:** `POST /api/transferencias/registrar`

**Proceso:**
1. **Origen NO-ADESA:**
   - **NO valida stock**
   - Actualiza `StockProductoADM`:
     - Resta `cantidad` del stock origen
2. **Destino NO-ADESA:**
   - Actualiza `StockProductoADM`:
     - Suma `cantidad` al stock destino
3. Crea `Movimiento` tipo `TRANSFER`

**Tablas afectadas:**
- `StockProductoADM`: **Modificada** (origen resta, destino suma)
- `Movimiento`: Creado
- `StockUbicacion`: **NO se modifica**

**Impacto en cache:** Ambas ubicaciones ADM se actualizan temporalmente. La próxima sincronización sobrescribirá con valores reales de ADM.

---

### 3.3. Módulo: RECEPCIONES (`routes/recepciones.py`)

#### Recepción en ADESA
**Endpoint:** `POST /api/recepciones/registrar`

**Proceso:**
1. Para cada producto y asignación:
   - Si `es_adesa == True`:
     - Busca/crea `StockUbicacion`
     - Suma `cantidad` a `StockUbicacion.cantidad`
2. Crea `Movimiento` tipo `RECEIPT`

**Tablas afectadas:**
- `StockUbicacion`: **Modificada** (suma)
- `Movimiento`: Creado
- `StockProductoADM`: **NO se modifica**

**Impacto en cache:** La recepción física NO afecta el cache de ADM. La próxima sincronización reflejará el estado real de ADM.

---

#### Recepción en NO-ADESA
**Endpoint:** `POST /api/recepciones/registrar`

**Proceso:**
1. Para cada producto:
   - **NO modifica `StockUbicacion`** (línea 452)
   - Usa `location_name` de ADM como ubicación en `Movimiento`
2. Crea `Movimiento` tipo `RECEIPT`

**Tablas afectadas:**
- `Movimiento`: Creado
- `StockUbicacion`: **NO se modifica**
- `StockProductoADM`: **NO se modifica**

**Impacto en cache:** La recepción NO-ADESA no modifica ningún stock. Solo crea movimiento de auditoría. La próxima sincronización reflejará el estado real de ADM.

---

### 3.4. Módulo: DESPACHOS (`routes/despachos.py`)

#### Despacho desde ADESA
**Endpoint:** `POST /api/despachos/registrar`

**Proceso:**
1. Busca despacho en ADM Cloud por `DocID`
2. Guarda en `FacturaProcesada` (solo metadata)
3. **NO modifica stock** (el despacho ya ocurrió en ADM)

**Tablas afectadas:**
- `FacturaProcesada`: Creada/actualizada
- `StockUbicacion`: **NO se modifica**
- `StockProductoADM`: **NO se modifica**

**Impacto en cache:** El despacho NO modifica stock. Solo registra que el despacho fue procesado. La próxima sincronización reflejará el estado real de ADM (stock ya descontado en ADM).

---

## 4. ANÁLISIS DE PROBLEMAS: TRANSACCIONES EN ADM ANTES DE SINCRONIZACIÓN

### 4.1. Escenario Base: Transferencia en ADM Antes de Sincronización

**Estado Inicial:**
- ADM Cloud: ADESA=5, Mirador SUR=3
- WMS `StockProductoADM`: ADESA=5, Mirador SUR=3
- WMS `StockUbicacion`: Ubicación física en ADESA tiene 5

**Paso 1: Transferencia en ADM Cloud (NO en WMS)**
- Usuario realiza transferencia de 5 unidades desde ADESA hacia Mirador SUR en ADM Cloud
- ADM Cloud: ADESA 5→0, Mirador SUR 3→8
- WMS `StockProductoADM`: ADESA=5, Mirador SUR=3 (sin cambios, desactualizado)
- WMS `StockUbicacion`: Ubicación física en ADESA tiene 5 (sin cambios)

**Paso 2: Sincronización desde ADM**
- WMS ejecuta sincronización de ADESA y Mirador SUR
- WMS `StockProductoADM`: ADESA=0, Mirador SUR=8 (actualizado desde ADM)
- WMS `StockUbicacion`: Ubicación física en ADESA tiene 5 (NO se actualiza, punto crítico)

**Resultado:** Inconsistencia entre `StockProductoADM` (0) y `StockUbicacion` (5).

---

### 4.2. Impacto en Módulo: TRANSFERENCIAS

#### Caso 1: Usuario intenta registrar transferencia ADESA → Mirador SUR (5 unidades)

**Después de sincronización:**
- `StockProductoADM`: ADESA=0, Mirador SUR=8
- `StockUbicacion`: ADESA=5 (desactualizado)

**Proceso de validación:**
1. **Origen ADESA:**
   - Valida contra `StockUbicacion` (tiene 5) ✅ **PASA VALIDACIÓN**
   - Resta 5 de `StockUbicacion` → queda en 0
2. **Destino Mirador SUR (NO-ADESA):**
   - Actualiza `StockProductoADM`:
     - Suma 5 al stock destino
     - `stock_nuevo = 8 + 5 = 13` ❌ **DUPLICACIÓN**

**Resultado:**
- `StockUbicacion`: ADESA=0 ✅ (correcto)
- `StockProductoADM`: Mirador SUR=13 ❌ (debería ser 8, duplicación de 5 unidades)
- `Movimiento`: Creado (transferencia duplicada)

**Problema:** Se registra una transferencia que ya ocurrió en ADM, duplicando el stock en destino.

---

#### Caso 2: Usuario intenta registrar transferencia Mirador SUR → ADESA (3 unidades)

**Después de sincronización:**
- `StockProductoADM`: ADESA=0, Mirador SUR=8
- `StockUbicacion`: ADESA=5 (desactualizado)

**Proceso de validación:**
1. **Origen Mirador SUR (NO-ADESA):**
   - **NO valida stock** (línea 553)
   - Actualiza `StockProductoADM`:
     - Resta 3 del stock origen
     - `stock_nuevo = max(0.0, 8 - 3) = 5`
2. **Destino ADESA:**
   - Suma 3 a `StockUbicacion` → queda en 8

**Resultado:**
- `StockProductoADM`: Mirador SUR=5 ✅ (correcto, 8-3=5)
- `StockUbicacion`: ADESA=8 ❌ (debería ser 0, ahora tiene 8 cuando debería tener 0)
- `Movimiento`: Creado

**Problema:** Se suma stock a ADESA cuando ya debería estar en 0, creando inconsistencia.

---

### 4.3. Impacto en Módulo: DESPACHOS

#### Caso: Despacho desde ADESA en ADM (10 unidades) antes de sincronización

**Estado Inicial:**
- ADM Cloud: ADESA=10
- WMS `StockProductoADM`: ADESA=10
- WMS `StockUbicacion`: Ubicación física en ADESA tiene 10

**Paso 1: Despacho en ADM Cloud (NO en WMS)**
- Usuario realiza despacho de 10 unidades desde ADESA en ADM Cloud
- ADM Cloud: ADESA 10→0
- WMS `StockProductoADM`: ADESA=10 (sin cambios, desactualizado)
- WMS `StockUbicacion`: ADESA=10 (sin cambios)

**Paso 2: Sincronización desde ADM**
- WMS ejecuta sincronización de ADESA
- WMS `StockProductoADM`: ADESA=0 (actualizado desde ADM)
- WMS `StockUbicacion`: ADESA=10 (NO se actualiza, punto crítico)

**Paso 3: Usuario intenta registrar despacho en WMS**
- El módulo de despachos **NO modifica stock** (solo registra metadata)
- `StockUbicacion`: ADESA=10 (sigue desactualizado)
- `StockProductoADM`: ADESA=0 (correcto)

**Resultado:**
- Inconsistencia: `StockUbicacion` (10) vs `StockProductoADM` (0)
- **Regla de Oro #3:** Se crea `Discrepancia` crítica (ADM=0 pero Físico=10)

**Problema:** El despacho no modifica stock en WMS, pero la inconsistencia queda registrada como discrepancia.

---

### 4.4. Impacto en Módulo: RECEPCIONES

#### Caso: Recepción en ADESA en ADM (15 unidades) antes de sincronización

**Estado Inicial:**
- ADM Cloud: ADESA=0
- WMS `StockProductoADM`: ADESA=0
- WMS `StockUbicacion`: Ubicación física en ADESA tiene 0

**Paso 1: Recepción en ADM Cloud (NO en WMS)**
- Usuario realiza recepción de 15 unidades en ADESA en ADM Cloud
- ADM Cloud: ADESA 0→15
- WMS `StockProductoADM`: ADESA=0 (sin cambios, desactualizado)
- WMS `StockUbicacion`: ADESA=0 (sin cambios)

**Paso 2: Sincronización desde ADM**
- WMS ejecuta sincronización de ADESA
- WMS `StockProductoADM`: ADESA=15 (actualizado desde ADM)
- WMS `StockUbicacion`: ADESA=0 (NO se actualiza, punto crítico)

**Paso 3: Usuario intenta registrar recepción en WMS**
- El módulo de recepciones suma 15 a `StockUbicacion`
- `StockUbicacion`: ADESA=15 ✅ (correcto)
- `StockProductoADM`: ADESA=15 ✅ (correcto)

**Resultado:**
- Ambos stocks quedan correctos después del registro
- **NO hay problema** en este caso (la recepción suma, no resta)

**Problema:** Solo si el usuario intenta registrar la recepción DESPUÉS de la sincronización, se duplica el stock en `StockUbicacion` (15 + 15 = 30).

---

## 5. REGLAS DE ORO DEL SISTEMA

### REGLA DE ORO #1: "Desaparecido => 0"
**Ubicación:** `routes/sincronizar.py` líneas 1206-1250

**Enunciado:**
> Si un producto tenía `stock > 0` en `StockProductoADM` para una ubicación, pero NO aparece en la respuesta de `/api/Stock` durante una sincronización COMPLETA, entonces su stock ERP ahora es 0.

**Condiciones:**
- Solo se aplica si `sync_completa == True`
- Si la sync fue parcial (alcanzó cap), NO se aplica (evita falsos 0)

**Acción:**
- Actualiza `StockProductoADM.stock = 0`
- Actualiza `StockProductoADM.updated_at = datetime.utcnow()`

**Impacto:** Garantiza que el cache refleje productos que se agotaron en ADM.

---

### REGLA DE ORO #2: "Sincronización Sobrescribe Cache"
**Ubicación:** Implícita en todo `routes/sincronizar.py`

**Enunciado:**
> La sincronización desde ADM Cloud es la fuente de verdad para `StockProductoADM`. Cualquier modificación manual (ajustes, transferencias) será sobrescrita en la próxima sincronización.

**Condiciones:**
- Siempre aplica durante `sincronizar_ubicacion`
- No hay excepciones

**Acción:**
- `StockProductoADM.stock` se actualiza con el valor de ADM Cloud
- `StockProductoADM.updated_at` se actualiza a `datetime.utcnow()`

**Impacto:** Mantiene consistencia entre WMS y ADM Cloud, pero puede sobrescribir cambios manuales.

---

### REGLA DE ORO #3: "Discrepancia Crítica: ADM=0 pero Físico>0"
**Ubicación:** `routes/sincronizar.py` líneas 1235-1250, `routes/productos.py` línea 171

**Enunciado:**
> Si `StockProductoADM.stock == 0` para una ubicación ADM, pero `StockUbicacion.cantidad > 0` para el mismo SKU, se crea una `Discrepancia` crítica con estado 'pendiente'.

**Condiciones:**
- Solo se crea si no existe una discrepancia pendiente para el mismo producto/ubicación
- Solo durante sincronización completa

**Acción:**
- Crea registro en `Discrepancia`:
  - `producto_id`, `location_id`
  - `stock_adm = 0`
  - `stock_fisico = sum(StockUbicacion.cantidad)`
  - `estado = 'pendiente'`
  - `tipo = 'critica'`

**Impacto:** Detecta inconsistencias entre cache ADM y stock físico WMS.

---

### REGLA DE ORO #4: "ADESA vs NO-ADESA"
**Ubicación:** `routes/transferencias.py`, `routes/ajustes.py`, `routes/recepciones.py`

**Enunciado:**
> Solo las ubicaciones físicas dentro de ADESA modifican `StockUbicacion`. Las ubicaciones ADM (NO-ADESA) solo modifican `StockProductoADM`.

**Condiciones:**
- Se detecta ADESA si `location_name.upper().contains("ADESA")`
- Para transferencias: origen y destino se evalúan independientemente

**Acción:**
- **Si es ADESA:**
  - Modifica `StockUbicacion`
  - Valida stock en `StockUbicacion` (para transferencias desde ADESA)
- **Si NO es ADESA:**
  - Modifica `StockProductoADM`
  - NO valida stock (para transferencias desde NO-ADESA)

**Impacto:** Separa la gestión de stock físico (ADESA) del cache de ADM (NO-ADESA).

---

### REGLA DE ORO #5: "Movimientos de Auditoría"
**Ubicación:** Todos los módulos de transacciones

**Enunciado:**
> Todas las transacciones (ajustes, transferencias, recepciones, despachos) crean registros en `Movimiento` para auditoría, independientemente de si modifican stock o no.

**Condiciones:**
- Siempre aplica
- `Movimiento.tipo` puede ser: `ADJUSTMENT`, `TRANSFER`, `RECEIPT`, `DISPATCH`

**Acción:**
- Crea registro en `Movimiento` con:
  - `tipo`, `sku`, `product_id`
  - `ubicacion_origen`, `ubicacion_destino`
  - `cantidad`, `usuario_id`, `timestamp`
  - `factura_guid`, `factura_id` (si aplica)
  - `notas` (descripción de la transacción)

**Impacto:** Proporciona trazabilidad completa de todas las operaciones.

---

## 6. SOLUCIONES PROPUESTAS

### SOLUCIÓN 1: Validación Dual para Transferencias desde ADESA

**Problema que resuelve:** Transferencias duplicadas cuando ADM ya procesó la transacción.

**Descripción:**
- Al validar stock para transferencias desde ADESA, validar TANTO `StockUbicacion` COMO `StockProductoADM`
- Rechazar la transferencia si `StockProductoADM` es insuficiente, incluso si `StockUbicacion` tiene stock

**Implementación:**
```python
# En routes/transferencias.py, línea 537
if origen_es_adesa:
    # Validar StockUbicacion (existente)
    stock_ubic_origen = StockUbicacion.query.filter_by(...).first()
    if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < cantidad_origen:
        return jsonify({"error": "Stock insuficiente en ubicación física"}), 400
    
    # NUEVO: Validar también StockProductoADM
    producto_db = ProductoADM.query.filter_by(sku=sku).first()
    if producto_db and location_id_origen:
        stock_adm_origen = StockProductoADM.query.filter_by(
            producto_id=producto_db.id,
            location_id=location_id_origen
        ).first()
        if stock_adm_origen and float(stock_adm_origen.stock) < cantidad_origen:
            return jsonify({
                "error": f"Stock insuficiente en ADM Cloud para {origen_nombre}. Stock ADM: {stock_adm_origen.stock}, requerido: {cantidad_origen}. Sincroniza antes de transferir."
            }), 400
```

**Ventajas:**
- Previene transferencias cuando ADM ya procesó la transacción
- Fuerza al usuario a sincronizar antes de transferir
- No requiere cambios en reglas de oro

**Desventajas:**
- Puede rechazar transferencias válidas si la sincronización está desactualizada
- Requiere que el usuario sincronice frecuentemente

**Impacto en Reglas de Oro:**
- ✅ No afecta REGLA #1, #2, #3, #5
- ⚠️ Modifica REGLA #4: Ahora ADESA también consulta `StockProductoADM` para validación (pero sigue modificando solo `StockUbicacion`)

---

### SOLUCIÓN 2: Detección de Transferencias Duplicadas por GUID

**Problema que resuelve:** Registrar la misma transferencia dos veces (una en ADM, otra en WMS).

**Descripción:**
- Antes de registrar una transferencia, verificar si ya existe un `Movimiento` con el mismo `factura_guid`
- Si existe, rechazar la transferencia con mensaje claro

**Implementación:**
```python
# En routes/transferencias.py, antes de procesar productos
transferencia_existente = Movimiento.query.filter_by(
    tipo='TRANSFER',
    factura_guid=transferencia_guid
).first()

if transferencia_existente:
    return jsonify({
        "success": False,
        "error": f"Esta transferencia ya fue registrada anteriormente (DocID: {transfer_data.get('DocID', 'N/A')})"
    }), 400
```

**Ventajas:**
- Previene duplicaciones de manera simple
- No requiere cambios en validación de stock
- Compatible con todas las reglas de oro

**Desventajas:**
- Solo funciona si ADM proporciona `GUID` único
- No previene transferencias manuales sin GUID

**Impacto en Reglas de Oro:**
- ✅ No afecta ninguna regla de oro

---

### SOLUCIÓN 3: Actualización de StockUbicacion Durante Sincronización

**Problema que resuelve:** Inconsistencia entre `StockUbicacion` y `StockProductoADM` después de sincronización.

**Descripción:**
- Durante la sincronización de ADESA, distribuir el stock de ADM entre ubicaciones físicas
- Requiere lógica de distribución (proporcional, por ubicación más grande, etc.)

**Implementación:**
```python
# En routes/sincronizar.py, después de actualizar StockProductoADM
if location_name.upper() == "ADESA" and stock_adm > 0:
    # Obtener todas las ubicaciones físicas para este SKU
    stock_ubicaciones = StockUbicacion.query.filter_by(sku=producto.sku).all()
    stock_fisico_total = sum(float(s.cantidad) for s in stock_ubicaciones)
    
    if stock_fisico_total > 0:
        # Distribuir proporcionalmente
        for stock_ubic in stock_ubicaciones:
            proporcion = float(stock_ubic.cantidad) / stock_fisico_total
            stock_ubic.cantidad = stock_adm * proporcion
            stock_ubic.updated_at = datetime.utcnow()
    else:
        # Si no hay stock físico, crear en ubicación por defecto o más grande
        # (requiere lógica adicional)
        pass
```

**Ventajas:**
- Mantiene consistencia entre `StockUbicacion` y `StockProductoADM`
- Reduce discrepancias críticas

**Desventajas:**
- **Muy complejo:** Requiere lógica de distribución que puede no reflejar la realidad
- **Riesgo alto:** Puede sobrescribir stock físico correcto con valores incorrectos
- **No escalable:** ¿Qué pasa si hay múltiples ubicaciones físicas?

**Impacto en Reglas de Oro:**
- ❌ **AFECTA REGLA #4:** Modifica `StockUbicacion` automáticamente durante sincronización (rompe la separación ADESA/NO-ADESA)
- ⚠️ Puede crear inconsistencias si la distribución no es correcta

---

### SOLUCIÓN 4: Advertencia de Sincronización Pendiente

**Problema que resuelve:** Usuario no sabe que necesita sincronizar antes de transferir.

**Descripción:**
- Mostrar advertencia en UI si `StockProductoADM.updated_at` es muy antiguo (> 1 hora)
- Bloquear transferencias desde ADESA si la última sincronización es > 2 horas

**Implementación:**
```python
# En routes/transferencias.py, antes de validar stock
if origen_es_adesa:
    # Verificar última sincronización
    estado_sync = SyncLocationStatus.query.filter_by(
        location_id=location_id_origen
    ).first()
    
    if estado_sync:
        tiempo_desde_sync = (datetime.utcnow() - estado_sync.last_sync_at).total_seconds() / 3600
        if tiempo_desde_sync > 2:
            return jsonify({
                "success": False,
                "error": f"La última sincronización de {origen_nombre} fue hace {tiempo_desde_sync:.1f} horas. Sincroniza antes de transferir.",
                "requires_sync": True
            }), 400
```

**Ventajas:**
- Fuerza al usuario a mantener sincronización actualizada
- Previene inconsistencias por datos desactualizados
- No requiere cambios en reglas de oro

**Desventajas:**
- Puede bloquear transferencias válidas si la sincronización falla
- Requiere que el usuario sincronice frecuentemente

**Impacto en Reglas de Oro:**
- ✅ No afecta ninguna regla de oro

---

### SOLUCIÓN 5: Sincronización Automática Antes de Transferencias

**Problema que resuelve:** Usuario olvida sincronizar antes de transferir.

**Descripción:**
- Antes de validar stock para transferencias desde ADESA, ejecutar sincronización automática si la última sync es > 30 minutos
- Mostrar progreso al usuario

**Implementación:**
```python
# En routes/transferencias.py, antes de validar stock
if origen_es_adesa:
    estado_sync = SyncLocationStatus.query.filter_by(
        location_id=location_id_origen
    ).first()
    
    if estado_sync:
        tiempo_desde_sync = (datetime.utcnow() - estado_sync.last_sync_at).total_seconds() / 60
        if tiempo_desde_sync > 30:
            # Ejecutar sincronización automática (en background o síncrona)
            from routes.sincronizar import sincronizar_ubicacion
            resultado = sincronizar_ubicacion(location_id_origen, forzar=True)
            if not resultado.get("success"):
                return jsonify({
                    "success": False,
                    "error": "Error al sincronizar automáticamente. Intenta sincronizar manualmente.",
                    "sync_error": resultado.get("error")
                }), 500
```

**Ventajas:**
- Garantiza datos actualizados antes de transferir
- Reduce errores del usuario
- Mejora UX (automático)

**Desventajas:**
- Puede hacer lenta la operación de transferencia (esperar sync)
- Requiere manejo de errores de sincronización
- Puede fallar si ADM Cloud está lento

**Impacto en Reglas de Oro:**
- ✅ No afecta ninguna regla de oro

---

### SOLUCIÓN 6: Validación de Stock en Recepciones NO-ADESA

**Problema que resuelve:** Recepciones duplicadas cuando ADM ya procesó la recepción.

**Descripción:**
- Antes de registrar recepción en NO-ADESA, verificar si `StockProductoADM` ya refleja el stock esperado
- Si el stock actual + cantidad recibida > stock ADM esperado, mostrar advertencia

**Implementación:**
```python
# En routes/recepciones.py, antes de crear movimientos
if not es_adesa and location_id_resp:
    producto_db = ProductoADM.query.filter_by(sku=sku).first()
    if producto_db:
        stock_adm_actual = StockProductoADM.query.filter_by(
            producto_id=producto_db.id,
            location_id=location_id_resp
        ).first()
        
        if stock_adm_actual:
            stock_esperado = float(stock_adm_actual.stock) + cantidad_total
            # Verificar si hay discrepancia grande (más del 10%)
            if stock_esperado > float(stock_adm_actual.stock) * 1.1:
                # Mostrar advertencia pero permitir continuar
                logger.warning(f"Recepción puede duplicar stock: SKU={sku}, stock actual={stock_adm_actual.stock}, cantidad recibida={cantidad_total}")
```

**Ventajas:**
- Detecta posibles duplicaciones
- No bloquea la operación (solo advertencia)

**Desventajas:**
- No previene la duplicación, solo la detecta
- Requiere lógica adicional para calcular stock esperado

**Impacto en Reglas de Oro:**
- ✅ No afecta ninguna regla de oro

---

## 7. IMPACTO DE SOLUCIONES EN REGLAS DE ORO

### Matriz de Impacto

| Solución | REGLA #1 | REGLA #2 | REGLA #3 | REGLA #4 | REGLA #5 | Riesgo |
|----------|----------|----------|----------|----------|----------|--------|
| **Solución 1:** Validación Dual | ✅ | ✅ | ✅ | ⚠️ | ✅ | Bajo |
| **Solución 2:** Detección Duplicados | ✅ | ✅ | ✅ | ✅ | ✅ | Muy Bajo |
| **Solución 3:** Actualizar StockUbicacion | ✅ | ✅ | ⚠️ | ❌ | ✅ | **Alto** |
| **Solución 4:** Advertencia Sync | ✅ | ✅ | ✅ | ✅ | ✅ | Muy Bajo |
| **Solución 5:** Sync Automática | ✅ | ✅ | ✅ | ✅ | ✅ | Medio |
| **Solución 6:** Validación Recepciones | ✅ | ✅ | ✅ | ✅ | ✅ | Bajo |

**Leyenda:**
- ✅ = No afecta la regla
- ⚠️ = Modifica la regla pero de forma compatible
- ❌ = Rompe la regla

---

### Recomendaciones por Prioridad

#### PRIORIDAD ALTA (Implementar primero)
1. **Solución 2: Detección de Duplicados por GUID**
   - Riesgo muy bajo
   - Implementación simple
   - Previene duplicaciones sin afectar reglas

2. **Solución 1: Validación Dual para ADESA**
   - Riesgo bajo
   - Previene transferencias inválidas
   - Modifica REGLA #4 de forma compatible (solo validación, no modificación)

#### PRIORIDAD MEDIA (Evaluar después)
3. **Solución 4: Advertencia de Sincronización Pendiente**
   - Riesgo muy bajo
   - Mejora UX sin cambios estructurales

4. **Solución 6: Validación de Stock en Recepciones**
   - Riesgo bajo
   - Detecta problemas sin bloquear operaciones

#### PRIORIDAD BAJA (Evaluar cuidadosamente)
5. **Solución 5: Sincronización Automática**
   - Riesgo medio
   - Puede hacer lenta la operación
   - Requiere manejo de errores robusto

#### NO RECOMENDADA
6. **Solución 3: Actualizar StockUbicacion Durante Sync**
   - Riesgo alto
   - Rompe REGLA #4
   - Lógica compleja y propensa a errores

---

## 8. CONCLUSIÓN

El sistema WMS mantiene dos fuentes de verdad independientes (`StockUbicacion` y `StockProductoADM`) que no se sincronizan automáticamente. Esto crea inconsistencias cuando:

1. Una transacción ocurre en ADM Cloud antes de sincronización
2. El usuario intenta registrar la misma transacción en WMS después de sincronización
3. La sincronización actualiza `StockProductoADM` pero NO `StockUbicacion`

**Soluciones recomendadas:**
- **Corto plazo:** Implementar Solución 2 (detección de duplicados) y Solución 1 (validación dual)
- **Medio plazo:** Implementar Solución 4 (advertencias) y Solución 6 (validación recepciones)
- **Largo plazo:** Evaluar Solución 5 (sync automática) si se requiere

**Evitar:** Solución 3 (actualizar StockUbicacion durante sync) debido a su alto riesgo y complejidad.

---

**Fin del Informe**



