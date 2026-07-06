# Informe técnico y funcional: Stock ADM, cache local, transacciones WMS y ajustes

**Alcance:** Análisis del diseño actual sin proponer cambios ni modificar código.  
**Fuente:** Código en `routes/`, `database/models.py`, `utils/helpers.py`, `api/adm_cloud.py`.

---

## Parte 1: Cómo funciona hoy el sistema

### 1.1 Cómo entra el stock de ADM a la BD local (sync)

Existen **dos flujos de sincronización** en el código:

**A) Sync “legacy” (todos los productos y todas las ubicaciones en un solo proceso)**  
- **Ruta:** `POST /api/sincronizar/productos` → `sincronizar_productos()`.  
- **Flujo:**  
  1. Obtiene ítems de ADM vía `adm_client._make_request("items/", {skip, take})` en lotes hasta un tope (ej. 5000).  
  2. Obtiene ubicaciones ADM con `obtener_ubicaciones()`.  
  3. Por cada ubicación llama a `obtener_stock(location_id, skip, take)` paginando hasta agotar ítems.  
  4. Escribe/actualiza `ProductoADM` y, por cada producto y cada ubicación, crea o actualiza **`StockProductoADM`** (producto_id, location_id, location_name, stock, updated_at).  
- **Importante:** En este flujo **no se asigna `sync_run_id`** a los registros de `StockProductoADM`. Los registros quedan con `sync_run_id = NULL`.

**B) Sync “staging” (por ubicación, con runs)**  
- **Ruta:** `POST /api/sincronizar/ubicacion/<location_id>` → `sincronizar_ubicacion()` → `run_sync_ubicacion()`.  
- **Flujo:**  
  1. Por esa ubicación se crea un **nuevo `SyncRun`** (running).  
  2. Se actualiza `SyncLocationStatus` con `running_run_id = nuevo_run.run_id` (aún no se cambia `current_run_id`).  
  3. Se obtiene stock de ADM para esa ubicación (paginado) y se escriben filas en **`StockProductoADM`** con **`sync_run_id = nuevo_run.run_id`**.  
  4. Al finalizar bien: **swap atómico** `estado_sync.current_run_id = nuevo_run.run_id` y `running_run_id = None`.  
  5. El “stock vigente” (LIVE) pasa a ser el del nuevo run; los registros del run anterior siguen en BD pero dejan de leerse como vigentes.

En ambos casos la **fuente de verdad** del valor es la API de ADM; la BD local actúa como **caché** de ese estado.

---

### 1.2 Tablas/modelos que guardan ese stock

- **`ProductoADM`**  
  Catálogo de productos (item_id, sku, nombre, codigo_barras, etc.). No guarda cantidades.

- **`StockProductoADM`**  
  Stock por producto y por ubicación ADM.  
  Campos relevantes: `producto_id`, `location_id`, `location_name`, `stock`, `sync_run_id` (nullable), `updated_at`.  
  En modo legacy, `sync_run_id` es NULL. En modo staging, cada fila pertenece a un run (`sync_run_id`).

- **`SyncLocationStatus`**  
  Una fila por ubicación ADM.  
  Campos: `location_id`, `location_name`, `status`, `current_run_id` (run “LIVE”), `running_run_id` (run en curso), `last_sync_at`, etc.

- **`SyncRun`**  
  Una fila por ejecución de sync de una ubicación (en el flujo staging): `run_id`, `location_id`, `location_name`, `status`, `started_at`, `finished_at`, etc.

- **`StockUbicacion`**  
  Stock **físico WMS** por producto y **ubicación física** (ej. pasillo/estante).  
  No es “stock ADM”; es el inventario interno por ubicación física (ADESA u otras).  
  Campos: `product_id` (ItemID), `sku`, `ubicacion` (código físico), `cantidad`, `updated_at`.

- **`Movimiento`**  
  Auditoría de operaciones: RECEIPT, PICK, TRANSFER, ADJUSTMENT.  
  No almacena “stock actual”; solo historial de movimientos.

---

### 1.3 Cómo se consulta ese stock en el WMS

- **Consulta “stock ADM por ubicación” (vigente):**  
  Se usa de forma centralizada **`obtener_stock_vigente(producto_id, location_id)`** en `utils/helpers.py`:
  - Lee `SyncLocationStatus` para esa `location_id`.
  - Si existe `current_run_id`: devuelve el **único** registro de `StockProductoADM` con ese `producto_id`, `location_id` y **`sync_run_id = current_run_id`**.
  - Si no hay `current_run_id` (legacy): devuelve el registro con ese `producto_id`, `location_id` y **`sync_run_id = NULL`**.

