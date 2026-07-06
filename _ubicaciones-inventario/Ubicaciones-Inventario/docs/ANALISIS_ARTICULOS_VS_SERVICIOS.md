# Análisis: Distinción entre Artículos y Servicios en ADM Cloud

## 📋 Resumen Ejecutivo

Este documento analiza si el sistema WMS actual puede distinguir entre **Artículos** (que manejan stock) y **Servicios** (que no manejan stock) cuando trae productos desde ADM Cloud en los documentos (recepciones, despachos, etc.).

---

## 🔍 1. CAMPOS EXTRAÍDOS ACTUALMENTE

### 1.1 Funciones de Extracción de Productos

**Ubicación:** `utils/helpers.py`

Las siguientes funciones extraen productos de documentos ADM Cloud:
- `obtener_productos_factura()`
- `obtener_productos_recepcion()`
- `obtener_productos_vendor_recepcion()`
- `obtener_productos_credit_note()`
- `obtener_productos_dispatch()`

**Campos extraídos actualmente:**
```python
{
    "RowOrder": item.get("RowOrder"),
    "ItemID": item.get("ItemID"),
    "ItemSKU": item.get("ItemSKU", ""),
    "SKU": item.get("SKU", item.get("ItemSKU", "")),
    "Name": item.get("Name", ""),
    "Quantity": float(item.get("Quantity", 0)),
    "Cost": float(item.get("Cost", 0)),
    "ExtendedCost": float(item.get("ExtendedCost", 0)),
    "UOMName": item.get("UOMName", ""),
}
```

### 🔴 CONCLUSIÓN PARCIAL
**NO se está extrayendo ningún campo que indique el tipo de item (Artículo vs Servicio).**

---

## 🔍 2. MODELO DE BASE DE DATOS

### 2.1 Modelo ProductoADM

**Ubicación:** `database/models.py`

**Campos actuales:**
- `id` (Integer, PK)
- `item_id` (String, GUID de ADM)
- `nombre` (String)
- `sku` (String)
- `codigo_barras` (String, nullable)
- `activo` (Boolean)
- `updated_at` (DateTime)
- `synced_at` (DateTime, nullable)

### 🔴 CONCLUSIÓN PARCIAL
**NO existe un campo en la base de datos para distinguir entre Artículos y Servicios.**

---

## 🔍 3. PROCESAMIENTO EN DOCUMENTOS

### 3.1 Recepciones

**Ubicación:** `routes/recepciones.py`

Cuando se registra una recepción:
- Se crean movimientos tipo `RECEIPT` para todos los productos
- Se actualiza `StockUbicacion` para todos los productos
- **NO hay validación** que verifique si el producto es un servicio

### 3.2 Despachos

**Ubicación:** `routes/despacho.py`

Cuando se registra un pick:
- Se verifica stock en `StockUbicacion`
- Se crean movimientos tipo `PICK`
- Se decrementa stock en `StockUbicacion`
- **NO hay validación** que verifique si el producto es un servicio

### 🔴 CONCLUSIÓN PARCIAL
**El sistema trata TODOS los items igual, sin distinguir si son artículos o servicios.**

---

## 🔍 4. SINCRONIZACIÓN DE PRODUCTOS

### 4.1 Proceso de Sincronización

**Ubicación:** `routes/sincronizar.py`

Cuando se sincronizan productos desde ADM Cloud:
- Se obtienen items desde `/api/items/`
- Se guardan en `ProductoADM` con los campos mencionados
- **NO se guarda información sobre el tipo de item**

### 4.2 Sincronización de Stock

**Ubicación:** `routes/sincronizar.py`

Cuando se sincroniza stock:
- Se obtiene stock desde `/api/Stock/`
- Solo se procesan items que tienen stock (o stock=0 si `ShowNoStock=true`)
- **NO se distingue entre artículos y servicios**

### 🔴 CONCLUSIÓN PARCIAL
**La sincronización NO distingue entre artículos y servicios.**

---

## 🔍 5. CAMPOS DISPONIBLES EN ADM CLOUD API

### 5.1 Análisis del Código

Basándome en el código actual, se están usando estos campos de los items:
- `ItemID` / `ID`
- `ItemSKU` / `SKU`
- `Name`
- `Quantity`
- `Cost`
- `ExtendedCost`
- `UOMName`
- `Stock` / `QuantityOnHand` (solo en sincronización de stock)

### 5.2 Campos Potenciales (NO VERIFICADOS)

ADM Cloud podría tener campos como:
- `ItemType` / `Type` - Tipo de item (Artículo, Servicio, etc.)
- `IsService` / `IsProduct` - Boolean que indica si es servicio
- `TrackInventory` - Boolean que indica si se rastrea inventario
- `InventoryItem` - Boolean que indica si es item de inventario

### ⚠️ CONCLUSIÓN PARCIAL
**No se puede confirmar si ADM Cloud devuelve estos campos sin revisar la documentación de la API o hacer una prueba real.**

