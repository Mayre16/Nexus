# Viabilidad técnica y plan de ejecución – Arquitectura objetivo WMS

**Alcance:** Evaluación de viabilidad y plan de ejecución detallado para alinear el sistema con la arquitectura objetivo definida, **sin implementar cambios en código**. Se asume el análisis previo en `ANALISIS_FUNCIONAL_TECNICO_COMPLETO.md`.

---

## A. Viabilidad general del modelo

### Qué tan compatible es con la arquitectura actual

**Compatible con condiciones.** La base de datos, el modelo de runs (SyncRun, SyncLocationStatus.current_run_id) y la sync que escribe por `sync_run_id` permiten que los módulos operativos **actualicen** la fila vigente de cache (la que tiene `sync_run_id = current_run_id`) sin tocar runs ni `current_run_id`. La lectura vigente (`obtener_stock_vigente`) ya usa solo esa fila, por lo que cualquier UPDATE sobre ella se vería de inmediato. La sync sigue creando un **nuevo** run, insertando filas desde ADM y asignando `current_run_id` al nuevo run; así, las escrituras operativas quedan en el run “viejo” y dejan de ser vigentes cuando la sync termina. Eso cumple el objetivo: “ADM es la verdad; la sync puede sobrescribir”.

### Qué lo favorece

- **StockProductoADM** ya existe y tiene `sync_run_id`; la sync ya escribe por run y actualiza `current_run_id`; no hace falta que la sync “interprete” movimientos WMS.
- **Transferencias** ya actualizan `StockProductoADM` para origen/destino **no-ADESA** usando `obtener_stock_vigente` (modifican la fila vigente); el patrón “obtener vigente → actualizar stock” está probado.
- **Ajustes ADM** ya actualizan o crean `StockProductoADM`; el hueco es solo que al **crear** no asignan `sync_run_id` (y la reversión no toca cache).
- **Reversión en recepción y despacho** ya es simétrica para `StockUbicacion`; el mismo patrón (cantidad y ubicación en el movimiento) puede usarse para restaurar cache si se añade la escritura de cache en el registro.
- **Movimiento** guarda tipo, cantidad, ubicacion_origen, ubicacion_destino, notas; con eso se puede implementar reversión simétrica por delta (suma ↔ resta) sin obligar a guardar “stock anterior” en todos los casos; en ajustes ADM las notas ya traen “Anterior” y “Nuevo”.
- **Discrepancias** se crean en la sync comparando ADM (run recién creado desde API) vs físico; no dependen de que los módulos escriban o no cache; seguirían siendo válidas.

### Qué lo bloquea

- **Recepción y despacho** no escriben `StockProductoADM`; hay que añadir esa escritura y, en reversión, la restauración de cache.
- **Transferencias** no actualizan cache cuando **ADESA** es origen o destino; solo mueven físico. Y la **reversión** no toca `StockProductoADM` en ningún caso (origen/destino ADESA o no).
- **Ajustes:** al crear fila nueva en `StockProductoADM` no se asigna `sync_run_id` → en entornos con `current_run_id` esa fila no es vigente (efecto fantasma). La reversión de ajuste ADM no restaura `StockProductoADM`.
- **Trazabilidad para reversión de cache:** para “restaurar exactamente” hace falta poder aplicar la operación inversa. Por delta (suma ↔ resta) basta con cantidad y ubicación; para ajuste ADM ya existe “Anterior” en notas. No hay hoy un campo explícito “stock_cache_antes” en Movimiento; si se quisiera un snapshot explícito, habría que definirlo (no es estrictamente necesario si la inversa es por delta).
- **Riesgo de doble reversión:** hoy no hay un flag “revertido” en documento; si se revierte dos veces por error, la segunda podría volver a sumar/restar. Conviene definir control de estado (documento ya revertido) y/o idempotencia.

---

## B. Evaluación por módulo y escenario

### Recepciones

