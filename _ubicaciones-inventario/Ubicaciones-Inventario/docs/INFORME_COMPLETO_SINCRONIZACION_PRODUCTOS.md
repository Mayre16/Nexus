# 📋 INFORME COMPLETO: SISTEMA DE SINCRONIZACIÓN DE PRODUCTOS Y CÓDIGO DE BARRAS

## 🎯 OBJETIVO DEL SISTEMA

Sincronizar productos y stock desde **ADM Cloud** hacia la base de datos local del WMS, permitiendo búsquedas rápidas y consultas de inventario sin depender directamente de la API de ADM en tiempo real.

---

## 📊 ARQUITECTURA DEL SISTEMA

### **1. Modelos de Base de Datos**

#### `ProductoADM` (Tabla: `productos_adm`)
Guarda información básica de productos sincronizados desde ADM Cloud:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `item_id` | String(100) | GUID único de ADM Cloud (Primary Key) |
| `sku` | String(100) | SKU del producto (índice) |
| `nombre` | String(500) | Nombre del producto |
| **`codigo_barras`** | String(100) | **Código de barras (índice)** ⚠️ |
| `activo` | Boolean | Si el producto está activo |
| `updated_at` | DateTime | Última actualización |
| `synced_at` | DateTime | Última sincronización completa |

#### `StockProductoADM` (Tabla: `stock_productos_adm`)
Guarda el stock de cada producto por ubicación:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `producto_id` | Integer | FK a `productos_adm.id` |
| `location_id` | String(100) | GUID de ubicación ADM |
| `location_name` | String(200) | Nombre de ubicación (ej: "ADESA") |
| `stock` | Numeric(10,2) | Cantidad en stock (> 0) |
| `updated_at` | DateTime | Última actualización |

**IMPORTANTE:** Solo se guardan registros con `stock > 0` (ADM Cloud no devuelve stock 0).

---

## 🔄 TIPOS DE SINCRONIZACIÓN

### **TIPO 1: Sincronización Masiva de Productos** (`/api/sincronizar/productos`)

**Propósito:** Obtener TODOS los productos desde ADM Cloud con sus datos completos.

**Flujo:**
1. Obtiene productos de `/api/Items` con paginación (50 productos por llamada)
2. Para cada producto:
   - Extrae: `ID`, `SKU`, `Name`, `Barcode` ⚠️
   - Busca producto en BD por `item_id`
   - Si existe → **actualiza**: `nombre`, `sku`, `codigo_barras`
   - Si no existe → **crea** nuevo producto
3. También sincroniza stock por ubicación (opcional, puede ser pesado)

**Ventajas:**
- ✅ Obtiene código de barras directamente (viene en `/api/Items`)
- ✅ Actualiza nombre, SKU, código de barras eficientemente
- ✅ Usa paginación (50 productos por llamada = eficiente)

**Desventajas:**
- ⚠️ Puede ser lento si hay muchos productos
- ⚠️ Si incluye stock, hace muchas consultas adicionales

---

### **TIPO 2: Sincronización por Ubicación** (`/api/sincronizar/ubicacion/<location_id>`)

**Propósito:** Sincronizar stock de UNA ubicación específica (ej: ADESA).

**Flujo:**
1. Obtiene stock de `/api/Stock?LocationID=...&skip=0&take=50` (paginación de 50)
2. Para cada item con stock > 0:
   - Extrae: `ItemID`, `ItemSKU`, `Stock`
   - Busca producto en BD por `item_id`
   - **Si producto NO existe** → crea con datos básicos (SKU, nombre temporal)
   - **Si producto existe** → no cambia sus datos (preserva nombre, SKU, código de barras)
   - Guarda/actualiza stock en `StockProductoADM`
3. Commit periódico cada 100 items
4. **Al finalizar** → inicia actualización de productos en segundo plano ⚠️

**Ventajas:**
- ✅ Rápido (solo stock, sin timeout)
- ✅ Se puede ejecutar por ubicación individual
- ✅ ADESA puede sincronizarse primero (prioridad)

