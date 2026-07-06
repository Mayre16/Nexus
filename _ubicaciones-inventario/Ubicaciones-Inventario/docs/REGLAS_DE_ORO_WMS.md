# 🥇 REGLAS DE ORO DEL WMS

**Este documento define las reglas fundamentales que TODO el sistema debe respetar.**

**IMPORTANTE:** Si una regla entra en conflicto con otra, DEBE reportarse inmediatamente antes de programar.

---

## 🎯 OBJETIVO REAL DEL WMS

El WMS debe permitir que el personal de almacén y despacho pueda:

✅ **Consultar un producto rápido** (sin llamar ADM en vivo)  
✅ **Ver dónde hay stock en el ERP** (ADM Cloud) por ubicación/sucursal  
✅ **Ver ubicación física interna** en el almacén (WMS)  
✅ **Despachar con trazabilidad** (y evitar inventarios fantasmas)  
✅ **Detectar inconsistencias** y obligar revisión cuando algo no cuadra  

---

## 🥇 REGLA DE ORO #1: Stock 0 en ADM NO viene como 0

### **Enunciado:**
ADM Cloud **NO devuelve stock 0** en `/api/Stock`.

### **Implicación:**
➡️ **Si el SKU existe en `/api/Items` pero NO aparece en `/api/Stock?LocationID=...`, entonces para esa ubicación el stock ERP es 0.**

