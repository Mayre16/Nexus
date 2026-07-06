# Análisis UX: Despacho vs Recepciones — Múltiples ubicaciones por SKU

**Fecha:** 2026-02-25  
**Estado:** ✅ IMPLEMENTADO (homologación aplicada)  
**Objetivo:** Verificar la diferencia de UX entre módulos y evaluar la homologación de Despacho al patrón expandido de Recepciones.

---

## 1. Confirmación: sí existe una diferencia clara

| Aspecto | Despacho (actual) | Recepciones (actual) |
|---------|-------------------|------------------------|
| **Patrón** | Secuencial: un pick a la vez | Expandido: varias filas visibles a la vez |
| **UI por SKU** | Un input ubicación + un input cantidad + Registrar | Varias filas (ubicación + cantidad) + "Agregar ubicación" + Registrar |
| **Visualización previa** | No: solo después de registrar ves el pick en la lista | Sí: ves todas las filas antes de registrar |
| **Validación suma** | Implícita (no puedes superar pendiente) | Explícita: "Total asignado X / Y" + "Restante Z" + validación antes de Registrar |
| **Registro** | Una ubicación por llamada | Todas las asignaciones de la línea en una sola llamada |

**Ejemplo práctico (SKU solicitado = 5):**

| Despacho | Recepciones |
|-----------|-------------|
| Registrar TIENDA = 3 → pick 1 | Fila 1: TIENDA → 3 |
| Registrar 1L1AN1 = 2 → pick 2 | Fila 2: 1L1AN1 → 2 |
| (2 acciones separadas) | Total 5/5, Restante 0 → Registrar (1 acción) |

---

## 2. Diferencia en el código

### Backend

| Módulo | Endpoint | Payload | Comportamiento |
|--------|----------|---------|----------------|
| **Despacho** | `POST /api/despacho/registrar` | `ubicacion`, `cantidad` (escalares) | Crea **un** movimiento PICK por llamada |
| **Recepciones** | `POST /api/recepciones/registrar-linea` | `asignaciones: [{ubicacion, cantidad}, ...]` | Crea **N** movimientos RECEIPT en una llamada |

### Frontend

| Módulo | Estado por SKU | UI de asignaciones |
|--------|----------------|--------------------|
| **Despacho** | `estadoProductos[sku]` con `ubicaciones`, `picks_registrados` | Un bloque `scan-inputs`: `<input id="ubicacion-{sku}">` + `<input id="cantidad-{sku}">` + botón Registrar |
| **Recepciones** | `productosAsignados[sku].asignaciones` (array) | `renderizarAsignaciones()` genera N filas `.asignacion-fila` con input ubicación + cantidad cada una |

La lógica de Recepciones incluye:
- `agregarUbicacion(sku)` — añade una fila
- `eliminarAsignacion(sku, index)` — quita una fila
- `actualizarAsignacion(sku, index, campo, valor)` — actualiza ubicación o cantidad
- `actualizarSumaAsignaciones(sku)` — recalcula total y restante
- `registrarLineaRecepcion()` — envía `asignaciones` completas al API

---

## 3. ¿Es viable homologar Despacho al patrón de Recepciones?

**Sí, es viable.** La diferencia está sobre todo en la capa de presentación y en el contrato del API; el modelo de datos (movimientos PICK) ya soporta múltiples picks por SKU.

---

## 4. Cambios necesarios

### 4.1 Backend (`routes/despacho.py`)

**Opción A (recomendada):** Ampliar `registrar_pick` para aceptar también `asignaciones`.

```python
# Contrato actual: ubicacion, cantidad (escalares)
# Contrato ampliado: asignaciones: [{ubicacion, cantidad}, ...]

asignaciones = data.get('asignaciones', [])
if asignaciones:
    # Nuevo flujo: múltiples asignaciones en una llamada
    for a in asignaciones:
        ubicacion = a.get('ubicacion', '').strip()
        cantidad = float(a.get('cantidad', 0))
        if cantidad <= 0:
            continue
        # Misma lógica actual: validar stock, crear Movimiento, actualizar StockUbicacion
        ...
else:
    # Flujo actual: una sola ubicación + cantidad (retrocompatibilidad)
    ubicacion = data.get('ubicacion', '').strip()
    cantidad = data.get('cantidad')
    # ... lógica actual
```

