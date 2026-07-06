# 📊 INFORME COMPARATIVO: Stock ADESA en Consulta vs Despacho

## 🎯 Objetivo
Analizar por qué el stock de ADESA se muestra correctamente en "Consulta de Productos" pero no en "Despacho".

---

## 1️⃣ CONSULTA DE PRODUCTOS (✅ FUNCIONA)

### Backend: `routes/productos.py`

#### **Endpoint:**
```
POST /api/productos/buscar
```

#### **Flujo de obtención de stock ADESA:**

```python
# Línea 72: Buscar producto por SKU exacto
producto_db = ProductoADM.query.filter_by(sku=busqueda_upper).first()

# Línea 75-84: Si no encuentra, normalizar (quitar guiones, espacios)
if not producto_db and ('-' in busqueda or '_' in busqueda or ' ' in busqueda):
    busqueda_normalizada = busqueda.upper().replace('-', '').replace('_', '').replace(' ', '')
    # Buscar en todos los productos comparando SKU normalizado

# Línea 122: Obtener TODOS los registros de stock
stock_ubicaciones_adm = StockProductoADM.query.filter_by(producto_id=producto_db.id).all()

# Línea 131-148: Iterar sobre TODOS los registros y buscar ADESA
for stock_adm in stock_ubicaciones_adm:
    stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
    
    if stock_cantidad > 0:
        # Línea 144: Comparación EXACTA con "ADESA"
        if stock_adm.location_name.upper() == "ADESA":
            stock_adesa = stock_cantidad

# Línea 218: Retornar en JSON
return jsonify({
    "stock_adesa": stock_adesa,  # ✅ Valor correcto
    ...
})
```

#### **Logs:**
- Línea 128: `logger.info(f"Buscando stock para producto ID={producto_db.id}, SKU={producto_db.sku}")`
- Línea 129: `logger.info(f"Encontrados {len(stock_ubicaciones_adm)} registros de stock en BD")`
- Línea 148: `logger.debug(f"Stock en {stock_adm.location_name}: {stock_cantidad}")`

---

### Frontend: `templates/productos.html`

#### **Cómo se muestra:**
```javascript
// Recibe respuesta del backend con stock_adesa
if (data.stock_adesa > 0) {
    // Muestra: "✅ En mano (ADESA): 21.00"
}
```

#### **Visualización:**
- ✅ Muestra correctamente el stock de ADESA
- ✅ Formato: "En mano (ADESA): X.XX"

---

## 2️⃣ DESPACHO (❌ NO FUNCIONA - Muestra 0.00)

### Backend: `routes/despacho.py`

#### **Endpoint:**
```
GET /api/despacho/factura/<factura_guid>/estado
```

#### **Flujo de obtención de stock ADESA:**

```python
# Línea 165: Obtener productos desde factura JSON
productos = json.loads(factura.productos_json) if factura.productos_json else []

# Línea 174-175: Extraer SKU desde producto de factura
sku_raw = producto.get("SKU") or producto.get("ItemSKU") or producto.get("sku") or ""
sku = sku_raw.strip().upper() if sku_raw else ""

# Línea 202: Buscar producto por SKU exacto
producto_adm = ProductoADM.query.filter_by(sku=sku).first()

# Línea 207-211: Si no encuentra, intentar con ILIKE
if not producto_adm:
    producto_adm = ProductoADM.query.filter(ProductoADM.sku.ilike(sku)).first()

# Línea 214-225: Si aún no encuentra, normalizar (incluye puntos)
if not producto_adm and ('-' in sku or '_' in sku or ' ' in sku or '.' in sku):
    sku_normalizado = sku.replace('-', '').replace('_', '').replace(' ', '').replace('.', '')
    # Buscar comparando SKU normalizado

# Línea 229-231: Obtener TODOS los registros de stock
stock_ubicaciones_adm = StockProductoADM.query.filter_by(
    producto_id=producto_adm.id
).all()

# Línea 236-243: Iterar sobre TODOS los registros y buscar ADESA
for stock_adm in stock_ubicaciones_adm:
    location_upper = stock_adm.location_name.upper() if stock_adm.location_name else ""
    # Línea 240: Comparación EXACTA con "ADESA"
    if location_upper == "ADESA":
        stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
        if stock_cantidad > 0:
            stock_adesa = stock_cantidad

# Línea 254: Retornar en JSON
productos_estado.append({
    "stock_adesa_adm": stock_adesa,  # ❓ Valor es 0
    ...
})
```