### **Cómo se aplica:**
- ✅ Al sincronizar ubicación, solo se guardan registros que vienen en `/api/Stock` (stock > 0)
- ✅ Si un producto existía en BD con stock ERP > 0 y después de sincronizar **ya NO viene en `/api/Stock`**, significa que el stock ERP ahora es 0
- ✅ **Se actualiza `StockProductoADM.stock = 0`** (capa ERP/cache)
- ✅ **NO se toca `StockUbicacion.cantidad`** (stock físico del WMS - debe quedar igual)
- ✅ Si hay stock físico > 0 y ADM dice 0, se marca como DISCREPANCIA (ver Regla #3)

### **Ejemplo:**
- Producto VP1 en ADESA tenía stock = 20 (registrado en BD)
- Sincronización de ADESA no devuelve VP1 en `/api/Stock`
- ➡️ Stock ERP en ADESA ahora es 0
- ➡️ Si WMS físico tiene stock > 0, marcar como DISCREPANCIA (Regla #3)

---

## 🥇 REGLA DE ORO #2: La consulta del usuario siempre debe ser desde BD local

### **Enunciado:**
La pantalla "Consulta de Productos" debe responder **rápido y sin depender de ADM en vivo**.

### **Implicación:**
➡️ **Toda consulta debe leer la base de datos del WMS.**

### **Cómo se aplica:**
- ✅ La página "Consulta de Productos" SOLO consulta la BD local
- ✅ **NO hace llamadas a ADM Cloud en tiempo real**
- ✅ ADM se consulta solo mediante:
  - Sincronización manual (admin)
  - Cron programado
  - Procesos controlados

### **Excepciones:**
- ❌ NO hay excepciones. Si se necesita información de ADM, se debe sincronizar primero.

---

## 🥇 REGLA DE ORO #3: Discrepancias NO se pisan, se registran y se alertan

### **Enunciado:**
Si ADM "baja" un producto (ej: stock ERP pasa de 20 a 0), pero en WMS físico todavía existe cantidad registrada o ubicación física conocida, entonces:

### **Implicación:**
✅ **NO se borra evidencia ni se sobrescribe la realidad física en silencio.**  
✅ **Se guarda el nuevo valor de ADM como snapshot (0).**  
✅ **Se mantiene el stock físico del WMS tal cual estaba.**  
✅ **Se marca como DISCREPANCIA / NO CONCILIADO.**  
✅ **Se genera alerta obligatoria para administradores.**

### **Razón:**
Una inconsistencia siempre tiene explicación (venta pendiente de despacho, ajuste, error humano, transferencia, etc.) y debe investigarse.

### **Cómo se aplica:**

**⚠️ CRITERIO DE DISCREPANCIA CRÍTICA:**
Solo se disparan discrepancias en eventos críticos para evitar ruido:
- ✅ **ADM stock = 0** pero **stock físico WMS > 0** → **DISCREPANCIA CRÍTICA**

**❌ NO se marcan como discrepancias:**
- Diferencias menores (ej: ADM=100, WMS=98) → No es crítico
- Solo se marca cuando hay riesgo real (ADM=0 pero físico existe)

**Acciones cuando se detecta discrepancia crítica:**
1. ✅ Guardar stock ERP = 0 en `StockProductoADM` (si no viene en `/api/Stock`)
2. ✅ **NO tocar stock físico** en `StockUbicacion` (debe quedar igual)
3. ✅ Crear registro en tabla de discrepancias
4. ✅ Marcar producto/ubicación como "DISCREPANCIA CRÍTICA"
5. ✅ Mostrar alerta en panel admin
6. ✅ Mostrar aviso en consulta de productos: "⚠️ DISCREPANCIA: Stock ERP = 0, Stock Físico = X"

### **Ejemplo:**
- Producto VP1 en ADESA:
  - Stock ERP (ADM): 0 (después de sincronizar)
  - Stock físico (WMS): 20 (en ubicación física "A-01-02")
- ➡️ Sistema muestra: "⚠️ DISCREPANCIA: Stock ERP = 0, Stock Físico = 20"
- ➡️ Marca como pendiente de revisión
- ➡️ Genera alerta para administradores

---

## 🔄 SINCRONIZACIÓN: CÓMO DEBE FUNCIONAR

### **1. Sincronización por Ubicación (Manual desde Panel Admin)**

**Propósito:** Obtener stock ERP por ubicación desde ADM Cloud.

**Cuándo se ejecuta:**
- Manualmente desde Panel de Administración
- 1 ubicación a la vez (para evitar timeout)

**Qué guarda:**
- ✅ Stock ERP por ubicación (solo lo que viene en `/api/Stock` = stock > 0)
- ✅ Fecha de actualización
- ✅ Estado de sync

**Qué NO toca:**
- ❌ NO modifica ubicaciones físicas del WMS
- ❌ NO modifica catálogo de productos (nombre, SKU, código de barras)
- ❌ NO borra registros de stock físico del WMS

**Prioridad:**
- 🎯 ADESA es siempre prioridad

**Manejo de productos desaparecidos:**
- Si un producto existía con stock ERP > 0 y después de sincronizar **ya no viene en `/api/Stock`**:
  1. ✅ Actualizar `StockProductoADM.stock = 0` (capa ERP/cache)
  2. ✅ **NO tocar** `StockUbicacion.cantidad` (stock físico debe quedar igual)
  3. ✅ Si `StockUbicacion.cantidad > 0`, crear DISCREPANCIA CRÍTICA (Regla #3)

---

### **2. Sincronización de Catálogo (Items) - Obligatoria para búsqueda completa**

**Propósito:** Mantener catálogo de productos actualizado desde ADM Cloud.

**Cuándo se ejecuta:**
- Manualmente desde Panel de Administración
- O mediante cron programado

**Qué guarda (se SOBREESCRIBE siempre):**
- ✅ Nombre
- ✅ SKU
- ✅ Código de barras
- ✅ Activo/inactivo (si aplica)
- ✅ UOM (si aplica)

**Qué NO toca:**
- ❌ NO toca stock ERP (viene de sincronización por ubicación)
- ❌ NO toca stock físico del WMS
- ❌ NO toca ubicaciones físicas

**Razón de sobreescribir:**
En ADM estos campos cambian frecuentemente por correcciones, por lo que deben actualizarse siempre.

---

## 📋 PÁGINA: "Consulta de Productos" (Requisitos)

### **Búsqueda:**
✅ Por SKU  
✅ Por Nombre  
✅ Por Código de barras  

**IMPORTANTE:** Toda búsqueda es en BD local (Regla #2)

### **Ficha del producto:**
✅ SKU  
✅ Nombre  
✅ Código de barras  

### **Stock del ERP por ubicaciones:**
✅ Listar solo ubicaciones con stock > 0  
✅ Total general  
✅ Resaltar "En mano (ADESA)"  

### **Ubicación física interna del WMS:**
✅ Ubicación interna (pasillo/nivel)  
✅ Cantidad física (si está asignada)  

### **Manejo de discrepancia:**
Si ADM dice 0 y WMS físico dice >0:
➡️ Mostrar aviso claro "⚠️ DISCREPANCIA"  
➡️ Mostrar: "Stock ERP: 0" vs "Stock Físico: X"  
➡️ Marcar como pendiente revisión  

### **Navegación:**
✅ Botón volver al panel principal (módulos)  
✅ Cerrar sesión  

---

## ⚠️ MANEJO DE CONFLICTOS ENTRE REGLAS

### **Si detectas conflicto:**

✅ **NO tomar una decisión silenciosa**  
✅ **NO sobreescribir datos físicos sin evidencia**  
✅ **Reportarlo como discrepancia**  
✅ **Informar y mostrarlo en panel admin/alerta**  

### **Ejemplo de conflicto:**
- Regla #1: ADM no devuelve stock 0, entonces si no viene = 0
- Regla #3: No se pisan discrepancias, se alertan
- **Resolución:** Actualizar stock ERP a 0 (Regla #1), pero mantener stock físico y marcar como DISCREPANCIA (Regla #3)

---

## ✅ RESULTADO ESPERADO FINAL

Cuando busquemos un SKU como "VP1", el sistema debe mostrar:

✅ **Stock ADM por ubicación** (ADESA / MIRADOR SUR / etc.)  
✅ **Total general**  
✅ **"En mano (ADESA)"** resaltado  
✅ **Ubicación física interna**  
✅ **Si hay inconsistencias, mostrarlas como discrepancias investigables**  

---

**Versión:** 1.0  
**Fecha:** 19 de enero de 2026  
**Estado:** ACTIVO - Estas reglas deben respetarse en TODO el código