| Caso | Objetivo | Sistema actual | ¿Soporta? | Cambios en registro | Cambios en reversión | Impacto sync | Impacto discrepancias | Riesgo técnico |
|------|----------|----------------|-----------|---------------------|----------------------|--------------|------------------------|----------------|
| **A1** Recepción ADESA | RECEIPT + subir StockUbicacion + subir StockProductoADM ADESA; reversión baja ambos | Hoy: RECEIPT + StockUbicacion; no toca cache; reversión solo baja físico | **Parcial** | Añadir: obtener vigente ADESA, sumar cantidad a esa fila (sync_run_id=current_run_id). No crear runs | En revertir: además de restar físico, restar la misma cantidad en StockProductoADM (misma ubicación ADM). Usar cantidad del movimiento | Ninguno: sync crea nuevo run desde API | actualizar_discrepancias_por_skus ya se llama; sigue comparando físico vs ERP; sin cambio conceptual | Bajo si se usa solo UPDATE a fila vigente |
| **A2** Recepción no-ADESA | RECEIPT + subir StockProductoADM ubicación; reversión baja cache | Hoy: solo RECEIPT; no toca StockUbicacion ni cache; reversión no toca stock | **Requiere cambios** | Añadir: identificar location_id/location_name de la recepción, obtener_stock_vigente(producto_id, location_id), sumar cantidad; si no hay fila vigente, definir si se crea con sync_run_id=current_run_id o no se escribe | En revertir: restar cantidad en StockProductoADM de esa ubicación (por movimientos: cantidad y ubicación ADM en destino) | Ninguno | Discrepancias hoy solo ADESA; si se extienden a otras ubicaciones después, la lógica sería análoga | Medio: definir “ubicación ADM” por tipo recepción y flujo no-ADESA |
| **A3** Tres tipos documento | Misma regla inventario para los tres | Hoy la lógica ya es una por tipo (es_adesa); tipo solo cambia API y presentación | **Sí** | Ninguno de modelo; si se añade cache, aplicar la misma regla (cache de la ubicación ADM del documento) a los tres tipos | Igual reversión para los tres | Ninguno | Ninguno | Bajo |

---

### Despachos

| Caso | Objetivo | Sistema actual | ¿Soporta? | Cambios en registro | Cambios en reversión | Impacto sync | Impacto discrepancias | Riesgo técnico |
|------|----------|----------------|-----------|---------------------|----------------------|--------------|------------------------|----------------|
| **B1** Despacho ADESA | PICK + bajar StockUbicacion + bajar StockProductoADM ADESA; reversión sube ambos | Hoy: PICK + baja físico; no toca cache; reversión restaura solo físico | **Parcial** | Añadir: identificar ubicación ADM (ADESA) del documento/factura, obtener_stock_vigente, restar cantidad | En revertir: además de sumar en StockUbicacion, sumar en StockProductoADM ADESA por cada movimiento (cantidad) | Ninguno | Sin cambio conceptual | Bajo |
| **B2** Despacho no-ADESA | PICK + bajar cache ADM; si hay bin, bajar también físico; reversión restaura lo afectado | Hoy: siempre exige asignación con ubicación física; resta de ese bin; no toca cache | **Requiere cambios** | Definir si “despacho desde no-ADESA” implica solo cache (sin bin) o bin en esa ubicación. Si solo cache: restar StockProductoADM de esa ubicación; si hay bin: igual que B1 para ese bin + cache | Reversión: devolver cantidad a StockProductoADM (y a StockUbicacion si se tocó) | Ninguno | Ninguno para ADESA; si luego hay discrepancias por ubicación, análogo | Medio: modelo operativo “despacho sin bin” vs “despacho con bin” |
| **B3** Tres tipos documento | Misma regla para los tres | Hoy misma lógica para todos | **Sí** | Si se añade cache, misma regla por ubicación ADM para Factura Contado, Crédito, Despacho/Conduce | Igual reversión | Ninguno | Ninguno | Bajo |

---

### Transferencias