#### **Logs agregados:**
- Línea 170: `logger.info(f"DESPACHO - Procesando {len(productos)} productos...")`
- Línea 177: `logger.info(f"DESPACHO - Procesando producto: SKU={sku}, campos disponibles: {list(producto.keys())}")`
- Línea 203: `logger.info(f"DESPACHO - Búsqueda exacta SKU={sku}: {'ENCONTRADO' if producto_adm else 'NO ENCONTRADO'}")`
- Línea 233: `logger.info(f"DESPACHO - Producto ID={producto_adm.id}, SKU={producto_adm.sku}, encontrados {len(stock_ubicaciones_adm)} registros de stock")`
- Línea 238: `logger.info(f"DESPACHO - Revisando ubicación: '{stock_adm.location_name}' (upper: '{location_upper}'), stock={stock_adm.stock}")`
- Línea 242: `logger.info(f"DESPACHO - ✅ Stock ADESA encontrado para SKU={sku}: {stock_cantidad}")`

---

### Frontend: `templates/despacho.html`

#### **Cómo se obtiene y muestra:**
```javascript
// Línea 748: Obtener estado desde backend
async function obtenerEstadoFactura(facturaGuid) {
    const response = await fetch(`/api/despacho/factura/${facturaGuid}/estado`);
    const data = await response.json();
    // data.productos contiene stock_adesa_adm
}

// Línea 661: Extraer stock_adesa_adm del estado
const stockAdesa = estado.stock_adesa_adm || 0;

// Línea 730: Mostrar en HTML
✅ En mano (ADESA – ADM): ${stockAdesa.toFixed(2)}
```

#### **Visualización:**
- ❌ Muestra "0.00" en lugar del valor correcto
- ✅ El formato es correcto, pero el valor no

---

## 3️⃣ ANÁLISIS DE DIFERENCIAS

### ✅ SIMILITUDES (Ambos deberían funcionar igual)

| Aspecto | Consulta | Despacho |
|---------|----------|----------|
| Búsqueda de ProductoADM | Por SKU exacto + normalización | Por SKU exacto + ILIKE + normalización |
| Obtener StockProductoADM | `filter_by(producto_id=producto_db.id).all()` | `filter_by(producto_id=producto_adm.id).all()` |
| Iterar registros | `for stock_adm in stock_ubicaciones_adm` | `for stock_adm in stock_ubicaciones_adm` |
| Comparación ADESA | `stock_adm.location_name.upper() == "ADESA"` | `location_upper == "ADESA"` |
| Retornar en JSON | `"stock_adesa": stock_adesa` | `"stock_adesa_adm": stock_adesa` |

**✅ Ambos usan la MISMA lógica de búsqueda de stock ADESA**

---

### ❌ DIFERENCIAS CRÍTICAS

| Aspecto | Consulta | Despacho | Impacto |
|---------|----------|----------|---------|
| **Origen del SKU** | Usuario escribe en input | Viene de `factura.productos_json` | 🔴 **CRÍTICO** |
| **Formato del SKU** | Controlado por usuario (normalizado) | Depende de cómo ADM guarda en factura | 🔴 **CRÍTICO** |
| **Normalización de puntos** | NO normaliza puntos (.) | SÍ normaliza puntos (.) | 🟡 Puede causar problemas |
| **Campos del JSON factura** | No aplica | `producto.get("SKU") or producto.get("ItemSKU")` | 🟡 Campo puede variar |

---

## 4️⃣ HIPÓTESIS DEL PROBLEMA

### 🔴 HIPÓTESIS 1: SKU desde factura no coincide con ProductoADM

**Evidencia:**
- En Consulta: Usuario busca `00.6418.018.000` → Funciona
- En Despacho: SKU viene de `factura.productos_json` → No funciona

**Posibles causas:**
1. El SKU en `productos_json` tiene formato diferente (ej: `"00-6418-018-000"` vs `"00.6418.018.000"`)
2. El SKU viene en otro campo (ej: `ItemSKU` en lugar de `SKU`)
3. El SKU tiene espacios u otros caracteres ocultos

**Diagnóstico:**
- Ver logs: `DESPACHO - Procesando producto: SKU=..., campos disponibles: [...]`
- Ver logs: `DESPACHO - Búsqueda exacta SKU=...: NO ENCONTRADO`

---

### 🟡 HIPÓTESIS 2: Producto no se encuentra en ProductoADM

**Evidencia:**
- Si el producto no existe en `ProductoADM`, `producto_adm` será `None`
- El código salta toda la lógica de búsqueda de stock

