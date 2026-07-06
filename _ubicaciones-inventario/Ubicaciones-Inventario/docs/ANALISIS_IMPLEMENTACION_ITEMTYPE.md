# Análisis de Implementación: ItemType (I/S/K) en WMS

## ✅ CONFIRMACIÓN DE VIABILIDAD

### Hallazgos Confirmados

1. **✅ ItemType viene en Items[] de documentos**
   - Confirmado en: CreditInvoices, Dispatchs, Receptions
   - Valores: `"I"` (Item), `"S"` (Service), `"K"` (Kit)
   - Campo disponible directamente en la respuesta del documento

2. **✅ No requiere llamadas adicionales a API**
   - El campo viene en el documento completo
   - No necesitamos hacer llamadas a `/api/Items/{id}`, `/api/Kits/{id}`, `/api/Services/{id}`
   - Implementación será **simple y eficiente**

3. **✅ Script de prueba funcional**
   - El script usa `GetByID` que es equivalente a `/{guid}`
   - Muestra estructura completa de Items
   - Confirma que ItemType está presente

---

## 🎯 ANÁLISIS DE FUNCIONALIDAD

### ¿Es Funcional para la Lógica Actual?

**✅ SÍ, es TOTALMENTE funcional** y se integra perfectamente con la lógica existente:

1. **No rompe código existente:**
   - Solo necesitamos **agregar** extracción de ItemType
   - La lógica actual seguirá funcionando para Items (I)
   - Agregamos validaciones condicionales para S/K

2. **Compatibilidad hacia atrás:**
   - Si ItemType no viene (casos legacy), podemos asumir "I" por defecto
   - No rompe documentos existentes

3. **Lógica clara:**
   - ItemType == "I": Flujo actual (sin cambios)
   - ItemType == "S" o "K": Nuevo flujo simplificado

---

## 📋 PLAN DE IMPLEMENTACIÓN

### Fase 1: Extracción de ItemType (Backend)

#### 1.1 Modificar Funciones Helper

**Archivo:** `utils/helpers.py`

**Funciones a modificar:**
- `obtener_productos_factura()`
- `obtener_productos_recepcion()`
- `obtener_productos_vendor_recepcion()`
- `obtener_productos_credit_note()`
- `obtener_productos_dispatch()`
- `obtener_productos_location_transfer()`

**Cambio:**
```python
# ANTES
producto = {
    "RowOrder": item.get("RowOrder"),
    "ItemID": item.get("ItemID"),
    "ItemSKU": item.get("ItemSKU", ""),
    "SKU": item.get("SKU", item.get("ItemSKU", "")),
    "Name": item.get("Name", ""),
    "Quantity": float(item.get("Quantity", 0)),
    ...
}

# DESPUÉS
producto = {
    "RowOrder": item.get("RowOrder"),
    "ItemID": item.get("ItemID"),
    "ItemSKU": item.get("ItemSKU", ""),
    "SKU": item.get("SKU", item.get("ItemSKU", "")),
    "Name": item.get("Name", ""),
    "Quantity": float(item.get("Quantity", 0)),
    "ItemType": item.get("ItemType", "I"),  # ← NUEVO: Default a "I" si no viene
    "requiere_ubicacion": item.get("ItemType", "I") == "I",  # ← NUEVO: Helper
    ...
}
```

**Impacto:** ✅ Bajo - Solo agregar campos, no cambiar lógica existente

---

### Fase 2: Validación en Recepciones (Backend)

#### 2.1 Modificar `registrar_recepcion()`

**Archivo:** `routes/recepciones.py`

**Lógica actual:**
- Itera sobre productos
- Para cada producto, itera sobre asignaciones de ubicación
- Crea movimientos RECEIPT y actualiza StockUbicacion

**Lógica nueva:**
```python
for producto in productos:
    item_type = producto.get("ItemType", "I")
    requiere_ubicacion = item_type == "I"
    
    if requiere_ubicacion:
        # LÓGICA ACTUAL (sin cambios)
        for asignacion in asignaciones:
            # Crear movimiento RECEIPT
            # Actualizar StockUbicacion
            ...
    else:
        # NUEVA LÓGICA para S/K
        # Crear movimiento RECEIPT SIN ubicación física
        # NO actualizar StockUbicacion
        movimiento = Movimiento(
            tipo="RECEIPT",
            product_id=item_id or "",
            sku=sku,
            ubicacion_origen=None,
            ubicacion_destino=None,  # ← Sin ubicación física
            cantidad=cantidad,
            factura_id=recepcion_docid or recepcion_guid,
            factura_guid=recepcion_guid,
            usuario_id=session.get('user_id'),
            notas=f"Recepción {recepcion_docid} - {tipo_nombre} (ItemType: {item_type}) - Sin ubicación física"
        )
        db.session.add(movimiento)
```