| Caso | Objetivo | Sistema actual | ¿Soporta? | Cambios en registro | Cambios en reversión | Impacto sync | Impacto discrepancias | Riesgo técnico |
|------|----------|----------------|-----------|---------------------|----------------------|--------------|------------------------|----------------|
| **C1** ADESA → ADESA | Mover StockUbicacion; neto cache ADESA no cambia; reversión restaura físico | Hoy: solo StockUbicacion + TRANSFER; no toca cache (correcto para neto) | **Sí** | Ninguno de inventario; opcionalmente documentar que no se toca cache ADESA porque la macro no cambia | Reversión ya restaura StockUbicacion; no hace falta tocar cache | Ninguno | Ninguno | Bajo |
| **C2** ADESA → MIRADOR SUR | Bajar físico ADESA + bajar cache ADESA + subir cache MIRADOR SUR; reversión deshace los tres | Hoy: baja físico ADESA; sube cache MIRADOR SUR; **no** baja cache ADESA. Reversión: solo restaura físico ADESA; **no** restaura cache MIRADOR SUR | **Requiere cambios** | Añadir: cuando origen es ADESA, obtener_stock_vigente(ADESA), restar cantidad en esa fila | Reversión: sumar en StockProductoADM ADESA la cantidad; restar en StockProductoADM MIRADOR SUR la cantidad (por movimiento: cantidad, origen/destino en TransferenciaProcesada o movimientos) | Ninguno | Ninguno | Medio: asegurar que reversión tenga location_id origen/destino para cache |
| **C3** MIRADOR SUR → ADESA | Bajar cache origen + subir cache ADESA + subir físico destino ADESA; reversión deshace todo | Hoy: baja cache MIRADOR SUR; sube físico ADESA; **no** sube cache ADESA. Reversión: resta físico destino; **no** suma cache MIRADOR SUR | **Requiere cambios** | Añadir: cuando destino es ADESA, obtener_stock_vigente(ADESA), sumar cantidad | Reversión: restar en StockProductoADM ADESA; sumar en StockProductoADM MIRADOR SUR | Ninguno | Ninguno | Medio |
| **C4** MIRADOR SUR → SANTIAGO | Bajar cache origen + subir cache destino + movimiento; reversión restaura ambas caches | Hoy: ya baja origen y sube destino en StockProductoADM. Reversión: **no** toca ninguna cache; solo borra movimientos | **Parcial** | Registro ya alineado | Reversión debe: sumar en StockProductoADM origen y restar en StockProductoADM destino (por movimientos + transferencia para location_id) | Ninguno | Ninguno | Medio: reversión hoy no tiene lógica de cache para no-ADESA |

---

### Ajustes

| Caso | Objetivo | Sistema actual | ¿Soporta? | Cambios en registro | Cambios en reversión | Impacto sync | Impacto discrepancias | Riesgo técnico |
|------|----------|----------------|-----------|---------------------|----------------------|--------------|------------------------|----------------|
| **D1** Ajuste físico individual | Ajustar StockUbicacion; trazabilidad anterior/nuevo; reversión restaura valor anterior | Hoy: ajusta StockUbicacion y guarda “Anterior”/“Nuevo” en notas; reversión restaura desde notas | **Sí** | Opcional: regla de negocio explícita “¿este ajuste físico también corrige cache ADM?” (hoy no toca cache) | Ya simétrica para físico | Ninguno | actualizar_discrepancias_por_skus ya se usa | Bajo |
| **D2** Ajuste ADM con fila vigente | Ajustar StockProductoADM; reversión restaura valor anterior; sync puede sobrescribir | Hoy: actualiza fila vigente; reversión **no** restaura StockProductoADM, solo borra movimiento | **Parcial** | Ninguno en registro | Reversión: leer “Anterior” de notas del movimiento, escribir ese valor en la fila vigente de StockProductoADM (mismo producto_id, location_id, sync_run_id=current_run_id); eliminar movimiento | Ninguno | Ninguno | Bajo |
| **D3** Ajuste ADM sin fila vigente (staging) | Cambio visible de inmediato; no fila invisible; reversión deja como antes | Hoy: crea fila **sin** sync_run_id → no vigente en staging; reversión no borra/restaura esa fila | **Requiere cambios** | Al crear: asignar sync_run_id = estado_sync.current_run_id (solo lectura) para esa location_id, para que la fila sea vigente. No tocar current_run_id | Reversión: si el ajuste había creado la fila, eliminar esa fila (producto_id, location_id, sync_run_id=current_run_id y que coincida con la creada en el ajuste) o restar a 0; si había actualizado, restaurar “Anterior” | Ninguno: sync puede crear después otra fila con mismo producto/location en nuevo run; la creada por ajuste queda en run viejo | Ninguno | Medio: unicidad producto_id+location_id+sync_run_id; no crear duplicados al asignar current_run_id |
| **D4** Ajuste masivo Excel | Mismo estándar que individual; reversible; sin efectos parciales | Hoy: solo físico; reversible por (timestamp, ubicacion); no toca cache | **Sí** para físico | Si en el futuro se permite ADM por Excel: mismas reglas que D2/D3 (vigencia, reversión) | Reversión por (timestamp, ubicacion) ya correcta para físico | Ninguno | Ninguno | Bajo; futuro Excel ADM: igual que D2/D3 |

