# Entrega: Módulo Recepciones — Estandarización WMS

**Fecha:** 17 de febrero de 2026  
**Sprint:** Módulo 2 — Recepciones  
**Estado:** ✅ Completado

---

## 1. Diagnóstico del módulo actual

### Estado previo

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Modelo de persistencia | ❌ No existía | ✅ RecepcionProcesada |
| Endpoint de búsqueda | `/api/recepciones/buscar` | Igual (ahora persiste) |
| Guardado de asignaciones | Global: `POST /api/recepciones/registrar` con todos los productos | Por línea: `POST /api/recepciones/registrar-linea` |
| Estructura asignaciones | `productos: [{ sku, asignaciones: [{ ubicacion, cantidad }] }]` | Igual, pero registro por línea |
| Estados | `ya_registrada` (por movimientos) | `estado_recepcion`: PENDIENTE / EN_PROCESO / COMPLETO |
| Bloqueo inputs | `ya_registrada` deshabilitaba todo | Solo cuando `ya_registrada` |
| Post-reversión | Llamaba `refrescarRecepcion()` con confirm → UI bloqueada | Llama `recargarRecepcionTrasRevertir()` (buscar sin confirm) |

### Causa del bloqueo post-reversión

Tras revertir se llamaba `refrescarRecepcion()`, que mostraba un `confirm()`. Si el usuario cancelaba o había fallo, la UI no se actualizaba. Además, `refrescar` consulta ADM; lo necesario era re-buscar localmente para obtener el estado sin movimientos.

---

## 2. Plan de cambios ejecutado

### A) Persistencia al cargar

- Modelo `RecepcionProcesada` (patrón FacturaProcesada / TransferenciaProcesada).
- En `buscar_recepcion`: crear/actualizar `RecepcionProcesada` con guid, docid, tipo, cliente, fecha, total, location, productos_json, estado_recepcion.
- Actualizar estado según movimientos existentes (EN_PROCESO, COMPLETO).

### B) Registro por línea

- Nuevo `POST /api/recepciones/registrar-linea` con `recepcion_guid`, `sku`, `asignaciones[]`.
- Validaciones: suma ≤ cantidad recibida, ubicación válida (ADESA), no negativos.
- Frontend: botón "Registrar" por tarjeta SKU.
- "Registrar Todas las Asignaciones" oculto (flujo secundario).

### C) UX múltiples ubicaciones

- "+ Agregar otra ubicación" por SKU.
- Lista "Asignaciones registradas" por línea (estilo picks en Despacho).
- Total asignado / Restante.
- "✓ Completo" cuando restante = 0.

### D) Botones admin

- Refrescar: solo admin (`@require_admin`).
- Revertir: solo admin.
- Visibilidad: cuando hay recepción cargada y (avances o ya registrada).

### E) Post-reversión editable

- Tras revertir: `recargarRecepcionTrasRevertir()` → buscar sin confirm → `mostrarRecepcion()`.
- UI queda editable sin pasos adicionales.

### F) Reordenar completados

- Pendientes primero, completados al final.
- Se recalcula tras cada registro por línea.

---

## 3. Implementación

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `database/models.py` | Modelo `RecepcionProcesada` |
| `routes/recepciones.py` | Persistencia en buscar, `registrar-linea`, `estado`, `por-guid`, actualización en revertir |
| `utils/helpers.py` | `calcular_cantidad_asignada_recepcion`, `calcular_cantidad_restante_recepcion` |
| `templates/recepciones.html` | Flujo por línea, estado API, reorden, asignaciones registradas, post-revert, retomar por guid |
| `scripts/migrar_tablas_nuevas.py` | Creación de tabla `recepciones_procesadas` |
| `scripts/init_db.py` | Import de `RecepcionProcesada` (si aplica) |

### Endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/recepciones/recepcion/<guid>/estado` | Estado por producto (asignado, restante, asignaciones_registradas) |
| POST | `/api/recepciones/registrar-linea` | Registro de una línea (SKU + asignaciones) |
| GET | `/api/recepciones/por-guid/<guid>` | Recepción persistida por GUID (retomar) |

### Endpoints modificados

| Endpoint | Cambio |
|----------|--------|
| `POST /api/recepciones/buscar` | Persiste en `RecepcionProcesada`, devuelve `estado_recepcion` |
| `POST /api/recepciones/<guid>/revertir` | Actualiza `RecepcionProcesada.estado_recepcion` a PENDIENTE |
| `POST /api/recepciones/<guid>/refrescar` | `@require_admin` |

### Modelos / migraciones

- **Nuevo:** `RecepcionProcesada` (tabla `recepciones_procesadas`).
- **Migración:** `python scripts/migrar_tablas_nuevas.py` crea la tabla si no existe.

---

## 4. Riesgos y efectos secundarios

| Riesgo | Mitigación |
|--------|------------|
| Tabla nueva en producción | Ejecutar `migrar_tablas_nuevas.py` o `db.create_all()` |
| Recepciones antiguas sin persistencia | Al buscar de nuevo se crea el registro |
| **Historial sin movimientos antiguos** | Ejecutar `python scripts/migrar_recepciones_legacy.py` para poblar RecepcionProcesada desde movimientos RECEIPT existentes. Ver `docs/MIGRACION_RECEPCIONES_LEGACY.md` |
| Refrescar solo admin | Usuarios no admin no verán el botón (comportamiento esperado) |

---

## 5. Cómo probar

### Persistencia

1. Buscar recepción por DocID.
2. Verificar en BD que existe `recepciones_procesadas` con ese guid.
3. Cerrar pestaña, volver a buscar el mismo DocID.
4. Comprobar que se mantienen las asignaciones ya registradas.

### Registro por línea

1. Buscar recepción con varios productos.
2. Asignar un SKU en 2 ubicaciones (ej. 3 + 2).
3. Pulsar "Registrar" en esa línea.
4. Verificar que aparece "Asignaciones registradas" y que el restante se actualiza.

### Múltiples ubicaciones

1. Producto con cantidad 5.
2. Asignar ubicación A = 2, ubicación B = 3.
3. Registrar.
4. Comprobar lista de asignaciones y estado "✓ Completo".

### Post-reversión

1. Registrar una recepción completa.
2. Como admin, pulsar "Revertir Recepción".
3. Confirmar.
4. Verificar que la UI queda editable sin buscar de nuevo.

### Reordenar completados

1. Recepción con 3 productos.
2. Completar el segundo.
3. Verificar que pasa al final de la lista.

### Botones admin

1. Como admin, cargar recepción con avances.
2. Verificar que aparecen Refrescar y Revertir.
3. Como usuario no admin, verificar que no aparecen.

---

## 6. Checklist final de Recepción

| Ítem | Estado |
|------|--------|
| Persistencia al cargar (RecepcionProcesada) | ✅ |
| Registro por línea (registrar-linea) | ✅ |
| Múltiples ubicaciones por SKU (UX) | ✅ |
| Asignaciones registradas visibles | ✅ |
| Botones Refrescar/Revertir (solo admin) | ✅ |
| Post-reversión UI editable | ✅ |
| Reordenar completados al final | ✅ |
| Retomar por guid (por-guid) | ✅ |
| Migración tabla recepciones_procesadas | ✅ |

---

## 7. Resumen

| Concepto | Detalle |
|----------|---------|
| **Qué se añadió** | RecepcionProcesada, registrar-linea, estado, por-guid, flujo por línea |
| **Qué se cambió** | Buscar persiste, revertir actualiza estado, post-revert sin confirm |
| **Qué se ocultó** | "Registrar Todas" (flujo secundario) |
| **Impacto** | Recepciones alineadas con Despacho en persistencia, flujo por línea y UX |
