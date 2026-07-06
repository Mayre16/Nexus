# Informe de análisis: Revisión funcional y UX del WMS

**Fecha:** 17 de febrero de 2026  
**Objetivo:** Analizar el informe de revisión funcional (generado con ChatGPT) y contrastarlo con el estado real del código. Determinar qué se puede implementar, qué falta en la lógica actual y qué podría romper lo existente.

---

## 1. Resumen ejecutivo

El informe de revisión funcional identifica correctamente la mayoría de las diferencias entre módulos. La exploración del código confirma que **Despacho** es el módulo más maduro (persistencia, trabajo por línea, múltiples ubicaciones, Revertir/Refrescar). **Recepción**, **Transferencias** y **Ajustes** presentan inconsistencias que el informe describe con precisión.

**Conclusión principal:** Las mejoras propuestas son viables y no romperían la lógica actual si se implementan de forma incremental y siguiendo el patrón ya establecido en Despacho.

---

## 2. Validación punto por punto del informe vs. código real

### 2.1 Despacho

| Afirmación del informe | Estado real | Observación |
|------------------------|------------|-------------|
| Persistencia inmediata al cargar | ✅ Correcto | `FacturaProcesada` se crea/actualiza en `/api/despachos/buscar` |
| Trabajo por línea | ✅ Correcto | `POST /api/despacho/registrar` por pick (factura_guid, sku, ubicacion, cantidad) |
| Múltiples ubicaciones por línea | ✅ Correcto | Split por ubicación soportado; varios picks por SKU |
| Revertir (solo admin) | ✅ Correcto | `POST /api/despacho/{guid}/revertir` con `@require_admin` |
| Refrescar desde ADM | ✅ Correcto | `POST /api/despacho/{guid}/refrescar`; si hay movimientos, solo admin |
| Reordenar líneas completadas al final | ❌ No implementado | El orden viene del array `productos`; no hay lógica de reordenamiento |
| "Factura undefined #..." | ⚠️ Posible | Si `factura.tipo_factura` es `undefined` o no está en `tipoNombres`, se muestra "undefined" |

**Detalle "Factura undefined":** En `despacho.html` L827-868, `tipoFactura = tipoNombres[factura.tipo_factura] || factura.tipo_factura`. Si `factura.tipo_factura` es `undefined`, el resultado es `undefined`. Falta un fallback (ej. `|| 'N/A'` o `|| 'Documento'`).

---

### 2.2 Recepción

| Afirmación del informe | Estado real | Observación |
|------------------------|------------|-------------|
| No persiste documento en WMS al cargar | ✅ Correcto | La búsqueda devuelve datos de ADM; no existe `RecepcionProcesada` ni equivalente |
| Registro global (no por línea) | ✅ Correcto | Un solo `POST /api/recepciones/registrar` con todos los productos |
| Múltiples ubicaciones por línea | ✅ Correcto | `asignaciones: [{ ubicacion, cantidad }]` por producto |
| Revertir / Refrescar | ✅ Correcto | Ambos endpoints existen y están restringidos por rol |
| Post-reversión: UI bloqueada | ⚠️ Parcial | Tras revertir se llama a `refrescarRecepcion()` y se actualiza `recepcionActual.ya_registrada = false`. La lógica está; si la UI queda bloqueada, podría ser un bug de estado en el frontend (ej. inputs deshabilitados por condición que no se recalcula) |

**Nota sobre post-reversión:** El código en `recepciones.html` L1676-1683 hace `refrescarRecepcion()` después de revertir. Si la UI sigue bloqueada, habría que revisar qué datos devuelve `refrescar` y si el frontend recalcula correctamente el estado editable (ej. `ya_registrada`, visibilidad de inputs).

---

### 2.3 Transferencias

| Afirmación del informe | Estado real | Observación |
|------------------------|------------|-------------|
| Persistencia al cargar | ✅ Correcto | `TransferenciaProcesada` se crea/actualiza en `/api/transferencias/buscar` |
| Registro global (no por línea) | ✅ Correcto | Un solo `POST /api/transferencias/registrar` con todos los productos |
| Múltiples ubicaciones origen/destino | ✅ Correcto | `asignaciones_origen` y `asignaciones_destino` por producto |
| Revertir | ✅ Correcto | Endpoint existe y revierte stock en origen/destino |
| No tiene Refrescar | ✅ Correcto | No existe endpoint ni botón |

---

### 2.4 Ajustes

| Afirmación del informe | Estado real | Observación |
|------------------------|------------|-------------|
| No hay documento previo en ADM | ✅ Correcto | Los ajustes se crean directamente en WMS |
| Trabajo parcial por producto/ubicación | ✅ Correcto | Se registran ajustes individuales |
| Múltiples ubicaciones | ✅ Correcto | `asignaciones: [{ ubicacion, cantidad, tipo }]` |
| Revertir | ✅ Correcto | `POST /api/ajustes/{ajuste_id}/revertir` |
| Refrescar no aplica | ✅ Correcto | Los ajustes no vienen de ADM |
| Auditoría | ✅ Correcto | `Movimiento` con tipo ADJUSTMENT, notas, usuario, timestamp |

---

## 3. Lo que se puede implementar sin romper lo actual

### 3.1 Mejoras de bajo riesgo (UX / frontend)

| Mejora | Módulo | Impacto | Riesgo |
|--------|--------|---------|--------|
| Reordenar líneas completadas al final | Despacho | Solo orden visual en el DOM | Bajo |
| Fallback para "Factura undefined" | Despacho | `tipoFactura \|\| 'Documento'` o similar | Muy bajo |
| Restricción Refrescar por rol (si no está) | Recepción | Verificar `@require_admin` o equivalente | Bajo |

