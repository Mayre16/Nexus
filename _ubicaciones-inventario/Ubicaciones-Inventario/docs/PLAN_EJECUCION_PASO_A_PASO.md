# Plan de ejecución paso a paso

**Objetivo:** Alinear el sistema con la arquitectura objetivo (Reglas 1–24) sin romper la sync, staging, legacy ni discrepancias.

**Convención:** Cada paso indica qué archivo, qué función, qué líneas aproximadas y qué cambio concreto.

---

## PASO 0: Helper centralizado de cache ADM

**Archivo:** `utils/helpers.py`

**Qué hacer:** Crear una función reutilizable que todos los módulos usen para actualizar `StockProductoADM`.

**Función: `actualizar_cache_adm(producto_id, location_id, delta, modo='delta')`**

Comportamiento:
- Llama internamente a `obtener_stock_vigente(producto_id, location_id)`.
- Si la fila vigente existe: aplica `fila.stock += delta` (modo delta) o `fila.stock = delta` (modo absoluto para ajustes).
- Si la fila vigente **no existe** y se necesita crear:
  - Lee `SyncLocationStatus.current_run_id` de esa `location_id`.
  - Crea `StockProductoADM` con `sync_run_id = current_run_id` (no NULL).
  - Si no hay `current_run_id` (legacy), crea con `sync_run_id = None` (fallback legacy compatible).
- Devuelve `(stock_anterior, stock_nuevo, fila_creada)` para trazabilidad.
- No toca `SyncRun`, no toca `current_run_id`, no crea runs.

**Función: `revertir_cache_adm(producto_id, location_id, delta, fila_fue_creada=False)`**

Comportamiento:
- Si `fila_fue_creada`: elimina la fila de `StockProductoADM` (producto_id, location_id, sync_run_id vigente).
- Si no fue creada: aplica `fila.stock -= delta` (o `+= delta` según signo).
- Devuelve True/False.

**Por qué primero:** Centraliza la regla "solo fila vigente" y evita repetir el patrón `obtener_stock_vigente` → update/create en cada módulo. Todos los pasos siguientes lo usarán.

**Validación:** Tras crear este helper, verificar que `obtener_stock_vigente` sigue devolviendo la fila correcta y que no se escriben filas con `sync_run_id=None` cuando hay `current_run_id`.

---

## PASO 1: Ajustes — Registro ADM (corregir fila invisible)

**Archivo:** `routes/ajustes.py`  
**Función:** `registrar_ajuste` (~línea 111)  
**Zona:** Bloque de ajuste ADM, líneas ~377–393

### 1.1 Cambio en registro

**Situación actual (líneas 385–391):**  
Cuando no existe fila vigente, se crea `StockProductoADM` **sin** `sync_run_id`:
```python
stock_adm = StockProductoADM(
    producto_id=producto_db.id,
    location_id=location_id,
    location_name=ubicacion_adm,
    stock=cantidad_nueva,
    updated_at=datetime.utcnow()
)
```

**Cambio requerido:**  
Reemplazar la creación directa con el helper `actualizar_cache_adm` en modo absoluto, que asigna `sync_run_id = current_run_id`. También reemplazar la actualización existente (líneas 379–381) para usar el mismo helper.

**Notas del movimiento** (línea 396): ya guardan `"Anterior: X, Nuevo: Y"` — no hace falta cambiar.

### 1.2 Guardar si la fila fue creada

En las notas del movimiento (o en un campo adicional), indicar si la fila fue **creada** por este ajuste. Esto se necesita para la reversión.

Opción simple: añadir al texto de notas `" [FILA_CREADA]"` cuando se crea una nueva fila. Es parseable y no rompe nada existente.

---

## PASO 2: Ajustes — Reversión ADM (restaurar cache)

**Archivo:** `routes/ajustes.py`  
**Función:** `revertir_ajuste` (~línea 1418)  
**Zona:** Bloque `else` cuando NO es ubicación física, líneas ~1546–1547