Todo el sistema que necesita “stock ADM actual” (consulta de productos, transferencias, ajustes ADM, etc.) debe usar este helper para no mezclar runs y mantener una única noción de “stock vigente”.

- **Consulta stock físico WMS:**  
  Lectura directa de `StockUbicacion` (por product_id/sku y ubicación).

---

### 1.4 Qué pasa cuando una transacción del WMS afecta un producto

#### Recepción (`routes/recepciones.py`)

- **Qué hace:**  
  Registra la recepción creando filas en **`Movimiento`** (tipo RECEIPT) y, **solo si la ubicación ADM de la recepción es ADESA**, actualiza o crea filas en **`StockUbicacion`** (suma cantidad a la ubicación física indicada).  
- **Qué no hace:**  
  **No modifica `StockProductoADM`**. La cache ADM local no se toca.

#### Despacho (`routes/despacho.py`)

- **Qué hace:**  
  Resta cantidad de **`StockUbicacion`** (ubicación física de origen) y crea **`Movimiento`** (tipo PICK).  
- **Qué no hace:**  
  **No modifica `StockProductoADM`**. La cache ADM local no se toca.

#### Transferencia (`routes/transferencias.py`)

- **Origen (ubicación ADM de origen):**  
  Si hay `location_id_origen` y producto encontrado, se obtiene el stock vigente con `obtener_stock_vigente(producto_db.id, location_id_origen)` y **se modifica ese mismo registro de `StockProductoADM`**: se resta la cantidad transferida (`stock_nuevo = max(0, stock_anterior - cantidad_total)`). Comentario en código: “será sobrescrito en próxima sync”.

- **Destino:**  
  - Si **destino es ADESA:** solo se actualiza **`StockUbicacion`** (suma en ubicación física destino) y se crea **`Movimiento`** (TRANSFER). **No se actualiza `StockProductoADM`** para la ubicación ADM destino (ADESA).  
  - Si **destino NO es ADESA:** se obtiene el stock vigente de destino con `obtener_stock_vigente` y **sí se actualiza ese registro de `StockProductoADM`** (suma la cantidad). Comentario: “será sobrescrito en próxima sync”.

Resumen: la transferencia **sí** actualiza la cache ADM para el **origen** (restar) y para el **destino solo cuando no es ADESA** (sumar). Para destino ADESA solo se mueve stock físico en WMS; la cache ADM de ADESA no se incrementa hasta la próxima sync.

---

### 1.5 Cómo interactúan con SyncRun, SyncLocationStatus, current_run_id y “stock vigente”

- **`obtener_stock_vigente`** es el único punto de lectura de “stock ADM actual” para operaciones. Siempre usa:
  - En staging: `sync_run_id = current_run_id` de esa ubicación.
  - En legacy: `sync_run_id = NULL`.

- **Transferencias y ajustes ADM** obtienen el registro con `obtener_stock_vigente` y **modifican ese mismo registro** (misma fila de `StockProductoADM`). Es decir, **mutan el snapshot vigente** (el mismo que escribió la sync). No crean otro run ni tocan `SyncRun` ni `SyncLocationStatus.current_run_id`.

- **Sync staging** no “actualiza en sitio” los registros del run actual: escribe **nuevos** registros con un **nuevo** `sync_run_id` y luego cambia `current_run_id` a ese run. Los registros viejos (incluidos los que fueron modificados por transferencia o ajuste) quedan en BD pero dejan de ser “vigentes”. La “sobrescritura” es por **cambio de run LIVE**, no por UPDATE sobre las mismas filas.

- **Sync legacy** sí hace UPDATE/INSERT sobre `StockProductoADM` sin run; ahí la sobrescritura es literal (mismo registro actualizado con valores de ADM).

---

### 1.6 Módulo de ajustes: funcionamiento actual

**Qué hace:**

- **Ajuste de ubicación física (tipo `fisica`):**  
  Fija la cantidad de un producto en una **ubicación física WMS** (ej. 2P1D01N1).  
  - Actualiza o crea **`StockUbicacion`**.  
  - Crea **`Movimiento`** (ADJUSTMENT) si hay diferencia.  
  - **No toca `StockProductoADM`.**