---

## 📊 6. RESUMEN DE HALLAZGOS

### ✅ Lo que SÍ hace el sistema:
1. Extrae productos de documentos ADM Cloud (facturas, recepciones, despachos)
2. Guarda información básica de productos (SKU, nombre, etc.)
3. Procesa movimientos de inventario para todos los productos
4. Actualiza stock para todos los productos

### ❌ Lo que NO hace el sistema:
1. **NO distingue entre Artículos y Servicios**
2. **NO extrae campos de tipo de item desde ADM Cloud**
3. **NO valida si un producto es servicio antes de procesar stock**
4. **NO tiene campo en BD para almacenar tipo de item**
5. **NO filtra servicios en recepciones/despachos**

---

## 🎯 7. IMPACTO ACTUAL

### 7.1 Problemas Potenciales

1. **Servicios en Recepciones:**
   - Si un servicio viene en una recepción, el sistema intentará crear stock
   - Esto podría generar registros innecesarios en `StockUbicacion`

2. **Servicios en Despachos:**
   - Si un servicio viene en un despacho, el sistema intentará verificar stock
   - Esto podría fallar o generar errores si no hay stock

3. **Sincronización:**
   - Los servicios podrían estar siendo sincronizados como productos
   - Esto podría llenar la base de datos con items que no deberían tener stock

### 7.2 Escenarios Reales

**Escenario 1: Recepción con Servicio**
- Un documento de recepción incluye un servicio (ej: "Instalación")
- El sistema intenta crear stock para ese servicio
- Se crea un registro en `StockUbicacion` con cantidad 0 o la cantidad recibida
- **Problema:** Los servicios no deberían tener stock

**Escenario 2: Despacho con Servicio**
- Un despacho incluye un servicio (ej: "Mantenimiento")
- El sistema intenta verificar stock en `StockUbicacion`
- Si no existe stock, podría fallar o permitir el despacho
- **Problema:** Los servicios no deberían requerir verificación de stock

---

## 🔧 8. RECOMENDACIONES

### 8.1 Verificación Inmediata

1. **Revisar Documentación de ADM Cloud API:**
   - Verificar qué campos devuelve la API para items
   - Identificar si hay campos como `ItemType`, `IsService`, `TrackInventory`, etc.

2. **Probar API Directamente:**
   - Hacer una petición a `/api/items/` y revisar la estructura completa
   - Buscar items que sean servicios y ver qué campos tienen
   - Comparar con items que sean artículos

3. **Revisar Logs de Sincronización:**
   - Los logs en `routes/sincronizar.py` línea 200-202 muestran la estructura completa de items
   - Revisar si hay campos adicionales que no se están usando

### 8.2 Mejoras Sugeridas (si existen campos en ADM)

1. **Agregar Campo en ProductoADM:**
   ```python
   es_servicio = db.Column(db.Boolean, default=False, nullable=False)
   # o
   tipo_item = db.Column(db.String(20), nullable=True)  # 'ARTICULO', 'SERVICIO'
   ```

2. **Extraer Campo en Funciones Helper:**
   ```python
   "ItemType": item.get("ItemType", ""),
   "IsService": item.get("IsService", False),
   # o
   "TrackInventory": item.get("TrackInventory", True),
   ```

3. **Validar en Recepciones:**
   - No crear stock para servicios
   - Mostrar advertencia si hay servicios en la recepción

4. **Validar en Despachos:**
   - No verificar stock para servicios
   - Permitir despacho directo de servicios sin validación de stock

5. **Filtrar en Sincronización:**
   - Opcionalmente, no sincronizar servicios
   - O marcarlos claramente como servicios

---

## 📝 9. CONCLUSIÓN FINAL

### ❌ RESPUESTA DIRECTA

**NO, el sistema actualmente NO logra ver/distinguir entre Artículos y Servicios cuando trae productos desde ADM Cloud.**

### Razones:

1. **No se extraen campos de tipo:** Las funciones `obtener_productos_*` no extraen ningún campo que indique si es artículo o servicio.

2. **No se almacena en BD:** El modelo `ProductoADM` no tiene un campo para distinguir el tipo.

3. **No se valida en procesamiento:** Recepciones y despachos tratan todos los items igual, sin validar si son servicios.

4. **No se filtra en sincronización:** La sincronización procesa todos los items sin distinguir tipo.

### ⚠️ PRÓXIMOS PASOS RECOMENDADOS

1. **Verificar API de ADM Cloud:** Revisar qué campos devuelve realmente la API para items.
2. **Probar con datos reales:** Hacer una petición de prueba y revisar la estructura completa.
3. **Implementar distinción:** Si existen campos en ADM, agregar la lógica para distinguir artículos de servicios.

---

**Fecha de Análisis:** 2026-01-30
**Versión del Sistema:** Post-migración MySQL