**Desventajas:**
- ⚠️ NO obtiene código de barras directamente (la API `/api/Stock` puede no incluir Barcode)
- ⚠️ Si el producto no existe, lo crea sin código de barras

---

### **TIPO 3: Actualización Automática en Segundo Plano** (Thread automático)

**Propósito:** Actualizar productos (nombre, SKU, código de barras) después de sincronizar ubicación.

**Cuándo se ejecuta:**
- Automáticamente después de sincronizar una ubicación
- Se ejecuta en un thread separado (no bloquea la respuesta)

**Flujo:**
1. Obtiene productos de `/api/Items` con paginación (50 por llamada)
2. Para cada producto:
   - Busca en BD por `item_id`
   - Si existe → **actualiza** `nombre`, `sku`, `codigo_barras` (solo si cambió)
   - Si no existe → **crea** nuevo producto (sin stock, viene de sync ubicación)
3. Commit periódico cada 100 productos
4. **NO toca el stock** (viene de sincronización por ubicación)

**Ventajas:**
- ✅ Se ejecuta automáticamente (sin intervención manual)
- ✅ No bloquea sincronización de ubicación
- ✅ Actualiza código de barras eficientemente
- ✅ Preserva el stock (no lo modifica)

**Desventajas:**
- ⚠️ Se ejecuta en segundo plano (puede tardar varios minutos)
- ⚠️ Si falla, puede no ser obvio para el usuario

---

## 🚨 DESAFÍO PRINCIPAL: CÓDIGO DE BARRAS

### **Problema Identificado:**

1. **La API `/api/Stock` NO devuelve código de barras directamente**
   - Solo devuelve: `ItemID`, `ItemSKU`, `Stock`
   - No incluye: `Barcode`, `Name` completo

2. **Solución anterior (problemática):**
   - Hacer llamada individual a `/api/Items/{item_id}` por cada producto sin código de barras
   - Si ADESA tiene 6,451 productos sin código de barras = **6,451 llamadas HTTP**
   - Cada llamada: ~400ms → **Total: ~43 minutos** → **TIMEOUT en cPanel** ❌

3. **Solución actual (optimizada):**
   - ✅ Sincronización por ubicación: Solo usa código de barras si viene en `/api/Stock`
   - ✅ Si no viene, crea producto sin código de barras (se obtiene después)
   - ✅ Actualización en segundo plano: Obtiene código de barras con paginación eficiente (50 productos por llamada)
   - ✅ Resultado: Sin timeout, código de barras se obtiene después automáticamente

---

## 🔍 FLUJO COMPLETO ACTUAL

### **Escenario: Sincronizar ADESA por primera vez**

```
1. ADMIN presiona "Sincronizar" en ADESA
   ↓
2. Sincronización por ubicación (RÁPIDA):
   - GET /api/Stock?LocationID=adesa&skip=0&take=50
   - Procesa 50 items → crea productos básicos (sin código de barras)
   - GET /api/Stock?LocationID=adesa&skip=50&take=50
   - Procesa 50 items más → actualiza stock
   - ... continúa hasta obtener todos ...
   - Total: ~130 llamadas (6,451 ÷ 50)
   - Tiempo: ~52 segundos ✅
   - Responde al admin: "Sincronización completada"
   ↓
3. En segundo plano (AUTOMÁTICO):
   - Thread inicia actualización de productos
   - GET /api/Items?skip=0&take=50
   - Procesa 50 productos → actualiza nombre, SKU, código de barras
   - GET /api/Items?skip=50&take=50
   - Procesa 50 productos más → actualiza código de barras
   - ... continúa hasta obtener todos ...
   - Total: ~130 llamadas (más eficiente que 6,451 individuales)
   - Tiempo: ~5-10 minutos (en background, sin bloquear)
   - Resultado: Todos los productos tienen código de barras ✅
```

---

## 📝 ESTADO ACTUAL DEL CÓDIGO DE BARRAS

### **¿Dónde se guarda el código de barras?**

1. **Durante sincronización masiva de productos:**
   - ✅ Se obtiene de `/api/Items` (viene en cada producto)
   - ✅ Se guarda directamente en `ProductoADM.codigo_barras`

