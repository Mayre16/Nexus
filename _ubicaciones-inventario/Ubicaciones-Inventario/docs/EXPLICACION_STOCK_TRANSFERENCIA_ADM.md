# 📋 EXPLICACIÓN: STOCK DESPUÉS DE TRANSFERENCIA EN ADM CLOUD

**Problema:** Después de transferir un artículo en ADM Cloud, el sistema WMS aún muestra stock en la ubicación física.

---

## 🔍 ¿QUÉ ESTÁ PASANDO?

### **Escenario:**
1. Transfieres el artículo **PA-001** de **P2-P1-AL-N2** usando un documento de transferencia interna en **ADM Cloud**
2. ADM Cloud ya no muestra ese producto en P2-P1-AL-N2 (stock = 0)
3. Sincronizas la ubicación P2-P1-AL-N2
4. Consultas el producto y **aún ves stock en P2-P1-AL-N2**

---

## 🎯 ¿CÓMO FUNCIONA EL SISTEMA?

El sistema WMS maneja **DOS tipos de stock diferentes**:

### **1. Stock ERP (ADM Cloud) - `StockProductoADM`**
- **Fuente:** ADM Cloud (sincronización)
- **Se actualiza:** Automáticamente durante sincronización
- **Qué muestra:** Stock según ADM Cloud
- **Regla de Oro #1:** Si un producto desaparece de ADM Cloud, se actualiza a 0

### **2. Stock Físico WMS - `StockUbicacion`**
- **Fuente:** Movimientos registrados en el WMS
- **Se actualiza:** Solo cuando registras movimientos en el WMS:
  - ✅ Recepciones
  - ✅ Despachos
  - ✅ Transferencias internas (registradas en WMS)
  - ✅ Ajustes
- **Qué muestra:** Stock físico real en el almacén según movimientos del WMS

---

## ⚠️ EL PROBLEMA

Cuando haces una transferencia **directamente en ADM Cloud** (no en el WMS):

1. ✅ **ADM Cloud se actualiza:** El stock en ADM Cloud cambia
2. ✅ **Sincronización detecta el cambio:** La Regla de Oro #1 actualiza `StockProductoADM.stock = 0`
3. ❌ **Stock físico WMS NO se actualiza:** `StockUbicacion` sigue igual porque:
   - La transferencia NO se registró en el WMS
   - El WMS no sabe que hubo una transferencia
   - Solo se actualiza cuando registras movimientos en el WMS

---

## 📊 RESULTADO EN LA CONSULTA

Cuando consultas el producto PA-001:

**Stock ADM Cloud (ERP):**
- P2-P1-AL-N2: **0.00** ✅ (correcto, porque se sincronizó)

**Stock Físico WMS:**
- P2-P1-AL-N2: **1.00** ❌ (incorrecto, porque nunca se registró la transferencia en el WMS)

**Resultado:** **DISCREPANCIA CRÍTICA** (Regla de Oro #3)
- ADM dice: 0
- WMS físico dice: 1
- El sistema debería mostrar una alerta de discrepancia

---

## ✅ SOLUCIÓN

### **Opción 1: Registrar la transferencia en el WMS (RECOMENDADO)**

1. Ir al módulo de **Transferencias** en el WMS
2. Buscar el documento de transferencia interna desde ADM Cloud
3. Registrar la transferencia en el WMS
4. Esto actualizará `StockUbicacion` correctamente

**Ventajas:**
- ✅ Stock físico se actualiza correctamente
- ✅ Trazabilidad completa en el WMS
- ✅ No hay discrepancias

### **Opción 2: Crear un ajuste manual**

1. Ir al módulo de **Ajustes** en el WMS
2. Crear un ajuste para reducir el stock en P2-P1-AL-N2
3. Esto actualizará `StockUbicacion` manualmente

**Ventajas:**
- ✅ Rápido
- ✅ Actualiza stock físico

**Desventajas:**
- ⚠️ No refleja la transferencia real (solo un ajuste)

---

## 🔄 ¿EL SISTEMA ESPERA EL REGISTRO EN EL MÓDULO DE TRANSFERENCIAS?

**Respuesta: NO, el sistema NO espera automáticamente.**

**Explicación:**
- El sistema **NO puede saber** automáticamente que hubo una transferencia en ADM Cloud
- La sincronización solo lee el stock final de ADM Cloud
- No lee los movimientos/transferencias individuales
- Por eso, el stock físico del WMS (`StockUbicacion`) **solo se actualiza cuando registras movimientos en el WMS**

---

## 🎯 FLUJO CORRECTO

### **Si haces transferencia en ADM Cloud:**

1. **ADM Cloud:** Stock cambia automáticamente
2. **Sincronización WMS:** Detecta cambio y actualiza `StockProductoADM`
3. **Registro en WMS:** Debes registrar la transferencia en el módulo de Transferencias
4. **Stock Físico:** Se actualiza cuando registras en el WMS

### **Si haces transferencia directamente en el WMS:**

1. **Registro en WMS:** Registras la transferencia
2. **Stock Físico:** Se actualiza inmediatamente
3. **ADM Cloud:** Se actualiza cuando ADM Cloud procesa el documento
4. **Sincronización:** Confirma el cambio

---

## 📝 RECOMENDACIÓN

**Para evitar discrepancias:**

1. ✅ **Siempre registrar transferencias en el WMS** después de hacerlas en ADM Cloud
2. ✅ **O hacer las transferencias directamente en el WMS** (si es posible)
3. ✅ **Revisar discrepancias periódicamente** y resolverlas

---

## 🔍 VERIFICACIÓN

Para verificar si hay discrepancias:

1. Consulta el producto PA-001
2. Revisa si aparece una alerta de **"DISCREPANCIA CRÍTICA"**
3. Si aparece, significa:
   - ADM Cloud dice: 0 (correcto)
   - WMS físico dice: > 0 (necesita actualización)

---

**Conclusión:** El sistema funciona correctamente. El stock físico del WMS solo se actualiza cuando registras movimientos en el WMS. Si haces transferencias en ADM Cloud, debes registrarlas también en el WMS para mantener la consistencia.



