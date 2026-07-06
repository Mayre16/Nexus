# ANÁLISIS: Stock de Ubicación Macro NO se Actualiza en Transferencias

## FECHA: 2026-01-26

---

## 🔍 PROBLEMA REPORTADO

**Escenario:**
- Transferencia procesada: P2-P1-AL-N2 → ADESA (cantidad: 1.00)
- P2-P1-AL-N2 es una ubicación MACRO (NO-ADESA)
- Después de la transferencia, al consultar el producto, P2-P1-AL-N2 sigue mostrando stock: 1.00

**Comportamiento esperado:**
- El stock de P2-P1-AL-N2 debería disminuir a 0.00 después de la transferencia

---

## 📊 ANÁLISIS DEL CÓDIGO

### 1. **Procesamiento de Transferencias** (`routes/transferencias.py`)

#### **Origen NO-ADESA (líneas 552-554):**
```python
else:
    # Origen NO-ADESA: no validar stock, usar location_name
    ubicacion_origen_mov = origen_nombre[:200]  # Truncar a 200 si necesario
```

**Análisis:**
- ✅ NO modifica `StockUbicacion` (correcto, porque no es ubicación física)
- ❌ NO modifica `StockProductoADM` (problema: el stock mostrado no se actualiza)

#### **Destino ADESA (líneas 557-579):**
```python
if destino_es_adesa:
    # Destino ADESA: procesar cada asignación destino
    # ... modifica StockUbicacion ...
```

**Análisis:**
- ✅ Modifica `StockUbicacion` (correcto, porque ADESA tiene ubicaciones físicas)

---

### 2. **Consulta de Productos** (`routes/productos.py`)

#### **Stock mostrado (líneas 122-149):**
```python
stock_ubicaciones_adm = StockProductoADM.query.filter_by(producto_id=producto_db.id).all()
# ... muestra stock desde StockProductoADM ...
```

**Análisis:**
- El stock mostrado viene de `StockProductoADM` (cache local)
- Este cache se actualiza mediante la **sincronización** desde ADM Cloud
- NO se actualiza cuando se procesa una transferencia

---

## 🎯 CAUSA RAÍZ

### **Problema identificado:**

1. **Transferencia P2-P1-AL-N2 → ADESA:**
   - Origen NO-ADESA: Solo crea movimiento de auditoría, NO modifica `StockProductoADM`
   - Destino ADESA: Modifica `StockUbicacion` (ubicación física 2P1D01N1)

2. **Consulta de producto:**
   - Muestra stock desde `StockProductoADM` (cache)
   - `StockProductoADM` para P2-P1-AL-N2 sigue en 1.00 porque no se actualizó

3. **Sincronización:**
   - La sincronización desde ADM Cloud eventualmente actualizará el stock
   - Pero hasta que se sincronice, el usuario ve el stock incorrecto

---

## 📋 COMPARACIÓN CON OTROS MÓDULOS

### **Ajustes:**
- ✅ Actualiza `StockProductoADM` cuando se ajusta una ubicación macro (NO-ADESA)
- ✅ El usuario ve el cambio inmediatamente

### **Transferencias:**
- ❌ NO actualiza `StockProductoADM` cuando se transfiere desde/hacia ubicación macro (NO-ADESA)
- ❌ El usuario NO ve el cambio hasta que se sincronice

---

## ✅ SOLUCIÓN PROPUESTA

### **Actualizar `StockProductoADM` en transferencias:**

**Para origen NO-ADESA:**
- Restar cantidad del stock en `StockProductoADM` para la ubicación origen

**Para destino NO-ADESA:**
- Sumar cantidad al stock en `StockProductoADM` para la ubicación destino

**Beneficios:**
- ✅ Mejor UX: Usuario ve el cambio inmediatamente
- ✅ Consistencia con módulo de Ajustes
- ✅ No rompe lógica: La sincronización sobrescribirá el valor (esperado)

**Consideraciones:**
- Similar a lo implementado en Ajustes para ubicaciones ADM
- El cambio es temporal hasta la próxima sincronización
- Mejora la experiencia del usuario

---

## 🔍 FLUJO ACTUAL vs FLUJO PROPUESTO

### **FLUJO ACTUAL:**

```
Transferencia P2-P1-AL-N2 → ADESA (1.00)
├─ Origen NO-ADESA: Solo crea movimiento
├─ Destino ADESA: Modifica StockUbicacion (2P1D01N1: +1.00)
└─ StockProductoADM: NO se modifica
   └─ Consulta muestra: P2-P1-AL-N2 = 1.00 ❌ (incorrecto)
```

### **FLUJO PROPUESTO:**

```
Transferencia P2-P1-AL-N2 → ADESA (1.00)
├─ Origen NO-ADESA: 
│  ├─ Crea movimiento
│  └─ Actualiza StockProductoADM (P2-P1-AL-N2: -1.00) ✅
├─ Destino ADESA: Modifica StockUbicacion (2P1D01N1: +1.00)
└─ Consulta muestra: P2-P1-AL-N2 = 0.00 ✅ (correcto)
```

---

## 📝 NOTA IMPORTANTE

**Regla de Oro #4:**
- Solo modifica `StockUbicacion` si la ubicación física existe y es ADESA
- **NO prohíbe** modificar `StockProductoADM` para ubicaciones macro (NO-ADESA)
- `StockProductoADM` es cache de ADM Cloud, puede actualizarse temporalmente

---

## ✅ CONCLUSIÓN

**El problema es que `StockProductoADM` no se actualiza en transferencias cuando se involucran ubicaciones macro (NO-ADESA).**

**La solución es similar a la implementada en Ajustes:**
- Actualizar `StockProductoADM` cuando se procesa una transferencia desde/hacia ubicación macro
- Esto mejora la UX mostrando el cambio inmediatamente
- La sincronización eventualmente sobrescribirá el valor (esperado y correcto)