### 3.2 Mejoras de riesgo medio (requieren diseño)

| Mejora | Módulo | Consideración |
|--------|--------|---------------|
| Persistencia de recepción al cargar | Recepción | Crear modelo `RecepcionProcesada` (o similar) y guardar al buscar. No rompe la lógica actual de registro; solo añade una capa de persistencia para retomar trabajo. |
| Registro por línea en Recepción | Recepción | Requiere nuevo endpoint `POST /api/recepciones/registrar-linea` (o similar) y cambios en el frontend. El registro global actual puede coexistir como "Registrar todo" hasta migrar. |
| Registro por línea en Transferencias | Transferencias | Misma idea que Recepción: endpoint por línea + UI. El registro global puede mantenerse. |
| Botón Refrescar en Transferencias | Transferencias | Añadir `POST /api/transferencias/{guid}/refrescar` que reconsulte ADM y actualice `TransferenciaProcesada`. Patrón ya existe en Despacho y Recepción. |

### 3.3 Mejoras que requieren validación de negocio

| Mejora | Consideración |
|--------|---------------|
| Post-reversión UI en Recepción | Si la UI queda bloqueada, hay que depurar: ¿el endpoint `refrescar` devuelve datos en estado editable? ¿El frontend tiene condiciones que no se actualizan? |
| Conflicto ADM vs. trabajo parcial WMS | El informe pregunta qué pasa si el documento cambia en ADM y ya hay avances en WMS. Hoy no hay lógica explícita de merge/conflicto; Refrescar sobrescribe. Definir política (ej. avisar, bloquear, o sobrescribir) antes de cambiar. |

---

## 4. Lo que podría romper algo (precauciones)

### 4.1 Cambios que NO romperían

- **Reordenamiento de líneas completadas:** Solo afecta el orden de renderizado; no cambia datos ni APIs.
- **Fallback "Factura undefined":** Cambio cosmético en el frontend.
- **Añadir Refrescar en Transferencias:** Nuevo endpoint; no modifica el flujo actual.
- **Persistencia de recepción:** Añadir modelo y guardar al buscar; el flujo de registro actual sigue igual.

### 4.2 Cambios que requieren cuidado

- **Registro por línea en Recepción/Transferencias:** Si se elimina el registro global sin migración, usuarios que usan "Registrar todo" quedarían sin flujo. Recomendación: implementar registro por línea en paralelo y mantener el global hasta validar.
- **Cambios en el modelo de datos de ubicaciones:** Si se modifica la estructura de `asignaciones` o `StockUbicacion`, hay que revisar todas las rutas que las usan (Despacho, Recepción, Transferencias, Ajustes).

### 4.3 Lo que el informe no contempla

- **Sincronización de inventario:** El módulo de sincronización (`routes/sincronizar.py`) es independiente; las mejoras de Despacho/Recepción/Transferencias/Ajustes no lo afectan.
- **Integración ADM Cloud:** Los endpoints de búsqueda y refresco dependen de la API ADM. Cualquier cambio en contratos (ej. nuevos campos) debe validarse contra la documentación ADM.

---

## 5. Lo que falta en la lógica actual (resumen)

| Aspecto | Despacho | Recepción | Transferencias | Ajustes |
|---------|----------|-----------|----------------|---------|
| Persistencia documento al cargar | ✅ | ❌ | ✅ | N/A |
| Registro por línea | ✅ | ❌ | ❌ | ✅ (por producto) |
| Múltiples ubicaciones | ✅ | ✅ | ✅ | ✅ |
| Revertir (admin) | ✅ | ✅ | ✅ | ✅ |
| Refrescar desde ADM | ✅ | ✅ | ❌ | N/A |
| Reordenar completados al final | ❌ | N/A | N/A | N/A |
| Fallback tipo documento (evitar "undefined") | ❌ | N/A | N/A | N/A |
| Post-reversión UI editable | N/A | ⚠️ Revisar | N/A | N/A |

---

## 6. Recomendaciones

1. **Prioridad alta (rápido, sin riesgo):**
   - Reordenar líneas completadas al final en Despacho.
   - Corregir "Factura undefined" con fallback en `despacho.html`.

2. **Prioridad media (requiere desarrollo):**
   - Añadir Refrescar en Transferencias (reutilizar patrón de Despacho/Recepción).
   - Persistir recepción al cargar (modelo `RecepcionProcesada` o equivalente).
   - Implementar registro por línea en Recepción y Transferencias, manteniendo el registro global como opción.

3. **Prioridad baja (validar con operación):**
   - Depurar post-reversión en Recepción si la UI sigue bloqueada.
   - Definir política de conflicto ADM vs. trabajo parcial WMS.

4. **No rompe lo actual:** Todas las mejoras propuestas pueden implementarse de forma incremental sin eliminar funcionalidad existente, siempre que se mantenga compatibilidad hacia atrás (ej. registro global + registro por línea en paralelo).

---

## 7. Conclusión

El informe de revisión funcional es coherente con el estado real del código. Las diferencias entre módulos están bien identificadas y las reglas estándar deseadas son alcanzables sin romper la operación actual. La estrategia recomendada es adoptar **Despacho como referencia** e ir alineando Recepción, Transferencias y Ajustes de forma gradual, priorizando primero las mejoras de bajo riesgo (UX) y luego las de persistencia y registro por línea.