---

## C. Evaluación de reversión

### Qué soporta hoy

- **Recepción:** Tiene cantidad y ubicacion_destino en cada Movimiento; puede restar de StockUbicacion. No tiene “stock cache antes” guardado; la inversa por delta (restar la misma cantidad de cache) es suficiente.
- **Despacho:** Cantidad y ubicacion_origen en cada PICK; puede sumar en StockUbicacion. Inversa en cache sería sumar la misma cantidad.
- **Transferencias:** Cantidad, ubicacion_origen, ubicacion_destino en movimientos; TransferenciaProcesada tiene location_id y nombre origen/destino. Con eso se puede aplicar inversa en cache (sumar origen, restar destino). Hoy solo se revierte StockUbicacion cuando hay ADESA.
- **Ajustes:** En físico, “Anterior” en notas permite restaurar StockUbicacion. En ADM, “Anterior” y “Nuevo” están en notas pero la reversión no escribe en StockProductoADM ni elimina fila creada.

### Qué no soporta hoy

- Restaurar **StockProductoADM** en recepción, despacho, transferencias y ajustes ADM.
- Eliminar o restaurar la fila creada en ajuste ADM sin fila previa (y hoy esa fila puede ser invisible si sync_run_id es NULL).
- Control explícito “documento ya revertido” para evitar doble reversión (depende de estado PROCESADA/PENDIENTE; si se permite revertir solo una vez, falta garantizar idempotencia o flag).

### Qué tendría que cambiar

- **Por módulo:** Añadir en cada reversión los mismos dominios que el registro: si el registro escribe StockProductoADM, la reversión debe restaurar (por delta o por valor anterior desde notas).
- **Trazabilidad:** Movimiento con cantidad y ubicaciones es suficiente para reversión por delta. Para ajuste ADM hace falta usar “Anterior” en notas y aplicarlo a la fila vigente; si el ajuste creó la fila, criterio claro para “eliminar esa fila” o “poner 0” sin romper unicidad.
- **Modelo Movimiento:** No es obligatorio añadir campos nuevos si la inversa es por delta; si se quisiera trazabilidad explícita de “stock cache antes/después”, podría añadirse en notas o en campos dedicados (decisión de diseño).
- **Condiciones:** Mantener “solo PROCESADA se puede revertir” y, tras revertir, dejar documento en PENDIENTE; opcionalmente marcar “revertido” para no permitir segunda reversión.

### Si hace falta guardar deltas, snapshots o ambos

- **Delta** basta para recepción, despacho y transferencias: cantidad y ubicación(es) permiten la operación inversa.
- **Snapshot “valor anterior”** ya existe en ajustes (notas); usarlo en reversión de ajuste ADM es suficiente. No es estrictamente necesario un snapshot de cache en Movimiento para los demás módulos si la reversión es “restar/sumar la misma cantidad”.

### Riesgo de doble reversión, reversión parcial o pérdida de simetría

- **Doble reversión:** Si tras revertir el documento queda PENDIENTE y el endpoint exige PROCESADA, una segunda llamada fallaría por estado; si en algún flujo se pudiera “reprocesar” y volver a PROCESADA, habría riesgo. Recomendable: no permitir revertir si ya está revertido (por estado o flag).
- **Reversión parcial:** Hoy en transferencias y ajustes ADM la reversión es parcial (solo físico o solo movimiento). Al implementar restauración de cache, debe hacerse en la misma transacción que el resto para evitar estados intermedios.
- **Simetría:** Se recupera implementando, en cada reversión, todas las escrituras inversas (StockUbicacion y StockProductoADM según lo que haga el registro).

### Condiciones para una reversión “fuerte y comprobable”

