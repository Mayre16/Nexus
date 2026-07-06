# ANÁLISIS PROFUNDO: Por qué no funciona el ajuste a 0 en ubicaciones ADM (Mirador Sur)

## FECHA: 2026-01-26

---

## 🔍 PROBLEMA REPORTADO

El usuario intenta ajustar "Mirador Sur" a 0 pero "no pasa nada". Necesitamos entender por qué.

---

## 📋 FLUJO COMPLETO DEL AJUSTE ADM

### 1. FRONTEND: Construcción de la petición

**Ubicación:** `templates/ajustes.html` líneas 1033-1043

```javascript
// Agregar ubicaciones ADM no-ADESA (solo cantidad total)
for (const ubicADM of ubicacionesADMSeleccionadas) {
    if (!ubicADM.es_adesa) {
        asignaciones.push({
            ubicacion_adm: ubicADM.location_name,  // "MIRADOR SUR"
            location_id: ubicADM.location_id,      // GUID de la ubicación
            cantidad: ubicADM.cantidad,             // 0 (si el usuario puso 0)
            tipo: 'adm'
        });
    }
}
```

**✅ CORRECTO:** El frontend envía:
- `ubicacion_adm`: "MIRADOR SUR"
- `location_id`: GUID de la ubicación
- `cantidad`: 0
- `tipo`: 'adm'

---

### 2. BACKEND: Validación inicial

**Ubicación:** `routes/ajustes.py` líneas 194-221

```python
tipo_asignacion = asignacion.get('tipo', 'fisica')  # 'adm'
cantidad = asignacion.get('cantidad', 0)  # 0

# Validar cantidad
try:
    cantidad_float = float(cantidad)  # 0.0
except (ValueError, TypeError):
    return error("Cantidad debe ser un número")

if cantidad_float < 0:  # 0 < 0 = False ✅ PASA
    return error("Cantidad no puede ser negativa")

if cantidad_float > 999999.99:  # 0 > 999999.99 = False ✅ PASA
    return error("Cantidad excede el límite máximo")
```

**✅ CORRECTO:** La validación permite cantidad 0.

---

### 3. BACKEND: Procesamiento del ajuste ADM

**Ubicación:** `routes/ajustes.py` líneas 343-378

```python
elif tipo_asignacion == 'adm':
    # Ajuste de ubicación ADM (macro, no-ADESA)
    ubicacion_adm = asignacion.get('ubicacion_adm', '')  # "MIRADOR SUR"
    location_id = asignacion.get('location_id', '')       # GUID
    
    # Obtener stock actual en ADM (desde cache)
    stock_adm_actual = 0
    if location_id and producto_db:  # ⚠️ PROBLEMA POTENCIAL 1
        stock_adm = StockProductoADM.query.filter_by(
            producto_id=producto_db.id,
            location_id=location_id
        ).first()
        if stock_adm:
            stock_adm_actual = float(stock_adm.stock) if stock_adm.stock else 0
    
    # Calcular diferencia
    diferencia = cantidad_nueva - stock_adm_actual
    # Si cantidad_nueva = 0 y stock_adm_actual = 44:
    # diferencia = 0 - 44 = -44 ✅ CORRECTO
    
    # ⚠️ PROBLEMA CRÍTICO 1: NO HAY VALIDACIÓN de diferencia != 0
    # Para ubicaciones físicas SÍ hay: if diferencia != 0: (línea 324)
    # Para ubicaciones ADM NO hay esta validación
    
    # Crear movimiento de auditoría
    movimiento = Movimiento(
        tipo="ADJUSTMENT",
        sku=sku,
        ubicacion_origen=ubicacion_adm if diferencia < 0 else None,  # "MIRADOR SUR"
        ubicacion_destino=ubicacion_adm if diferencia > 0 else None,    # None
        cantidad=abs(diferencia),  # abs(-44) = 44 ✅ CORRECTO
        ...
    )
    db.session.add(movimiento)
    movimientos_creados.append(movimiento.to_dict())

db.session.commit()  # ✅ Se guarda en BD
```

**✅ CORRECTO:** El movimiento se crea y se guarda en la base de datos.

---

## 🐛 PROBLEMAS IDENTIFICADOS

### PROBLEMA 1: Falta validación de `diferencia != 0` para ubicaciones ADM

**Ubicación:** `routes/ajustes.py` línea 359

**Comparación:**

| Tipo | Ubicación | Validación |
|------|-----------|------------|
| Física | Línea 324 | `if diferencia != 0:` ✅ |
| ADM | Línea 359 | **NO HAY VALIDACIÓN** ❌ |

**Consecuencia:**
- Si `diferencia = 0` (ajustar de 0 a 0), se crea un movimiento con `cantidad = 0`
- Este movimiento con cantidad 0 puede causar problemas en el historial

