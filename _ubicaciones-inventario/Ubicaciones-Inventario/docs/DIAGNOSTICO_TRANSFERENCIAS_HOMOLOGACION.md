# Diagnóstico: Transferencias — Homologación con Despacho y Recepciones

**Fecha:** 17 de Febrero 2026  
**Estado:** Análisis previo a implementación — NO modificar código hasta validar  
**Objetivo:** Diagnosticar Transferencias y proponer plan para homologarlo con el estándar ya logrado en Despacho y Recepciones.

---

## 1. Diagnóstico actual de Transferencias

### 1.1 Persistencia

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Al cargar** | ✅ Sí | `buscar_transferencia` crea/actualiza `TransferenciaProcesada` con `estado_procesamiento='PENDIENTE'` |
| **Usuario solicitante** | ✅ Sí | Se guarda `usuario_solicitante` al buscar |
| **productos_json** | ✅ Sí | Productos en JSON en la BD |

### 1.2 Trabajo por línea vs global

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Registro** | ❌ Global | Un solo botón "Registrar Transferencia" que envía **todos** los productos en una sola llamada |
| **Progreso parcial** | ❌ No | No se puede registrar producto por producto; es todo o nada |
| **Persistencia del avance** | ❌ No | Si registras la mitad y falla, no queda nada guardado |

### 1.3 Origen y destino

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Origen ADESA** | ✅ Sí | Requiere ubicaciones físicas; valida stock en `StockUbicacion` |
| **Destino ADESA** | ✅ Sí | Requiere ubicaciones físicas; suma stock |
| **Origen NO-ADESA** | ✅ Sí | No exige ubicación física; actualiza `StockProductoADM` |
| **Destino NO-ADESA** | ✅ Sí | No exige ubicación física; auditoría en movimientos |
| **Asignaciones múltiples** | ✅ Destino | "+ Agregar otra ubicación" en destino |
| **Asignaciones múltiples origen** | ⚠️ Parcial | El backend acepta `asignaciones_origen` múltiples, pero la UI típicamente genera una sola fila |

### 1.4 Estado visible

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Estados** | PENDIENTE / PROCESADA | No tiene `EN_PROCESO` |
| **Badge en cabecera** | ❌ No | No hay badge tipo pill con PENDIENTE / EN_PROCESO / COMPLETO como Despacho/Recepciones |
| **Estado por producto** | ❌ No | No hay "Total asignado X / Y (Restante Z)" por línea como en Recepciones |
| **API de estado** | ❌ No | No existe `GET /api/transferencias/<guid>/estado` con asignado/restante por SKU |

### 1.5 Botones admin

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Refrescar desde ADM** | ❌ No | No existe el endpoint ni el botón |
| **Revertir** | ✅ Sí | `POST /api/transferencias/<guid>/revertir` (solo admin) |
| **Post-reversión** | ⚠️ Parcial | No hay flujo claro de recarga sin confirm invasivo |

### 1.6 Reordenamiento y UX

| Aspecto | Estado actual | Detalle |
|---------|---------------|---------|
| **Completados al final** | N/A | Al ser registro global, no hay productos "completados" antes de registrar todo |
| **Patrón expandido** | ⚠️ Parcial | Tiene varias filas de ubicación en destino, pero no el mismo flujo que Recepciones |
| **IDs únicos por SKU** | ✅ Sí | `agregar_productos_por_sku` evita duplicados (ya aplicado en helpers) |

### 1.7 Modelo de datos

| Modelo | Campos relevantes |
|--------|-------------------|
| **TransferenciaProcesada** | `estado_procesamiento` (PENDIENTE/PROCESADA), `usuario_solicitante`, `usuario_procesador`, `fecha_procesamiento`, `productos_json` |
| **Movimiento** | `tipo='TRANSFER'`, `ubicacion_origen`, `ubicacion_destino`, `cantidad`, `factura_guid` |
| **StockUbicacion** | Se actualiza al registrar (origen ADESA resta, destino ADESA suma) |

---

## 2. Comparación contra el estándar (Despacho / Recepciones)

| Criterio | Despacho | Recepciones | Transferencias |
|----------|----------|-------------|----------------|
| **Estado visible** | ✅ PENDIENTE / EN_PROCESO / COMPLETO | ✅ PENDIENTE / EN_PROCESO / COMPLETO | ❌ Solo PENDIENTE / PROCESADA |
| **Persistencia del avance** | ✅ Por línea | ✅ Por línea | ❌ Todo o nada |
| **Trabajo por línea** | ✅ registrar-linea | ✅ registrar-linea | ❌ registrar global |
| **Múltiples ubicaciones por SKU** | ✅ Sí | ✅ Sí | ✅ Sí (destino; origen en backend) |
| **Estado por producto** | ✅ asignado/restante | ✅ asignado/restante | ❌ No |
| **Refrescar desde ADM** | ✅ Sí | ✅ Sí | ❌ No |
| **Revertir** | ✅ Sí (admin) | ✅ Sí (admin) | ✅ Sí (admin) |
| **Reordenamiento completados** | ✅ Sí | ✅ Sí | N/A (registro global) |
| **API de estado** | Implícito en factura | `GET /estado` | ❌ No existe |
| **UX homologada** | ✅ Patrón expandido | ✅ Patrón expandido | ⚠️ Similar pero distinto |