### 2.1 Situación actual

Cuando no es ubicación física (ajuste ADM), solo elimina el movimiento y muestra *"No se modificó stock físico (ajuste ADM – solo auditoría)"*. **No restaura StockProductoADM.**

### 2.2 Cambio requerido

Antes de eliminar el movimiento:

1. Leer "Anterior:" de las notas del movimiento (mismo parseo que ya existe en líneas 1493–1500).
2. Identificar `location_id` de la ubicación ADM:
   - `ubicacion_destino` del movimiento contiene el nombre de la ubicación ADM.
   - Buscar `SyncLocationStatus` por `location_name` para obtener `location_id`.
   - O buscar directamente `StockProductoADM` vigente por SKU y `location_name`.
3. Si las notas contienen `[FILA_CREADA]`: usar `revertir_cache_adm` con `fila_fue_creada=True` (elimina la fila).
4. Si no: usar `revertir_cache_adm` para restaurar el valor anterior (poner `stock = cantidad_anterior` leído de notas).
5. Eliminar el movimiento.

### 2.3 Validación paso 1+2

- Registrar ajuste ADM con fila vigente existente → verificar que se actualizó.
- Revertir → verificar que volvió al valor anterior.
- Registrar ajuste ADM sin fila vigente (staging) → verificar que la fila se crea con `sync_run_id = current_run_id` y es visible.
- Revertir → verificar que la fila se elimina.
- Ejecutar sync → verificar que la sync sobrescribe normalmente.
- Ajuste masivo Excel: no requiere cambios (solo físico); verificar que sigue funcionando igual.

---

## PASO 3: Transferencias — Registro con cache ADESA

**Archivo:** `routes/transferencias.py`  
**Función:** `registrar_transferencia` (~línea 660)  
**Zona:** Bloque de origen y destino, líneas ~840–1020

### 3.1 Situación actual

- **Origen no-ADESA** (líneas 908–916): ya resta cache con `obtener_stock_vigente`.
- **Destino no-ADESA** (líneas 991–1001): ya suma cache con `obtener_stock_vigente`.
- **Origen ADESA:** solo resta `StockUbicacion`; **no toca cache ADESA**.
- **Destino ADESA:** solo suma `StockUbicacion`; **no toca cache ADESA**.

### 3.2 Cambio requerido — Origen

Después de restar `StockUbicacion` para origen ADESA (rama `if origen_es_adesa`), añadir:

```
actualizar_cache_adm(producto_id, location_id_origen, -cantidad_total)
```

Esto resta de la cache ADM de ADESA la cantidad transferida.

**Excepción ADESA→ADESA (C1):** Si `origen_es_adesa` **y** `destino_es_adesa`, el neto de cache ADESA es 0. Se puede:
- Opción A: no tocar cache en este caso (neto 0).
- Opción B: restar en origen y sumar en destino (consistente, el neto es 0 de todos modos).

Recomendación: Opción A (no tocar cache ADESA→ADESA) por simplicidad; documentar con comentario.

### 3.3 Cambio requerido — Destino

Después de sumar `StockUbicacion` para destino ADESA (rama `if destino_es_adesa`), añadir:

```
actualizar_cache_adm(producto_id, location_id_destino, +cantidad_total)
```

Mismo criterio: si ambos son ADESA, no ejecutar (o hacerlo simétricamente).

### 3.4 Unificar ramas no-ADESA

Las ramas existentes para origen/destino no-ADESA (líneas 908–916 y 991–1001) pueden migrarse a usar el mismo helper `actualizar_cache_adm`. Esto simplifica y centraliza, pero no es obligatorio; si se prefiere, dejar como está y solo añadir las ramas ADESA.

---

## PASO 4: Transferencias — Reversión completa

