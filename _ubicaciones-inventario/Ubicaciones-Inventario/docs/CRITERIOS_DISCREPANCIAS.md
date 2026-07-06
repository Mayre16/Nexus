# 🔍 CRITERIOS DE DISCREPANCIAS CRÍTICAS

**Objetivo:** Definir cuándo se debe disparar una discrepancia y cuándo NO (para evitar ruido).

---

## ⚠️ DISCREPANCIA CRÍTICA (Se dispara alerta)

### **Criterio único:**
✅ **ADM stock = 0** pero **stock físico WMS > 0**

### **Razón:**
- Si ADM dice que no hay stock (0) pero físicamente existe producto en el almacén
- Esto es crítico porque puede indicar:
  - Venta pendiente de despacho
  - Error en sincronización
  - Producto no registrado en venta
  - Transferencia no procesada
  - Error humano

### **Acciones:**
1. ✅ Actualizar `StockProductoADM.stock = 0` (ERP cache)
2. ✅ **NO tocar** `StockUbicacion.cantidad` (stock físico intacto)
3. ✅ Crear registro en tabla `Discrepancia`
4. ✅ Mostrar alerta en Panel Admin
5. ✅ Mostrar aviso en Consulta de Productos

---

## ❌ NO ES DISCREPANCIA (No se dispara alerta)

### **Casos que NO se marcan como discrepancias:**

1. **ADM stock > 0 y WMS físico > 0 (valores diferentes)**
   - Ejemplo: ADM=100, WMS=98
   - **Razón:** Diferencias menores son normales (productos en tránsito, contados pero no despachados, etc.)
   - **Acción:** Solo mostrar valores (sin alerta)

2. **ADM stock > 0 y WMS físico = 0**
   - Ejemplo: ADM=50, WMS=0
   - **Razón:** Stock puede estar en otras ubicaciones o pendiente de recibir
   - **Acción:** Mostrar valores normalmente

3. **ADM stock = 0 y WMS físico = 0**
   - **Razón:** No hay discrepancia, ambos coinciden
   - **Acción:** Mostrar normalmente

---

## 📊 TABLA RESUMEN

| ADM Stock | WMS Físico | ¿Es Discrepancia? | Acción |
|-----------|------------|-------------------|--------|
| 0 | > 0 | ✅ **SÍ (CRÍTICA)** | Alerta + Registrar discrepancia |
| 0 | 0 | ❌ No | Mostrar normalmente |
| > 0 | > 0 | ❌ No | Mostrar normalmente (valores pueden diferir) |
| > 0 | 0 | ❌ No | Mostrar normalmente |

---

## 🔄 FLUJO DE DETECCIÓN

### **Durante sincronización por ubicación:**

```
1. Obtener productos de /api/Stock para ubicación X
2. Guardar/actualizar StockProductoADM con stock > 0

3. Buscar productos que TENÍAN stock > 0 en BD pero YA NO vienen en /api/Stock:
   - Actualizar StockProductoADM.stock = 0 (ERP cache)
   
4. Para cada producto actualizado a 0:
   - Buscar stock físico en StockUbicacion
   - Si StockUbicacion.cantidad > 0:
     → CREAR DISCREPANCIA CRÍTICA
```

### **Durante consulta de productos:**

```
1. Obtener stock ERP desde StockProductoADM
2. Obtener stock físico desde StockUbicacion
3. Comparar:
   - Si ERP = 0 y Físico > 0:
     → Mostrar alerta "⚠️ DISCREPANCIA CRÍTICA"
     → Mostrar: "Stock ERP: 0" vs "Stock Físico: X"
   - Si no cumple criterio:
     → Mostrar valores normalmente (sin alerta)
```

---

## 📋 MODELO DE DISCREPANCIA

```python
class Discrepancia(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=True)  # Ubicación ADM
    location_name = db.Column(db.String(200), nullable=True)
    ubicacion_fisica = db.Column(db.String(50), nullable=True)  # Ubicación física WMS
    
    stock_erp = db.Column(db.Numeric(10, 2), default=0, nullable=False)  # Stock ADM
    stock_fisico_wms = db.Column(db.Numeric(10, 2), default=0, nullable=False)  # Stock físico
    
    tipo = db.Column(db.String(20), default='critica', nullable=False)  # critica, menor, etc.
    estado = db.Column(db.String(20), default='pendiente', nullable=False)  # pendiente, revisado, resuelto
    
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    fecha_revision = db.Column(db.DateTime, nullable=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    
    notas = db.Column(db.Text, nullable=True)  # Notas del administrador
    resuelto_por = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
```

---

## ✅ VALIDACIÓN FINAL

**Solo se crea discrepancia cuando:**
- ✅ `StockProductoADM.stock = 0` (ADM dice que no hay stock)
- ✅ `StockUbicacion.cantidad > 0` (Pero físicamente existe stock)

**En cualquier otro caso:**
- ❌ NO se crea discrepancia
- ❌ Solo se muestran los valores normalmente

---

**Versión:** 1.0  
**Fecha:** 19 de enero de 2026  
**Estado:** ACTIVO - Criterio único para evitar ruido








