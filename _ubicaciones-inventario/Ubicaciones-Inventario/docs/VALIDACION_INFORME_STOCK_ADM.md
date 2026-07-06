# Validación del informe: stock ADM, cache, transacciones y ajustes

**Alcance:** Contrastar el informe anterior con el código real. Sin cambios ni propuestas de implementación.  
**Referencia de código:** `routes/transferencias.py` (líneas 838-1008), `routes/recepciones.py`, `routes/despacho.py`, `routes/ajustes.py`, `utils/helpers.py` (`obtener_stock_vigente`).

---

## 1. Qué conclusión del informe anterior se confirma

- **Recepción y despacho no tocan `StockProductoADM`.** Confirmado: en `recepciones.py` no aparece `StockProductoADM` ni `obtener_stock_vigente`; solo `StockUbicacion` (si es ADESA) y `Movimiento`. En `despacho.py` `StockProductoADM` solo se usa para **lectura** (mostrar stock ADM en la UI); no hay ninguna escritura.
- **Ajuste físico solo toca `StockUbicacion` y `Movimiento`.** Confirmado: en `ajustes.py` el bloque `tipo_asignacion == 'fisica'` solo actualiza/crea `StockUbicacion` y crea `Movimiento`; no hay referencia a `StockProductoADM`.
- **Ajuste ADM actualiza o crea `StockProductoADM`; al crear, no se asigna `sync_run_id`.** Confirmado: líneas 377-392 de `ajustes.py`. El constructor `StockProductoADM(...)` no incluye `sync_run_id`, por tanto queda `NULL`.
- **`obtener_stock_vigente` en staging devuelve solo filas con `sync_run_id == current_run_id`.** Confirmado: `utils/helpers.py` líneas 483-486. Si existe `current_run_id`, la consulta filtra por ese run; si no, fallback a `sync_run_id=None`.
- **Inconsistencia potencial en Caso F (ajuste ADM creando fila en staging).** Confirmada: la fila nueva tiene `sync_run_id=NULL`; en staging, `obtener_stock_vigente` no la devolverá hasta que una sync cree un registro con el run vigente.

---

## 2. Qué conclusión del informe anterior hay que corregir o matizar

- **“Transferencia actualiza `StockProductoADM` en **origen** (restar) y en **destino** solo cuando destino no es ADESA (sumar)”.**  
  **Corrección:** En el código, `StockProductoADM` **solo se actualiza cuando la ubicación implicada NO es ADESA**.  
  - El bloque que actualiza el **origen** (restar) está en el **`else`** de `if origen_es_adesa` (líneas 885-924). Es decir: **si origen es ADESA, no se actualiza `StockProductoADM` para el origen.**  
  - El bloque que actualiza el **destino** (sumar) está en el **`else`** de `if destino_es_adesa` (líneas 981-1007). Es decir: **si destino es ADESA, no se actualiza `StockProductoADM` para el destino.**  
  Por tanto: **la cache ADM de ADESA no se modifica nunca en el módulo de transferencias**, ni como origen ni como destino. Solo se mueve stock físico (`StockUbicacion`) cuando ADESA está involucrado, y se actualiza `StockProductoADM` únicamente para ubicaciones **no ADESA** (origen o destino).

- **Ejemplo 3 del informe (“Transferencia interna ADESA→ADESA”):** Se dijo que se restaba en cache ADM de ADESA. **Incorrecto.** Cuando origen y destino son ADESA, `origen_es_adesa` y `destino_es_adesa` son True; no se entra en ninguno de los dos bloques que modifican `StockProductoADM`. Solo se actualiza `StockUbicacion` (restar origen, sumar destino) y se crea `Movimiento`. La cache ADM no se toca.

- **Ejemplo 4 (ADESA → MIRADOR SUR):** Se dijo que la cache ADM se actualiza en origen (ADESA -4) y destino (MIRADOR SUR +4). **Mitad correcta:** Solo se actualiza **MIRADOR SUR** (+4). **ADESA no se actualiza** (origen es ADESA, por tanto no se entra en el bloque que resta en `StockProductoADM`). En origen solo baja `StockUbicacion` (ubicación física ADESA).