**Ejemplo problemático:**
```python
# Escenario: Stock actual = 0, usuario ajusta a 0
stock_adm_actual = 0
cantidad_nueva = 0
diferencia = 0 - 0 = 0
cantidad = abs(0) = 0  # ⚠️ Movimiento con cantidad 0
```

---

### PROBLEMA 2: Dependencia de `producto_db` para obtener stock ADM

**Ubicación:** `routes/ajustes.py` línea 350

```python
stock_adm_actual = 0
if location_id and producto_db:  # ⚠️ Si producto_db es None, stock_adm_actual = 0 siempre
    stock_adm = StockProductoADM.query.filter_by(...).first()
    if stock_adm:
        stock_adm_actual = float(stock_adm.stock) if stock_adm.stock else 0
```

**Consecuencias:**
1. Si `producto_db` no se encuentra (producto no está en cache), `stock_adm_actual = 0` siempre
2. Si el producto no está sincronizado, no se puede obtener el stock real
3. El ajuste se procesa con `stock_adm_actual = 0`, lo que puede generar movimientos incorrectos

**Ejemplo problemático:**
```python
# Escenario: Producto no está en cache
producto_db = None
stock_adm_actual = 0  # Siempre 0
cantidad_nueva = 0
diferencia = 0 - 0 = 0
cantidad = abs(0) = 0  # ⚠️ Movimiento con cantidad 0
```

---

### PROBLEMA 3: El historial agrupa por `ubicacion_destino`, pero ajustes a 0 tienen `ubicacion_destino = None`

**Ubicación:** `routes/historiales.py` líneas 425-436

```python
# Query base: agrupar movimientos ADJUSTMENT por timestamp y ubicación
query = db.session.query(
    Movimiento.timestamp,
    Movimiento.ubicacion_destino,  # ⚠️ PROBLEMA: Ajustes a 0 tienen None
    ...
).filter(
    Movimiento.tipo == 'ADJUSTMENT'
).group_by(
    Movimiento.timestamp,
    Movimiento.ubicacion_destino  # ⚠️ Todos los ajustes a 0 se agrupan juntos
)
```

**Consecuencias:**
1. Todos los ajustes a 0 (de diferentes ubicaciones) se agrupan juntos porque todos tienen `ubicacion_destino = None`
2. No se puede distinguir entre "Mirador Sur ajustado a 0" y "ADESA ajustado a 0"
3. El filtro de búsqueda por ubicación no funciona para ajustes a 0

**Ejemplo:**
```python
# Ajuste 1: Mirador Sur 44 → 0
movimiento1 = Movimiento(
    ubicacion_origen="MIRADOR SUR",
    ubicacion_destino=None,  # ⚠️
    cantidad=44
)

# Ajuste 2: ADESA 100 → 0
movimiento2 = Movimiento(
    ubicacion_origen="ADESA",
    ubicacion_destino=None,  # ⚠️
    cantidad=100
)

# En el historial, ambos se agrupan juntos porque ubicacion_destino = None
```

---

### PROBLEMA 4: Búsqueda de detalles no encuentra ajustes a 0 correctamente

**Ubicación:** `routes/detalles.py` líneas 527-555

**Estado actual (después de correcciones anteriores):**
- Si `ubicacion == "None"`, busca por `ubicacion_origen` ✅
- Pero el historial forma el ID como `timestamp_None` ❌

**Problema:**
1. El historial forma el ID: `timestamp_None` (string)
2. Al buscar detalles, se parsea como `ubicacion = "None"` (string)
3. Se busca por `ubicacion_origen`, pero el ID del historial es `timestamp_None`
4. Puede haber inconsistencias si hay múltiples ajustes a 0 en el mismo timestamp

---

## 🔬 ESCENARIOS DE PRUEBA

### Escenario 1: Ajustar Mirador Sur de 44 a 0 (CASO NORMAL)

**Input:**
- `cantidad_nueva = 0`
- `stock_adm_actual = 44` (obtenido de StockProductoADM)
- `producto_db` existe

**Procesamiento:**
```python
diferencia = 0 - 44 = -44
ubicacion_origen = "MIRADOR SUR"  # diferencia < 0
ubicacion_destino = None          # diferencia > 0 es False
cantidad = abs(-44) = 44
```

**Resultado esperado:**
- ✅ Movimiento creado con `cantidad = 44`
- ✅ `ubicacion_origen = "MIRADOR SUR"`
- ✅ `ubicacion_destino = None`

**¿Funciona?**
- ✅ SÍ, el movimiento se crea correctamente
- ⚠️ PERO puede no aparecer en el historial correctamente (problema 3)

---

### Escenario 2: Ajustar Mirador Sur de 0 a 0 (CASO ESPECIAL)

**Input:**
- `cantidad_nueva = 0`
- `stock_adm_actual = 0` (ya está en 0)
- `producto_db` existe

