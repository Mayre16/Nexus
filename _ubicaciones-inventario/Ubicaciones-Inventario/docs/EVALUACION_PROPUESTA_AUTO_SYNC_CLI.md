# Evaluación de la propuesta: auto-sync vía CLI

## Resumen

La propuesta de mover el auto-sync de HTTP/curl a CLI es **viable y recomendable** en este WMS, con algunas decisiones de diseño y límites de cPanel a validar. Añadir rotación real y cooldown resuelve el ciclo infinito con ADESA.

---

## 1. Tu propuesta: cambiar cron a CLI

### Idea
- Crear `scripts/auto_sync_cli.py` que:
  - Elija la siguiente ubicación
  - Ejecute la sync internamente (sin HTTP)
- Cron ejecutaría el Python del virtualenv y escribiría logs en archivo

### Viabilidad en cPanel

| Aspecto | Análisis |
|--------|----------|
| **Acceso a Python** | cPanel con Setup Python App crea un venv (ej. `/home2/adesa/wms.adesa.com.do/venv/bin/python`). El cron debe usar esa ruta para tener las mismas dependencias. |
| **Tiempo de ejecución del cron** | Algunos hosts matan crons tras 5–15 min. Si ADESA tarda ~25 min, un cron único podría cortarse. Hay que comprobar el límite en cPanel. |
| **No hay desconexión de cliente** | Sin curl, no hay cierre de conexión. Si algo mata el proceso, será por límite de tiempo del cron o del sistema, no por “client disconnect”. |
| **App context** | La sync usa Flask (`db`, modelos, `get_adm_client`, etc.). El script debe cargar la app y usar `with app.app_context()`. |
| **Lógica reutilizable** | `sincronizar_ubicacion` es una ruta Flask. La lógica real no depende del request más allá del decorador de auth. Se puede extraer a una función llamable desde CLI. |

### Conclusión
Sí es viable. Requiere:
1. Extraer la lógica de sync a una función que acepte `location_id` y se ejecute dentro de `app.app_context()`.
2. Que el cron use el Python del venv del proyecto.
3. Confirmar en cPanel si hay límite de tiempo para crons.

---

## 2. ¿Passenger/Apache mata la request al desconectar el cliente?

**Sí, es habitual.** En entornos con Passenger:

- Si el cliente cierra la conexión (ej. curl -m 20), Passenger puede terminar el proceso que atiende esa request.
- Se suele controlar con:
  - `PassengerAbortLongRunningRequestsOnClientDisconnect` (o equivalente)
  - `PassengerSpawnMethod` (smart vs direct)
- En muchas instalaciones por defecto se aborta la request al desconectar el cliente.

Por eso el ciclo es: curl cierra → Passenger mata el worker → sync incompleta → zombie → cleanup → ADESA de nuevo.

---

## 3. ¿Por qué la lógica actual elige siempre ADESA aunque esté en error?

La prioridad en `auto_tick` es:

```python
# Para status in (partial, paused): (0, sub)
# Para el resto (pending, done, error): (1, sub)
# sub: 0=ADESA, 1=MIRADOR SUR, 2=resto
```

- `error` no se excluye, solo se salta `running`.
- Orden: partial/paused primero, luego por nombre (ADESA > MIRADOR SUR > resto).
- Cuando ADESA está en `error`, sigue siendo `(1, 0, "ADESA")`, por lo que queda antes que MIRADOR SUR `(1, 1, ...)`.
- Resultado: ADESA en error vuelve a ser la primera candidata y se repite el ciclo.

---

## 4. Ajustes mínimos para rotar ubicaciones y evitar runs incompletos

### Rotación y cooldown

| Opción | Descripción |
|--------|-------------|
| **Cooldown para error** | Si `status == 'error'`, no seleccionar esa ubicación durante N minutos (ej. 30). Campo nuevo: `last_error_at`, o reutilizar `updated_at` cuando se pone en error. |
| **Prioridad por last_sync_at** | Ordenar por `last_sync_at` ASC (más antigua primero). Requiere que `last_sync_at` se actualice bien en done/error. |
| **Round-robin** | Persistir “índice de última ubicación sincronizada” o “next_location_id” y avanzar cada vez que se complete una sync. |

### Evitar runs incompletos

| Opción | Descripción |
|--------|-------------|
| **CLI en vez de curl** | El principal cambio: sin HTTP, no hay client disconnect → no se mata la sync por cierre de conexión. |
| **Mantener heartbeat** | Corregir `datetime.utcnow` → `datetime.utcnow()` para que el cleanup de zombies funcione correctamente. |
| **Límite de tiempo del cron** | Si cPanel limita crons a 5–10 min, una sync de 25 min podría cortarse. Hay que medir o consultar documentación. |

### Combinación sugerida (mínimo)

1. Cambiar a CLI (evita client disconnect).
2. Corregir `datetime.utcnow()`.
3. Cooldown: excluir ubicaciones con `status == 'error'` y `updated_at` / `last_error_at` < hace 30 min.
4. Prioridad secundaria por `last_sync_at` ASC para favorecer a las que más tiempo llevan sin sincronizar.

