# 📦 ARCHIVOS A ACTUALIZAR EN cPanel
## Implementación: Multi-Ubicación por SKU (Split por Filas) - Regla de Oro #4

**Fecha:** 23 de Enero, 2026  
**Implementación:** Multi-ubicación por SKU para recepciones ADESA

---

## 📝 ARCHIVOS MODIFICADOS

### **1. Backend: `routes/recepciones.py`**

**Ubicación en servidor:**
```
/home2/adesa/wms.adesa.com.do/routes/recepciones.py
```

**Cambios realizados:**
- ✅ Modificado `registrar_recepcion()` para aceptar nueva estructura con asignaciones múltiples
- ✅ Agregada validación de sumatoria por SKU
- ✅ Implementada lógica de Regla de Oro #4 (ADESA vs NO-ADESA)
- ✅ Modificado `revertir_recepcion()` para verificar tipo de ubicación antes de revertir stock

**Líneas modificadas:**
- Líneas 285-490: Función `registrar_recepcion()` completamente reescrita
- Líneas 493-545: Función `revertir_recepcion()` actualizada

---

### **2. Frontend: `templates/recepciones.html`**

**Ubicación en servidor:**
```
/home2/adesa/wms.adesa.com.do/templates/recepciones.html
```

**Cambios realizados:**
- ✅ Cambiada estructura de datos: `productosAsignados[sku].asignaciones[]`
- ✅ Agregadas funciones: `calcularSumaAsignaciones()`, `validarSumatoria()`, `agregarUbicacion()`, `eliminarAsignacion()`, `renderizarAsignaciones()`, `actualizarSumaAsignaciones()`
- ✅ Modificada función `mostrarProductos()` para mostrar múltiples filas por SKU
- ✅ Actualizada función `registrarTodosProductos()` para enviar nueva estructura
- ✅ Actualizada lógica de bloqueo para NO-ADESA (ya no bloquea)

**Líneas modificadas:**
- Líneas 518: Estructura de datos actualizada
- Líneas 975-1050: Funciones nuevas y actualizadas
- Líneas 870-973: Función `mostrarProductos()` reescrita
- Líneas 1052-1138: Función `registrarTodosProductos()` actualizada

---

## ✅ CHECKLIST DE ACTUALIZACIÓN

### **Paso 1: Backup (IMPORTANTE)**

Antes de actualizar, crear backup de los archivos actuales:

```bash
# En cPanel File Manager o por SSH:
cd /home2/adesa/wms.adesa.com.do

# Crear backup
cp routes/recepciones.py routes/recepciones.py.backup_$(date +%Y%m%d_%H%M%S)
cp templates/recepciones.html templates/recepciones.html.backup_$(date +%Y%m%d_%H%M%S)
```

### **Paso 2: Actualizar Archivos**

**Opción A: Por cPanel File Manager**
1. Ir a `File Manager` en cPanel
2. Navegar a `/home2/adesa/wms.adesa.com.do/`
3. Subir archivos nuevos reemplazando los existentes:
   - `routes/recepciones.py`
   - `templates/recepciones.html`

**Opción B: Por SSH (si tienes acceso)**
```bash
cd /home2/adesa/wms.adesa.com.do
# Subir archivos usando scp o editar directamente
```

### **Paso 3: Verificar Permisos**

Asegurar que los archivos tengan permisos correctos:

```bash
chmod 644 routes/recepciones.py
chmod 644 templates/recepciones.html
```

### **Paso 4: Reiniciar Aplicación (si es necesario)**

Si usas Passenger o similar, puede requerir reinicio:

```bash
# Crear archivo restart.txt para forzar reinicio
touch /home2/adesa/wms.adesa.com.do/tmp/restart.txt
```

O simplemente esperar unos segundos para que se recargue automáticamente.

---

## 🧪 VERIFICACIÓN POST-ACTUALIZACIÓN

### **1. Verificar que la aplicación carga sin errores**

- [ ] Acceder a `/recepciones` y verificar que carga sin errores
- [ ] Revisar logs de error si hay problemas

### **2. Probar recepción ADESA con múltiples ubicaciones**

- [ ] Buscar recepción con `LocationName` que contenga "ADESA"
- [ ] Verificar que se muestran múltiples filas para asignar ubicaciones
- [ ] Agregar segunda ubicación con botón "+ Agregar otra ubicación"
- [ ] Verificar validación de sumatoria en tiempo real
- [ ] Registrar recepción y verificar que se crean múltiples movimientos

### **3. Probar recepción NO-ADESA**

- [ ] Buscar recepción con `LocationName` que NO contenga "ADESA"
- [ ] Verificar que NO se muestran campos de ubicación física
- [ ] Verificar que se muestra mensaje informativo
- [ ] Registrar recepción y verificar que NO se modifica `StockUbicacion`

### **4. Verificar compatibilidad con estructura antigua**

- [ ] Si hay código que aún usa `productos_ubicaciones`, verificar que funciona
- [ ] El backend debe aceptar ambas estructuras

---

## 📊 RESUMEN DE CAMBIOS

| Archivo | Tipo | Cambios Principales |
|---------|------|-------------------|
| `routes/recepciones.py` | Backend | Nueva estructura con asignaciones múltiples, validación de sumatoria, Regla de Oro #4 |
| `templates/recepciones.html` | Frontend | UI dinámica con múltiples filas, validación en tiempo real, botones Agregar/Eliminar |

---

## ⚠️ IMPORTANTE

1. **Backup obligatorio:** Siempre hacer backup antes de actualizar
2. **No requiere migración de BD:** Los cambios son solo en código
3. **Backward compatible:** El backend acepta estructura antigua y nueva
4. **Sin downtime:** Los cambios no requieren detener la aplicación

---

## 🔄 ROLLBACK (Si algo sale mal)

Si necesitas revertir los cambios:

```bash
# Restaurar desde backup
cp routes/recepciones.py.backup_YYYYMMDD_HHMMSS routes/recepciones.py
cp templates/recepciones.html.backup_YYYYMMDD_HHMMSS templates/recepciones.html
```

---

**Fin del Documento**