---

## 3. Cómo responde hoy el sistema en cada caso

### Caso A: Movimiento físico interno dentro de la misma macro (ADESA 2P1D01N1 → 2P1D02N1, 4 unidades)

1. **¿Transferencias o Ajustes?**  
   El módulo de **Transferencias** está atado a un documento ADM (LocationTransfer): se busca por DocID y se procesa ese documento. Un “movimiento físico interno” sin documento ADM de transferencia (solo reorganizar de una ubicación física a otra dentro de ADESA) **no es un flujo que el código de transferencias contemple como caso “solo físico”**. Para ese escenario el código actual lleva a usar **Ajustes**: dos ajustes de tipo `fisica` (reducir 4 en 2P1D01N1 y sumar 4 en 2P1D02N1, o equivalentemente fijar cantidades absolutas).  
   Si existiera un documento ADM “ADESA → ADESA” y se usara Transferencias, entonces sí se usaría el módulo de transferencias; en ese caso, al ser origen y destino ADESA, no se actualizaría `StockProductoADM` (véase más abajo).

2. **Tablas que toca realmente:**  
   - **Vía Ajustes (caso habitual “solo reorganizar físico”):** `StockUbicacion` (actualizar o crear en 2P1D01N1 y 2P1D02N1) y `Movimiento` (ADJUSTMENT). No se toca `StockProductoADM`.  
   - **Vía Transferencias (solo si hay documento ADM ADESA→ADESA):** `StockUbicacion` (restar en origen físico, sumar en destino físico) y `Movimiento` (TRANSFER). No se toca `StockProductoADM` (ambos lados son ADESA).

3. **¿Se modifica `StockProductoADM`?**  
   **No**, ni con Ajustes ni con Transferencias en el escenario ADESA→ADESA.

4. **¿Solo reorganiza físico o también altera cache ADM?**  
   Solo reorganiza stock físico. La cache ADM no se altera.

---

### Caso B: Transferencia entre macro ubicaciones ADM (ADESA 10, MIRADOR SUR 2; se transfieren 4 de ADESA a MIRADOR SUR)

1. **¿Se resta 4 en `StockProductoADM` de ADESA?**  
   **No.** Origen es ADESA (`origen_es_adesa` True). El código que resta en `StockProductoADM` está en el `else` (origen NO-ADESA). Para origen ADESA solo se resta en **`StockUbicacion`** (ubicación física origen).

2. **¿Se suman 4 en `StockProductoADM` de MIRADOR SUR?**  
   **Sí.** Destino es NO-ADESA; se entra en el bloque líneas 981-1007 y se actualiza el registro vigente de MIRADOR SUR (+4).

3. **¿Se toca `StockUbicacion`?**  
   **Sí en origen (ADESA):** se resta la cantidad de la(s) ubicación(es) física(s) origen. **No en destino:** MIRADOR SUR no es ADESA; el bloque `if destino_es_adesa` no se ejecuta, así que no se crea ni actualiza `StockUbicacion` para destino (el diseño asume que destino no-ADESA no tiene ubicaciones físicas WMS en este flujo).

4. **Qué ve el usuario en consulta de producto justo después:**  
   - ADESA: mismo valor que antes de la transferencia (p. ej. 10), porque `StockProductoADM` para ADESA no se tocó.  
   - MIRADOR SUR: +4 (p. ej. 2→6).  
   - Físico: en ADESA bajó en la ubicación física origen; en MIRADOR SUR no hay cambio de físico (no se escribe `StockUbicacion` para MIRADOR SUR).

5. **Qué hace luego la sync:**  
   Vuelve a traer de ADM los valores por ubicación. Si ADM ya refleja la transferencia, ADESA y MIRADOR SUR quedarán con los valores de ADM (p. ej. ADESA 6, MIRADOR SUR 6). Esos valores sobrescriben lo que haya en el run vigente (staging) o en los registros sin run (legacy).

