# ANÁLISIS: Filtros del Historial de Ajustes

## FECHA: 2026-01-26

---

## 🔍 FILTROS ACTUALES

### **Filtros implementados:**
1. **Fecha Desde** ✅
2. **Fecha Hasta** ✅
3. **Ubicación Física** ⚠️ (Nombre incorrecto)
4. **Tipo Ajuste** ⚠️ (Opciones incorrectas)
5. **Usuario** ✅
6. **Búsqueda general** ✅ (por notas y ubicación)

---

## 📊 CAMPOS DISPONIBLES EN LA TABLA

### **Columnas mostradas:**
1. **Fecha** - `timestamp`
2. **Ubicación** - Puede ser física (2P1D01N1) o ADM (MIRADOR SUR)
3. **Productos (SKU)** - Lista de SKUs ajustados
4. **Tipo** - "Físico" o "ADM" (badge)
5. **Cantidad** - Cantidad total ajustada
6. **Usuario** - Usuario que realizó el ajuste
7. **Notas** - Notas del ajuste
8. **Acciones** - Ver Detalle / Editar

---

## ⚠️ PROBLEMAS IDENTIFICADOS

### **1. Filtro "Ubicación Física" (Nombre incorrecto)**

**Problema:**
- El nombre sugiere que solo filtra ubicaciones físicas
- Pero también filtra ubicaciones ADM (como "MIRADOR SUR")
- Es confuso para el usuario

**Solución sugerida:**
- Cambiar nombre a: **"Ubicación"** o **"Ubicación (Física/ADM)"**
- Mantener el mismo comportamiento (filtra ambas)

---

### **2. Filtro "Tipo Ajuste" (Opciones incorrectas)**

**Problema actual:**
```html
<select id="tipo_ajuste">
    <option value="">Todos</option>
    <option value="Ajuste de Inventario">Ajuste de Inventario</option>
</select>
```

**Problema:**
- Solo tiene una opción: "Ajuste de Inventario"
- No coincide con los tipos reales mostrados en la tabla: **"Físico"** y **"ADM"**
- El filtro no funciona correctamente porque nunca coincide con los valores reales

**Valores reales en la tabla:**
- `tipo_ajuste = 'Físico'` (para ubicaciones físicas)
- `tipo_ajuste = 'ADM'` (para ubicaciones ADM)

**Solución sugerida:**
```html
<select id="tipo_ajuste">
    <option value="">Todos</option>
    <option value="Físico">Físico</option>
    <option value="ADM">ADM</option>
</select>
```

---

### **3. Falta filtro por SKU**

**Problema:**
- La tabla muestra "Productos (SKU)" como columna importante
- No hay filtro para buscar por SKU específico
- El usuario debe usar la búsqueda general que busca en notas y ubicación

**Solución sugerida:**
- Agregar filtro: **"SKU"** (input de texto)
- Permitir buscar ajustes de un producto específico

---

### **4. Falta filtro por cantidad (rango)**

**Problema:**
- La tabla muestra "Cantidad" como columna
- No hay filtro para buscar por cantidad (ej: ajustes mayores a X, entre X e Y)
- Podría ser útil para auditoría

**Solución sugerida (opcional):**
- Agregar filtros: **"Cantidad Mínima"** y **"Cantidad Máxima"**
- O simplemente omitir si no es crítico

---

## ✅ FILTROS QUE ESTÁN BIEN

1. **Fecha Desde / Fecha Hasta** ✅
   - Funcionan correctamente
   - Son útiles para auditoría

2. **Usuario** ✅
   - Funciona correctamente
   - Útil para auditoría

3. **Búsqueda general** ✅
   - Busca en notas y ubicación
   - Útil para búsquedas rápidas

---

## 📋 RESUMEN DE PROBLEMAS

| Filtro | Problema | Impacto | Prioridad |
|--------|----------|---------|-----------|
| **Ubicación Física** | Nombre incorrecto (filtra ADM también) | Confusión del usuario | Media |
| **Tipo Ajuste** | Opciones incorrectas (no coincide con valores reales) | Filtro no funciona | Alta |
| **SKU** | No existe | No se puede filtrar por producto | Media |
| **Cantidad** | No existe | No se puede filtrar por cantidad | Baja |

---

## 🎯 RECOMENDACIONES

### **Cambios prioritarios:**

1. **Corregir "Tipo Ajuste":**
   - Cambiar opciones a: "Todos", "Físico", "ADM"
   - Actualizar backend para filtrar por `tipo_ajuste` correcto

2. **Renombrar "Ubicación Física":**
   - Cambiar a: "Ubicación" o "Ubicación (Física/ADM)"
   - Mantener funcionalidad actual

3. **Agregar filtro por SKU:**
   - Agregar input de texto "SKU"
   - Filtrar en backend por SKU en los movimientos

### **Cambios opcionales:**

4. **Filtro por cantidad (rango):**
   - Solo si es necesario para auditoría
   - Puede ser complejo de implementar

---

## 🔧 CAMBIOS TÉCNICOS NECESARIOS

### **Frontend (templates/ajustes_historial.html):**

1. **Línea 334:** Cambiar label "Ubicación Física" → "Ubicación"
2. **Líneas 338-342:** Corregir opciones de "Tipo Ajuste":
   ```html
   <select id="tipo_ajuste">
       <option value="">Todos</option>
       <option value="Físico">Físico</option>
       <option value="ADM">ADM</option>
   </select>
   ```
3. **Agregar filtro SKU:** Después de "Ubicación", agregar:
   ```html
   <div class="filter-group">
       <label>SKU</label>
       <input type="text" id="sku" placeholder="Ej: VP1">
   </div>
   ```

### **Backend (routes/historiales.py):**

1. **Línea ~455:** Agregar filtro por `tipo_ajuste`:
   ```python
   if tipo_ajuste:
       # Filtrar por tipo_ajuste (Físico o ADM)
       # Necesita lógica para determinar tipo según ubicación
   ```

2. **Agregar filtro por SKU:**
   ```python
   if sku:
       # Filtrar movimientos que tengan este SKU
       # Usar subquery similar a la búsqueda general
   ```

---

## ✅ CONCLUSIÓN

**Problemas críticos:**
- ❌ "Tipo Ajuste" no funciona (opciones incorrectas)
- ⚠️ "Ubicación Física" tiene nombre confuso

**Mejoras sugeridas:**
- ✅ Agregar filtro por SKU
- ⚠️ Considerar filtro por cantidad (opcional)

**Prioridad:**
1. **ALTA:** Corregir "Tipo Ajuste" (filtro no funciona)
2. **MEDIA:** Renombrar "Ubicación Física" y agregar filtro SKU
3. **BAJA:** Agregar filtro por cantidad