**Impacto:** ✅ Medio - Cambio en lógica de registro, pero no rompe existente

---

### Fase 3: Validación en Despachos (Backend)

#### 3.1 Modificar `registrar_pick()`

**Archivo:** `routes/despacho.py`

**Lógica actual:**
- Verifica que producto esté en factura
- Verifica cantidad pendiente
- Verifica stock en ubicación
- Crea movimiento PICK y decrementa stock

**Lógica nueva:**
```python
# Obtener ItemType del producto en la factura
producto_factura = None
for p in productos:
    if p.get("SKU", "").upper() == sku or p.get("ItemSKU", "").upper() == sku:
        producto_factura = p
        break

item_type = producto_factura.get("ItemType", "I") if producto_factura else "I"
requiere_ubicacion = item_type == "I"

if requiere_ubicacion:
    # LÓGICA ACTUAL (sin cambios)
    # Verificar stock en ubicación
    # Crear movimiento PICK
    # Decrementar stock
    ...
else:
    # NUEVA LÓGICA para S/K
    # NO verificar stock
    # Crear movimiento PICK SIN ubicación física
    # NO decrementar stock
    movimiento = Movimiento(
        tipo="PICK",
        product_id=producto_factura.get("ItemID"),
        sku=sku,
        ubicacion_origen=None,  # ← Sin ubicación física
        ubicacion_destino=None,
        cantidad=cantidad,
        factura_id=factura.factura_docid,
        factura_guid=factura_guid,
        usuario_id=session.get('user_id'),
        notas=f"Despacho {factura.factura_docid} - {tipo_nombre} (ItemType: {item_type}) - Sin ubicación física"
    )
    db.session.add(movimiento)
```

**Impacto:** ✅ Medio - Cambio en lógica de picking, pero no rompe existente

---

### Fase 4: UI - Recepciones (Frontend)

#### 4.1 Modificar `templates/recepciones.html`

**Cambios necesarios:**

1. **Ocultar campos de ubicación para S/K:**
```javascript
function mostrarRecepcion(recepcion) {
    // ... código existente ...
    
    recepcion.productos.forEach(producto => {
        const itemType = producto.ItemType || 'I';
        const requiereUbicacion = itemType === 'I';
        
        if (!requiereUbicacion) {
            // Ocultar campos de ubicación
            // Mostrar badge "No requiere ubicación física"
            // Permitir registrar directamente
        }
    });
}
```

2. **Validación antes de registrar:**
```javascript
function validarAsignaciones(productos) {
    for (const producto of productos) {
        const itemType = producto.ItemType || 'I';
        const requiereUbicacion = itemType === 'I';
        
        if (requiereUbicacion) {
            // Validar que tenga asignación de ubicación
            if (!producto.asignaciones || producto.asignaciones.length === 0) {
                return false; // Error: requiere ubicación
            }
        }
        // Si es S/K, no requiere validación de ubicación
    }
    return true;
}
```

**Impacto:** ✅ Medio - Cambios en UI, pero UX mejorada

---

### Fase 5: UI - Despachos (Frontend)

#### 5.1 Modificar `templates/despacho.html`

**Cambios necesarios:**

1. **Ocultar sección de escaneo para S/K:**
```javascript
function mostrarProductos(productos, facturaGuid) {
    // ... código existente ...
    
    productos.forEach(producto => {
        const itemType = producto.ItemType || 'I';
        const requiereUbicacion = itemType === 'I';
        
        if (!requiereUbicacion) {
            // Ocultar sección de escaneo (SKU + Ubicación + Cantidad)
            // Mostrar badge "No requiere picking físico"
            // Permitir marcar como "despachado" directamente
        }
    });
}
```

2. **Botón "Despachar Sin Ubicación" para S/K:**
```javascript
function registrarPickServicioKit(sku, cantidad, facturaGuid) {
    // Registrar directamente sin validar stock ni ubicación
    fetch('/api/despacho/registrar', {
        method: 'POST',
        body: JSON.stringify({
            factura_guid: facturaGuid,
            sku: sku,
            ubicacion: null,  // Sin ubicación
            cantidad: cantidad,
            es_servicio_kit: true  // Flag para backend
        })
    });
}
```

**Impacto:** ✅ Medio - Cambios en UI, pero UX mejorada

---

## 🔄 MÓDULOS QUE NECESITAN CAMBIOS

### ✅ Módulos Principales (ALTA PRIORIDAD)

1. **📦 Recepciones** (`routes/recepciones.py` + `templates/recepciones.html`)
   - ✅ Backend: Validar ItemType antes de crear stock
   - ✅ Frontend: Ocultar campos de ubicación para S/K