---

### Caso C: Transferencia hacia ADESA (MIRADOR SUR 8, ADESA 10; se transfieren 3 de MIRADOR SUR a ADESA)

1. **¿Se restan 3 en la cache ADM de MIRADOR SUR?**  
   **Sí.** Origen es NO-ADESA; se entra en el bloque que obtiene el vigente de origen y resta (líneas 905-916).

2. **¿Se suman 3 en la cache ADM de ADESA?**  
   **No.** Destino es ADESA; el bloque que actualiza `StockProductoADM` destino está en el `else` (destino NO-ADESA). Para destino ADESA solo se actualiza **`StockUbicacion`** (sumar en la(s) ubicación(es) física(s) destino).

3. **¿Solo se crea/actualiza `StockUbicacion` en ADESA?**  
   **Sí.** En el bloque `if destino_es_adesa` (líneas 926-981) se actualiza o crea `StockUbicacion` para la ubicación física destino y se crea `Movimiento`. No hay escritura en `StockProductoADM` para ADESA.

4. **¿Asimetría temporal entre macro stock ADM y stock físico?**  
   **Sí.** Tras la operación: cache ADM MIRADOR SUR bajó 3; cache ADM ADESA sigue igual; stock físico en ADESA subió 3. Hasta la próxima sync, la consulta mostrará ADESA con el valor viejo en macro (p. ej. 10) aunque el físico ya tenga 3 más.

5. **¿Está sustentado por el código?**  
   **Sí.** La rama `if destino_es_adesa` solo modifica `StockUbicacion` y crea `Movimiento`; la rama `else` (destino NO-ADESA) es la única que escribe en `StockProductoADM` para el destino.

---

### Caso D: Recepción en ADESA (sync ADESA=10, se reciben 5 en 2P1D01N1)

1. **¿Hoy solo sube `StockUbicacion`?**  
   **Sí.** En `recepciones.py` (líneas 886-904), si `es_adesa` se actualiza o crea `StockUbicacion` para la ubicación indicada y se suma la cantidad. No hay referencia a `StockProductoADM`.

2. **¿`StockProductoADM` se queda en 10?**  
   **Sí.** No se toca.

3. **¿Decisión deliberada o ausencia de lógica?**  
   No hay comentarios en el código que expliquen por qué recepciones no actualizan la cache ADM. Solo se aplica la “REGLA DE ORO #4” (tocar `StockUbicacion` solo si es ADESA). La no actualización de `StockProductoADM` en recepciones es **ausencia explícita de esa lógica**, no un comentario de diseño.

4. **Qué ve el usuario al consultar el producto justo después:**  
   - Ubicaciones físicas: +5 en 2P1D01N1.  
   - Stock ADM ADESA: sigue mostrando 10 (cache sin cambiar).

5. **Qué corrige la sync:**  
   Cuando se ejecute la sync para ADESA, los valores de `StockProductoADM` (run vigente o legacy) se reemplazan por los de ADM. Si ADM ya tiene las 15, la cache pasará a 15.

---

### Caso E: Despacho desde ADESA (cache ADESA=10, físico=10, se despachan 3)

1. **¿Hoy solo baja `StockUbicacion`?**  
   **Sí.** En `despacho.py`, `_crear_movimiento_pick_item` resta de `stock_ubic.cantidad` y crea `Movimiento`. No hay escritura en `StockProductoADM`.

2. **¿`StockProductoADM` permanece en 10?**  
   **Sí.**

3. **¿El sistema está diseñado para tolerar esa diferencia temporal?**  
   El código no documenta esa tolerancia. Solo se lee `StockProductoADM` para mostrar/validar; no se actualiza. Se puede inferir que se asume que la sync “pondrá al día” la cache, pero no hay comentario que lo diga.

