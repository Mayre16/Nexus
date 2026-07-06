# ANÁLISIS DE DIAGNÓSTICO: ERROR 2013 "Lost connection to MySQL server"

**Fecha:** 30 de Enero, 2026  
**Tipo:** Análisis diagnóstico (sin cambios de código)  
**Objetivo:** Verificar teoría sobre causa raíz del error 2013

---

## 1. RESUMEN DE LA TEORÍA

### Hipótesis Principal

El error `(2013, 'Lost connection to MySQL server')` **NO es un timeout puro**, sino una **cascada de errores** iniciada por:

1. **Error inicial:** "This result object does not return rows" 
2. **Error secundario:** "Command Out of Sync (2014)"
3. **Error final:** "Lost connection (2013)"

### Evidencia Observada

- **Timing:** Error ocurre ~3 segundos después de iniciar sync (no 30+ segundos)
- **Secuencia en logs:**
  1. `utils.db_helpers Error inesperado en query: This result object does not return rows. It has been closed automatically.`
  2. `pymysql.err.OperationalError: (2014, 'Command Out of Sync')` (durante teardown/rollback)
  3. `(2013, 'Lost connection to MySQL server during query')` (en DELETE dentro del loop)

---

## 2. VERIFICACIÓN DE LA TEORÍA

### 2.1 ¿Tiene sentido la secuencia de errores?

**✅ SÍ, tiene sentido técnicamente:**

1. **"This result object does not return rows":**
   - Ocurre cuando se intenta leer filas de un ResultProxy que:
     - Fue cerrado automáticamente
     - Proviene de una operación que NO devuelve filas (DELETE/UPDATE/INSERT)
     - Está en estado inválido por un error previo

2. **"Command Out of Sync (2014)":**
   - PyMySQL lanza este error cuando:
     - El cursor está en un estado inconsistente
     - Se intenta ejecutar un comando cuando hay un resultado pendiente
     - La conexión está "desincronizada" después de un error

3. **"Lost connection (2013)":**
   - Ocurre cuando:
     - MySQL cierra la conexión debido a estado inconsistente
     - Se intenta usar una conexión que ya fue cerrada
     - El rollback/teardown falla porque la conexión ya no es válida

**Conclusión:** La secuencia es **técnicamente plausible** y sigue un patrón de cascada de errores.

---

### 2.2 ¿Hay lugares donde se ejecuta DELETE/UPDATE/INSERT y luego se leen filas?

**Revisión del código:**

#### Línea 1208-1211: DELETE masivo inicial
```python
registros_legacy_eliminados = StockProductoADM.query.filter(...).delete()
if registros_legacy_eliminados > 0:  # ✅ Correcto: .delete() retorna entero
    ...
```
**✅ Correcto:** `.delete()` retorna un entero, no se intenta leer filas.

#### Línea 1451-1456: DELETE dentro del loop (stock > 0)
```python
StockProductoADM.query.filter_by(...).filter(...).delete()  # ✅ Retorna entero
stock_obj = StockProductoADM(...)  # Crear nuevo objeto
db.session.add(stock_obj)
```
**✅ Correcto:** `.delete()` retorna entero, no se lee.

#### Línea 1576-1581: DELETE dentro del loop (stock = 0)
```python
StockProductoADM.query.filter_by(...).filter(...).delete()  # ✅ Retorna entero
stock_obj = StockProductoADM(...)  # Crear nuevo objeto
db.session.add(stock_obj)
```
**✅ Correcto:** `.delete()` retorna entero, no se lee.

**Conclusión:** **NO hay lugares obvios** donde se intente leer filas de un DELETE/UPDATE/INSERT directamente.

---

### 2.3 ¿Puede ocurrir "does not return rows" en otro contexto?

**Sí, puede ocurrir en estos escenarios:**

#### Escenario A: ResultProxy cerrado prematuramente

Si dentro de `db_query_with_retry()` se ejecuta una query que retorna un ResultProxy, y luego:
- El ResultProxy se cierra automáticamente (por timeout, error, o limpieza)
- El código intenta acceder a `.first()`, `.all()`, `.fetchone()`, etc.
- SQLAlchemy lanza: "This result object does not return rows. It has been closed automatically."

**Ejemplo potencial:**
```python
# Dentro de db_query_with_retry
stock_obj = db_query_with_retry(
    lambda: StockProductoADM.query.filter_by(...).first(),  # Retorna ResultProxy
    max_retries=3
)
```