- Estado del documento permita revertir solo una vez (o operación idempotente).
- Transacción de BD: o se revierte todo (movimientos, físico, cache, estado) o nada.
- Trazabilidad: poder ver qué se revirtió (movimientos con cantidad y ubicaciones; opcionalmente valor anterior en notas).
- No dejar filas “fantasma” (ej. StockProductoADM creado por ajuste sin run y no eliminado al revertir).

---

## D. Evaluación de discrepancias

### Qué seguiría funcionando

- **Creación en sync:** Se hace con el run recién creado desde ADM y StockUbicacion; no depende de que los módulos operativos escriban cache. Seguiría igual.
- **actualizar_discrepancias_por_skus:** Recalcula stock_fisico_wms desde StockUbicacion y marca resuelto si cuadra con stock_erp. Sigue siendo válido.
- **Solo ADESA:** Si se mantiene la limitación a ADESA, no hay cambio conceptual: las transacciones que actualicen cache ADM de ADESA no cambian cómo la sync crea discrepancias (la sync usa su propio run recién creado).

### Qué habría que ajustar

- **Ningún cambio obligatorio** en la lógica actual de discrepancias para cumplir la arquitectura objetivo. Opcionalmente:
  - Si en el futuro se quieren discrepancias por ubicación no-ADESA, haría falta un equivalente a validar_adm_vs_fisico para otras ubicaciones (y definir “físico” por ubicación).
  - Si se quiere distinguir “desfase temporal hasta sync” vs “error real”, podría añadirse clasificación o estados (ej. “temporal” vs “confirmada”); eso podría tocar la sync o el post-proceso de discrepancias (Regla 19 de tus reglas).
- **Reversión completa y simétrica:** Ayudaría a que, tras revertir, el físico (y si se usa cache en la comparación en el futuro) vuelva al estado previo; actualizar_discrepancias_por_skus podría resolver más a menudo correctamente.

### Cambios conceptuales si toda transacción afecta cache ADM

- La comparación actual es “ADM (run de la sync) vs físico (StockUbicacion)”. No se compara con “cache vigente” para crear discrepancias. Por tanto, que las transacciones actualicen la cache no obliga a cambiar la definición de discrepancia: la “verdad” para comparar sigue siendo el run que trae la sync desde ADM. La cache actualizada por WMS es solo vista coherente hasta la próxima sync.

---

## E. Plan de ejecución por fases

### Fase 1: Revisión y definición (sin tocar código)

- **Revisar / definir primero:**
  - Regla de negocio: ajuste físico individual ¿puede o debe corregir también cache ADM de una ubicación ADM? Documentar decisión.
  - Despacho desde no-ADESA: ¿siempre hay bin físico o puede ser solo cache? Definir escenarios soportados.
  - Recepción no-ADESA: cómo se obtiene de forma estable location_id (y nombre) de la ubicación ADM del documento para escribir y revertir cache.
- **Cerrar reglas de negocio:**
  - Tipos de documento: confirmar que los tres de recepción y los tres de despacho comparten la misma regla de inventario (físico + cache por ubicación ADM).
  - Transferencias ADESA↔ADESA: confirmar que no se toca cache ADM (neto 0).
- **Riesgos a eliminar antes de tocar nada:**
  - Confirmar que en ningún módulo se crea SyncRun ni se escribe SyncLocationStatus.current_run_id; solo lectura de current_run_id donde haga falta.
  - Confirmar unicidad (producto_id, location_id, sync_run_id) en StockProductoADM y que la sync no asume “solo hay filas creadas por sync”.

### Fase 2: Orden de módulos y dependencias

- **Orden recomendado:**
  1. **Ajustes** (individual ADM): menor superficie; ya escriben StockProductoADM. Cambios: (1) al crear fila, asignar sync_run_id=current_run_id; (2) en reversión, restaurar valor desde notas o eliminar fila si se creó. Valida que la sync no se rompe y que no hay filas invisibles.
  2. **Transferencias**: ya actualizan cache para no-ADESA; falta (1) actualizar cache cuando ADESA es origen o destino; (2) en reversión, restaurar StockProductoADM en todos los casos (origen y destino, ADESA y no-ADESA según corresponda). Depende de tener claro location_id origen/destino en reversión.
  3. **Recepción**: añadir actualización de StockProductoADM (origen ADESA y no-ADESA) en registro y reversión. Reutiliza el patrón de transferencias (obtener_stock_vigente, sumar).
  4. **Despacho**: añadir actualización de StockProductoADM (ADESA y no-ADESA según documento) en registro y reversión (restar en registro, sumar en reversión).