4. **¿Alguna otra parte del código compensa antes de la sync?**  
   **No.** No hay ningún flujo en recepciones, despacho ni en otro módulo revisado que, tras un despacho, actualice `StockProductoADM`.

5. **Qué ve el usuario inmediatamente después:**  
   - Físico: 7 en la ubicación desde la que despachó.  
   - Stock ADM ADESA en consulta de producto: sigue 10.

---

### Caso F: Ajuste ADM cuando no existe fila vigente (staging, MIRADOR SUR con `current_run_id`, SKU 123 sin fila vigente para MIRADOR SUR; ajuste a 5)

1. **¿El módulo crea una fila nueva en `StockProductoADM`?**  
   **Sí.** Cuando `obtener_stock_vigente` devuelve `None`, el código entra en `elif producto_db and location_id` (líneas 383-392) y crea un nuevo `StockProductoADM`.

2. **¿Esa fila se crea con `sync_run_id = NULL` o con `current_run_id`?**  
   **Con `sync_run_id = NULL`.** El constructor en líneas 385-391 no asigna `sync_run_id`; en el modelo el campo es nullable y no tiene default, por tanto queda NULL.

3. **¿`obtener_stock_vigente` vería esa fila inmediatamente después?**  
   **No**, en modo staging. `obtener_stock_vigente` con `current_run_id` definido filtra por `sync_run_id=estado_sync.current_run_id`. La fila nueva tiene `sync_run_id=NULL`, por tanto no se devuelve.

4. **¿El usuario podría hacer un ajuste y no verlo reflejado en consulta?**  
   **Sí.** La consulta de producto usa `obtener_stock_vigente` (vía `productos.py` y helpers). Si no había fila vigente y el ajuste creó una con `sync_run_id=NULL`, en staging la consulta seguirá mostrando “sin stock” (o 0) para esa ubicación hasta que una sync cree un registro con el run vigente.

5. **¿Es una inconsistencia real del diseño actual?**  
   **Sí.** Es un bug de diseño: se crea un registro que en staging nunca se considera “vigente”, por lo que el ajuste no es visible en las pantallas que usan stock vigente hasta la próxima sync (que puede crear otro registro con run_id y valor de ADM, no necesariamente el 5 que puso el usuario).

---

## 4. Si hoy el diseño es uniforme o mixto

**El sistema hoy sigue un modelo mixto (Modelo 3), no uniforme.**

- **Recepción:** Solo toca físico (`StockUbicacion`) y `Movimiento`. No toca cache ADM.  
- **Despacho:** Solo toca físico y `Movimiento`. No toca cache ADM.  
- **Transferencia:**  
  - Si la ubicación es **ADESA** (origen o destino): solo toca físico y `Movimiento`; **no toca** `StockProductoADM`.  
  - Si la ubicación es **no ADESA** (origen o destino): **sí toca** `StockProductoADM` (restar en origen, sumar en destino).  
- **Ajuste físico:** Solo toca `StockUbicacion` y `Movimiento`. No toca cache ADM.  
- **Ajuste ADM:** Sí toca `StockProductoADM` (actualizar vigente o crear fila sin run).  

Por tanto no es “solo sync modifica cache” (Modelo 1) ni “todas las transacciones que afectan una ubicación ADM actualizan cache” (Modelo 2). La regla efectiva en código es: **solo se actualiza `StockProductoADM` cuando la ubicación implicada no es ADESA** (transferencias) o cuando se hace un ajuste explícito a una ubicación ADM (ajustes). ADESA como ubicación ADM nunca se actualiza en transferencias; recepción y despacho no actualizan ninguna ubicación ADM.

---

## 5. Qué inconsistencia real existe hoy

