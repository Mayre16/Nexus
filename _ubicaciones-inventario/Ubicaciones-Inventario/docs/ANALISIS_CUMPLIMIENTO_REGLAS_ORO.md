# 📊 ANÁLISIS DE CUMPLIMIENTO DE REGLAS DE ORO

**Fecha:** 19 de enero de 2026  
**Objetivo:** Identificar qué cumple y qué NO cumple las Reglas de Oro del WMS

---

## ✅ REGLA DE ORO #1: Stock 0 en ADM NO viene como 0

### **Estado Actual: PARCIALMENTE CUMPLE** ⚠️

#### ✅ Lo que SÍ cumple:
- Solo guarda registros que vienen en `/api/Stock` (stock > 0)
- No intenta guardar stock 0 desde ADM

#### ❌ Lo que NO cumple:
1. **NO detecta cuando un producto desaparece de `/api/Stock`**
   - Si un producto tenía stock > 0 en BD y después de sincronizar ya no viene en `/api/Stock`, el registro sigue en BD con stock > 0
   - **Debería:** Actualizar stock ERP a 0 y verificar si hay stock físico (Regla #3)

2. **NO actualiza stock ERP a 0 cuando el producto desaparece**
   - El registro en `StockProductoADM` se queda con el último valor conocido
   - **Debería:** Actualizar a 0 cuando no viene en la sincronización

#### 🔧 Acción Requerida:
- Modificar `sincronizar_ubicacion()` para:
  1. Guardar lista de `item_id` que vienen en la sincronización actual
  2. Buscar productos en BD que NO están en esa lista pero que tienen stock > 0 para esa ubicación
  3. Actualizar esos registros a stock = 0
  4. Si hay stock físico del WMS, marcar como DISCREPANCIA (Regla #3)

---

## ✅ REGLA DE ORO #2: La consulta del usuario siempre debe ser desde BD local

### **Estado Actual: CUMPLE** ✅

#### ✅ Lo que SÍ cumple:
- `routes/productos.py` línea 43: "Usa la base de datos local (cache) para búsquedas rápidas"
- Solo consulta `ProductoADM`, `StockProductoADM`, `StockUbicacion` desde BD
- **NO hace llamadas a ADM Cloud en tiempo real**

#### ✅ Verificación:
- ✅ Búsqueda por SKU: `ProductoADM.query.filter_by(sku=...)` (BD local)
- ✅ Búsqueda por código de barras: `ProductoADM.query.filter_by(codigo_barras=...)` (BD local)
- ✅ Búsqueda por nombre: `ProductoADM.query.filter(...)` (BD local)
- ✅ Stock ADM: `StockProductoADM.query.filter_by(...)` (BD local)
- ✅ Stock físico: `StockUbicacion.query.filter_by(...)` (BD local)

**CONCLUSIÓN: Esta regla se cumple correctamente** ✅

---

## ❌ REGLA DE ORO #3: Discrepancias NO se pisan, se registran y se alertan

### **Estado Actual: NO CUMPLE** ❌

#### ❌ Lo que NO existe:
1. **NO hay detección de discrepancias**
   - No compara stock ERP vs stock físico
   - No detecta cuando ADM dice 0 pero WMS físico dice >0

2. **NO hay tabla/modelo de discrepancias**
   - No existe tabla para registrar discrepancias
   - No hay modelo `Discrepancia` o similar

3. **NO se muestran alertas en consulta de productos**
   - La página `templates/productos.html` muestra stock ERP y stock físico
   - **PERO NO compara ni muestra discrepancias**
   - No hay mensaje "⚠️ DISCREPANCIA"

4. **NO hay alertas para administradores**
   - No hay panel de alertas
   - No se notifica cuando hay discrepancias

#### 🔧 Acción Requerida (CRÍTICO):
1. **Crear modelo de discrepancias:**
   ```python
   class Discrepancia(db.Model):
       - producto_id
       - sku
       - location_id
       - stock_erp (ADM)
       - stock_fisico_wms
       - fecha_deteccion
       - estado (pendiente, revisado, resuelto)
       - notas
   ```

2. **Modificar sincronización por ubicación:**
   - Después de sincronizar, comparar stock ERP vs stock físico
   - Si hay diferencia, crear registro de discrepancia

3. **Modificar página de consulta:**
   - Comparar stock ERP vs stock físico
   - Mostrar alerta "⚠️ DISCREPANCIA" cuando haya diferencia
   - Mostrar: "Stock ERP: X" vs "Stock Físico: Y"

4. **Crear panel de alertas para admin:**
   - Listar todas las discrepancias pendientes
   - Permitir marcar como revisado/resuelto

---

## 🔄 SINCRONIZACIÓN: ANÁLISIS

### **1. Sincronización por Ubicación**

#### ✅ Lo que SÍ cumple:
- Se ejecuta 1 ubicación a la vez (evita timeout)
- Guarda stock ERP desde `/api/Stock`
- Guarda fecha de actualización
- Guarda estado de sync
- ADESA tiene prioridad

#### ❌ Lo que NO cumple:
1. **NO maneja discrepancias cuando producto desaparece** (Regla #1 y #3)
2. **NO actualiza stock ERP a 0 cuando producto desaparece** (Regla #1)

#### 🔧 Acción Requerida:
- Implementar detección de productos desaparecidos
- Actualizar stock ERP a 0
- Si hay stock físico, crear discrepancia

---

### **2. Sincronización de Catálogo**

#### ✅ Lo que SÍ cumple:
- Existe función `actualizar_productos_en_segundo_plano()` que actualiza catálogo
- Actualiza: nombre, SKU, código de barras
- NO toca stock ERP ni stock físico

#### ⚠️ Lo que necesita mejorar:
1. **No hay endpoint dedicado desde Panel Admin**
   - La actualización solo se ejecuta automáticamente después de sync ubicación
   - Debería haber botón manual en Panel Admin para ejecutar sync de catálogo

#### 🔧 Acción Requerida:
- Crear endpoint `/api/sincronizar/catalogo` (manual)
- Agregar botón en Panel Admin para sincronizar catálogo
- Mantener ejecución automática en segundo plano (opcional)

---

## 📋 PÁGINA "Consulta de Productos": ANÁLISIS

### **✅ Lo que SÍ cumple:**
- ✅ Búsqueda por SKU, Nombre, Código de barras
- ✅ Muestra SKU, Nombre, Código de barras
- ✅ Muestra stock ERP por ubicaciones (solo > 0)
- ✅ Muestra total general
- ✅ Resalta "En mano (ADESA)"
- ✅ Muestra ubicaciones físicas WMS
- ✅ Navegación (volver, cerrar sesión)

### **❌ Lo que NO cumple:**
1. **NO detecta ni muestra discrepancias** ❌
   - Muestra stock ERP y stock físico por separado
   - **PERO NO compara ni alerta cuando hay diferencia**
   - No muestra "⚠️ DISCREPANCIA: Stock ERP: 0, Stock Físico: 20"

#### 🔧 Acción Requerida:
- Modificar `routes/productos.py` para:
  - Comparar stock ERP vs stock físico por ubicación
  - Detectar discrepancias
  - Incluir en respuesta JSON: `discrepancias: []`
- Modificar `templates/productos.html` para:
  - Mostrar alerta visual cuando hay discrepancias
  - Mostrar comparación: "Stock ERP: X" vs "Stock Físico: Y"
  - Marcar como "⚠️ DISCREPANCIA - Pendiente revisión"

---

## 🚨 CONFLICTOS IDENTIFICADOS

### **Conflicto 1: Regla #1 vs Regla #3**

**Situación:**
- Regla #1: Si producto no viene en `/api/Stock` = stock ERP es 0
- Regla #3: Si ADM dice 0 pero WMS físico dice >0, marcar como DISCREPANCIA

**Resolución necesaria:**
1. Al sincronizar ubicación:
   - Actualizar stock ERP a 0 para productos que desaparecieron (Regla #1)
   - Verificar si hay stock físico del WMS
   - Si hay stock físico > 0, crear discrepancia (Regla #3)
   - Mantener stock físico intacto (Regla #3)

**Estado:** ⚠️ NO está implementado

---

## 📊 RESUMEN DE CUMPLIMIENTO

| Regla | Estado | Cumplimiento |
|-------|--------|--------------|
| **#1: Stock 0 NO viene como 0** | ⚠️ PARCIAL | Guarda solo stock > 0, pero NO detecta cuando desaparece |
| **#2: Consultas desde BD local** | ✅ CUMPLE | Todas las consultas son desde BD local |
| **#3: Discrepancias se alertan** | ❌ NO CUMPLE | No hay detección, no hay tabla, no hay alertas |

---

## 🎯 PRIORIDADES DE CORRECCIÓN

### **🔴 CRÍTICO (Implementar inmediatamente):**

1. **Implementar detección de discrepancias (Regla #3)**
   - Crear modelo `Discrepancia`
   - Modificar sincronización para detectar discrepancias
   - Modificar consulta de productos para mostrar discrepancias

2. **Corregir manejo de productos desaparecidos (Regla #1)**
   - Actualizar stock ERP a 0 cuando producto no viene en sync
   - Si hay stock físico, crear discrepancia

### **🟡 IMPORTANTE (Implementar pronto):**

3. **Crear endpoint manual para sincronización de catálogo**
   - Botón en Panel Admin para ejecutar sync de catálogo manualmente

4. **Crear panel de alertas para administradores**
   - Listar discrepancias pendientes
   - Permitir marcar como revisado/resuelto

---

## ✅ PLAN DE ACCIÓN RECOMENDADO

1. **Crear modelo de discrepancias** (`database/models.py`)
2. **Modificar sincronización por ubicación** (`routes/sincronizar.py`)
   - Detectar productos desaparecidos
   - Actualizar stock ERP a 0
   - Crear discrepancias cuando corresponda
3. **Modificar consulta de productos** (`routes/productos.py`)
   - Detectar discrepancias en respuesta
4. **Modificar página de consulta** (`templates/productos.html`)
   - Mostrar alertas de discrepancias
5. **Crear endpoint de sync catálogo** (`routes/sincronizar.py`)
6. **Agregar botón en Panel Admin** (`templates/admin.html`)

---

**Siguiente paso:** ¿Procedemos con la implementación de las correcciones críticas?