- **Por qué ese orden:** Ajustes ya tocan cache y son más acotados; transferencias ya tienen parte del comportamiento; recepción y despacho son los que más impacto tienen y se apoyan en el mismo patrón ya probado en transferencias y ajustes.

### Fase 3: Cambios estructurales y afectación

- **Tablas / modelos:**
  - **StockProductoADM:** Sin cambio de esquema. Uso: solo UPDATE (o INSERT con sync_run_id=current_run_id en ajuste cuando no exista fila). La sync sigue creando filas con su run_id; los módulos no crean runs.
  - **Movimiento:** Sin cambio obligatorio. Opcional: ampliar notas o campos para “stock_cache_antes” si se quiere trazabilidad explícita; no imprescindible si la reversión es por delta.
  - **Documentos (FacturaProcesada, RecepcionProcesada, TransferenciaProcesada):** Sin cambio de esquema; opcional flag “revertido” si se quiere impedir doble reversión sin depender solo de estado.
- **Funciones / helpers:**
  - **obtener_stock_vigente:** Sin cambio; los módulos la usan en lectura y luego actualizan el objeto devuelto (mismo run).
  - **Nuevo helper opcional:** “actualizar_cache_adm(producto_id, location_id, delta)” o “establecer_stock_cache(producto_id, location_id, valor)” que lea vigente, actualice o cree (solo en ajustes con current_run_id) sin tocar runs. Centraliza la regla “solo fila vigente”.
- **Rutas afectadas:**
  - **Ajustes:** registro (crear fila con sync_run_id=current_run_id), revertir_ajuste (restaurar StockProductoADM desde notas; si creó fila, eliminarla o poner 0).
  - **Transferencias:** registro (actualizar cache cuando ADESA origen/destino), revertir_transferencia (restaurar StockProductoADM origen y destino por cantidad y location_id).
  - **Recepciones:** registro (sumar cache ADM ubicación documento), revertir_recepcion (restar cache ADM).
  - **Despacho:** registro (restar cache ADM ubicación documento), revertir_despacho (sumar cache ADM).
- **Sync / SyncRun / current_run_id:** Ningún cambio en sincronizar.py; los módulos solo leen current_run_id y escriben en filas con ese sync_run_id.

### Fase 4: Validación de que no se rompe nada

- **Sync:**
  - Ejecutar sync completa por ubicación; verificar que se crea nuevo run, se insertan filas con sync_run_id=nuevo_run, current_run_id pasa a nuevo_run, y que las consultas vigentes devuelven solo datos del nuevo run.
  - Verificar que no queden referencias a runs eliminados ni que los módulos operativos escriban en tablas de sync (SyncRun, SyncLocationStatus).
- **Staging:**
  - Con current_run_id definido: registrar recepción/despacho/transferencia/ajuste ADM; comprobar que el stock vigente (obtener_stock_vigente y pantallas) refleja el cambio; ejecutar sync; comprobar que el valor vigente pasa a ser el de ADM (sobrescritura).
  - Ajuste ADM sin fila vigente: crear fila con sync_run_id=current_run_id; comprobar que es visible; revertir y comprobar que la fila se elimina o se restaura.
- **Legacy:**
  - Entornos con sync_run_id=None / sin current_run_id: verificar que obtener_stock_vigente sigue devolviendo el fallback y que no se asume current_run_id obligatorio en rutas que ya funcionan.
- **Reversión:**
  - Por cada módulo: registrar transacción, comprobar físico y cache; revertir; comprobar que físico y cache vuelven al valor anterior (simetría).
  - Transferencias: casos ADESA↔no-ADESA y no-ADESA↔no-ADESA; verificar que la reversión restaura ambas caches.
- **Discrepancias:**
  - Tras sync ADESA: comprobar que se crean discrepancias cuando ADM=0 y físico>0 (o según reglas actuales).
  - Tras registrar y revertir: comprobar que actualizar_discrepancias_por_skus actualiza/resuelve según físico y que no aparecen comportamientos raros.