2. **🚚 Despachos** (`routes/despacho.py` + `templates/despacho.html`)
   - ✅ Backend: Validar ItemType antes de verificar stock
   - ✅ Frontend: Ocultar sección de escaneo para S/K

### 🟡 Módulos Secundarios (MEDIA PRIORIDAD)

3. **🔄 Transferencias** (`routes/transferencias.py`)
   - ⚠️ Evaluar: ¿Las transferencias pueden incluir S/K?
   - Probablemente NO, pero validar

4. **📊 Historiales** (`routes/historiales.py` + templates)
   - ✅ Mostrar badge/indicador de ItemType en historial
   - ✅ Filtrar por tipo (opcional)

### 🟢 Módulos Terciarios (BAJA PRIORIDAD)

5. **📦 Ajustes** (`routes/ajustes.py`)
   - ⚠️ Evaluar: ¿Los ajustes pueden incluir S/K?
   - Probablemente NO (solo Items físicos)

6. **🔍 Consulta de Productos** (`routes/productos.py`)
   - ✅ Mostrar ItemType en información del producto
   - ✅ Filtrar por tipo (opcional)

---

## 🎯 DECISIÓN: ¿Aplicar a TODOS los Módulos?

### ✅ RECOMENDACIÓN: SÍ, pero con Priorización

**Razón:** Un documento puede venir **mixto** (Item + Kit + Service), por lo que TODOS los módulos que procesan documentos deben estar preparados.

### Plan de Implementación por Fases

**Fase 1 (Crítica):**
- ✅ Recepciones
- ✅ Despachos

**Fase 2 (Importante):**
- ✅ Historiales (mostrar ItemType)
- ✅ Consulta de Productos (mostrar ItemType)

**Fase 3 (Opcional):**
- ⚠️ Transferencias (validar si aplica)
- ⚠️ Ajustes (validar si aplica)

---

## 🔍 ANÁLISIS DE COMPATIBILIDAD

### ¿Rompe Lógica Existente?

**✅ NO, es totalmente compatible:**

1. **Default a "I":**
   - Si ItemType no viene, asumimos "I" (comportamiento actual)
   - Documentos legacy seguirán funcionando

2. **Validaciones condicionales:**
   - Solo agregamos `if (requiere_ubicacion)` antes de lógica existente
   - No modificamos lógica de Items (I)

3. **Base de datos:**
   - No requiere cambios en esquema
   - Movimientos pueden tener `ubicacion_origen = NULL` y `ubicacion_destino = NULL` (ya permitido)

---

## 📊 IMPACTO EN BASE DE DATOS

### Movimientos con NULL en Ubicaciones

**Estado actual:**
- `Movimiento.ubicacion_origen` → `nullable=True` ✅
- `Movimiento.ubicacion_destino` → `nullable=True` ✅

**Conclusión:** ✅ No requiere cambios en BD

### StockUbicacion

**Estado actual:**
- Solo se crea/actualiza para Items físicos
- Para S/K: NO se crea/actualiza (correcto)

**Conclusión:** ✅ No requiere cambios en BD

---

## 🎯 RESUMEN EJECUTIVO

### ✅ Viabilidad

**SÍ, es TOTALMENTE funcional y viable:**

1. ✅ ItemType viene en documentos (confirmado)
2. ✅ No requiere llamadas adicionales a API
3. ✅ Compatible con lógica existente
4. ✅ No rompe código actual
5. ✅ No requiere cambios en BD

### 📋 Implementación Recomendada

**Fase 1 (Crítica):**
1. Modificar `utils/helpers.py` - Extraer ItemType
2. Modificar `routes/recepciones.py` - Validar ItemType
3. Modificar `routes/despacho.py` - Validar ItemType
4. Modificar `templates/recepciones.html` - UI para S/K
5. Modificar `templates/despacho.html` - UI para S/K

**Fase 2 (Mejoras):**
6. Modificar `routes/historiales.py` - Mostrar ItemType
7. Modificar templates de historial - Badges de tipo

**Fase 3 (Opcional):**
8. Evaluar transferencias y ajustes
9. Agregar filtros por ItemType

### 🎯 Aplicación a Módulos

**✅ SÍ, aplicar a TODOS los módulos que procesan documentos:**
- Recepciones ✅
- Despachos ✅
- Historiales ✅
- Consulta de Productos ✅
- Transferencias ⚠️ (evaluar)
- Ajustes ⚠️ (evaluar)

---

**Fecha de Análisis:** 2026-01-30
**Estado:** ✅ Listo para implementación
**Riesgo:** 🟢 Bajo (compatible con código existente)
