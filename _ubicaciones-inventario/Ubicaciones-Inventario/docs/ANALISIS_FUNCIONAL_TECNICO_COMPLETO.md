# Análisis funcional y técnico del comportamiento actual del sistema

**Alcance:** Diseño actual incluyendo registro, reversión, discrepancias, ADESA vs no-ADESA y tipos de documento. Sin cambios ni propuestas de implementación.

---

## A. Resumen por módulo

### Despacho

1. **Tipos de documento:** Factura Contado (CASH), Factura Crédito (CREDIT), Despacho/Conduce (DISPATCH, ORDER). El campo `tipo_factura` en `FacturaProcesada` se usa solo para el **nombre mostrado** (tipo_nombre); no cambia la lógica de registro ni de stock.
2. **Validaciones antes de registrar:** factura existe, SKU en la factura, cantidad ≤ pendiente, asignaciones con ubicación física válida (`validar_ubicacion`) y cantidad; para ítems con ubicación se exige al menos una asignación origen con bin y cantidad.
3. **Tablas al registrar:** `Movimiento` (PICK), `StockUbicacion` (resta en la ubicación física origen). `FacturaProcesada` se actualiza (estado_despacho, fecha_inicio, usuario_despachador, etc.).
4. **StockUbicacion:** Sí: se resta la cantidad de la(s) ubicación(es) física(s) indicada(s).
5. **StockProductoADM:** No se toca (solo lectura para mostrar stock ADM en UI).
6. **Movimiento:** Sí: se crea PICK por cada asignación.
7. **ADESA vs no-ADESA:** El despacho siempre sale de una **ubicación física** en `StockUbicacion` (el usuario elige el bin). Esa ubicación suele ser de ADESA porque solo ADESA tiene bins en WMS. El código no condiciona la escritura a “es_adesa”; siempre resta de `StockUbicacion` y nunca toca `StockProductoADM`.
8. **Pendiente a sync:** La cache ADM no se actualiza; hasta la próxima sync la consulta seguirá mostrando el valor anterior de ADM.
9. **Diferencia temporal:** Sí: físico baja y cache ADM no cambia.
10. **Revertir:** Endpoint `POST /api/despacho/<factura_guid>/revertir`, solo administrador. Elimina todos los movimientos PICK de esa factura, **restaura** la cantidad en cada `StockUbicacion` (ubicacion_origen del movimiento) sumando la cantidad del movimiento, y pone la factura en PENDIENTE. No toca `StockProductoADM`. Llama a `actualizar_discrepancias_por_skus` con los SKUs afectados. La reversión es **simétrica** respecto a lo que se modificó al registrar (solo físico).

---

### Recepción