---

## 5. Diseño propuesto para `auto_sync_cli.py`

### Funcionamiento

```
1. sys.path al project root; cargar app_wms
2. with app.app_context():
   a. Comprobar lock global (evitar dos crons simultáneos)
   b. Zombie cleanup (igual que tick actual)
   c. Comprobar si hay sync en curso (cualquier ubicación)
   d. Si hay sync en curso → salir (next cron lo retomará)
   e. Seleccionar siguiente ubicación (con cooldown y last_sync_at)
   f. Si ninguna candidata → salir
   g. Llamar sync_ubicacion_interno(location_id) o run_sync(location_id)
3. Escribir logs a archivo
```

### Necesidad de refactor

La lógica de `sincronizar_ubicacion` hoy está dentro de la ruta. Para reutilizarla desde CLI hace falta:

- **Opción A:** Extraer a `sync_ubicacion_core(location_id)` en `routes/sincronizar.py`, que la ruta invoque tras pasar el decorador de auth. El CLI la llama con `app.app_context()`.
- **Opción B:** Mantener la ruta y, desde CLI, hacer una llamada HTTP interna (ej. `requests.post` local) para disparar la sync. Eso reintroduce el problema del cliente que se desconecta.
- **Opción C:** CLI que importe la app, use `app.test_request_context()` y simule un POST. Más frágil y acoplado a Flask.

Recomendación: **Opción A** (extraer función core).

### Ejemplo de firma

```python
# routes/sincronizar.py
def sync_ubicacion_core(location_id: str) -> dict:
    """
    Lógica de sincronización. No usa request.
    Retorna dict con success, items_synced, error, etc.
    """
    # Todo el contenido actual de sincronizar_ubicacion salvo el try/except
    # que convierte a jsonify
```

---

## 6. Alternativa más simple (sin refactor grande)

Si no quieres tocar la estructura del código ahora:

1. **Probar solo config de Passenger**  
   Desactivar `PassengerAbortLongRunningRequestsOnClientDisconnect` (o equivalente) y ver si la sync termina aunque curl cierre a los 20 s.

2. **Ajustes mínimos en el flujo actual**
   - Corregir `datetime.utcnow()`.
   - Cooldown para `error`.
   - Prioridad por `last_sync_at`.

Si con eso la sync ya completa, el problema era el client disconnect y se aplaza el paso a CLI.

---

## 7. UI / progreso (2150/2150)

### Problema
Durante la sync, `total_items` es el conteo hasta el momento. Si el proceso muere en 2150, queda `2150/2150` aunque el total real sea >5000.

### Opciones

| Opción | Descripción |
|--------|-------------|
| **A** | Si `status == 'running'`, no mostrar total o mostrar “X items procesados” sin denominador. |
| **B** | Mantener `total_items` del último run completado y mostrar “2150 de ~5000 (en progreso)”. |
| **C** | Renombrar en UI: “Progreso: 2150 ítems procesados” sin barra o con barra indeterminada. |

La más limpia es **A o C**: evitar X/X cuando X no es el total final.

---

## 8. Plan de implementación sugerido

### Fase 1 (rápida, sin CLI)

1. Corregir `datetime.utcnow()`.
2. Añadir cooldown para `error` (ej. 30 min).
3. Ordenar candidatos por `last_sync_at` ASC (null o muy antiguo = prioridad).
4. Revisar configuración de Passenger respecto a client disconnect.

Si tras esto la sync completa vía curl, el problema era sobre todo el client disconnect.

### Fase 2 (CLI, si Fase 1 no basta)

1. Extraer `sync_ubicacion_core(location_id)` en `routes/sincronizar.py`.
2. Crear `scripts/auto_sync_cli.py` que use esa función.
3. Cambiar el cron para ejecutar el script Python en vez del bash con curl.
4. Aplicar el mismo cooldown y prioridad por `last_sync_at`.

### Fase 3 (UI)

1. Ajustar la UI para no mostrar “X/X” como total definitivo cuando `status == 'running'`.

---

## 9. Respuestas directas

| Pregunta | Respuesta |
|----------|-----------|
| ¿Passenger mata la request al desconectar el cliente? | Sí, es comportamiento habitual. Habría que verificar si está activado en tu instalación. |
| ¿Por qué siempre ADESA en error? | La prioridad no excluye `error`; ADESA tiene sub-prioridad 0 y siempre va antes que el resto. |
| ¿Cambio más simple para rotación? | Cooldown de 30 min para `status == 'error'` + ordenar por `last_sync_at` ASC. |
| ¿CLI es viable en cPanel? | Sí, si se usa el Python del venv del proyecto y se verifica el límite de tiempo del cron. |
| ¿Enfoque más sólido? | CLI es más fiable que curl por eliminar el client disconnect; el cooldown evita el ciclo con ADESA. |