- **Ajuste de ubicación ADM (tipo `adm`):**  
  Fija la cantidad de un producto en una **ubicación ADM** (macro, ej. MIRADOR SUR).  
  - Obtiene el stock vigente con **`obtener_stock_vigente(producto_db.id, location_id)`**.  
  - Si existe el registro: **actualiza ese mismo registro de `StockProductoADM`** (stock = cantidad_nueva).  
  - Si no existe: **crea un nuevo registro `StockProductoADM`** con producto_id, location_id, location_name, stock; **no se asigna `sync_run_id`** (queda NULL).  
  - Crea **`Movimiento`** (ADJUSTMENT) si hay diferencia.

**Tablas que toca:**

- Siempre que hay cambio: **`Movimiento`**.  
- Ajuste físico: **`StockUbicacion`**.  
- Ajuste ADM: **`StockProductoADM`** (update del vigente o insert sin run).

**Si afecta stock físico, stock ADM en cache o ambos:**

- Ajuste físico: solo **stock físico** (`StockUbicacion`).  
- Ajuste ADM: solo **stock ADM en cache** (`StockProductoADM`).

**Impacto en la consulta de stock después del ajuste:**

- Ajuste físico: la siguiente consulta de stock físico (por product_id/ubicación) verá la nueva cantidad en `StockUbicacion`. La consulta de stock ADM vigente no cambia (no toca `StockProductoADM`).  
- Ajuste ADM (update): como se modifica el mismo registro que devuelve `obtener_stock_vigente`, la siguiente consulta de stock ADM para esa ubicación verá la cantidad nueva.  
- Ajuste ADM (creación de registro sin `sync_run_id`): en **modo staging** (con `current_run_id` definido), ese nuevo registro **no** será devuelto por `obtener_stock_vigente` (que filtra por `sync_run_id = current_run_id`). Hasta que una sync cree un registro para ese producto/ubicación con el run vigente, la consulta seguirá viendo “sin stock” o el valor anterior si existía otro run. **Posible inconsistencia en staging.**

---

## Parte 2: Ejemplos “qué pasaría si…”

### Ejemplo 1: Recepción

**Situación:** SKU 123 tiene en cache ADM (última sync) ADESA = 10. Hay stock físico en WMS. Se registra una recepción de 5 unidades y se colocan en la ubicación física interna “2P1D01N1”.

**Qué tablas se afectan:**

- **`Movimiento`:** se crea al menos un registro tipo RECEIPT (product_id, sku, cantidad=5, factura_guid, ubicacion_destino según flujo; si es ADESA puede ser la ubicación física).
- **`StockUbicacion`:** si la recepción es para ADESA, se busca o crea la fila (product_id, sku, ubicacion=2P1D01N1) y se **suman** 5 a `cantidad`.

**Ubicación física:**  
Sí, sube: la fila de `StockUbicacion` para ese producto y “2P1D01N1” aumenta en 5.

**Ubicación ADM ADESA en cache:**  
**No cambia.** No se escribe en `StockProductoADM`. Sigue en 10.

**Qué ve el usuario justo después:**  
- En consulta por producto: stock físico WMS con 5 más en esa ubicación; stock ADM ADESA sigue mostrando 10.  
- Inconsistencia temporal: más unidades en físico que las que muestra la cache ADM para ADESA (hasta que sync actualice la cache).

**Cuando corre la próxima sync:**  
- **Sync staging (por ubicación):** se obtiene de ADM el stock actual de ADESA; se escriben nuevos registros con el nuevo run_id y se hace swap a LIVE. El valor de ADM (que ya debería incluir la recepción si ADM se actualizó por otro canal) sobrescribe lo que se lee como “vigente”; si ADM ya refleja las 15, la cache pasará a 15.  
- **Sync legacy:** se actualizan en sitio los registros de `StockProductoADM` con los valores de ADM; mismo efecto de “ponerse al día” con ADM.

---

### Ejemplo 2: Despacho

**Situación:** SKU 123 tiene ADESA = 10 en cache y 10 en una ubicación física WMS. Se registra un despacho de 3 unidades desde esa ubicación física.

**Qué stock baja realmente hoy:**  
Solo el **stock físico**: se resta 3 de la fila correspondiente de **`StockUbicacion`** (sku, ubicación física). Se crea **`Movimiento`** (PICK).

**Ubicación ADM en cache:**  
**Sigue en 10.** No se modifica `StockProductoADM`.

**Inconsistencia temporal:**  
El usuario ve en “consulta de producto” (o pantallas que usan stock ADM) que ADESA sigue en 10, mientras que el físico ya bajó a 7. La cache ADM queda “atrás” hasta la próxima sync.