**Archivo:** `routes/transferencias.py`  
**Función:** `revertir_transferencia` (~línea 1138)  
**Zona:** Bloque de reversión, líneas ~1174–1230

### 4.1 Situación actual

- Solo revierte `StockUbicacion` cuando destino/origen es ADESA.
- **No revierte StockProductoADM en ningún caso.**

### 4.2 Datos disponibles para reversión

`TransferenciaProcesada` tiene:
- `location_id_origen`, `location_name_origen`
- `location_id_destino`, `location_name_destino`

Estos datos permiten identificar qué cache restaurar.

### 4.3 Cambio requerido

Después de revertir `StockUbicacion` (lo que ya existe), añadir:

**4.3.1 Revertir cache origen:**  
Si durante el registro se restó cache de origen (origen no-ADESA, o si se implementó 3.2 para ADESA):

```
actualizar_cache_adm(producto_id, transferencia.location_id_origen, +cantidad)
```

Excepto si ADESA→ADESA y se eligió no tocar cache (Opción A del paso 3).

**4.3.2 Revertir cache destino:**  
Si durante el registro se sumó cache en destino:

```
actualizar_cache_adm(producto_id, transferencia.location_id_destino, -cantidad)
```

Mismo criterio de excepción ADESA→ADESA.

**4.3.3 Obtener producto_id:**  
Desde `movimiento.sku` → `ProductoADM.query.filter_by(sku=sku).first()`.

### 4.4 Validación paso 3+4

- **C1 (ADESA→ADESA):** Registrar → verificar que cache ADESA no cambia (neto 0). Revertir → verificar que el físico vuelve y cache sigue igual.
- **C2 (ADESA→MIRADOR SUR):** Registrar → cache ADESA baja, cache MIRADOR SUR sube, físico ADESA baja. Revertir → todo vuelve a su estado anterior.
- **C3 (MIRADOR SUR→ADESA):** Registrar → cache MIRADOR SUR baja, cache ADESA sube, físico ADESA sube. Revertir → todo vuelve.
- **C4 (MIRADOR SUR→SANTIAGO):** Registrar → cache origen baja, cache destino sube. Revertir → ambas caches vuelven.
- Ejecutar sync después de cada prueba → verificar que sobrescribe normalmente.

---

## PASO 5: Recepciones — Registro con cache ADM

**Archivo:** `routes/recepciones.py`  
**Funciones:** `registrar_linea` (~línea 534) y `registrar_recepcion` (~línea 688)

### 5.1 Añadir import

Actualmente `recepciones.py` **no importa** `StockProductoADM`. Añadir a los imports:
```python
from database.models import ..., StockProductoADM
```
Y el helper:
```python
from utils.helpers import ..., actualizar_cache_adm
```

### 5.2 Datos disponibles

- `RecepcionProcesada` tiene `location_id` y `location_name`.
- En `registrar_linea`: `recepcion.location_id` y `recepcion.location_name` (líneas 534–535).
- En `registrar_recepcion`: `location_name` viene del request; `location_id` puede obtenerse de `RecepcionProcesada` o del request.

### 5.3 Cambio requerido — registrar_linea

Después de actualizar `StockUbicacion` (cuando es_adesa, líneas 589–601) **y** en la rama no-ADESA (línea ~559), añadir la llamada para sumar cache:

```
producto_db = ProductoADM.query.filter_by(sku=sku).first()
if producto_db and recepcion.location_id:
    actualizar_cache_adm(producto_db.id, recepcion.location_id, +cantidad)
```

Esto aplica **tanto para ADESA como para no-ADESA**: en ambos casos la recepción suma a la cache ADM de la ubicación del documento.

### 5.4 Cambio requerido — registrar_recepcion

Mismo patrón. Asegurar que `location_id` esté disponible (del request o de `RecepcionProcesada`).

### 5.5 Los tres tipos de documento