**Diagnóstico:**
- Ver logs: `DESPACHO - ❌ Producto NO encontrado en ProductoADM para SKU=...`

---

### 🟡 HIPÓTESIS 3: location_name no es exactamente "ADESA"

**Evidencia:**
- Comparación es exacta: `location_upper == "ADESA"`
- Si en BD está como `"Adesa"`, `"ADESA "`, `"1/26 ADESA"`, etc., no coincidirá

**Diagnóstico:**
- Ver logs: `DESPACHO - Revisando ubicación: '...' (upper: '...'), stock=...`
- Si dice `upper: '1/26 ADESA'` o similar, ese es el problema

---

### 🔴 HIPÓTESIS 4: El endpoint no se está ejecutando

**Evidencia:**
- Los logs no aparecen (usuario reporta que no hay logs)
- Puede que el frontend no esté llamando al endpoint correcto

**Diagnóstico:**
- Verificar en DevTools → Network si se llama `/api/despacho/factura/.../estado`
- Verificar respuesta del endpoint

---

## 5️⃣ PLAN DE DIAGNÓSTICO

### Paso 1: Verificar que el endpoint se ejecuta
1. Abrir DevTools → Network
2. Buscar factura #2806
3. Buscar petición a `/api/despacho/factura/.../estado`
4. Ver respuesta JSON

### Paso 2: Revisar logs del servidor
1. Ver `stderr.log` en cPanel
2. Buscar líneas con `DESPACHO -`
3. Verificar:
   - ¿Se ejecuta el endpoint?
   - ¿Qué SKU se está buscando?
   - ¿Se encuentra el producto?
   - ¿Qué ubicaciones tiene en BD?

### Paso 3: Comparar SKU de factura vs BD
1. Ver en logs: `DESPACHO - Procesando producto: SKU=00.6418.018.000`
2. Ver en logs: `DESPACHO - Búsqueda exacta SKU=00.6418.018.000: ENCONTRADO/NO ENCONTRADO`
3. Si NO ENCONTRADO, ver: `DESPACHO - Intentando búsqueda normalizada: ...`

### Paso 4: Verificar location_name en BD
1. Ver en logs: `DESPACHO - Revisando ubicación: '...'`
2. Verificar que alguna sea exactamente `'ADESA'` (upper)

---

## 6️⃣ SOLUCIONES PROPUESTAS

### Solución 1: Agregar más logging visible (YA IMPLEMENTADO)
- ✅ Cambiar logs a INFO nivel
- ✅ Agregar logs en cada paso crítico
- ✅ Mostrar campos disponibles del JSON factura

### Solución 2: Mejorar normalización de SKU
- Agregar normalización de puntos (.) en consulta también
- Hacer normalización más agresiva (quitar TODOS los caracteres especiales)

### Solución 3: Buscar por ItemID también
- Si el SKU no coincide, intentar buscar por `item_id` que viene en factura
- Usar relación directa ProductoADM.item_id

### Solución 4: Hacer location_name más flexible
- En lugar de `== "ADESA"`, usar `in` o `contains`:
  ```python
  if "ADESA" in location_upper:
  ```

---

## 7️⃣ RECOMENDACIONES INMEDIATAS

1. **Verificar logs** - Revisar `stderr.log` después de buscar factura
2. **Verificar Network** - Confirmar que se llama el endpoint correcto
3. **Verificar JSON factura** - Ver qué campos tiene el producto en `productos_json`
4. **Comparar SKUs** - Comparar SKU de factura vs SKU en ProductoADM

---

## 📋 CHECKLIST DE DIAGNÓSTICO

- [ ] ¿Se ejecuta el endpoint `/api/despacho/factura/.../estado`?
- [ ] ¿Qué SKU se extrae de `productos_json`?
- [ ] ¿Se encuentra el producto en `ProductoADM`?
- [ ] ¿Cuántos registros de stock tiene en `StockProductoADM`?
- [ ] ¿Qué `location_name` tienen esos registros?
- [ ] ¿Algún `location_name.upper() == "ADESA"`?
- [ ] ¿El stock de ADESA es > 0?

---

## 🔍 PRÓXIMOS PASOS

1. Ejecutar búsqueda de factura y capturar logs completos
2. Comparar SKU de factura vs SKU en ProductoADM
3. Verificar estructura de `productos_json` en la factura
4. Implementar solución según diagnóstico

---

**Fecha del análisis:** 2026-01-19  
**Autor:** Análisis técnico WMS  
**Estado:** Pendiente diagnóstico completo con logs