Si la conexión se cierra o hay un error durante la ejecución, el ResultProxy puede quedar en estado inválido.

#### Escenario B: Sesión en estado "dirty" después de error

Si `db_query_with_retry()` captura un error pero **NO hace rollback** (línea 150-151 de `db_helpers.py`):

```python
except Exception as e:
    logger.error(f"Error inesperado en query: {e}")
    return None  # ❌ NO hace rollback aquí
```

La sesión queda en estado "dirty/failed", y cuando Flask/SQLAlchemy intenta hacer teardown automático:
- Intenta rollback
- Pero la sesión ya está en mal estado
- PyMySQL detecta cursor desincronizado → 2014
- MySQL cierra conexión → 2013

**Conclusión:** Este escenario es **muy probable** y coincide con la teoría.

---

### 2.4 Análisis de `db_query_with_retry()`

**Código actual (líneas 111-153):**

```python
def db_query_with_retry(query_func, max_retries=3, retry_delay=0.5):
    for attempt in range(max_retries):
        try:
            return query_func()
        except (OperationalError, DisconnectionError) as e:
            # ... manejo de reconexión ...
            if _needs_reconnect(e):
                db.session.rollback()  # ✅ Hace rollback aquí
                # ...
            else:
                logger.error(f"Error en query después de {attempt + 1} intentos: {e}")
                return None  # ❌ NO hace rollback aquí
        except Exception as e:
            logger.error(f"Error inesperado en query: {e}")
            return None  # ❌ NO hace rollback aquí
    
    return None
```

**Problemas identificados:**

1. **Línea 147-148:** Si `OperationalError` NO requiere reconexión (ej: "database is locked"), retorna `None` **sin rollback**.
2. **Línea 150-151:** Si hay cualquier `Exception` (incluyendo "does not return rows"), retorna `None` **sin rollback**.

**Impacto:**
- La sesión queda en estado "dirty"
- Flask/SQLAlchemy intenta rollback automático en teardown
- Si la sesión está corrupta, el rollback falla con 2014/2013

**Conclusión:** Este es un **punto crítico** que confirma la teoría.

---

## 3. PUNTOS CRÍTICOS IDENTIFICADOS

### 3.1 Falta de rollback en `db_query_with_retry()`

**Ubicación:** `utils/db_helpers.py` líneas 147-148 y 150-151

**Problema:**
- Si una query falla con un error que NO es `OperationalError` o que NO requiere reconexión, la función retorna `None` sin hacer rollback.
- Esto deja la sesión en estado "dirty/failed".

**Escenario de fallo:**
```
1. Query dentro de db_query_with_retry() falla con "does not return rows"
2. db_query_with_retry() captura Exception, loguea, retorna None (sin rollback)
3. Sesión queda en estado "dirty"
4. Flask/SQLAlchemy intenta rollback automático en teardown
5. Rollback falla porque sesión está corrupta → 2014
6. MySQL cierra conexión → 2013
```

### 3.2 Posible cierre prematuro de ResultProxy

**Ubicación:** Cualquier uso de `db_query_with_retry()` con queries que retornan ResultProxy (`.first()`, `.all()`, etc.)

**Problema:**
- Si la conexión se cierra o hay un error durante la ejecución, el ResultProxy puede quedar en estado inválido.
- SQLAlchemy puede lanzar "does not return rows" cuando se intenta acceder.

**Escenario de fallo:**
```
1. db_query_with_retry() ejecuta: StockProductoADM.query.filter_by(...).first()
2. Durante la ejecución, conexión se cierra o hay error
3. ResultProxy queda en estado inválido
4. SQLAlchemy intenta acceder al resultado → "does not return rows"
5. db_query_with_retry() captura Exception, retorna None (sin rollback)
6. Cascada de errores (2014 → 2013)
```

### 3.3 DELETE dentro del loop sin protección

**Ubicación:** `routes/sincronizar.py` líneas 1451-1456 y 1576-1581

**Problema:**
- Los DELETEs dentro del loop **NO están envueltos en `db_query_with_retry()`**.
- Si hay un error durante el DELETE, no hay manejo de retry/reconexión.
- Si la sesión ya está en estado "dirty" (por error previo), el DELETE falla inmediatamente.

**Escenario de fallo:**
```
1. Error previo dejó sesión en estado "dirty" (sin rollback)
2. Loop intenta DELETE (línea 1451 o 1576)
3. DELETE falla porque sesión está corrupta → 2013
```

