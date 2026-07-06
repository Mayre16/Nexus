# Validación funcional: comportamiento actual por escenario

**Alcance:** Describir qué hace hoy el sistema en cada caso según el código. Sin cambios ni propuestas.

---

## 1) RECEPCIONES

### Caso 1A: Recepción en ADESA

**Caso:** SKU 123, última sync ADESA = 10, se recibe documento por 5 unidades, se colocan en ubicación física `2P1D01N1`.

**Módulo que interviene:** Recepciones (`routes/recepciones.py`, flujo de registrar recepción con asignaciones por ítem).

**Qué cambia en BD:**
- **`StockUbicacion`:** Sí cambia. Se busca o crea la fila (product_id, sku, ubicacion=2P1D01N1) y se **suman** 5 a `cantidad` (REGLA DE ORO #4: solo si `es_adesa`).
- **`Movimiento`:** Se crea al menos un registro tipo RECEIPT (product_id, sku, cantidad=5, factura_guid, ubicacion_destino=2P1D01N1).

**Qué no cambia:**
- **`StockProductoADM`:** No se toca. La cache ADM de ADESA sigue en 10.

**Qué ve el usuario inmediatamente:**
- En consulta de producto: ubicaciones físicas con +5 en 2P1D01N1; stock ADM ADESA sigue mostrando 10.

**Qué queda pendiente a sync:**
- Que la cache ADM de ADESA pase a reflejar el total real (15) cuando la sync traiga el valor desde ADM.

**Observación sobre coherencia o diferencia temporal:** Hay diferencia temporal: el físico sube y la cache ADM no; hasta la próxima sync la consulta muestra ADESA = 10 aunque el físico ya tenga 5 más en esa ubicación.

---

### Caso 1B: Recepción en ubicación no-ADESA

**Caso:** SKU 123, última sync MIRADOR SUR = 8, se recibe documento por 4 unidades para MIRADOR SUR.

**Módulo que interviene:** Recepciones (mismo flujo; `es_adesa` es False para MIRADOR SUR).

**Qué cambia en BD:**
- **`Movimiento`:** Se crea registro RECEIPT (ubicacion_destino = location_name, ej. "MIRADOR SUR", o "NO-ADESA"; ver líneas 906-907). Se registra la recepción para auditoría.

**Qué no cambia:**
- **`StockUbicacion`:** No se modifica. El código explícitamente no toca StockUbicacion cuando no es ADESA (“NO modificar StockUbicacion”, línea 908).
- **`StockProductoADM`:** No se toca. La cache de MIRADOR SUR sigue en 8.

**Qué ve el usuario inmediatamente:**
- En consulta de producto: stock ADM MIRADOR SUR sigue en 8; no hay incremento en ubicaciones físicas WMS (porque no se escribe StockUbicacion para no-ADESA).

**Qué queda pendiente a sync:**
- Que la cache ADM de MIRADOR SUR pase a 12 cuando la sync traiga el valor desde ADM.

**Observación sobre coherencia o diferencia temporal:** El sistema solo registra el movimiento (auditoría); no actualiza ni físico ni cache ADM para no-ADESA. La diferencia temporal entre lo recibido (4) y lo mostrado en cache (8) se mantiene hasta la sync.

---

## 2) DESPACHOS

### Caso 2A: Despacho desde ADESA

**Caso:** SKU 123, ADESA en cache = 10, físico en WMS = 10 en 2P1D01N1, se despachan 3 unidades.

**Módulo que interviene:** Despacho (`routes/despacho.py`, registrar pick con asignaciones desde ubicación física).

**Qué cambia en BD:**
- **`StockUbicacion`:** Sí cambia. Se resta 3 de la fila (sku, ubicacion=2P1D01N1); `cantidad` pasa a 7.
- **`Movimiento`:** Se crea registro PICK (cantidad=3, ubicacion_origen=2P1D01N1, factura_guid, etc.).

**Qué no cambia:**
- **`StockProductoADM`:** No se toca. La cache ADM de ADESA sigue en 10.

**Qué ve el usuario inmediatamente:**
- En consulta de producto: ubicación física 2P1D01N1 con 7; stock ADM ADESA sigue 10.

**Qué queda pendiente a sync:**
- Que la cache ADM de ADESA pase a 7 (o al valor que ADM tenga) cuando se ejecute la sync.

**Observación sobre coherencia o diferencia temporal:** Diferencia temporal: físico baja a 7, cache ADM sigue en 10 hasta la sync.

---

### Caso 2B: Despacho desde no-ADESA

**Caso:** SKU 123, MIRADOR SUR en cache = 8, se despachan 3 unidades “desde MIRADOR SUR”.

**Módulo que interviene:** Despacho (mismo módulo). El flujo exige una **ubicación física** en cada asignación (`validar_ubicacion(ubicacion)`); esa ubicación debe existir en `StockUbicacion` y tener stock suficiente para el SKU.

**Qué cambia en BD (si el escenario es viable):**
- Si existe una fila en `StockUbicacion` con ese SKU y una ubicación que se considere “de MIRADOR SUR” (p. ej. código de bin o el propio nombre “MIRADOR SUR”): se **restan** 3 de esa fila y se crea **`Movimiento`** PICK.
- **`StockProductoADM`:** No se modifica en ningún caso en el módulo de despacho.

**Qué no cambia:**
- **`StockProductoADM`:** No se toca. Cache MIRADOR SUR sigue en 8.

**Qué ve el usuario inmediatamente:**
- Si había StockUbicacion para esa ubicación: ve la cantidad física bajada; stock ADM MIRADOR SUR sigue 8.
- Si no hay StockUbicacion para “desde MIRADOR SUR”, el flujo actual exige ubicación física válida con stock; el despacho no se completaría hasta indicar una ubicación que exista en WMS.

**Qué queda pendiente a sync:**
- Que la cache ADM de MIRADOR SUR se actualice cuando corra la sync.

**Observación sobre coherencia o diferencia temporal:** El comportamiento respecto a cache ADM es el mismo que en 2A: el despacho nunca actualiza `StockProductoADM`. Si el “despacho desde MIRADOR SUR” se hace eligiendo una ubicación física que exista en `StockUbicacion`, solo baja ese físico; si no existe tal ubicación, el caso no está soportado tal cual (el sistema no crea StockUbicacion para no-ADESA en recepciones, pero podría existir por ajustes u otros medios).

---

## 3) TRANSFERENCIAS

### Caso 3A: ADESA → ADESA

**Caso:** SKU 123, mover 4 unidades de 2P1D01N1 a 2P1D02N1, todo dentro de ADESA.

**Módulo que interviene:**  
- **Habitual (sin documento ADM de transferencia):** Ajustes: dos ajustes tipo `fisica` (reducir 4 en 2P1D01N1 y sumar 4 en 2P1D02N1, o fijar cantidades absolutas).  
- **Si existe documento ADM LocationTransfer ADESA→ADESA y se usa Transferencias:** Módulo Transferencias.

**Qué cambia en BD:**

Si se hace por **Ajustes:**  
- **`StockUbicacion`:** Se actualiza en ambas ubicaciones (2P1D01N1 -4, 2P1D02N1 +4) y se crean **`Movimiento`** ADJUSTMENT.  
- **`StockProductoADM`:** No cambia.

Si se hace por **Transferencias** (documento ADESA→ADESA):  
- **`StockUbicacion`:** Se resta 4 en origen (2P1D01N1) y se suman 4 en destino (2P1D02N1).  
- **`Movimiento`:** Se crea(n) registro(s) TRANSFER.  
- **`StockProductoADM`:** No cambia. El código solo actualiza StockProductoADM en los bloques `else` (origen NO-ADESA y destino NO-ADESA); aquí ambos son ADESA.

**Qué no cambia:**  
- **`StockProductoADM`** en ambos caminos.

**Qué ve el usuario inmediatamente:**  
- Físico: 4 menos en 2P1D01N1 y 4 más en 2P1D02N1. Stock ADM ADESA igual que antes.

**Qué queda pendiente a sync:**  
- Nada en este caso; el total en ADESA no cambia, solo se reorganiza físico.

**Observación sobre coherencia o diferencia temporal:** Coherente: solo se reorganiza stock físico dentro de la misma macro ADM; la cache ADM no se toca y no debería cambiar por este movimiento.

---

### Caso 3B: ADESA → MIRADOR SUR

**Caso:** SKU 123, ADESA = 10, MIRADOR SUR = 2, se transfieren 4 de ADESA a MIRADOR SUR.

**Módulo que interviene:** Transferencias (`routes/transferencias.py`, registrar-linea / flujo que procesa asignaciones con origen_es_adesa True, destino_es_adesa False).

**Qué cambia en BD:**
- **`StockUbicacion`:** Sí en origen ADESA: se **restan** 4 de la(s) ubicación(es) física(s) origen indicada(s). No se toca StockUbicacion para destino (MIRADOR SUR no es ADESA; el bloque que suma en destino es solo cuando `destino_es_adesa`).
- **`StockProductoADM`:** Solo **MIRADOR SUR**: se obtiene el vigente y se **suman** 4. **ADESA no se modifica** (el update de origen está en el `else` de `if origen_es_adesa`).
- **`Movimiento`:** Se crea(n) TRANSFER (origen físico / origen nombre, destino nombre, cantidad).

**Qué no cambia:**
- **`StockProductoADM`** de ADESA: sigue en 10.

**Qué ve el usuario inmediatamente:**
- ADESA: cache sigue 10; físico en la ubicación origen bajó 4.  
- MIRADOR SUR: cache pasa a 6 (2+4).

**Qué corrige luego la sync:**
- Trae de ADM los valores por ubicación; si ADM ya refleja la transferencia, ADESA y MIRADOR SUR quedarán con los valores de ADM (p. ej. ADESA 6, MIRADOR SUR 6), sobrescribiendo lo que haya en el run vigente.

**Observación sobre coherencia o diferencia temporal:** Diferencia temporal en ADESA: la cache sigue en 10 aunque el físico ya bajó 4; hasta la sync la consulta no refleja esa baja en la macro ADESA.

---

### Caso 3C: MIRADOR SUR → ADESA

**Caso:** SKU 123, MIRADOR SUR = 8, ADESA = 10, se transfieren 3 de MIRADOR SUR a ADESA.

**Módulo que interviene:** Transferencias (origen_es_adesa False, destino_es_adesa True).

**Qué cambia en BD:**
- **`StockProductoADM`** de MIRADOR SUR: se obtiene el vigente y se **restan** 3 (origen no-ADESA).
- **`StockUbicacion`:** Sí en destino ADESA: se **suman** 3 en la(s) ubicación(es) física(s) destino indicada(s). Origen (MIRADOR SUR) no tiene actualización de StockUbicacion en este flujo.
- **`Movimiento`:** Se crea(n) TRANSFER.
- **`StockProductoADM`** de ADESA: **no cambia** (el update de destino está solo en el `else` de `if destino_es_adesa`).

**Qué no cambia:**
- **`StockProductoADM`** de ADESA: sigue en 10.

**Qué ve el usuario inmediatamente:**
- MIRADOR SUR: cache 5 (8-3).  
- ADESA: cache sigue 10; físico en la(s) ubicación(es) destino subió 3.

**Qué queda pendiente a sync:**
- Que la cache ADM de ADESA pase a 13 (o al valor de ADM) cuando se ejecute la sync.

**Observación sobre coherencia o diferencia temporal:** Asimetría: el origen (MIRADOR SUR) se actualiza en cache; el destino (ADESA) no. El usuario ve ADESA = 10 aunque el físico ya tenga 3 más hasta la sync.

---

### Caso 3D: MIRADOR SUR → SANTIAGO

**Caso:** SKU 123, MIRADOR SUR = 8, SANTIAGO = 3, se transfieren 2 unidades.

**Módulo que interviene:** Transferencias (origen_es_adesa False, destino_es_adesa False).

**Qué cambia en BD:**
- **`StockProductoADM`** de MIRADOR SUR: se **restan** 2 (origen no-ADESA).
- **`StockProductoADM`** de SANTIAGO: se **suman** 2 (destino no-ADESA); si no existe fila vigente, no se crea (solo se actualiza si existe).
- **`Movimiento`:** Se crea(n) TRANSFER (ubicacion_origen y ubicacion_destino como nombres de ubicación ADM, sin ubicaciones físicas WMS).
- **`StockUbicacion`:** No se toca. Ninguno de los dos es ADESA en el sentido del flujo que escribe físico (solo se actualiza StockUbicacion cuando destino_es_adesa u origen_es_adesa para las asignaciones físicas).

**Qué no cambia:**
- **`StockUbicacion`:** No interviene en este flujo para dos ubicaciones no-ADESA.

**Qué ve el usuario inmediatamente:**
- MIRADOR SUR: cache 6 (8-2).  
- SANTIAGO: cache 5 (3+2), si ya existía fila vigente para SANTIAGO; si no existía, la cache no muestra el incremento hasta la sync (el código no crea la fila).

**Qué queda pendiente a sync:**
- Solo si no existía fila vigente para SANTIAGO: que la sync cree/actualice ese registro. Si ya existía, no queda nada pendiente para este producto/ubicación en cuanto a cache.

**Observación sobre coherencia o diferencia temporal:** Es el caso más “macro ADM puro”: solo se actualizan las dos caches ADM y el movimiento; no se toca StockUbicacion. Coherente con el diseño actual para transferencias entre dos ubicaciones no-ADESA. Si SANTIAGO no tenía fila vigente, el +2 no se ve hasta la sync (el código no crea la fila en transferencias).

---

## 4) AJUSTES

### Caso 4A: Ajuste físico

**Caso:** SKU 123, en 2P1D01N1 había 10, se ajusta a 8.

**Módulo que interviene:** Ajustes (`routes/ajustes.py`, registrar ajuste con asignación tipo `fisica`).

**Qué cambia en BD:**
- **`StockUbicacion`:** Se actualiza la fila (product_id, ubicacion=2P1D01N1): `cantidad` pasa a 8 (o se crea la fila si no existía, con validación de que la ubicación exista en UbicacionFisica y esté activa).
- **`Movimiento`:** Se crea ADJUSTMENT si hay diferencia (cantidad=2, ubicacion_origen=2P1D01N1, notas con Anterior/Nuevo).

**Qué no cambia:**
- **`StockProductoADM`:** No se toca en el bloque de ajuste físico.

**Qué ve el usuario inmediatamente:**
- En consulta de producto: ubicación física 2P1D01N1 con 8; stock ADM (si se muestra por ubicación) sin cambio.

**Qué queda pendiente a sync:**  
- Nada obligatorio por este ajuste; el físico queda en 8.

**Observación sobre coherencia o diferencia temporal:** Coherente: solo se corrige el físico en una ubicación; la cache ADM no se modifica.

---

### Caso 4B: Ajuste ADM con fila vigente existente

**Caso:** SKU 123, MIRADOR SUR tenía 4 en stock vigente, se ajusta a 6.

**Módulo que interviene:** Ajustes (asignación tipo `adm`, ubicación ADM MIRADOR SUR).

**Qué cambia en BD:**
- **`StockProductoADM`:** Se obtiene el registro vigente con `obtener_stock_vigente`; se actualiza ese mismo registro: `stock` = 6, `updated_at` = ahora.
- **`Movimiento`:** Se crea ADJUSTMENT (cantidad=2, ubicacion_destino=MIRADOR SUR, notas con Anterior: 4, Nuevo: 6).

**Qué no cambia:**
- **`StockUbicacion`:** No se toca en el bloque de ajuste ADM.

**Qué ve el usuario inmediatamente:**
- En consulta de producto (y cualquier pantalla que use `obtener_stock_vigente`): MIRADOR SUR muestra 6.

**Qué queda pendiente a sync:**
- La sync puede sobrescribir ese valor con el que venga de ADM; el comentario en código indica que la sincronización sobrescribirá el valor pero mejora la UX.

**Observación sobre coherencia o diferencia temporal:** Coherente con el diseño: se actualiza la cache vigente y el usuario lo ve de inmediato; la sync puede traer después el valor de ADM.

---

### Caso 4C: Ajuste ADM sin fila vigente en staging

**Caso:** Sistema en staging, MIRADOR SUR tiene `current_run_id`, SKU 123 no tiene fila vigente en `StockProductoADM` para MIRADOR SUR, se ajusta a 5.

**Módulo que interviene:** Ajustes (asignación tipo `adm` para MIRADOR SUR).

**Qué cambia en BD:**
- **`StockProductoADM`:** Se **crea** una fila nueva (producto_id, location_id, location_name=MIRADOR SUR, stock=5, updated_at). Esa fila **no** recibe `sync_run_id` (el constructor en líneas 385-391 no lo asigna; queda NULL).
- **`Movimiento`:** Se crea ADJUSTMENT (cantidad=5, notas con Anterior: 0, Nuevo: 5).

**Qué no cambia:**
- No se modifica ninguna fila existente de StockProductoADM para ese producto/ubicación (porque no había fila vigente).

**Con qué `sync_run_id` se crea:**  
- **NULL.** El código no asigna `sync_run_id` al crear el registro.

**Si `obtener_stock_vigente` la vería o no:**  
- **No**, en staging. `obtener_stock_vigente` con `current_run_id` definido filtra por `sync_run_id = current_run_id`. La fila nueva tiene `sync_run_id = NULL`, por tanto no se devuelve.

**Qué vería el usuario justo después:**
- En consulta de producto (y cualquier lectura vía `obtener_stock_vigente`): MIRADOR SUR seguiría mostrando “sin stock” o 0 para ese SKU, no 5.

**Qué queda pendiente a sync:**
- Hasta que una sync cree un registro para ese producto/ubicación con el run vigente, el valor 5 del ajuste no es visible en las pantallas que usan stock vigente. La sync puede crear después un registro con valor de ADM, no necesariamente 5.

**Observación sobre coherencia o diferencia temporal:** Es una **inconsistencia real** del comportamiento actual: el usuario ejecuta un ajuste que deja un registro en BD, pero en modo staging ese registro no se considera vigente y no aparece en consultas hasta la próxima sync, y entonces el valor mostrado puede ser el de ADM, no el del ajuste.

---

*Documento de validación funcional; no se ha modificado ningún archivo del proyecto.*
