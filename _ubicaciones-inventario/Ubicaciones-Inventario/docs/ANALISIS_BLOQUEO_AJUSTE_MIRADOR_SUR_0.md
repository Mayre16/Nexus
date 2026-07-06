# ANÁLISIS: Por qué no se puede ajustar Mirador Sur a 0

## FECHA: 2026-01-26

---

## 🔍 PROBLEMA REPORTADO

El usuario intenta ajustar "Mirador Sur" a 0 desde el módulo de Ajustes, pero no puede hacerlo.

---

## 📋 ANÁLISIS DEL FLUJO

### 1. FRONTEND: Validaciones JavaScript

**Ubicación:** `templates/ajustes.html` líneas 983-989

```javascript
// Validar cantidades de ubicaciones ADM
// Permitir 0 (para eliminar stock), solo rechazar undefined, null o negativos
for (const ubicADM of ubicacionesADMSeleccionadas) {
    if (ubicADM.cantidad === undefined || ubicADM.cantidad === null || ubicADM.cantidad < 0) {
        mostrarMensaje('error', `La cantidad para ${ubicADM.location_name} es inválida`);
        return;
    }
}
```

**✅ CORRECTO:** Permite cantidad 0.

---

### 2. FRONTEND: Validación de ADESA

**Ubicación:** `templates/ajustes.html` líneas 992-1028

```javascript
// Validar ADESA si está seleccionada
const adesa = ubicacionesADMSeleccionadas.find(u => u.es_adesa);
if (adesa) {
    // Validar ubicaciones físicas...
}
```

**✅ CORRECTO:** Si solo se selecciona Mirador Sur (no ADESA), no entra en esta validación.

---

### 3. BACKEND: Validación de asignaciones

**Ubicación:** `routes/ajustes.py` líneas 176-191

```python
# Validar que haya asignaciones
if not asignaciones or len(asignaciones) == 0:
    return error("El producto debe tener al menos una asignación")

# Calcular suma de asignaciones
suma_asignaciones = sum(float(a.get('cantidad', 0)) for a in asignaciones)

# Validar que la suma no exceda la cantidad total (si se proporciona)
if cantidad_total > 0 and suma_asignaciones > cantidad_total:
    return error("Asignaciones exceden cantidad total")
```

**✅ CORRECTO:** 
- Permite `suma_asignaciones = 0`
- Solo valida si `cantidad_total > 0` y `suma_asignaciones > cantidad_total`

---

### 4. BACKEND: Procesamiento del ajuste ADM

**Ubicación:** `routes/ajustes.py` líneas 343-399

```python
elif tipo_asignacion == 'adm':
    ubicacion_adm = asignacion.get('ubicacion_adm', '')  # "MIRADOR SUR"
    location_id = asignacion.get('location_id', '')
    cantidad_nueva = 0  # Del usuario
    
    # Obtener stock actual
    stock_adm_actual = 0
    if location_id:
        if producto_db:
            stock_adm = StockProductoADM.query.filter_by(...).first()
            if stock_adm:
                stock_adm_actual = float(stock_adm.stock)  # 44
    
    # Calcular diferencia
    diferencia = cantidad_nueva - stock_adm_actual  # 0 - 44 = -44
    
    # Solo crear movimiento si hay diferencia
    if diferencia != 0:  # -44 != 0 ✅
        movimiento = Movimiento(...)
        db.session.add(movimiento)
```

**✅ CORRECTO:** El movimiento debería crearse.

---

## 🐛 POSIBLES PROBLEMAS

### PROBLEMA 1: El movimiento se crea pero no aparece en el historial

**Causa:** El historial agrupa por `COALESCE(ubicacion_destino, ubicacion_origen)`, pero si hay un problema con el GROUP BY, puede no aparecer.

**Verificación:** Revisar si el movimiento existe en la BD.

---

### PROBLEMA 2: Error silencioso en el frontend