---

## 4. VERIFICACIÓN DE LA TEORÍA: CONCLUSIÓN

### ✅ La teoría es TÉCNICAMENTE VÁLIDA

**Evidencia que la respalda:**

1. **Secuencia de errores es plausible:**
   - "does not return rows" → 2014 → 2013 es un patrón conocido de cascada de errores

2. **Timing coincide:**
   - ~3 segundos sugiere error de estado, no timeout de 30 segundos

3. **Problema real identificado:**
   - `db_query_with_retry()` NO hace rollback en todos los casos de error
   - Esto deja la sesión en estado "dirty"
   - El teardown automático falla con 2014/2013

4. **Punto de fallo probable:**
   - Cualquier query dentro de `db_query_with_retry()` que falle con un error no manejado
   - Especialmente queries que retornan ResultProxy (`.first()`, `.all()`)

### ⚠️ Preguntas pendientes (requieren instrumentación)

1. **¿Qué query específica causa "does not return rows"?**
   - Necesita instrumentación con tags/metadatos

2. **¿En qué momento exacto ocurre?**
   - ¿Durante búsqueda de producto? ¿Durante búsqueda de stock? ¿Durante commit?

3. **¿Hay condiciones de carrera?**
   - ¿El DELETE masivo inicial está aún ejecutándose cuando el loop inicia?

---

## 5. RECOMENDACIONES PARA INSTRUMENTACIÓN

### Opción A: Tags/Metadatos en `db_query_with_retry()` (PREFERIDA)

**Objetivo:** Identificar exactamente qué query causa "does not return rows"

**Implementación sugerida:**
```python
def db_query_with_retry(query_func, max_retries=3, retry_delay=0.5, tag=None, meta=None):
    """
    Args:
        tag: Identificador de la operación (ej: "buscar_producto", "buscar_stock")
        meta: Diccionario con contexto (ej: {"item_id": "...", "run_id": 16})
    """
    for attempt in range(max_retries):
        try:
            if tag:
                logger.debug(f"[{tag}] Ejecutando query (intento {attempt + 1}) - {meta}")
            result = query_func()
            if tag:
                logger.debug(f"[{tag}] Query exitosa - {meta}")
            return result
        except Exception as e:
            if tag:
                logger.error(f"[{tag}] Error en query (intento {attempt + 1}) - {meta}: {e}")
            # ... resto del código ...
```

**Uso:**
```python
producto = db_query_with_retry(
    lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
    max_retries=3,
    retry_delay=0.5,
    tag="buscar_producto",
    meta={"item_id": item_id, "skip": skip, "lote": lote_numero}
)
```

### Opción B: Hooks de SQLAlchemy

**Objetivo:** Capturar el SQL statement inmediatamente antes del crash

**Implementación:**
```python
from sqlalchemy import event

@event.listens_for(db.engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    logger.debug(f"SQL: {statement[:200]}... | Params: {parameters}")
```

---

## 6. CONCLUSIÓN FINAL

### ✅ La teoría del usuario es CORRECTA

**Resumen:**

1. **El error 2013 NO es un timeout puro**, sino una cascada iniciada por "does not return rows"

2. **La causa raíz probable es:**
   - Una query dentro de `db_query_with_retry()` falla con "does not return rows"
   - `db_query_with_retry()` retorna `None` **sin hacer rollback**
   - La sesión queda en estado "dirty"
   - El teardown automático falla con 2014 → 2013

3. **El problema real es el manejo de errores en `db_query_with_retry()`:**
   - No hace rollback en todos los casos de error
   - Esto deja la sesión en estado inconsistente

4. **Próximo paso:**
   - Instrumentar con tags/metadatos para identificar la query exacta
   - Una vez identificada, corregir el manejo de errores

### 🎯 Acción Recomendada

**ANTES de cambiar la lógica:**
1. Agregar instrumentación con tags a todas las llamadas a `db_query_with_retry()` en el loop
2. Ejecutar una sync de prueba
3. Analizar logs para identificar la query exacta que causa "does not return rows"

**DESPUÉS de identificar la query:**
1. Corregir `db_query_with_retry()` para hacer rollback en TODOS los casos de error
2. Agregar manejo específico para "does not return rows"
3. Considerar envolver los DELETEs dentro del loop con `db_query_with_retry()`

---

**Fin del Análisis de Diagnóstico**