### Resumen de brechas

1. **Registro global vs por línea** — Transferencias exige llenar todo y dar un solo "Registrar"; Despacho y Recepciones permiten ir línea por línea.
2. **Sin EN_PROCESO** — No hay estado intermedio; pasa de PENDIENTE a PROCESADA de golpe.
3. **Sin API de estado** — No hay forma de saber cuánto está asignado/restante por producto sin recalcular en frontend.
4. **Sin Refrescar** — No se puede traer datos actualizados desde ADM.
5. **Estado por producto** — No se muestra "Total asignado X / Y" por SKU de forma consistente.

---

## 3. Riesgos y puntos delicados

### 3.1 Complejidad bidireccional (origen + destino)

- **Origen ADESA:** Requiere ubicación física y validación de stock. El usuario debe indicar de qué ubicación sale.
- **Destino ADESA:** Requiere ubicación física; el usuario indica a qué ubicación llega.
- **Casos mixtos:** Origen ADESA + Destino NO-ADESA, u Origen NO-ADESA + Destino ADESA.
- **Riesgo:** Si se implementa por línea, hay que manejar bien las 4 combinaciones y las validaciones de stock.

### 3.2 Stock origen y destino

- **Origen ADESA:** Se valida `StockUbicacion` y `StockProductoADM` (LIVE). Si no hay stock, falla.
- **Destino ADESA:** Se suma a `StockUbicacion`.
- **Reversión:** Ya revierte ambos (origen y destino) cuando son ADESA.
- **Riesgo:** Con registro por línea, el stock disponible puede cambiar entre líneas (p. ej. otro usuario hace un ajuste). Hay que validar en el momento del registro.

### 3.3 Múltiples ubicaciones origen

- **Actual:** Backend acepta `asignaciones_origen` como array.
- **UI:** Suele inicializar una sola fila.
- **Riesgo:** Si un SKU sale de 2P1D01N1 (3 u) y 1L1AN2 (2 u), la UI debe permitir esa distribución. Hoy está más preparado para múltiples destinos que para múltiples orígenes.

### 3.4 Destino sin control físico WMS

- Cuando destino es NO-ADESA, no se toca `StockUbicacion`; se crean movimientos y se actualiza `StockProductoADM`.
- La UX debe dejar claro que no se exige ubicación física en ese caso.

### 3.5 Consistencia origen–destino

- La suma de `asignaciones_origen` debe coincidir con la suma de `asignaciones_destino` por SKU.
- Con split (varias ubicaciones), debe mantenerse coherencia entre origen y destino.

---

## 4. Plan lógico propuesto

### 4.1 Estados

- **PENDIENTE:** Recién buscada, sin movimientos.
- **EN_PROCESO:** Al menos un producto/línea registrado, pero no todos.
- **PROCESADA (o COMPLETA):** Todos los productos registrados.

Cálculo de EN_PROCESO/PROCESADA:

- `total_requerido` = suma de `Quantity` de todos los productos.
- `total_registrado` = suma de cantidades en movimientos TRANSFER de esa `factura_guid`.
- Si `total_registrado >= total_requerido` → PROCESADA; si `total_registrado > 0` y `< total_requerido` → EN_PROCESO.

### 4.2 Trabajo por línea

- Nuevo endpoint: `POST /api/transferencias/registrar-linea` (análogo a recepciones).
- Payload por SKU: `asignaciones_origen` y `asignaciones_destino`.
- Validar stock origen, restar origen, sumar destino, crear movimientos.
- Actualizar estado de la transferencia (PENDIENTE → EN_PROCESO → PROCESADA).

### 4.3 API de estado

- `GET /api/transferencias/<guid>/estado`
- Devuelve: `estado_transferencia` (PENDIENTE/EN_PROCESO/PROCESADA) y por producto: `cantidad_asignada`, `cantidad_restante`, `asignaciones_registradas` (origen y destino).

### 4.4 Refrescar desde ADM

- `POST /api/transferencias/<guid>/refrescar`
- Buscar por DocID en ADM, validar GUID, devolver productos/datos actualizados.
- Sólo si está PENDIENTE o EN_PROCESO (o según política definida).

### 4.5 UX

- Badge de estado en cabecera (PENDIENTE / EN_PROCESO / PROCESADA).
- Por producto: "Total asignado X / Y (Restante Z)" en origen y destino.
- Botón "Registrar" por línea (además de o en sustitución de "Registrar Transferencia" global).
- Reordenar productos: pendientes primero, completados al final.
- Patrón expandido: varias filas de ubicación/cantidad visibles antes de registrar.
- Botón "Refrescar desde ADM" visible cuando corresponda.

### 4.6 Múltiples ubicaciones