### Fase 5: Pruebas por escenario y tipo

- **Por escenario:** Ejecutar los casos A1–A3, B1–B3, C1–C4, D1–D4 del análisis: registro → vista inmediata → reversión → vista posterior; comprobar simetría y que la sync posterior sobrescribe correctamente.
- **Por tipo de documento:** Recepción (Conduce, Compra proveedor, Nota crédito); Despacho (Contado, Crédito, Conduce); comprobar que el comportamiento de inventario es el mismo y que la reversión es la misma.
- **Simetría registro/reversión:** Para cada tipo de transacción, comparar estado (StockUbicacion + StockProductoADM por ubicación) antes del registro y después de la reversión; deben coincidir.
- **Persistencia y visibilidad:** Tras registro, recargar pantalla y consultas API; el valor debe seguir siendo el actualizado hasta que corra la sync.
- **Concurrencia (si aplica):** Dos recepciones/despachos del mismo producto/ubicación en ventana corta; verificar que los UPDATE en cache y el commit no dejen valores inconsistentes (transacciones bien acotadas).

---

## F. Conclusión final

### Si el sistema actual soporta o no este modelo

**Sí lo soporta**, con cambios acotados en los módulos operativos (recepción, despacho, transferencias, ajustes) y en la lógica de reversión. No requiere cambiar la sync ni el modelo de runs ni la creación de discrepancias en la sync.

### Qué partes sí pueden adaptarse

- **Modelo de lectura vigente:** Ya es compatible: los módulos pueden actualizar la fila con sync_run_id=current_run_id y la vista vigente lo refleja; la sync sigue siendo la que asigna el nuevo current_run_id y sobrescribe.
- **Recepción y despacho:** Añadir escritura y reversión de StockProductoADM por ubicación ADM del documento.
- **Transferencias:** Extender escritura de cache a ADESA (origen/destino) y extender la reversión a StockProductoADM en todos los casos.
- **Ajustes:** Asignar sync_run_id=current_run_id al crear fila; en reversión, restaurar o eliminar esa fila según corresponda.
- **Discrepancias:** Sin cambios obligatorios; opcionalmente evolución para “temporal vs real” o para otras ubicaciones.

### Qué partes requieren rediseño

- **Reversión** en transferencias y ajustes: no es un rediseño de modelo de datos, sino completar la lógica para que restaure también StockProductoADM (y en ajustes, usar “Anterior” o eliminar fila creada).
- **Ajuste ADM sin fila vigente:** Comportamiento actual (crear sin sync_run_id) no cumple la arquitectura objetivo; hay que asignar sync_run_id=current_run_id y que la reversión deje el sistema como antes (eliminar fila o valor anterior).

### Qué riesgo principal existe

- **Inconsistencia entre físico y cache** si la reversión se implementa de forma parcial (por ejemplo se restaura físico pero falla la restauración de cache y no hay rollback). Mitigación: una sola transacción de BD por reversión (movimientos, StockUbicacion, StockProductoADM, estado del documento) y pruebas explícitas de simetría por escenario.

### Cuál sería el orden correcto para implementarlo sin romper el sistema

1. **Fase 1** (definición y reglas): Cerrar reglas de negocio y confirmar que no se toca sync ni runs.
2. **Fase 2** (módulos en orden): Ajustes (vigencia y reversión ADM) → Transferencias (cache ADESA + reversión completa) → Recepciones (cache + reversión) → Despacho (cache + reversión).
3. **Fase 3** (cambios): Implementar por módulo usando solo UPDATE/INSERT en StockProductoADM sobre fila vigente, sin tocar SyncRun ni current_run_id.
4. **Fase 4** (validación): Sync, staging, legacy, reversión y discrepancias como arriba.
5. **Fase 5** (pruebas): Escenarios A–D, tipos de documento, simetría, visibilidad y, si aplica, concurrencia.

Con este orden se minimiza el impacto, se reutiliza el patrón ya usado en transferencias y ajustes, y la sync permanece intacta como fuente de verdad desde ADM.

---

*Documento de viabilidad y plan; no se ha modificado ningún archivo del proyecto.*