**Cómo se corrige después con sync:**  
Cuando se ejecute la sync (staging o legacy), los valores de `StockProductoADM` se reemplazan por los que devuelve ADM. Si ADM ya refleja el despacho (por integración externa o porque en el futuro se le enviara el pick), la cache mostrará 7 (o el valor que ADM tenga). Si ADM no se actualiza con los picks del WMS, la sync seguirá trayendo 10 y la inconsistencia seguirá hasta que ADM se actualice por otro medio.

---

### Ejemplo 3: Transferencia física interna (sin movimiento entre ubicaciones ADM)

**Situación:** SKU 123 tiene 10 unidades en una ubicación física WMS; se transfieren 4 a otra ubicación física interna, sin implicar cambio entre ubicaciones ADM (ej. todo dentro de ADESA).

**Solo cambian las ubicaciones físicas:**  
Sí. En el código de transferencias, si origen y destino son ADESA, se restan 4 de `StockUbicacion` en la ubicación física origen y se suman 4 en la ubicación física destino (o se crean las filas correspondientes). Se crean `Movimiento` (TRANSFER).  
Además, cuando **origen es ADESA** se actualiza **`StockProductoADM`** para la ubicación ADM origen (restar 4). Por tanto, en este escenario “solo físico” **sí se toca la cache ADM**: baja el stock ADM de ADESA en 4 (aunque conceptualmente el stock total ADESA no debería cambiar). Esto es una particularidad del diseño actual: la transferencia interna ADESA→ADESA resta en cache en origen pero no suma en destino ADESA (porque destino ADESA no actualiza `StockProductoADM`), generando una bajada neta en la cache ADM de ADESA hasta la próxima sync.

**Cache ADM:**  
Se toca solo el **origen**: se resta en `StockProductoADM` para ADESA. El destino (también ADESA) no se actualiza en cache. Resultado: la cache muestra menos stock en ADESA del que realmente hay en físico hasta la próxima sync.

---

### Ejemplo 4: Movimiento que implica ubicaciones ADM (ej. ADESA → MIRADOR SUR)

**Situación:** SKU 123 tiene ADESA = 10 y MIRADOR SUR = 2 en cache. Se registra una transferencia de 4 unidades de ADESA hacia MIRADOR SUR.

**Según el diseño actual:**

- **Origen ADESA:** se obtiene el stock vigente de ADESA y se **restan** 4 en ese registro de `StockProductoADM`.  
- **Destino MIRADOR SUR (NO-ADESA):** se obtiene el stock vigente de MIRADOR SUR y se **suman** 4 en ese registro de `StockProductoADM`.  
- **Stock físico:** si destino es ADESA se actualiza `StockUbicacion`; si destino no es ADESA no se modifica `StockUbicacion` para el destino (solo movimientos de auditoría).

**¿El sistema refleja eso en la cache ADM?**  
Sí: la cache ADM se actualiza **en el momento** para origen (ADESA -4) y para destino (MIRADOR SUR +4). No hay que esperar a la sync para ver ese cambio en las consultas que usan `obtener_stock_vigente`.

**¿Solo se mueve lo físico en WMS?**  
No solo: en este caso (destino NO-ADESA) no se actualiza `StockUbicacion` en destino; lo que se actualiza es la cache ADM (origen y destino). El diseño asume que el “movimiento entre ubicaciones ADM” se refleja en cache local de inmediato para mejorar la UX; los comentarios en código indican que la próxima sync sobrescribirá esos valores con los de ADM.

**¿En qué momento la cache ADM se pondría al día?**  
Ya está “al día” en el instante de la transferencia para ese producto y esas dos ubicaciones. La sync posterior traerá de nuevo los valores de ADM; si ADM ya incorporó la transferencia, los valores coincidirán; si no, la sync “corregirá” la cache al estado de ADM (que podría ser la fuente de verdad deseada).

---

## Parte 3: Evaluación de la propuesta

**Propuesta:** Mantener ADM como fuente oficial de verdad, pero permitir que las transacciones del WMS que involucren ubicaciones ADM **también actualicen temporalmente** en la BD local las cantidades de esas ubicaciones ADM; cuando llegue la próxima sync, ADM sobrescribirá esos valores si corresponde.

**Evaluación breve:**