1. **Asimetría en transferencias:** Cuando interviene ADESA (origen o destino), la cache ADM de ADESA no se actualiza; solo el físico. Eso genera diferencias temporales entre lo que muestra la consulta (cache ADM) y el físico hasta la sync, y asimetría frente a ubicaciones no-ADESA (donde sí se actualiza la cache).
2. **Ajuste ADM creando fila sin run en staging:** La fila nueva con `sync_run_id=NULL` no es visible para `obtener_stock_vigente` en staging, por lo que el usuario puede “fijar” un valor y no verlo en consulta hasta la próxima sync (y entonces el valor puede ser el de ADM, no el del ajuste).
3. **Recepción y despacho:** Cache ADM no se actualiza; la diferencia temporal entre físico y “stock ADM” en consulta es consistente con el código pero no está documentada como decisión de diseño.

---

## 6. Preguntas de arquitectura que quedan abiertas (sin tocar código)

1. **Criterio ADESA vs no-ADESA en transferencias:** ¿Es intencional que la cache ADM solo se actualice para ubicaciones no-ADESA (por ejemplo porque ADESA se considera “WMS propio” y se asume que la sync es frecuente), o es un vacío que nunca se cerró?
2. **Ajuste ADM en staging:** ¿Se debe asignar `current_run_id` al crear la fila en ajustes para que sea vigente de inmediato, o se prefiere no escribir en el run vigente y dejar que solo la sync cree registros con run_id?
3. **Propuesta de que recepción y despacho actualicen cache:** ¿Debe aplicarse el mismo criterio que en transferencias (solo cuando la ubicación no es ADESA) o se quiere que también ADESA se actualice en cache cuando haya recepción/despacho en ADESA?
4. **Unificación de modelo:** ¿El objetivo a largo plazo es un Modelo 2 explícito (“cualquier transacción que afecte una ubicación ADM actualiza cache; la sync sobrescribe”) o se quiere mantener la excepción para ADESA y solo documentarla?

---

## 7. Validación de la propuesta futura (sin implementar)

**Propuesta evaluada:** Permitir que recepción y despacho también actualicen temporalmente `StockProductoADM` cuando afecten una ubicación ADM, igual que en “algunas transferencias y ajustes ADM”, y que la sync sobrescriba después.

1. **¿Extiende un patrón ya existente o cambia la filosofía?**  
   **Extiende un patrón que ya existe solo en parte:** hoy ese patrón aplica a “transferencias con ubicación no-ADESA” y a “ajuste ADM”. No aplica a recepción, despacho ni a “ADESA” en transferencias. Implementar la propuesta para recepción y despacho **extendería** el mismo tipo de actualización temporal de cache; no cambia la idea de “sync sobrescribe”. Pero hoy el patrón no es “todas las transacciones que afectan una ubicación ADM”; es “solo algunas (transfer no-ADESA y ajuste ADM)”. Por tanto la propuesta **unificaría** el comportamiento hacia un patrón más coherente (recepción/despacho también actualizarían cache), alineado con lo que ya hace transferencias para no-ADESA y ajustes ADM.

2. **¿Qué inconsistencias actuales habría que resolver antes?**  
   - **Caso F:** Asignar `sync_run_id` al crear `StockProductoADM` en ajustes (o usar el run vigente) para que el ajuste sea visible de inmediato en staging; si no, se seguiría teniendo el caso “ajuste que no se ve”.  
   - **Criterio ADESA:** Definir si, al extender a recepción y despacho, se actualiza también la cache cuando la ubicación es ADESA (hoy transferencias no la actualizan para ADESA). Si no se aclara, se podría terminar con “recepción/despacho actualizan ADESA” pero “transferencia no actualiza ADESA”, lo que mantendría la mezcla.

3. **Principal riesgo funcional de hacerlo sin aclarar reglas:**  
   Que recepción y despacho actualicen la cache sin definir (a) si aplica o no a ADESA y (b) cómo se trata el ajuste ADM en staging, puede dejar un sistema con tres comportamientos distintos (recepción/despacho actualizando todo, transferencias actualizando solo no-ADESA, ajuste ADM creando filas invisibles en staging) y más difícil de explicar y depurar. El riesgo no es tanto técnico como de reglas de negocio y consistencia entre módulos.

---

*Documento de validación; no se ha modificado ningún archivo del proyecto.*