**Causa:** El mensaje de error no se muestra correctamente, o hay un error de JavaScript que bloquea el envío.

**Verificación:** Revisar consola del navegador.

---

### PROBLEMA 3: El stock_adm_actual no se obtiene correctamente

**Causa:** Si `producto_db` no existe o `location_id` no se encuentra, `stock_adm_actual = 0`, entonces:
- `diferencia = 0 - 0 = 0`
- No se crea movimiento (porque `diferencia != 0` es False)

**Verificación:** Verificar que `producto_db` existe y que `location_id` es correcto.

---

### PROBLEMA 4: El botón está deshabilitado

**Causa:** La validación de ADESA puede estar deshabilitando el botón incluso cuando no hay ADESA seleccionada.

**Ubicación:** `templates/ajustes.html` línea 819

```javascript
const btnSubmit = document.querySelector('#ajuste-form button[type="submit"]');
// ...
if (btnSubmit) btnSubmit.disabled = false;
```

**Verificación:** Verificar si el botón está deshabilitado.

---

## 🔬 ESCENARIO ESPECÍFICO: Mirador Sur 44 → 0

**Input del usuario:**
- Selecciona "MIRADOR SUR"
- Pone cantidad: 0
- Hace clic en "Registrar Ajuste"

**Flujo esperado:**
1. ✅ Validación JavaScript: cantidad 0 es válida
2. ✅ No hay ADESA, no entra en validación de ADESA
3. ✅ Se envía al backend: `{ubicacion_adm: "MIRADOR SUR", cantidad: 0, tipo: 'adm'}`
4. ✅ Backend valida: hay asignaciones, suma = 0 (válido)
5. ✅ Backend obtiene: `stock_adm_actual = 44`
6. ✅ Backend calcula: `diferencia = 0 - 44 = -44`
7. ✅ Backend crea: movimiento con `cantidad = 44`, `ubicacion_origen = "MIRADOR SUR"`, `ubicacion_destino = None`
8. ✅ Backend guarda: `db.session.commit()`
9. ✅ Backend responde: `{success: true, total_movimientos: 1}`

**¿Dónde puede fallar?**
- ❓ Paso 5: Si `stock_adm_actual = 0` (no se encuentra el stock), entonces `diferencia = 0` y no se crea movimiento
- ❓ Paso 7: Si hay un error al crear el movimiento
- ❓ Paso 8: Si hay un error al hacer commit
- ❓ Paso 9: Si la respuesta no se muestra correctamente

---

## ✅ VERIFICACIONES NECESARIAS

1. **Revisar consola del navegador:**
   - ¿Hay errores de JavaScript?
   - ¿Se envía la petición al backend?
   - ¿Qué respuesta recibe del backend?

2. **Revisar logs del servidor:**
   - ¿Se recibe la petición?
   - ¿Hay errores al procesar?
   - ¿Se crea el movimiento?

3. **Verificar en la base de datos:**
   - ¿Existe el movimiento en la tabla `movimientos`?
   - ¿Tiene `tipo = 'ADJUSTMENT'`?
   - ¿Tiene `ubicacion_origen = 'MIRADOR SUR'`?
   - ¿Tiene `cantidad = 44`?

4. **Verificar stock en cache:**
   - ¿Existe `StockProductoADM` para el producto y location_id de Mirador Sur?
   - ¿Tiene `stock = 44`?

---

## 🎯 CONCLUSIÓN

El código **debería permitir** ajustar Mirador Sur a 0. Si no funciona, las causas más probables son:

1. **El stock no se encuentra en cache** → `stock_adm_actual = 0` → `diferencia = 0` → No se crea movimiento
2. **Error silencioso** → El movimiento se crea pero no se muestra o hay un error que no se reporta
3. **Problema con el historial** → El movimiento existe pero no aparece en el historial

**Recomendación:** Revisar logs y base de datos para identificar dónde falla el flujo.








