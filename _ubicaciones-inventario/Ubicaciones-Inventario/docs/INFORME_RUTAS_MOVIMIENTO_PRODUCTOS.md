# 📦 Informe: Rutas de Movimiento de Productos y Comparación con Módulos

**Fecha:** 2025-01-22  
**Versión del Sistema:** WMS v1.0

---

## 🎯 1. Resumen Ejecutivo

El sistema WMS maneja **3 tipos principales de movimientos de inventario**:

1. **RECEIPT** (Recepciones) - Entrada de productos
2. **TRANSFER** (Transferencias) - Movimiento entre ubicaciones
3. **ADJUSTMENT** (Ajustes) - Corrección de inventario

Cada uno tiene lógica diferente para manejar **ubicaciones físicas WMS** vs **ubicaciones macro ADM Cloud**.

---

## 🔄 2. Rutas Posibles de Movimiento de Productos

### 2.1. Ruta 1: ENTRADA (Recepción)

**Origen:** Proveedor / Cliente (exterior)  
**Destino:** Ubicación ADM Cloud → Ubicación Física WMS

**Flujo:**
```
Proveedor → ADM Cloud (Reception/VendorReception) → WMS
                                         ↓
                              ¿Es ubicación ADESA?
                              ├─ SÍ → Requiere ubicación física WMS
                              │        Modifica StockUbicacion
                              │        Ejemplo: ADESA → 2-P1-AD-N1
                              │
                              └─ NO → Usa mapeo o location_name
                                       NO modifica StockUbicacion
                                       Ejemplo: Sucursal → "Sucursal X"
```

**Características:**
- ✅ Soporta **asignaciones múltiples** (split por ubicaciones)
- ✅ Un producto puede dividirse en varias ubicaciones físicas
- ✅ Valida que la suma de asignaciones ≤ cantidad total recibida
- ✅ Solo modifica `StockUbicacion` si es ADESA

---

### 2.2. Ruta 2: TRANSFERENCIA (Movimiento Interno)

**Origen:** Ubicación ADM Cloud A  
**Destino:** Ubicación ADM Cloud B

**Flujo:**
```
Ubicación A (ADM) → Transferencia → Ubicación B (ADM)
         ↓                                    ↓
    ¿Es ADESA?                          ¿Es ADESA?
    ├─ SÍ → Requiere ubic. física      ├─ SÍ → Requiere ubic. física
    │        origen (2-P1-AD-N1)       │        destino (2-P2-AI-N2)
    │        Valida stock origen       │        Suma stock destino
    │        Resta de StockUbicacion   │        Suma a StockUbicacion
    │                                   │
    └─ NO → Usa location_name          └─ NO → Usa location_name
             NO modifica StockUbicacion        NO modifica StockUbicacion
```

**Combinaciones posibles:**

| Origen | Destino | Acción en StockUbicacion |
|--------|---------|-------------------------|
| ADESA | ADESA | ✅ Resta origen + Suma destino |
| ADESA | NO-ADESA | ✅ Resta origen (solo) |
| NO-ADESA | ADESA | ✅ Suma destino (solo) |
| NO-ADESA | NO-ADESA | ❌ No modifica StockUbicacion |

**Características:**
- ✅ Soporta **asignaciones múltiples** en origen y destino
- ✅ Valida stock suficiente en origen (si es ADESA)
- ✅ Permite split: un producto puede salir de una ubicación y llegar a múltiples ubicaciones
- ✅ Solo modifica `StockUbicacion` cuando ADESA está involucrado

---

### 2.3. Ruta 3: AJUSTE (Corrección Manual)

**Origen:** Ninguno (ajuste directo)  
**Destino:** Ubicación Física WMS

**Flujo:**
```
Ajuste Manual → Ubicación Física WMS
         ↓
    Modifica StockUbicacion directamente
    (Siempre, sin validar si es ADESA)
```

**Características:**
- ❌ **NO soporta asignaciones múltiples** (solo un producto a la vez)
- ❌ **NO diferencia** entre ADESA y NO-ADESA
- ❌ **NO valida** ubicaciones físicas contra tabla `UbicacionFisica`
- ✅ Modifica `StockUbicacion` siempre
- ✅ Calcula diferencia automáticamente

---

## 📊 3. Comparación Detallada: Recepciones vs Ajustes

### 3.1. Tabla Comparativa