Recepción (Conduce), Compra con Recepción (Proveedor), Nota de Crédito (Devolución): la lógica de inventario no depende del tipo hoy; el cambio aplica igual a los tres porque comparten la misma rama de escritura.

---

## PASO 6: Recepciones — Reversión con cache ADM

**Archivo:** `routes/recepciones.py`  
**Función:** `revertir_recepcion` (~línea 940)  
**Zona:** Después de revertir `StockUbicacion` (líneas 1010–1023)

### 6.1 Situación actual

- Si es_adesa: resta de `StockUbicacion` por cada movimiento.
- Si no es_adesa: no toca stock.
- **Nunca toca StockProductoADM.**

### 6.2 Datos disponibles

- `RecepcionProcesada` (variable `recepcion_proc`): tiene `location_id` y `location_name`.
- Cada movimiento tiene `sku` y `cantidad`.

### 6.3 Cambio requerido

Después del bucle de movimientos (antes de eliminar), para cada movimiento:

```
producto_db = ProductoADM.query.filter_by(sku=movimiento.sku).first()
if producto_db and recepcion_proc.location_id:
    actualizar_cache_adm(producto_db.id, recepcion_proc.location_id, -float(movimiento.cantidad))
```

Esto aplica para ADESA y no-ADESA: si en el registro se sumó cache, en la reversión se resta.

### 6.4 Discrepancias

`actualizar_discrepancias_por_skus` ya se llama en la reversión (líneas 1038–1043). Hoy solo se llama `if es_adesa`; debería llamarse **siempre** (para los SKUs afectados), ya que ahora la operación siempre toca cache. Si se quiere mantener limitado a ADESA, dejar como está y solo recalcular cuando es_adesa.

### 6.5 Validación paso 5+6

- **A1 (ADESA):** Registrar recepción → verificar que cache ADESA subió y físico subió. Revertir → ambos bajan.
- **A2 (no-ADESA):** Registrar recepción → verificar que cache MIRADOR SUR subió (sin cambio físico). Revertir → cache baja.
- **A3 (tres tipos):** Repetir con Conduce, Compra Proveedor, Nota Crédito → misma lógica.
- Sync → sobrescribe normalmente.

---

## PASO 7: Despacho — Registro con cache ADM

**Archivo:** `routes/despacho.py`  
**Función:** `_crear_movimiento_pick_item` (~línea 24) y flujo de registro (~línea 154)

### 7.1 Datos disponibles

- `FacturaProcesada` tiene `location_id` y `location_name`.
- La factura se obtiene al inicio del flujo.
- `StockProductoADM` ya está importado (línea 9).

### 7.2 Cambio requerido

Hay dos opciones de dónde añadir la resta de cache:

**Opción A — En el helper `_crear_movimiento_pick_item`:**  
Añadir parámetro `location_id` y llamar `actualizar_cache_adm(producto_id, location_id, -cantidad)`. Esto centraliza pero cambia la firma de la función.

**Opción B — En el flujo principal (línea ~168):**  
Después de cada llamada a `_crear_movimiento_pick_item`, acumular la cantidad total por SKU y al final del bucle restar de cache una sola vez por SKU. Esto es más eficiente (un UPDATE por SKU en vez de uno por asignación).

Recomendación: **Opción B** — acumular por SKU y al final:

```python
for sku, cantidad_total in cantidades_por_sku.items():
    producto_db = ProductoADM.query.filter_by(sku=sku).first()
    if producto_db and factura.location_id:
        actualizar_cache_adm(producto_db.id, factura.location_id, -cantidad_total)
```

### 7.3 Los tres tipos de documento

Factura Contado, Factura Crédito, Despacho/Conduce: misma lógica de registro. El tipo no cambia nada en inventario hoy; este cambio aplica igual a los tres.

---

## PASO 8: Despacho — Reversión con cache ADM

**Archivo:** `routes/despacho.py`  
**Función:** `revertir_despacho` (~línea 420)  
**Zona:** Bucle de movimientos (líneas ~455–468)