**Procesamiento:**
```python
diferencia = 0 - 0 = 0
ubicacion_origen = None  # diferencia < 0 es False
ubicacion_destino = None # diferencia > 0 es False
cantidad = abs(0) = 0    # ⚠️ PROBLEMA
```

**Resultado:**
- ⚠️ Movimiento creado con `cantidad = 0`
- ⚠️ `ubicacion_origen = None`
- ⚠️ `ubicacion_destino = None`
- ⚠️ Este movimiento no tiene sentido (no hay cambio)

**¿Funciona?**
- ❌ NO, se crea un movimiento sin sentido

---

### Escenario 3: Producto no está en cache

**Input:**
- `cantidad_nueva = 0`
- `producto_db = None` (no está en cache)
- `stock_adm_actual = 0` (siempre 0 porque no se puede buscar)

**Procesamiento:**
```python
stock_adm_actual = 0  # Siempre 0 porque producto_db es None
diferencia = 0 - 0 = 0
cantidad = abs(0) = 0  # ⚠️ PROBLEMA
```

**Resultado:**
- ⚠️ Movimiento creado con `cantidad = 0`
- ⚠️ No se puede obtener el stock real de ADM

**¿Funciona?**
- ❌ NO, no se puede calcular la diferencia real

---

## 📊 RESUMEN DE PROBLEMAS

| # | Problema | Ubicación | Impacto | Severidad |
|---|----------|-----------|---------|-----------|
| 1 | Falta validación `diferencia != 0` para ADM | `routes/ajustes.py:359` | Crea movimientos con cantidad 0 | 🔴 ALTA |
| 2 | Dependencia de `producto_db` para stock ADM | `routes/ajustes.py:350` | No puede obtener stock si producto no está en cache | 🟡 MEDIA |
| 3 | Historial agrupa por `ubicacion_destino` (None para ajustes a 0) | `routes/historiales.py:427` | Ajustes a 0 se agrupan incorrectamente | 🔴 ALTA |
| 4 | ID del historial usa `ubicacion_destino` (None) | `routes/historiales.py:571` | ID inconsistente para ajustes a 0 | 🟡 MEDIA |

---

## ✅ SOLUCIONES RECOMENDADAS

### Solución 1: Agregar validación `diferencia != 0` para ubicaciones ADM

```python
# Calcular diferencia
diferencia = cantidad_nueva - stock_adm_actual

# ✅ AGREGAR: Solo crear movimiento si hay diferencia
if diferencia != 0:
    movimiento = Movimiento(...)
    db.session.add(movimiento)
else:
    # Opcional: Mostrar mensaje informativo
    logger.info(f"Ajuste a {ubicacion_adm} no requiere cambio (ya está en {stock_adm_actual})")
```

---

### Solución 2: Mejorar obtención de stock ADM cuando `producto_db` no existe

```python
# Intentar obtener stock ADM incluso si producto_db no existe
stock_adm_actual = 0
if location_id:
    if producto_db:
        # Método 1: Buscar por producto_db.id y location_id
        stock_adm = StockProductoADM.query.filter_by(
            producto_id=producto_db.id,
            location_id=location_id
        ).first()
    else:
        # Método 2: Buscar por item_id y location_id (si no hay producto_db)
        stock_adm = StockProductoADM.query.filter_by(
            product_id=item_id,  # item_id del request
            location_id=location_id
        ).first()
    
    if stock_adm:
        stock_adm_actual = float(stock_adm.stock) if stock_adm.stock else 0
```

---

### Solución 3: Corregir agrupación en historial para ajustes a 0

```python
# Agrupar por ubicacion_destino O ubicacion_origen (para ajustes a 0)
query = db.session.query(
    Movimiento.timestamp,
    func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen).label('ubicacion'),
    ...
).filter(
    Movimiento.tipo == 'ADJUSTMENT'
).group_by(
    Movimiento.timestamp,
    func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen)
)
```

---

### Solución 4: Corregir formación de ID en historial

```python
# Usar ubicacion_ref (que ya obtiene ubicacion_origen si ubicacion_destino es None)
'id': f"{formatear_fecha_iso_utc(aj.timestamp)}_{ubicacion_ref or 'None'}"
```

**✅ YA IMPLEMENTADO** en correcciones anteriores, pero necesita verificación.

---

## 🎯 CONCLUSIÓN

El ajuste a 0 de Mirador Sur **SÍ se está procesando y guardando en la base de datos**, pero hay varios problemas que impiden que se muestre correctamente:

1. **Falta validación** para evitar movimientos con cantidad 0
2. **Problema de agrupación** en el historial cuando `ubicacion_destino = None`
3. **Dependencia de cache** para obtener stock ADM real

**El movimiento probablemente está en la BD, pero no aparece en el historial o no se puede ver el detalle correctamente.**

---

## 📝 PRÓXIMOS PASOS

1. Verificar en la base de datos si el movimiento se creó
2. Implementar las soluciones recomendadas
3. Probar todos los escenarios después de las correcciones








