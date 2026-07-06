# 🔍 DIAGNÓSTICO: Códigos de Barras No Aparecen

**Problema:** Aunque ejecutaste la sincronización de catálogo (5751 productos actualizados), el código de barras sigue mostrando "No disponible".

---

## ✅ CORRECCIONES APLICADAS

### **1. Corrección de encoding en logs:**
- Actualizado `app_wms.py` para usar `encoding='utf-8'` en los handlers de logging
- Esto evita errores de UnicodeEncodeError

### **2. Búsqueda mejorada de código de barras:**
- Actualizado `routes/sincronizar.py` para buscar el código de barras en MÁS campos posibles:
  - `Barcode`
  - `BarcodeValue`
  - `BarCode`
  - `barcode`
  - `CodigoBarras`
  - `codigo_barras`

### **3. Script de diagnóstico creado:**
- Archivo `verificar_codigo_barras.py` para verificar qué campos vienen realmente de ADM Cloud

---

## 🔧 PASOS PARA DIAGNOSTICAR

### **Paso 1: Ejecutar Script de Diagnóstico**

1. **En cPanel → Web Applications → Editar "WMS.ADESA.COM.DO/"**
2. **En "Execute python script", escribe:**
   ```
   verificar_codigo_barras.py
   ```
3. **Click en "Run Script"**
4. **Revisa la salida** - Te dirá:
   - Qué campos de código de barras vienen de ADM Cloud
   - Si los productos tienen código de barras o no
   - Qué hay guardado en tu base de datos local

---

### **Paso 2: Posibles Resultados del Diagnóstico**

#### **Escenario A: ADM Cloud NO envía código de barras**
**Solución:** 
- Si ADM Cloud no tiene códigos de barras configurados, no se puede hacer nada desde el WMS
- Necesitarías configurarlos primero en ADM Cloud

#### **Escenario B: ADM Cloud envía código de barras pero con otro nombre de campo**
**Solución:**
- El script te mostrará el nombre exacto del campo
- Actualiza `routes/sincronizar.py` línea 690-697 para incluir ese campo

#### **Escenario C: Códigos de barras vienen pero no se están guardando**
**Solución:**
- Verifica los logs durante la sincronización
- Puede haber un error silencioso

#### **Escenario D: Códigos de barras están guardados pero no se muestran**
**Solución:**
- El script verificará si hay códigos guardados en BD
- Si están guardados, el problema está en el frontend/template

---

### **Paso 3: Re-sincronizar Catálogo (después de correcciones)**

Después de hacer las correcciones necesarias:

1. **Ve al Panel Admin**
2. **Click en "🔄 Sincronizar Catálogo"** nuevamente
3. **Espera a que termine**
4. **Verifica en "Consulta de Productos"**

---

## 📋 ARCHIVOS ACTUALIZADOS PARA SUBIR A CPANEL

1. ✅ `app_wms.py` - Corrección de encoding en logs
2. ✅ `routes/sincronizar.py` - Búsqueda mejorada de código de barras
3. ✅ `verificar_codigo_barras.py` - Script de diagnóstico (NUEVO)

---

## ⚠️ NOTA IMPORTANTE

**Es posible que algunos productos en ADM Cloud simplemente NO tengan código de barras configurado.**

En ese caso:
- ✅ Es normal que muestre "No disponible"
- ✅ Solo los productos con código de barras en ADM Cloud lo mostrarán
- ✅ El script de diagnóstico te confirmará esto

---

## 🎯 PRÓXIMOS PASOS

1. **Ejecuta el script de diagnóstico** (`verificar_codigo_barras.py`)
2. **Comparte los resultados** para determinar la causa exacta
3. **Aplicamos la solución específica** según lo que encuentre el diagnóstico