### 8.1 Situación actual

Suma en `StockUbicacion` y elimina movimiento. No toca `StockProductoADM`.

### 8.2 Datos disponibles

- `factura` (FacturaProcesada): tiene `location_id` y `location_name`.
- Cada movimiento tiene `sku` y `cantidad`.

### 8.3 Cambio requerido

Similar a recepciones: acumular cantidad por SKU durante el bucle y al final sumar de vuelta en cache:

```python
for sku, cantidad_total in cantidades_por_sku.items():
    producto_db = ProductoADM.query.filter_by(sku=sku).first()
    if producto_db and factura.location_id:
        actualizar_cache_adm(producto_db.id, factura.location_id, +cantidad_total)
```

### 8.4 Validación paso 7+8

- **B1 (ADESA):** Registrar despacho → cache ADESA baja, físico baja. Revertir → ambos suben.
- **B2 (no-ADESA):** Registrar despacho → cache ubicación baja, físico baja en el bin indicado. Revertir → ambos suben.
- **B3 (tres tipos):** Contado, Crédito, Conduce → mismo comportamiento.
- Sync → sobrescribe normalmente.

---

## PASO 9: Revisión de discrepancias

**Archivo:** `utils/discrepancias.py`  
**Función:** `actualizar_discrepancias_por_skus`

### 9.1 Situación actual

Esta función recalcula `stock_fisico_wms` desde `StockUbicacion` y compara con `stock_erp`. Solo actualiza discrepancias **pendientes** ya existentes.

### 9.2 Cambio requerido

**Ninguno obligatorio.** La función sigue siendo válida: las discrepancias se crean en la sync (ADM vs físico) y se actualizan/resuelven cuando las operaciones cambian `StockUbicacion`.

### 9.3 Cambio recomendado

En los módulos que hoy solo llaman `actualizar_discrepancias_por_skus` cuando `es_adesa`:
- **Recepciones** (reversión, línea 1038): hoy `if es_adesa`. Puede dejarse así porque las discrepancias son solo de ADESA.
- Si en el futuro se extienden discrepancias a otras ubicaciones, quitar esa condición.

No es obligatorio para esta fase.

---

## PASO 10: Validación integral

### 10.1 Sync no se rompió

1. Ejecutar sync completa de ADESA.
2. Verificar que `current_run_id` se actualizó.
3. Verificar que `obtener_stock_vigente` devuelve datos del nuevo run.
4. Verificar que las filas escritas por módulos operativos (en el run anterior) ya no son "vigentes".

### 10.2 Staging

1. Con `current_run_id` definido: registrar una transacción de cada tipo.
2. Verificar que la cache se ve de inmediato.
3. Ejecutar sync.
4. Verificar que la sync sobrescribió con el valor de ADM.

### 10.3 Legacy

1. En ubicación sin `current_run_id`: verificar que `obtener_stock_vigente` usa el fallback `sync_run_id=None`.
2. Verificar que los helpers no fallan si no hay `current_run_id`.

### 10.4 Simetría registro/reversión

Para cada módulo, ejecutar la secuencia:

```
Estado_inicial = leer(StockUbicacion, StockProductoADM)
→ Registrar transacción
Estado_post_registro = leer(StockUbicacion, StockProductoADM)
→ Revertir transacción
Estado_post_reversion = leer(StockUbicacion, StockProductoADM)
→ Comparar Estado_inicial == Estado_post_reversion
```

Casos a probar:

| # | Módulo | Escenario | Físico cambia | Cache cambia |
|---|--------|-----------|---------------|--------------|
| 1 | Recepción | ADESA | Sí | Sí |
| 2 | Recepción | no-ADESA | No | Sí |
| 3 | Despacho | ADESA | Sí | Sí |
| 4 | Despacho | no-ADESA | Sí (si hay bin) | Sí |
| 5 | Transferencia | ADESA→ADESA | Sí | No (neto 0) |
| 6 | Transferencia | ADESA→no-ADESA | Sí | Sí |
| 7 | Transferencia | no-ADESA→ADESA | Sí | Sí |
| 8 | Transferencia | no-ADESA→no-ADESA | No | Sí |
| 9 | Ajuste físico | bin WMS | Sí | No |
| 10 | Ajuste ADM | con fila vigente | No | Sí |
| 11 | Ajuste ADM | sin fila vigente (staging) | No | Sí (crea) |
| 12 | Ajuste masivo Excel | bins WMS | Sí | No |

### 10.5 Discrepancias

1. Registrar recepción ADESA → ejecutar sync → verificar que no se crea discrepancia falsa.
2. Registrar despacho que deje físico en 0 → verificar que `actualizar_discrepancias_por_skus` funciona.
3. Revertir despacho → verificar que la discrepancia se resuelve si el físico vuelve a coincidir con ERP.

---

## Resumen del orden de ejecución

| Paso | Módulo | Acción | Archivos |
|------|--------|--------|----------|
| **0** | Helper | Crear `actualizar_cache_adm` y `revertir_cache_adm` | `utils/helpers.py` |
| **1** | Ajustes | Registro ADM: usar helper, asignar `sync_run_id` | `routes/ajustes.py` ~L377–393 |
| **2** | Ajustes | Reversión ADM: restaurar cache desde notas | `routes/ajustes.py` ~L1486–1547 |
| **3** | Transferencias | Registro: añadir cache cuando ADESA es origen/destino | `routes/transferencias.py` ~L840–1020 |
| **4** | Transferencias | Reversión: restaurar cache en todos los casos | `routes/transferencias.py` ~L1174–1230 |
| **5** | Recepciones | Registro: sumar cache por ubicación ADM | `routes/recepciones.py` ~L559, 589–601 |
| **6** | Recepciones | Reversión: restar cache por ubicación ADM | `routes/recepciones.py` ~L1010–1025 |
| **7** | Despacho | Registro: restar cache por ubicación ADM | `routes/despacho.py` ~L154–171 |
| **8** | Despacho | Reversión: sumar cache por ubicación ADM | `routes/despacho.py` ~L455–468 |
| **9** | Discrepancias | Revisar; sin cambio obligatorio | `utils/discrepancias.py` |
| **10** | Validación | Simetría, sync, staging, legacy, discrepancias | Todos |

---

## Dependencias entre pasos

```
Paso 0 ──────────────────────────────────────────────┐
  │                                                   │
  ├── Paso 1 → Paso 2 → Validar ajustes              │
  │                                                   │
  ├── Paso 3 → Paso 4 → Validar transferencias       │
  │                                                   │
  ├── Paso 5 → Paso 6 → Validar recepciones          │
  │                                                   │
  └── Paso 7 → Paso 8 → Validar despacho             │
                                                      │
  Paso 9 (revisión discrepancias) ────────────────────┘
                    │
              Paso 10 (validación integral)
```

El paso 0 es prerrequisito de todos los demás. Los bloques Ajustes, Transferencias, Recepciones y Despacho son independientes entre sí pero cada uno requiere registro antes de reversión. El paso 10 se ejecuta al final.

---

## Regla para cada paso

Antes de implementar cada paso, preguntarme:

1. **¿Qué dominio afecta?** (físico, cache, ambos)
2. **¿Qué tablas toca?** (StockUbicacion, StockProductoADM, Movimiento)
3. **¿Toca SyncRun o current_run_id?** (debe ser NO)
4. **¿La reversión es simétrica?** (lo que el registro suma, la reversión resta)
5. **¿Quedan filas invisibles?** (debe ser NO)
6. **¿La sync posterior sobrescribe correctamente?** (debe ser SÍ)

---

*Documento de plan; no se ha modificado ningún archivo del proyecto.*
