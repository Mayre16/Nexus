# ANÁLISIS DE SEGURIDAD: Actualizar StockProductoADM en Ajustes

## FECHA: 2026-01-26

---

## 🔍 ANÁLISIS: ¿Rompe algo actualizar StockProductoADM en ajustes?

### Módulos que usan StockProductoADM

#### 1. **Consulta de Productos** (`routes/productos.py`)

**Uso:**
- Solo **LEE** `StockProductoADM` para mostrar información
- No hace validaciones
- No depende de que NO se modifique

**Impacto de actualizar:**
- ✅ **NO ROMPE**: Solo mostrará el valor actualizado (mejor UX)

---

#### 2. **Despacho** (`routes/despacho.py`)

**Uso:**
- Solo **LEE** `StockProductoADM` para mostrar `stock_adesa_adm` al usuario
- **NO valida** stock disponible basándose en esto
- Las validaciones de stock se hacen contra `StockUbicacion` (ubicaciones físicas)

**Código relevante (línea 246):**
```python
stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
# Solo para mostrar, NO para validar
```

**Impacto de actualizar:**
- ✅ **NO ROMPE**: Solo mostrará el valor actualizado
- ✅ **NO afecta validaciones**: Las validaciones usan `StockUbicacion`, no `StockProductoADM`

---

#### 3. **Detección de Discrepancias** (`routes/productos.py` y `routes/sincronizar.py`)

**Uso:**
- Compara `StockProductoADM` (stock ADM) con `StockUbicacion` (stock físico WMS)
- Crea discrepancias cuando hay diferencias

**Escenarios si actualizamos StockProductoADM en ajustes:**

**Escenario A: Ajustas Mirador Sur 44 → 0**
- `StockProductoADM` se actualiza a 0 ✅
- Si hay stock físico en WMS → Se detecta discrepancia ✅ (correcto)
- Si no hay stock físico → No hay discrepancia ✅ (correcto)
- Sincronización luego → Si ADM Cloud tiene 44, sobrescribe a 44
- Si hay stock físico → Se crea discrepancia ✅ (correcto)

**Impacto de actualizar:**
- ✅ **NO ROMPE**: Incluso **MEJORA** la detección de discrepancias
- ✅ **Más preciso**: Refleja el ajuste realizado

---

#### 4. **Sincronización** (`routes/sincronizar.py`)

**Uso:**
- **SOBRESCRIBE** `StockProductoADM` con lo que viene de ADM Cloud
- Línea 991: `stock_obj.stock = stock` (sobrescribe siempre)

**Impacto de actualizar:**
- ✅ **NO ROMPE**: La sincronización sobrescribirá el cambio (esperado)
- ✅ **Comportamiento correcto**: Si ADM Cloud tiene 44, volverá a 44
- ✅ **Temporalidad**: El ajuste se refleja hasta la próxima sincronización

---

#### 5. **Ajustes** (`routes/ajustes.py`)

**Uso actual:**
- **NO actualiza** `StockProductoADM`
- Solo crea movimientos de auditoría

**Impacto de actualizar:**
- ✅ **NO ROMPE**: Solo mejorará la funcionalidad
- ✅ **Mejor UX**: Usuario ve el cambio inmediatamente

---

## 📊 RESUMEN DE IMPACTO

| Módulo | Uso de StockProductoADM | ¿Rompe si se actualiza? | Razón |
|--------|-------------------------|-------------------------|-------|
| **Consulta de Productos** | Solo lectura (mostrar) | ✅ NO | Solo muestra información |
| **Despacho** | Solo lectura (mostrar) | ✅ NO | No valida con esto, usa StockUbicacion |
| **Detección Discrepancias** | Comparación con StockUbicacion | ✅ NO | Incluso mejora la detección |
| **Sincronización** | Sobrescribe siempre | ✅ NO | Sobrescribirá el cambio (esperado) |
| **Ajustes** | Actualmente no actualiza | ✅ NO | Solo mejorará funcionalidad |

---

## ✅ CONCLUSIÓN

### **NO ROMPE NADA** ✅

**Razones:**

1. **Solo lectura en otros módulos**: Los demás módulos solo LEEN `StockProductoADM`, no dependen de que NO se modifique

2. **No hay validaciones críticas**: No hay validaciones que dependan de que `StockProductoADM` no cambie

3. **Sincronización sobrescribe**: La sincronización siempre sobrescribe, así que el cambio es temporal (esperado)

4. **Mejora la detección**: Actualizar mejora la detección de discrepancias porque refleja el ajuste realizado

5. **Consistencia**: Similar a cómo funcionan los ajustes físicos (actualizan `StockUbicacion`)

---

## 🎯 RECOMENDACIÓN FINAL

### **SÍ, es seguro y recomendable actualizar StockProductoADM en ajustes**

**Beneficios:**
- ✅ Mejor UX (usuario ve el cambio inmediatamente)
- ✅ Consistencia con ajustes físicos
- ✅ No rompe ninguna lógica existente
- ✅ Mejora la detección de discrepancias

**Riesgos:**
- ❌ Ninguno identificado

**Implementación:**
```python
# Después de crear el movimiento
if stock_adm:
    stock_adm.stock = cantidad_nueva
    stock_adm.updated_at = datetime.utcnow()
else:
    # Si no existe, crear registro
    stock_adm = StockProductoADM(
        producto_id=producto_db.id,
        location_id=location_id,
        location_name=ubicacion_adm,
        stock=cantidad_nueva
    )
    db.session.add(stock_adm)
```

---

## ⚠️ NOTA IMPORTANTE

**La sincronización sobrescribirá el cambio:**
- Esto es **esperado** y **correcto**
- Si ADM Cloud tiene 44, la sincronización volverá a poner 44
- El ajuste queda registrado en `movimientos` para auditoría
- El usuario verá el cambio temporalmente (mejor UX)