2. **Durante sincronización por ubicación:**
   - ⚠️ Solo se guarda si viene en `/api/Stock` (poco probable)
   - ⚠️ Si no viene, el producto se crea sin código de barras
   - ✅ Se obtiene después en actualización en segundo plano

3. **Durante actualización en segundo plano:**
   - ✅ Se obtiene de `/api/Items` con paginación eficiente
   - ✅ Se actualiza en productos existentes
   - ✅ Se guarda en productos nuevos

---

## ⚠️ PROBLEMAS CONOCIDOS

### **1. Sincronización quedó en "running" indefinidamente**

**Causa:**
- Si la sincronización se interrumpe por timeout o error, el estado puede quedar en `'running'` en la BD
- Cuando se carga la página, detecta `status === 'running'` y muestra "Sincronizando..."

**Solución recomendada:**
- Agregar timeout automático (si lleva más de X minutos en 'running', cambiar a 'error')
- O verificar en el código si el proceso realmente está corriendo

### **2. Código de barras no disponible inmediatamente**

**Causa:**
- La sincronización por ubicación no obtiene código de barras directamente
- La actualización en segundo plano puede tardar varios minutos

**Solución recomendada:**
- Ejecutar sincronización masiva de productos después de sincronizar ubicaciones
- O esperar a que termine la actualización en segundo plano

### **3. UnicodeEncodeError en logs**

**Causa:**
- Los logs intentan escribir caracteres especiales (ej: "Excepción") sin encoding UTF-8

**Solución:**
- Ya se corrigió en `app_wms.py` configurando `encoding='utf-8'` en StreamHandler

---

## ✅ MEJORES PRÁCTICAS

### **Para sincronizar inicialmente:**

1. **Primero:** Sincronizar ubicaciones (ADESA, MIRADOR SUR, etc.)
   - Esto crea productos básicos y guarda stock
   - Rápido, sin timeout

2. **Después:** Ejecutar sincronización masiva de productos
   - Esto obtiene códigos de barras de todos los productos
   - Más lento, pero eficiente

### **Para sincronización diaria:**

1. Sincronizar ubicaciones (actualiza stock)
2. La actualización en segundo plano actualizará productos automáticamente

### **Para verificar códigos de barras:**

```sql
-- Ver productos CON código de barras:
SELECT COUNT(*) FROM productos_adm WHERE codigo_barras IS NOT NULL;

-- Ver productos SIN código de barras:
SELECT COUNT(*) FROM productos_adm WHERE codigo_barras IS NULL;

-- Ver ejemplo de producto con código de barras:
SELECT item_id, sku, nombre, codigo_barras 
FROM productos_adm 
WHERE codigo_barras IS NOT NULL 
LIMIT 10;
```

---

## 🔧 CONFIGURACIÓN Y ARCHIVOS CLAVE

### **Archivos principales:**

1. **`routes/sincronizar.py`**
   - Endpoints de sincronización
   - Lógica de actualización de productos
   - Función `actualizar_productos_en_segundo_plano()`

2. **`database/models.py`**
   - Modelos `ProductoADM` y `StockProductoADM`
   - Definición de campo `codigo_barras`

3. **`templates/admin.html`**
   - Interfaz de Panel de Administración
   - Botones de sincronización

4. **`routes/productos.py`**
   - Búsqueda de productos por SKU, nombre, código de barras
   - Usa `ProductoADM.codigo_barras` para búsquedas

---

## 📊 RESUMEN EJECUTIVO

### **Estado Actual:**
- ✅ Sincronización por ubicación funciona (rápida, sin timeout)
- ✅ Actualización en segundo plano funciona (obtiene código de barras)
- ⚠️ Código de barras puede no estar disponible inmediatamente después de sync ubicación
- ⚠️ Estado 'running' puede quedar indefinidamente si hay interrupción

### **Recomendaciones:**
1. Agregar verificación de timeouts para estados 'running'
2. Ejecutar sincronización masiva de productos periódicamente
3. Verificar logs para confirmar que actualización en segundo plano está funcionando

---

**Fecha del informe:** 19 de enero de 2026  
**Versión del sistema:** Sincronización por etapas con actualización en segundo plano