- **Recepción y despacho hoy no tocan la cache ADM.** La propuesta implicaría que, al registrar recepción o despacho que afecte una ubicación ADM (ej. ADESA), además de `StockUbicacion` y `Movimiento`, se actualice el registro vigente de `StockProductoADM` para esa ubicación (sumar en recepción, restar en despacho), igual que ya se hace en transferencias y ajustes ADM.
- Eso es **coherente** con lo que ya hace el sistema en transferencias y ajustes: mutar el snapshot vigente para mejorar la UX, asumiendo que la sync luego lo sobrescribirá.
- **Viabilidad:** Sí es viable con la estructura actual: las mismas tablas (`StockProductoADM`, leyendo/escribiendo vía `obtener_stock_vigente`), sin tocar `SyncRun` ni `SyncLocationStatus.current_run_id`, y dejando que la sync (staging o legacy) siga siendo quien “trae la verdad” de ADM.

---

## Parte 4: Evaluación arquitectónica de la propuesta

- **¿Es viable con la estructura actual?**  
  Sí. Recepción y despacho solo tendrían que, en los mismos flujos donde ya tocan `StockUbicacion` y crean `Movimiento`, obtener el registro vigente con `obtener_stock_vigente` para la ubicación ADM afectada y actualizar su campo `stock` (y `updated_at`). No hace falta nueva tabla ni cambiar el modelo de runs.

- **Tablas/modelos involucrados:**  
  Los mismos: `StockProductoADM` (lectura/escritura vía `obtener_stock_vigente`), `Movimiento`, `StockUbicacion`. No se tocan `SyncRun`, `SyncLocationStatus`, ni `ProductoADM` más allá de lo ya usado.

- **¿Rompe la lógica de SyncRun, SyncLocationStatus, current_run_id y stock vigente?**  
  No. Esa lógica sigue igual: el “vigente” es el registro con `sync_run_id = current_run_id` (o NULL en legacy). Solo se estaría **modificando** ese mismo registro desde más flujos (recepción y despacho), igual que ya se hace en transferencia y ajuste. La sync no cambia: sigue escribiendo (staging: nuevo run y swap; legacy: update en sitio) y así “recupera” la verdad desde ADM.

- **¿Implica mutar un snapshot que hoy se asume resultado de sync?**  
  Sí. Hoy ya se muta ese snapshot en transferencias y ajustes ADM. La propuesta extiende esa misma idea a recepción y despacho. El supuesto sigue siendo: “el snapshot es una caché que puede ser corregida por el WMS hasta que la sync lo sobrescriba”.

- **Riesgos de inconsistencia:**  
  - Si la sync tarda mucho, la cache puede llevar tiempo “adelantada” respecto a ADM (recepción/despacho ya aplicados en cache, ADM aún no).  
  - Si ADM se actualiza por otro canal y luego se hace sync, se “pierden” en cache los movimientos solo locales (igual que hoy con transferencias/ajustes).  
  - Condiciones de carrera: dos transacciones WMS leyendo y actualizando el mismo registro de `StockProductoADM` (ej. dos despachos simultáneos para el mismo producto/ubicación) deberían seguir manejándose con transacciones BD y, si hace falta, con control de concurrencia (versión o bloqueo) para no perder restas.

- **Ventajas:**  
  - La consulta de producto (y cualquier pantalla que use stock ADM) refleja de inmediato recepciones y despachos, sin esperar a la sync.  
  - Comportamiento homogéneo entre recepción, despacho, transferencia y ajuste respecto a “actualizar cache ADM cuando la transacción afecta una ubicación ADM”.

- **Desventajas:**  
  - La cache deja de ser un “espejo puro” de ADM entre syncs; es un espejo más “optimista” que la sync luego puede corregir.  
  - Más puntos del código que escriben en `StockProductoADM` exigen disciplina (siempre vía `obtener_stock_vigente`, mismos criterios de ubicación ADM).

- **¿Actualizar directamente StockProductoADM o otra capa (overrides, movimientos derivados)?**  
  Con el diseño actual (transferencias y ajustes ya escriben en `StockProductoADM`), lo coherente es **seguir actualizando directamente** el mismo registro vigente, sin añadir una capa intermedia de “overrides” o “movimientos derivados” que luego haya que mezclar en la lectura. Una capa separada sería más limpia conceptualmente (“stock vigente = sync + deltas WMS”) pero implica cambios de modelo y de toda la lectura de stock; la propuesta tal como está (extender el mismo patrón) es la que menos rompe la arquitectura actual.