- Origen ADESA: varias filas (ubicación origen + cantidad) por SKU.
- Destino ADESA: varias filas (ubicación destino + cantidad) por SKU.
- Validar que la suma origen = suma destino = cantidad del producto.

---

## 5. Plan técnico propuesto

### 5.1 Backend

| Acción | Archivo | Detalle |
|--------|---------|---------|
| Crear `registrar-linea` | `routes/transferencias.py` | `POST /api/transferencias/registrar-linea`; recibe `transferencia_guid`, `sku`, `asignaciones_origen`, `asignaciones_destino`; valida, actualiza stock, crea movimientos, actualiza estado |
| Crear `estado` | `routes/transferencias.py` | `GET /api/transferencias/<guid>/estado`; calcula asignado/restante por SKU desde movimientos |
| Crear `refrescar` | `routes/transferencias.py` | `POST /api/transferencias/<guid>/refrescar`; busca en ADM por DocID, verifica GUID, devuelve datos actualizados |
| Actualizar `buscar` | `routes/transferencias.py` | Asegurar que `estado_procesamiento` se calcule según movimientos existentes (igual que en recepciones) |
| Mantener `registrar` | `routes/transferencias.py` | Conservar registro global para compatibilidad; el frontend puede migrar a registrar-linea |
| Ajustar reversión | `routes/transferencias.py` | Usar `TransferenciaProcesada` para determinar origen/destino ADESA (como en recepciones con `location_name`) |

### 5.2 Frontend

| Acción | Archivo | Detalle |
|--------|---------|---------|
| Badge de estado | `templates/transferencias.html` | Añadir pill PENDIENTE/EN_PROCESO/PROCESADA en cabecera |
| Llamar API estado | `templates/transferencias.html` | Al cargar productos, obtener estado y usarlo para restante/asignado por SKU |
| Registrar por línea | `templates/transferencias.html` | Botón "Registrar" por producto que llame a `registrar-linea` |
| Mostrar asignaciones registradas | `templates/transferencias.html` | Listar asignaciones ya registradas por producto (origen → destino) |
| Reordenar productos | `templates/transferencias.html` | Pendientes primero, completados al final |
| Botón Refrescar | `templates/transferencias.html` | Añadir y conectar con `/refrescar` |
| Patrón expandido origen | `templates/transferencias.html` | "+ Agregar otra ubicación" en origen cuando sea ADESA y aplique |
| IDs únicos | Ya aplicado | `agregar_productos_por_sku` en `obtener_productos_location_transfer` |
| Limpiar `productosAsignados` al cargar | `templates/transferencias.html` | Evitar datos obsoletos entre transferencias |

### 5.3 Modelo

- `TransferenciaProcesada.estado_procesamiento`: mantener PENDIENTE / PROCESADA y añadir EN_PROCESO, o derivar estado de movimientos sin cambiar el modelo (como en recepciones).

---

## 6. Confirmación de homologación

Con el plan anterior, Transferencias quedaría homologado en:

| Criterio | Resultado |
|----------|-----------|
| Estado visible | ✅ PENDIENTE / EN_PROCESO / PROCESADA (o COMPLETA) |
| Persistencia del avance | ✅ Por línea |
| Trabajo por línea | ✅ registrar-linea |
| Múltiples ubicaciones | ✅ Origen y destino |
| Estado por producto | ✅ API estado + UI |
| Refrescar | ✅ Sí |
| Revertir | ✅ Ya existe |
| Reordenamiento | ✅ Completados al final |
| UX alineada | ✅ Mismo patrón expandido que Despacho y Recepciones |

### Diferencia específica de Transferencias

Transferencias seguirá teniendo **origen y destino** por producto, algo que Despacho y Recepciones no tienen. La UX será:

- Para cada producto: sección "Origen (WMS)" (si aplica) y "Destino (WMS)" (si aplica).
- Múltiples filas en cada sección.
- Un "Registrar" por producto que envía ambas asignaciones en una sola llamada.

Eso es consistente con el patrón expandido y solo añade la dimensión bidireccional.

---

## 7. Orden sugerido de implementación

1. **API de estado** — Base para el resto.
2. **registrar-linea** — Habilitar trabajo por línea.
3. **Frontend: estado y registrar por línea** — Badge, estado por producto, botón Registrar por línea.
4. **Refrescar** — Backend + frontend.
5. **Reordenamiento y pulido UX** — Completados al final, asignaciones registradas visibles.
6. **Múltiples filas en origen** — Si la UI actual no las expone bien.

---

## 8. Conclusión

Transferencias está funcional pero desalineado con el estándar de Despacho y Recepciones. Las brechas principales son:

- Registro global en lugar de por línea.
- Ausencia de EN_PROCESO y de API de estado.
- Ausencia de Refrescar.
- UX distinta (aunque ya soporta múltiples ubicaciones en destino).

Con el plan propuesto, Transferencias puede homologarse al mismo patrón, manteniendo la lógica específica de origen/destino y las validaciones de stock. La complejidad extra es manejable si se sigue el orden indicado y se validan los casos origen ADESA, destino ADESA y las combinaciones mixtas.