**Opción B:** Crear `POST /api/despacho/registrar-linea` (espejo de recepciones) y dejar `registrar` como está. El frontend dejaría de llamar a `registrar` para Items y usaría `registrar-linea`.

En ambos casos, la lógica interna (validar stock, crear Movimiento, actualizar StockUbicacion, FacturaProcesada) se reutiliza; solo cambia cómo se reciben las asignaciones.

### 4.2 Frontend (`templates/despacho.html`)

| Cambio | Detalle |
|--------|---------|
| Estado por SKU | Introducir `productosPicks[sku] = { asignaciones: [], cantidad_solicitada, ... }` (análogo a `productosAsignados` en recepciones) |
| UI de Items | Sustituir el bloque `scan-inputs` por un bloque tipo Recepciones: contenedor `asignaciones-{sku}`, filas `asignacion-fila` con input ubicación + cantidad |
| Funciones nuevas | `renderizarAsignacionesPicks(sku)`, `agregarUbicacionPick(sku)`, `eliminarAsignacionPick(sku, index)`, `actualizarAsignacionPick(sku, index, campo, valor)` |
| Validación | Mostrar "Total asignado X / Pendiente Y" y deshabilitar Registrar si la suma no coincide con lo pendiente o si falta ubicación |
| Llamada API | En lugar de `registrarPick(facturaGuid, sku, cantidadSolicitada)` con un par ubicación/cantidad, llamar con `asignaciones: productosPicks[sku].asignaciones` |

El bloque "Picks registrados" puede mantenerse igual; ya muestra la lista de picks de esa línea.

### 4.3 ¿Se rompe algo del flujo actual?

| Punto | Impacto |
|-------|---------|
| Movimientos PICK | Sin cambio: se siguen creando uno por ubicación/cantidad |
| Stock | Sin cambio: misma lógica de descuento por ubicación |
| FacturaProcesada | Sin cambio: mismo cálculo de completo/pendiente |
| S/K (servicios y kits) | Sin cambio: siguen sin requerir ubicación ni la nueva UI |
| Historial y reportes | Sin cambio: los movimientos son los mismos |
| Integración ADM | Sin cambio |

El cambio es solo de UX: una o varias asignaciones en una sola acción en lugar de varias acciones secuenciales.

### 4.4 Compatibilidad hacia atrás

Si se amplía el backend para aceptar `asignaciones` sin eliminar `ubicacion` + `cantidad`, cualquier cliente que siga usando el contrato anterior seguiría funcionando. El frontend se migraría progresivamente al nuevo patrón.

---

## 5. ¿Cuándo conviene hacerlo?

| Factor | Recomendación |
|--------|---------------|
| Dependencia de otros módulos | No depende de Recepciones, Transferencias ni Ajustes |
| Complejidad | Media: backend pequeño, frontend mayor pero patrones ya probados en Recepciones |
| Riesgo | Bajo si se mantiene retrocompatibilidad en el API |
| Momento | Se puede hacer en cualquier momento. Si se prioriza cierre de funcionalidad de otros módulos, se puede aplazar; si la UX de Despacho es prioritaria, conviene hacerlo pronto para unificar criterios y reducir carga cognitiva del operador. |

---

## 6. Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Existe diferencia clara? | Sí: Despacho es secuencial (un pick a la vez); Recepciones es expandido (varias filas visibles y un solo Registrar) |
| ¿Es viable homologar? | Sí |
| Backend | Ampliar `registrar_pick` para aceptar `asignaciones` o crear `registrar-linea` |
| Frontend | Sustituir inputs únicos por múltiples filas tipo Recepciones + validación de suma |
| ¿Rompe flujo actual? | No |
| ¿Cuándo? | Cuando se decida priorizar; no bloquea ni depende de otros módulos |