| Característica | Recepciones | Ajustes |
|----------------|-------------|---------|
| **Origen de datos** | ADM Cloud (Reception/VendorReception) | Manual (usuario) |
| **Asignaciones múltiples** | ✅ Sí (split por ubicaciones) | ❌ No (uno a la vez) |
| **Validación ADESA** | ✅ Sí (Regla de Oro #4) | ❌ No |
| **Modifica StockUbicacion** | ✅ Solo si es ADESA | ✅ Siempre |
| **Validación ubicaciones físicas** | ✅ Sí (contra tabla) | ❌ No |
| **Validación stock origen** | N/A (entrada) | ❌ No |
| **Documento ADM asociado** | ✅ Sí (GUID, DocID) | ❌ No |
| **Historial agrupado** | ✅ Por recepción (GUID) | ✅ Por timestamp + ubicación |
| **Revertible** | ✅ Sí (admin) | ❌ No |
| **Múltiples productos** | ✅ Sí (en un solo documento) | ❌ No (uno por vez) |
| **Notas personalizadas** | ❌ No (automáticas) | ❌ No (automáticas) |

---

### 3.2. Lógica de Asignaciones Múltiples en Recepciones

**Estructura de datos:**
```json
{
  "productos": [
    {
      "sku": "SKU123",
      "item_id": "guid-adm",
      "cantidad_total": 100,
      "asignaciones": [
        {
          "ubicacion": "2-P1-AD-N1",
          "cantidad": 50
        },
        {
          "ubicacion": "2-P1-AD-N2",
          "cantidad": 30
        },
        {
          "ubicacion": "2-P2-AI-N1",
          "cantidad": 20
        }
      ]
    }
  ]
}
```

**Validaciones:**
1. ✅ Suma de asignaciones ≤ cantidad_total
2. ✅ Todas las ubicaciones deben ser válidas (si es ADESA)
3. ✅ Todas las cantidades deben ser > 0
4. ✅ Crea un movimiento por cada asignación

**Resultado:**
- Crea 3 registros en `StockUbicacion` (uno por ubicación)
- Crea 3 movimientos tipo `RECEIPT` (uno por asignación)
- Todos vinculados al mismo `factura_guid`

---

### 3.3. Lógica de Ajustes (Actual)

**Estructura de datos:**
```json
{
  "sku": "SKU123",
  "ubicacion": "2-P1-AD-N1",
  "cantidad": 100,
  "product_id": "guid-adm"
}
```

**Validaciones:**
1. ✅ SKU válido
2. ✅ Ubicación válida (formato básico)
3. ✅ Cantidad > 0
4. ❌ NO valida contra tabla `UbicacionFisica`
5. ❌ NO diferencia ADESA vs NO-ADESA

**Resultado:**
- Actualiza o crea 1 registro en `StockUbicacion`
- Crea 1 movimiento tipo `ADJUSTMENT`
- Calcula diferencia automáticamente

---

## 🔍 4. Regla de Oro #4: Modificación de StockUbicacion

### 4.1. En Recepciones

**Lógica:**
```python
if es_adesa:
    # Modificar StockUbicacion
    stock_ubic.cantidad += cantidad
else:
    # NO modificar StockUbicacion
    # Solo crear Movimiento para auditoría
```

**Ejemplos:**
- ✅ Recepción en ADESA → Modifica `StockUbicacion`
- ❌ Recepción en Sucursal → NO modifica `StockUbicacion`
- ✅ Recepción en ADESA con mapeo → Modifica `StockUbicacion` en ubicación física mapeada

---

### 4.2. En Transferencias

**Lógica:**
```python
if origen_es_adesa:
    # Restar de StockUbicacion origen
    stock_ubic_origen.cantidad -= cantidad
    
if destino_es_adesa:
    # Sumar a StockUbicacion destino
    stock_ubic_destino.cantidad += cantidad
```

**Ejemplos:**
- ✅ ADESA → ADESA → Resta origen + Suma destino
- ✅ ADESA → Sucursal → Resta origen (solo)
- ✅ Sucursal → ADESA → Suma destino (solo)
- ❌ Sucursal → Sucursal → NO modifica `StockUbicacion`

---

### 4.3. En Ajustes (Actual)

**Lógica:**
```python
# SIEMPRE modifica StockUbicacion
stock_ubic.cantidad = cantidad_nueva
```

**Problema:**
- ❌ NO aplica Regla de Oro #4
- ❌ Modifica `StockUbicacion` incluso si la ubicación no es ADESA
- ❌ No diferencia entre ubicaciones físicas WMS y ubicaciones macro ADM

---

## 🚨 5. Problemas Identificados en Ajustes

### 5.1. Falta de Lógica de Split/Múltiples Ubicaciones

**Problema:** No permite ajustar un producto en múltiples ubicaciones a la vez.

**Ejemplo de necesidad:**
```
Producto SKU123 tiene 100 unidades que deben ajustarse así:
- 50 unidades en 2-P1-AD-N1
- 30 unidades en 2-P1-AD-N2
- 20 unidades en 2-P2-AI-N1
```

**Solución actual:** Requiere 3 ajustes separados (ineficiente).

---

### 5.2. No Aplica Regla de Oro #4

**Problema:** Modifica `StockUbicacion` siempre, sin validar si es ADESA.

**Impacto:**
- Puede crear inconsistencias si se ajusta una ubicación NO-ADESA
- No respeta la arquitectura del sistema

---

### 5.3. No Valida Ubicaciones Físicas

**Problema:** No verifica que la ubicación exista en la tabla `UbicacionFisica`.

**Impacto:**
- Permite crear stock en ubicaciones "fantasma"
- Dificulta la gestión y limpieza de datos

---

### 5.4. No Permite Ajustes Masivos

**Problema:** Solo permite ajustar un producto a la vez.

**Ejemplo de necesidad:**
```
Ajuste de inventario inicial completo:
- SKU123: 50 unidades en 2-P1-AD-N1
- SKU456: 30 unidades en 2-P1-AD-N2
- SKU789: 20 unidades en 2-P2-AI-N1
```

**Solución actual:** Requiere 3 ajustes separados (muy ineficiente).

---

## 💡 6. Mejoras Sugeridas para Ajustes

### 6.1. Implementar Asignaciones Múltiples

**Similar a Recepciones:**
```json
{
  "productos": [
    {
      "sku": "SKU123",
      "cantidad_total": 100,
      "asignaciones": [
        {"ubicacion": "2-P1-AD-N1", "cantidad": 50},
        {"ubicacion": "2-P1-AD-N2", "cantidad": 30},
        {"ubicacion": "2-P2-AI-N1", "cantidad": 20}
      ]
    }
  ]
}
```

---

### 6.2. Aplicar Regla de Oro #4

**Validar ubicación física:**
- Si la ubicación existe en `UbicacionFisica` → Es ADESA → Modificar `StockUbicacion`
- Si NO existe → Es NO-ADESA → Solo crear Movimiento para auditoría

---

### 6.3. Validar Ubicaciones Físicas

**Verificar contra tabla:**
```python
ubicacion_fisica = UbicacionFisica.query.filter_by(
    codigo=ubicacion,
    activa=True
).first()

if not ubicacion_fisica:
    return error("Ubicación física no existe o está inactiva")
```

---

### 6.4. Permitir Ajustes Masivos

**Estructura:**
```json
{
  "productos": [
    {
      "sku": "SKU123",
      "asignaciones": [...]
    },
    {
      "sku": "SKU456",
      "asignaciones": [...]
    }
  ],
  "notas": "Ajuste de inventario inicial - Fecha: 2025-01-22"
}
```

---

## 📋 7. Resumen de Rutas de Movimiento

### 7.1. Matriz de Movimientos

| Tipo | Origen | Destino | Modifica StockUbicacion | Asignaciones Múltiples |
|------|--------|---------|------------------------|----------------------|
| **RECEIPT** | Exterior | ADM → WMS | ✅ Solo si ADESA | ✅ Sí |
| **TRANSFER** | ADM A | ADM B | ✅ Si ADESA involucrado | ✅ Sí |
| **ADJUSTMENT** | Manual | WMS | ✅ Siempre (❌ problema) | ❌ No (❌ problema) |

---

### 7.2. Flujo Completo de un Producto

```
1. ENTRADA (Recepción)
   Proveedor → ADESA → 2-P1-AD-N1 (StockUbicacion: +50)

2. TRANSFERENCIA INTERNA
   2-P1-AD-N1 → 2-P2-AI-N2 (StockUbicacion: -30 origen, +30 destino)

3. AJUSTE (Corrección)
   2-P2-AI-N2 → Ajuste manual (StockUbicacion: =25)

4. SALIDA (Despacho)
   2-P2-AI-N2 → Cliente (StockUbicacion: -10)
```

---

## 🎯 8. Conclusión

### Diferencias Clave:

1. **Recepciones:**
   - ✅ Soporta split/múltiples ubicaciones
   - ✅ Aplica Regla de Oro #4
   - ✅ Valida ubicaciones físicas
   - ✅ Vinculado a documento ADM

2. **Ajustes:**
   - ❌ NO soporta split/múltiples ubicaciones
   - ❌ NO aplica Regla de Oro #4
   - ❌ NO valida ubicaciones físicas
   - ❌ NO vinculado a documento ADM

### Recomendación:

**Alinear el módulo de Ajustes con la lógica de Recepciones:**
- Implementar asignaciones múltiples
- Aplicar Regla de Oro #4
- Validar ubicaciones físicas
- Permitir ajustes masivos (múltiples productos)

Esto haría que el módulo de Ajustes sea **consistente** con el resto del sistema y más **eficiente** para el usuario.