1. **Tipos de documento:** Recepción (Conduce/Ajuste) — RECEPTION; Compra con Recepción (Proveedor) — VEND_REC / VENDOR_RECEPTION; Nota de Crédito (Devolución Cliente) — CREDIT_NOTE / CREDIT_NOTE_CUSTOMER / CUST_CRE. El tipo se usa para decidir qué API de ADM llamar (listar recepciones vs vendor vs credit note) y para mostrar; **no** cambia la lógica de escritura en inventario.
2. **Validaciones antes de registrar:** recepción no registrada previamente, SKU válido, para ítems (I) al menos una asignación con ubicación y cantidad; suma de asignaciones ≤ cantidad total por SKU.
3. **Tablas al registrar:** `Movimiento` (RECEIPT), y **solo si `es_adesa`** (REGLA DE ORO #4): `StockUbicacion` (suma en la ubicación indicada). Si no es ADESA, no se modifica `StockUbicacion`.
4. **StockUbicacion:** Sí **solo si** la ubicación ADM de la recepción es ADESA; entonces se suma en la(s) ubicación(es) física(s) indicada(s).
5. **StockProductoADM:** No se toca.
6. **Movimiento:** Sí: siempre se crea RECEIPT (auditoría); si no es ADESA, `ubicacion_destino` puede ser el nombre de la ubicación ADM (ej. MIRADOR SUR) o "NO-ADESA".
7. **ADESA vs no-ADESA:** Si **es_adesa:** se actualiza `StockUbicacion` y movimiento con ubicación física. Si **no-ADESA:** solo movimiento; no se toca `StockUbicacion`.
8. **Pendiente a sync:** Cache ADM no se actualiza; la sync luego traerá el valor de ADM.
9. **Diferencia temporal:** En ADESA: físico sube y cache ADM no; en no-ADESA solo hay registro de movimiento, sin cambio de físico ni cache.
10. **Revertir:** Endpoint `POST /api/recepciones/<recepcion_guid>/revertir`, solo administrador. Elimina todos los movimientos RECEIPT de esa recepción. **Solo si `es_adesa`** resta de `StockUbicacion` (ubicacion_destino del movimiento) la cantidad del movimiento; si no es ADESA no toca stock. Pone `RecepcionProcesada` en PENDIENTE. No toca `StockProductoADM`. Llama a `actualizar_discrepancias_por_skus` solo si es_adesa. **Simétrica** al registro: solo revierte físico cuando en el registro se tocó físico (ADESA).

---

### Transferencias

1. **Tipos de documento:** Solo documentos de **transferencia entre ubicaciones** en ADM (LocationTransfers); se buscan por DocID y se procesa el documento devuelto por ADM.
2. **Validaciones antes de registrar:** producto en la transferencia, asignaciones origen/destino según si origen/destino es ADESA (ubicaciones físicas obligatorias para ADESA), suma de asignaciones ≤ cantidad total; si origen es ADESA se valida stock físico y stock ADM vigente (no permitir si ADM ya en 0).
3. **Tablas al registrar:** `Movimiento` (TRANSFER). **StockUbicacion:** solo cuando la ubicación es ADESA: si origen es ADESA se resta de la(s) ubicación(es) física(s) origen; si destino es ADESA se suma en la(s) ubicación(es) física(s) destino. **StockProductoADM:** solo cuando la ubicación **no** es ADESA: si origen no es ADESA se resta en cache origen; si destino no es ADESA se suma en cache destino. Si origen o destino es ADESA, no se actualiza la cache ADM para esa ubicación.
4. **StockUbicacion:** Sí cuando interviene ADESA (origen o destino): resta en origen físico, suma en destino físico.
5. **StockProductoADM:** Sí **solo para ubicaciones no-ADESA:** resta en origen no-ADESA, suma en destino no-ADESA. ADESA como ubicación ADM **nunca** se actualiza en transferencias.
6. **Movimiento:** Sí: TRANSFER.
7. **ADESA vs no-ADESA:** Origen ADESA: solo físico (resta); destino ADESA: solo físico (suma). Origen/destino no-ADESA: solo cache ADM (resta/suma); no se escribe `StockUbicacion` para no-ADESA en este flujo.
8. **Pendiente a sync:** Cache ADM de ADESA no se actualiza en el registro; la sync luego puede “corregir” con valores de ADM. Para no-ADESA la cache se actualiza en el momento (comentarios en código: será sobrescrita en próxima sync).
9. **Diferencia temporal:** Sí cuando participa ADESA: físico y cache ADM pueden quedar desalineados hasta la sync.
10. **Revertir:** Endpoint `POST /api/transferencias/<transferencia_guid>/revertir`, solo administrador; solo si estado es PROCESADA. Elimina todos los movimientos TRANSFER. **Solo revierte StockUbicacion:** si destino_es_adesa resta en ubicacion_destino; si origen_es_adesa suma en ubicacion_origen (o crea la fila si no existía). **No revierte StockProductoADM.** Marca la transferencia como PENDIENTE. Llama a `actualizar_discrepancias_por_skus`. **No simétrica** respecto a cache ADM: lo que se sumó/restó en cache para no-ADESA en el registro no se deshace en la reversión; solo se deshace el físico cuando es ADESA.

---

### Ajustes

1. **Tipos:** Ajuste **individual** (por producto): tipo asignación `fisica` (ubicación física WMS) o `adm` (ubicación ADM macro). Ajuste **masivo** por Excel: solo ubicaciones **físicas** (se valida que la ubicación exista en `UbicacionFisica`).
2. **Validaciones:** Individual: SKU/producto existe; para físico: ubicación en `UbicacionFisica` activa; para ADM: location_id y opcionalmente producto. Masivo Excel: columnas SKU/Product ID, ubicación, cantidad; ubicación debe existir en `UbicacionFisica` y estar activa.
3. **Tablas al registrar:** **Individual físico:** `StockUbicacion`, `Movimiento` (ADJUSTMENT). **Individual ADM:** `StockProductoADM` (actualizar vigente o crear fila sin `sync_run_id`), `Movimiento`. **Masivo Excel:** solo `StockUbicacion` y `Movimiento` (misma lógica que físico por fila).
4. **StockUbicacion:** Sí en ajuste físico individual y en masivo Excel.
5. **StockProductoADM:** Sí **solo** en ajuste individual tipo ADM (actualiza o crea; al crear no asigna `sync_run_id` en staging).
6. **Movimiento:** Sí en todos (ADJUSTMENT).
7. **ADESA vs no-ADESA:** En individual ADM la “ubicación” es una ubicación ADM (ej. MIRADOR SUR); no hay rama especial por nombre ADESA en la escritura de cache. En físico y Excel solo importa que la ubicación sea física (código de bin).
8. **Pendiente a sync:** Ajuste ADM se sobrescribe cuando la sync trae valores de ADM; si se creó fila sin run en staging, esa fila no es “vigente” hasta que la sync cree registro con run.
9. **Diferencia temporal:** En ajuste ADM con fila vigente la cache se actualiza de inmediato; en ajuste ADM sin fila vigente (staging) el usuario puede no ver el cambio (inconsistencia). En físico/Excel no se toca cache.
10. **Revertir:** Endpoint `POST /api/ajustes/<ajuste_id>/revertir`, solo administrador. `ajuste_id` = `timestamp_ubicacion` (ej. `2025-01-01T12:00:00_2P1D01N1`). Busca movimientos ADJUSTMENT con ese `timestamp` y `ubicacion_destino`. Si **es ubicación física** (existe en UbicacionFisica o heurística): restaura `StockUbicacion` a “cantidad anterior” extraída de las notas del movimiento, o decrementa por la cantidad del movimiento; elimina el movimiento. Si **no es ubicación física** (ajuste ADM): **solo elimina** el movimiento; **no** revierte `StockProductoADM`. Por tanto la reversión del ajuste ADM **no es simétrica**: la cache queda en el valor ajustado.

---

## B. Validación por escenarios

### A. RECEPCIONES

**A1 – Recepción en ADESA (SKU 123, sync ADESA=10, reciben 5 en 2P1D01N1)**  
- Tablas: `StockUbicacion` (sube +5 en 2P1D01N1), `Movimiento` (RECEIPT).  
- `StockProductoADM`: no cambia (sigue 10).  
- Usuario: físico +5 en 2P1D01N1; ADM ADESA sigue 10.  
- Sync: actualizará cache ADESA con el valor de ADM (ej. 15).  
- **Revertir:** Solo admin. Elimina movimientos RECEIPT; como es_adesa, **resta** 5 de `StockUbicacion` en 2P1D01N1. No toca `StockProductoADM`. RecepcionProcesada → PENDIENTE. `actualizar_discrepancias_por_skus` para los SKUs. Queda simétrico con el registro.

**A2 – Recepción en no-ADESA (SKU 123, MIRADOR SUR=8, reciben 4)**  
- Solo se crea `Movimiento` (RECEIPT, ubicacion_destino tipo MIRADOR SUR o NO-ADESA).  
- No se modifica `StockUbicacion` ni `StockProductoADM`.  
- Usuario: cache MIRADOR SUR sigue 8; no hay cambio de físico.  
- Pendiente a sync: que la cache pase a 12 cuando la sync traiga el valor.  
- **Revertir:** Elimina movimientos; como no es_adesa, **no** modifica `StockUbicacion`. No toca `StockProductoADM`. Simétrico (no se había tocado nada de stock).

**A3 – Diferencia por tipo de documento en recepción**  
- **Recepción (Conduce/Ajuste), Compra con Recepción (Proveedor), Nota de Crédito (Devolución Cliente):** en el código de registro se usa el mismo criterio: si `es_adesa` se actualiza `StockUbicacion`; si no, solo `Movimiento`. El tipo (`tipo_recepcion`) influye en qué API de ADM se llama y en la presentación, **no** en qué tablas se escriben.  
- Todos tocan inventario igual en función de es_adesa.  
- Revertir se comporta igual: solo revierte físico cuando es_adesa.

---

### B. DESPACHOS

**B1 – Despacho desde ADESA (SKU 123, ADESA cache=10, físico 10 en 2P1D01N1, despachan 3)**  
- Baja: `StockUbicacion` (2P1D01N1 pasa a 7), `Movimiento` (PICK).  
- `StockProductoADM`: no cambia (sigue 10).  
- Usuario: físico 7; ADM ADESA sigue 10.  
- Pendiente a sync: que la cache refleje el valor de ADM.  
- **Revertir:** Solo admin. Elimina PICKs; **suma** 3 de vuelta en `StockUbicacion` (ubicacion_origen). No toca `StockProductoADM`. Factura → PENDIENTE. Discrepancias por SKUs. Simétrico.

**B2 – Despacho desde no-ADESA (MIRADOR SUR cache=8, despachan 3)**  
- El flujo exige **ubicación física** en cada asignación; esa ubicación debe existir en `StockUbicacion` y tener stock. Si en WMS solo hay bins de ADESA, el “despacho desde MIRADOR SUR” sería despacho de un documento cuya ubicación ADM es MIRADOR SUR pero el pick se hace desde un bin (que típicamente sería ADESA). El código no distingue: siempre resta de la ubicación física indicada y no toca `StockProductoADM`.  
- Si hubiera `StockUbicacion` con ubicación “MIRADOR SUR” o similar: bajaría esa y se crearía PICK; al revertir se restauraría esa misma ubicación.  
- Comportamiento respecto a BD: igual que B1 (solo físico y movimiento); no se actualiza cache ADM. Revertir restaura el físico indicado en el movimiento.

**B3 – Diferencia por tipo de documento en despacho**  
- Factura Contado, Factura Crédito, Despacho/Conduce: el registro usa la misma lógica (asignaciones con ubicación física, resta de `StockUbicacion`, creación de PICK). `tipo_factura` solo cambia el texto mostrado (tipo_nombre).  
- Todos descuentan inventario igual (por ubicación física).  
- Todos permiten revertir (mismo endpoint por factura_guid).  
- Todos disparan `actualizar_discrepancias_por_skus` tras registrar y tras revertir; no crean discrepancias (solo actualizan/resuelven las existentes).

---

### C. TRANSFERENCIAS

**C1 – ADESA → ADESA (mover 4 de 2P1D01N1 a 2P1D02N1)**  
- Normalmente esto se hace por **Ajustes** (dos ajustes físicos) si no hay documento ADM de transferencia ADESA→ADESA.  
- Si existe documento ADM ADESA→ADESA y se usa Transferencias: solo cambian `StockUbicacion` (resta 4 origen, suma 4 destino) y `Movimiento` (TRANSFER). No se toca `StockProductoADM` (ambos lados ADESA).  
- Usuario: físico reorganizado; cache ADESA igual.  
- **Revertir:** Solo admin, solo si PROCESADA. Revierte `StockUbicacion` (suma en origen, resta en destino) y elimina movimientos. No toca `StockProductoADM`. Simétrico para lo que se modificó (solo físico).

**C2 – ADESA → MIRADOR SUR (ADESA=10, MIRADOR SUR=2, transfieren 4)**  
- ADESA: solo baja `StockUbicacion` (origen físico -4). No cambia `StockProductoADM` de ADESA.  
- MIRADOR SUR: sube `StockProductoADM` (+4 → 6). No se toca `StockUbicacion` (destino no-ADESA).  
- Usuario: ADESA cache 10, físico origen -4; MIRADOR SUR cache 6.  
- Sync: traerá valores de ADM y sobrescribirá (ej. ADESA 6, MIRADOR SUR 6).  
- **Revertir:** Revierte `StockUbicacion` en ADESA (vuelve a sumar 4 en origen). **No** resta 4 de `StockProductoADM` de MIRADOR SUR. Tras revertir: físico ADESA correcto; cache MIRADOR SUR sigue en 6 (debería volver a 2). **No simétrico** en cache.

**C3 – MIRADOR SUR → ADESA (MIRADOR SUR=8, ADESA=10, transfieren 3)**  
- Baja `StockProductoADM` MIRADOR SUR (8→5). Sube `StockUbicacion` en ADESA (destino +3). No sube `StockProductoADM` de ADESA.  
- Usuario: MIRADOR SUR 5; ADESA cache 10, físico destino +3.  
- Pendiente a sync: que cache ADESA pase a 13 (o valor de ADM).  
- **Revertir:** Resta en `StockUbicacion` destino ADESA (quita los 3). **No** suma de vuelta en `StockProductoADM` de MIRADOR SUR. Tras revertir: físico ADESA bien; cache MIRADOR SUR sigue 5 (debería 8). **No simétrico** en cache.

**C4 – MIRADOR SUR → SANTIAGO (8, 3, transfieren 2)**  
- Baja `StockProductoADM` origen (8→6); sube `StockProductoADM` destino (3→5) **si ya existía fila vigente**; si no existía, el código no crea la fila (solo actualiza). No se toca `StockUbicacion`.  
- Usuario: si SANTIAGO tenía fila vigente, ve 6 y 5; si no, solo ve 6 en MIRADOR SUR.  
- **Revertir:** Solo revierte `StockUbicacion` cuando origen o destino es ADESA; aquí ninguno es ADESA, así que **no revierte ningún stock** (solo elimina movimientos). Cache MIRADOR SUR y SANTIAGO quedan en 6 y 5. **No simétrico**: lo que se cambió en cache no se deshace. Es el caso más “macro ADM puro” en registro (solo cache), y la reversión no toca esa cache.

---

### D. AJUSTES

**D1 – Ajuste físico individual (2P1D01N1 de 10 a 8)**  
- Cambian: `StockUbicacion` (cantidad=8), `Movimiento` (ADJUSTMENT, cantidad=2, notas con Anterior/Nuevo).  
- `StockProductoADM` no cambia.  
- Usuario: ve 8 en esa ubicación.  
- **Revertir:** Ajuste_id = timestamp_ubicacion. Si es ubicación física: restaura `StockUbicacion` a la “cantidad anterior” de las notas (10) o decrementa por la cantidad del movimiento; elimina movimiento. Simétrico.

**D2 – Ajuste ADM individual con fila vigente (MIRADOR SUR 4→6)**  
- Se actualiza el registro vigente de `StockProductoADM` a 6 y se crea `Movimiento` (ADJUSTMENT).  
- Usuario lo ve de inmediato (6).  
- Sync puede sobrescribir después con valor de ADM.  
- **Revertir:** Se identifica por timestamp y ubicacion_destino (nombre ADM, ej. MIRADOR SUR). Como no es “ubicación física” (no está en UbicacionFisica con ese código), **solo se elimina** el movimiento; **no** se revierte `StockProductoADM`. La cache queda en 6. **No simétrico.**

**D3 – Ajuste ADM sin fila vigente en staging (MIRADOR SUR con current_run_id, SKU 123 sin fila vigente, ajuste a 5)**  
- Se **crea** fila en `StockProductoADM` con stock=5, **sync_run_id = NULL**.  
- `obtener_stock_vigente` en staging no la devuelve (filtra por current_run_id).  
- Usuario no ve el 5 en consulta hasta que una sync cree registro con run.  
- **Revertir:** Se elimina el movimiento; como es ajuste ADM, no se toca `StockProductoADM`. La fila creada (con 5 y sync_run_id=NULL) **permanece**; no hay lógica que la borre. Inconsistencia: ajuste “revirtiendo” no quita el valor ni la fila.  
- Es una **inconsistencia real** del diseño actual.

**D4 – Ajuste masivo por Excel**  
- **Validación:** Columnas SKU/Product ID, ubicación, cantidad; ubicación debe existir en `UbicacionFisica` y estar activa. No se permiten ubicaciones ADM en el Excel (solo físicas).  
- **Tablas:** Solo `StockUbicacion` y `Movimiento` (ADJUSTMENT). Mismo patrón que ajuste físico individual por fila.  
- No toca `StockProductoADM`; no crea filas con run_id NULL.  
- **Reversión:** El revertir ajuste usa `ajuste_id` = timestamp_ubicacion. En Excel se usa un timestamp común por carga y cada fila tiene distinta ubicación; cada par (timestamp, ubicacion) identifica un “ajuste” reversible. No hay un solo “revertir toda la carga Excel”; se revierte por cada (timestamp, ubicacion). Para cada uno, si es ubicación física (siempre en Excel), se restaura `StockUbicacion` y se elimina(n) el/los movimiento(s). No tiene los riesgos del ajuste ADM sin fila vigente porque no escribe `StockProductoADM`.  
- Tras la carga se llama `actualizar_discrepancias_por_skus` (puede marcar discrepancias como resueltas si físico y ERP coinciden).

---

## C. Reversión por módulo

### Recepción

- **Quién:** Solo administrador (`@require_admin`).  
- **Condición:** Existir movimientos RECEIPT con ese recepcion_guid.  
- **Tablas:** Se eliminan los `Movimiento` (RECEIPT). Si `es_adesa`: se **resta** en `StockUbicacion` (ubicacion_destino, por movimiento). Se actualiza `RecepcionProcesada` (PENDIENTE, limpia fecha_inicio, completed_at, usuario_procesador).  
- **Simétrica al registro:** Sí: solo revierte físico cuando en el registro se sumó físico (ADESA).  
- **StockUbicacion:** Se revierte solo si es_adesa.  
- **StockProductoADM:** No se toca (tampoco se tocó al registrar).  
- **Movimiento:** Solo se elimina; no se crea otro de “reversión”.  
- **Usuario tras revertir:** Recepción en PENDIENTE; si era ADESA, el físico vuelve a bajar.  
- **Pendiente a sync:** Nada adicional; la cache ADM no se había modificado.  
- **Riesgo:** Ninguno por no-ADESA (no se tocó stock). En ADESA es coherente con el registro.

---

### Despacho

- **Quién:** Solo administrador.  
- **Condición:** Existir movimientos PICK con ese factura_guid.  
- **Tablas:** Se eliminan los `Movimiento` (PICK). Se **suma** en `StockUbicacion` (ubicacion_origen de cada movimiento) la cantidad del movimiento. Se actualiza `FacturaProcesada` (PENDIENTE, limpia fecha_inicio, completed_at, usuario_despachador).  
- **Simétrica:** Sí: el registro restaba de esa ubicación; la reversión suma en la misma.  
- **StockUbicacion:** Se revierte siempre (por cada movimiento).  
- **StockProductoADM:** No se toca.  
- **Movimiento:** Solo se elimina.  
- **Usuario tras revertir:** Factura PENDIENTE; físico restaurado en los bins de origen.  
- **Pendiente a sync:** Nada; cache no se modificó.  
- **Riesgo:** Bajo; el despacho siempre modificó solo físico por bin; la reversión restaura ese mismo físico.

---

### Transferencias

- **Quién:** Solo administrador.  
- **Condición:** Transferencia en estado PROCESADA y existir movimientos TRANSFER con ese transferencia_guid.  
- **Tablas:** Se eliminan los `Movimiento` (TRANSFER). **Solo se revierte StockUbicacion:** si destino_es_adesa se **resta** en ubicacion_destino; si origen_es_adesa se **suma** en ubicacion_origen (o se crea la fila si no existía). **No** se modifica `StockProductoADM`. Se marca transferencia PENDIENTE.  
- **Simétrica:** **No.** Lo que se cambió en cache ADM (origen/destino no-ADESA) no se deshace. Solo se deshace el físico cuando participa ADESA.  
- **StockUbicacion:** Se revierte cuando origen o destino es ADESA.  
- **StockProductoADM:** No se revierte.  
- **Movimiento:** Solo se elimina.  
- **Usuario tras revertir:** Físico corregido donde había ADESA; cache de no-ADESA queda con el valor que había tras el registro (incorrecto si se esperaba “deshacer” todo).  
- **Pendiente a sync:** La sync puede volver a alinear cache con ADM, pero hasta entonces la cache no-ADESA queda “en adelante” o “atrás” respecto al estado físico revertido.  
- **Riesgo:** **Alto:** transferencias que involucran no-ADESA dejan cache desalineada tras revertir; no hay compensación en el código.

---

### Ajustes

- **Quién:** Solo administrador.  
- **Condición:** `ajuste_id` = timestamp_ubicacion válido y existir movimientos ADJUSTMENT con ese timestamp y ubicacion_destino.  
- **Tablas:** Se eliminan esos `Movimiento` (ADJUSTMENT). Si **es ubicación física:** se restaura `StockUbicacion` (cantidad anterior desde notas o por decremento). Si **no es ubicación física** (ajuste ADM): **no** se toca `StockProductoADM`.  
- **Simétrica:** Solo para ajuste físico. Para ajuste ADM **no**: la cache queda en el valor ajustado.  
- **StockUbicacion:** Se revierte solo cuando es ubicación física.  
- **StockProductoADM:** No se revierte nunca en la reversión.  
- **Movimiento:** Solo se elimina.  
- **Usuario tras revertir:** En físico ve la cantidad anterior; en ADM sigue viendo el valor del ajuste hasta sync o nuevo ajuste.  
- **Pendiente a sync:** En ajuste ADM la sync puede sobrescribir; hasta entonces la cache queda “ajustada”.  
- **Riesgo:** Ajuste ADM revertido deja la cache con el valor que ya no debería tener según la intención del usuario; ajuste ADM sin fila vigente (D3) además deja una fila “fantasma” (sync_run_id NULL) que no se elimina al revertir.

---

## D. Discrepancias

### Cómo se calculan

- **Creación de registros `Discrepancia`:** Solo en el flujo de **sincronización** (staging), al procesar una ubicación. Cuando la sync está completa y la ubicación es **ADESA**, se llama a `validar_adm_vs_fisico(run_id_new, location_id, location_name)`: compara stock ADM del run nuevo con la suma de `StockUbicacion` por SKU. Si ADM=0 y físico>0 se considera **crítica**; si hay diferencia >20% con físico>0 se considera **alta**. Esas discrepancias se usan para poblar `EnRevision` (top por severidad). Además, en el mismo flujo de sync, cuando un producto existía en el run anterior y en el nuevo tiene stock 0 en ADM pero sigue con stock físico, se **crea** (o actualiza) un registro en la tabla **`Discrepancia`**: producto_id, location_id, location_name, ubicacion_fisica, stock_erp=0, stock_fisico_wms=total físico, tipo='critica', estado='pendiente'.  
- **Actualización/resolución:** `actualizar_discrepancias_por_skus(skus)` no **crea** discrepancias. Recalcula `stock_fisico_wms` desde `StockUbicacion` para cada discrepancia **pendiente** de esos SKUs; si |stock_fisico_wms - stock_erp| < 0.01, marca la discrepancia como **resuelto** y fecha_resolucion. Es decir: las discrepancias se **crean** en la sync (ADM vs físico, solo ADESA); las operaciones que cambian físico o cache solo pueden **actualizar** el físico en la discrepancia y eventualmente **resolverla** si queda alineada con el ERP.

### Tablas

- **Discrepancia:** producto_id, sku, location_id, location_name, ubicacion_fisica, stock_erp, stock_fisico_wms, tipo, estado (pendiente/resuelto/etc.), fechas.  
- **StockUbicacion** (para recalcular físico en actualizar_discrepancias_por_skus).  
- **ProductoADM** (para resolver producto_id por SKU).  
- **EnRevision** (en sync, para top discrepancias por run; no es la tabla principal de negocio de “discrepancia” que ve el usuario).

### Momento en que se generan

- En la **sincronización por ubicación** (staging), cuando la ubicación es ADESA y la sync completa: al comparar run nuevo vs run anterior y al cruzar ADM nuevo vs `StockUbicacion`. Solo se **persisten** en `Discrepancia` las de tipo “ADM=0 y físico>0” (y actualización de existentes). Otras (cambio brusco, alta diferencia) alimentan `EnRevision` y el email.

### Qué compara

- **Creación en sync:** Stock ADM (run nuevo) vs suma de `StockUbicacion` por SKU (solo ADESA).  
- **Resolución:** stock_erp (guardado en Discrepancia) vs nuevo stock_fisico_wms recalculado desde `StockUbicacion`.

### Diferencias temporales hasta la sync

- El diseño no “considera normales” explícitamente las diferencias temporales; las discrepancias se marcan cuando en el momento de la sync hay desfase (sobre todo ADM=0 y físico>0). Recepciones/despachos/transferencias que no actualizan cache ADM generan desfase hasta la próxima sync; esa sync puede crear nuevas discrepancias (si después de traer ADM sigue habiendo ADM=0 y físico>0) o no crearlas si ADM ya refleja los movimientos.

### Impacto por caso

- **Recepción ADESA:** Sube físico; no toca cache. Si luego la sync trae ADM actualizado, puede no haber discrepancia; si la sync trae ADM=0 y el físico es >0, se crea discrepancia crítica. Tras revertir recepción, se llama actualizar_discrepancias_por_skus: se recalcula físico; si coincide con stock_erp, se marca resuelto.  
- **Recepción no-ADESA:** No toca físico ni cache; no afecta discrepancias de ADESA (las discrepancias son solo ADESA).  
- **Despacho ADESA:** Baja físico; no toca cache. Puede aumentar desfase ADM vs físico hasta la sync. Tras revertir, actualizar_discrepancias_por_skus puede resolver si el físico vuelve a coincidir con el ERP de la discrepancia.  
- **Transferencia ADESA → no-ADESA:** Baja físico en ADESA; sube cache en no-ADESA. Discrepancias solo se calculan para ADESA; el desfase en ADESA (físico bajó, cache no) puede dar lugar a discrepancia en la siguiente sync si ADM no se actualizó. Revertir no corrige la cache no-ADESA.  
- **Transferencia no-ADESA → ADESA:** Baja cache no-ADESA; sube físico ADESA. Mismo tipo de desfase en ADESA hasta la sync. Revertir restaura físico ADESA pero no la cache no-ADESA.  
- **Ajuste físico:** Cambia solo físico; puede acercar o alejar del ERP y por tanto contribuir a resolver o a que en la siguiente validación (sync) aparezca discrepancia.  
- **Ajuste ADM:** Cambia cache ADM; no cambia `StockUbicacion`. No afecta directamente las discrepancias (que comparan ERP con físico); la sync luego puede sobrescribir esa cache.  
- **Ajuste ADM invisible en staging:** No cambia el “vigente” que usa la comparación ADM vs físico en sync (porque la fila no es vigente); el físico no cambia. Impacto en discrepancias indirecto.  
- **Reversión:** En recepción y despacho, al revertir se llama actualizar_discrepancias_por_skus; puede **resolver** discrepancias si el nuevo físico coincide con stock_erp. En transferencias y ajustes la reversión **no** revierte cache ADM; si la discrepancia existía por desfase físico vs ERP, revertir el físico (en transferencias cuando hay ADESA) puede hacer que actualizar_discrepancias_por_skus resuelva esa discrepancia; si la discrepancia dependía de cache no-ADESA, la reversión no la corrige porque no toca esa cache.

### Reversión y discrepancia previa

- **Recepción/Despacho revertir:** Recalcula físico por SKU y actualiza Discrepancia; si |físico - stock_erp| < 0.01, marca **resuelto**. Puede **limpiar/corregir** una discrepancia previa.  
- **Transferencias revertir:** Solo revierte físico cuando hay ADESA; actualizar_discrepancias_por_skus puede resolver si el físico vuelve a coincidir con el ERP; las discrepancias no se “ensucian” por cache no-ADESA porque las Discrepancias son solo para ADESA (stock_erp vs físico).  
- **Ajustes revertir:** En físico, mismo efecto que arriba; en ADM, la reversión no toca cache ni recalcula ERP, por tanto no “corrige” una discrepancia que fuera por desfase ADM vs físico (la discrepancia sigue con el mismo stock_erp; el físico no cambió en ajuste ADM).

---

## E. Conclusión final

### Cómo funciona hoy realmente

- **Recepción:** Solo actualiza físico (`StockUbicacion`) cuando la ubicación del documento es ADESA; siempre crea `Movimiento` (RECEIPT). No toca `StockProductoADM`. Revertir solo revierte físico cuando es_adesa.  
- **Despacho:** Siempre resta de `StockUbicacion` (ubicación física elegida) y crea PICK; no toca `StockProductoADM`. Revertir restaura ese mismo físico.  
- **Transferencias:** Si la ubicación es ADESA (origen o destino), solo mueve `StockUbicacion`; si es no-ADESA, actualiza `StockProductoADM` (resta origen, suma destino). Revertir solo deshace `StockUbicacion` cuando hay ADESA; no deshace cambios en `StockProductoADM`.  
- **Ajustes:** Físico: solo `StockUbicacion` y `Movimiento`; ADM: actualiza o crea `StockProductoADM` (al crear en staging sin sync_run_id puede quedar invisible). Revertir físico restaura `StockUbicacion`; revertir ajuste ADM solo elimina el movimiento, no la cache.  
- **Discrepancias:** Se **crean** en la sync (solo ADESA, ADM vs físico); las operaciones solo pueden **actualizar** el físico en la discrepancia y **marcar resuelto** si cuadra con el ERP.

### Qué regla parece seguir ADESA

- En **recepción** y **transferencias**, cuando la ubicación es ADESA el sistema solo escribe **stock físico** (`StockUbicacion`); **no** actualiza la cache ADM para ADESA. La idea efectiva es: “ADESA es el WMS físico; la cache ADM de ADESA la trae la sync”.  
- En **despacho** no hay rama “solo si ADESA”; siempre se descuenta de la ubicación física indicada (que en la práctica suele ser de ADESA).  
- En **reversión**, para recepción solo se revierte físico si es_adesa; para transferencias solo se revierte `StockUbicacion` cuando origen o destino es ADESA; nunca se revierte `StockProductoADM` en ningún módulo.

### Qué regla parece seguir no-ADESA

- En **recepción** no-ADESA: no se toca `StockUbicacion` ni `StockProductoADM`; solo auditoría (Movimiento).  
- En **transferencias** cuando la ubicación es no-ADESA: sí se actualiza `StockProductoADM` (resta en origen, suma en destino); no se escribe `StockUbicacion` para esas ubicaciones. La reversión **no** deshace esos cambios en cache.

### Qué módulos tocan físico

- **Recepción:** Solo si es_adesa.  
- **Despacho:** Siempre (ubicación física del pick).  
- **Transferencias:** Solo cuando origen o destino es ADESA (bins físicos).  
- **Ajustes:** Individual físico y masivo Excel (solo físico).

### Qué módulos tocan cache ADM

- **Transferencias:** Solo para ubicaciones **no-ADESA** (origen y/o destino).  
- **Ajustes:** Solo en ajuste individual tipo ADM (actualizar o crear fila; crear puede ser con sync_run_id NULL en staging).  
- Recepción y Despacho no tocan cache ADM.

### Qué inconsistencias reales existen hoy

1. **Transferencias revertir no revierte cache ADM:** Tras revertir una transferencia que modificó no-ADESA, la cache de esas ubicaciones queda con el valor post-registro (no se deshace).  
2. **Ajuste ADM revertir no revierte cache:** El valor ajustado permanece en `StockProductoADM`; solo se elimina el movimiento.  
3. **Ajuste ADM sin fila vigente en staging:** Se crea fila con sync_run_id NULL; no es visible en consultas vigentes; al revertir no se borra esa fila ni se restaura ningún valor.  
4. **Transferencia entre dos no-ADESA (ej. MIRADOR SUR → SANTIAGO):** Al revertir no se toca ningún stock (ni físico ni cache); solo se borran movimientos; la cache queda desalineada con la intención “revertida”.

### Qué preguntas de arquitectura siguen abiertas antes de tocar código

1. ¿Es deseable que la reversión de transferencias también revierta los cambios en `StockProductoADM` para origen y destino no-ADESA?  
2. ¿Debe la reversión de un ajuste ADM restablecer el valor anterior en `StockProductoADM` (o eliminar la fila si se había creado)?  
3. ¿En staging, los ajustes ADM que crean fila deberían asignar `current_run_id` para ser vigentes de inmediato, o debe ser la sync la única que escribe filas con run_id?  
4. ¿Se quiere documentar explícitamente que “solo la sync actualiza la cache ADM de ADESA” y que “las transacciones pueden actualizar cache solo para no-ADESA (transferencias y ajustes ADM)”?  
5. ¿Las discrepancias deben seguir limitadas a ADESA (ADM vs físico) o se contempla extender el concepto a otras ubicaciones?

---

*Documento de análisis; no se ha modificado ningún archivo del proyecto.*