- **Impacto en recepciones, despachos y transferencias:**  
  - **Recepciones:** además de `StockUbicacion` (si ADESA) y `Movimiento`, actualizar `StockProductoADM` para la ubicación ADM de la recepción (sumar).  
  - **Despachos:** además de `StockUbicacion` y `Movimiento`, actualizar `StockProductoADM` para la ubicación ADM del despacho (ej. ADESA) restando la cantidad.  
  - **Transferencias:** ya actualizan cache ADM en origen y en destino (solo cuando destino no es ADESA); opcionalmente se podría unificar actualizando también el destino cuando **es** ADESA, para evitar la asimetría actual (origen baja, destino ADESA no sube en cache).

- **Qué pasa cuando una sync posterior sobrescribe:**  
  Igual que hoy: en staging, la sync escribe un nuevo run y hace swap; en legacy, actualiza las filas en sitio. Los valores que el WMS escribió en `StockProductoADM` se reemplazan por los de ADM. No hace falta lógica adicional; el comportamiento ya está asumido en los comentarios del código (“será sobrescrito en próxima sync”).

---

## Parte 5: Conclusión en el formato solicitado

**Cómo funciona hoy realmente**

- El stock ADM entra por dos tipos de sync: una “legacy” (todos los productos/ubicaciones, sin run) y una “staging” (por ubicación, con SyncRun y current_run_id). Todo el WMS consulta stock ADM vía `obtener_stock_vigente`, que lee `StockProductoADM` filtrado por run vigente (o NULL en legacy).  
- Recepción y despacho solo tocan `StockUbicacion` (cuando aplica) y `Movimiento`; **no** tocan `StockProductoADM`.  
- Transferencia actualiza `StockProductoADM` en origen (restar) y en destino **solo si destino no es ADESA** (sumar); si destino es ADESA solo actualiza físico.  
- Ajustes: el físico solo toca `StockUbicacion`; el ADM actualiza o crea `StockProductoADM` (al crear no se asigna `sync_run_id`, lo que en staging puede dejar ese valor invisible hasta la próxima sync).

**Qué limitación existe hoy**

- Entre una recepción o un despacho y la siguiente sync, la **cache ADM no refleja** esas operaciones: el usuario ve cantidades ADM “viejas” mientras el físico ya cambió. Solo transferencias (origen y destino no-ADESA) y ajustes ADM actualizan la cache de inmediato.

**Cómo funciona hoy el módulo de ajustes**

- Ajuste físico: actualiza `StockUbicacion` y crea `Movimiento`; no toca `StockProductoADM`.  
- Ajuste ADM: obtiene el vigente con `obtener_stock_vigente`, actualiza ese registro (o crea uno sin `sync_run_id`); crea `Movimiento`. Impacta la consulta de stock ADM solo cuando el registro existe y se actualiza; cuando se crea sin run en staging, la consulta puede no ver el cambio hasta la sync.

**Si la propuesta es viable o no**

- **Sí es viable** con la estructura actual: extender recepción y despacho para que actualicen el mismo registro de `StockProductoADM` que devuelve `obtener_stock_vigente` para la ubicación ADM afectada, igual que ya hacen transferencias y ajustes, sin tocar runs ni current_run_id.

**Qué riesgo principal tendría**

- Que la cache quede “adelantada” respecto a ADM durante más tiempo y que la sync la “corrija” con valores de ADM que no incluyan aún esos movimientos (si ADM no se actualiza por el WMS). El riesgo es de **consistencia temporal** entre cache y ADM, no de romper la arquitectura de runs o la sync.

**Cuál sería la forma más sana de hacerlo en el futuro, sin romper la arquitectura**

- La forma más sana y alineada con el código actual sería: **actualizar directamente el registro vigente de `StockProductoADM`** en recepción y despacho cuando la operación afecte una ubicación ADM, usando siempre `obtener_stock_vigente` y los mismos criterios que en transferencias y ajustes, documentando explícitamente que “la cache puede ser actualizada por el WMS y será sobrescrita por la próxima sync”. Opcionalmente, unificar el comportamiento de transferencias actualizando también la cache cuando el destino **es** ADESA, para evitar la asimetría actual.  
- Cualquier enfoque alternativo (capa de deltas, overrides, o doble fuente de verdad) requeriría cambios de modelo y de toda la lectura de stock; sería más limpio a largo plazo pero no es necesario para cumplir la propuesta tal como se ha evaluado aquí.

---

*Documento generado a partir del análisis del código; no se ha modificado ningún archivo del proyecto.*
