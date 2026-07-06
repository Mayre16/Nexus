# Análisis de problemas del auto-sync en producción

## Resumen ejecutivo

Tras revisar el código actual, se identificaron **7 causas raíz** que explican los síntomas observados. La principal es que **Passenger probablemente mata el proceso cuando curl desconecta a los 20s**, dejando syncs a mitad, zombies y el ciclo ready→disparo→timeout→busy→zombie cleanup→ready que repite siempre con ADESA.

---

## 1. Curl timeout (20s) y procesos muertos

### Qué ocurre
- El cron hace `curl -m 20` al endpoint de sync.
- La sync tarda 5–25 min; curl cierra la conexión a los 20 s.
- En muchas configuraciones (Passenger, Apache, etc.), **cuando el cliente desconecta, el servidor termina el proceso** para liberar recursos.
- Efecto: la sync **se interrumpe** tras ~20 s, pero el estado en BD ya quedó como `running`.

### Pruebas en el código
- Línea 1356: `estado_sync` se marca `running` y se hace `commit` **antes** del trabajo pesado.
- El trabajo real empieza en la línea 1441 (primer `obtener_stock`).
- Si el proceso muere tras 20 s, puede haberse procesado algo (1–2 batches) o nada tras el commit.

### Conclusión
El timeout de curl es esperado; el problema es si el servidor **mata** la request al desconectar el cliente.

---

## 2. Bug: `last_heartbeat_at = datetime.utcnow` (sin paréntesis)

### Ubicación
`routes/sincronizar.py` línea 1350:
```python
estado_sync.last_heartbeat_at = datetime.utcnow  # BUG: falta ()
```

### Qué hace
- Se asigna la función `datetime.utcnow`, no su resultado.
- SQLAlchemy intenta persistir eso; suele acabar guardando `NULL` o un valor no válido.
- El heartbeat inicial **nunca queda bien guardado**.

### Impacto
- El tick usa `last_heartbeat_at` para saber si un sync está vivo.
- Si es NULL, hace fallback a `run.started_at`.
- Afecta sobre todo el diagnóstico de zombies; el bug empeora el seguimiento de runs vivos.

---

## 3. Tick devuelve siempre ADESA (no rota ubicaciones)

### Lógica actual
```python
def _priority(ub):
    ...
    return (0, 0 if is_adesa else 1 if is_mirador else 2, loc_name)  # partial primero
    return (1, 0 if is_adesa else 1 if is_mirador else 2, loc_name)   # luego por nombre
```

- `(0, ...)` = partial/paused
- `(1, ...)` = resto (pending, done, error)

Entre las no-partial, ADESA (0) va antes que MIRADOR SUR (1) y resto (2).

### Problema
- No se excluye `error`; solo se salta `running`.
- Cuando ADESA pasa a `error` (por zombie cleanup o fallo), en el siguiente tick vuelve a ser la primera candidata porque `(1, 0, "ADESA")` sigue antes que MIRADOR SUR.
- El flujo se convierte en: ADESA → zombie/error → limpieza → ADESA otra vez → …  
  Nunca se llega a MIRADOR SUR u otras ubicaciones.

---

## 4. Run ids saltando / runs que no terminan

### Flujo
1. Tick devuelve `ready` → cron dispara sync.
2. Se crea `SyncRun` (nuevo `run_id`).
3. Se marca `estado_sync.status = 'running'`, `running_run_id = nuevo_run.run_id`.
4. Se hace commit y empieza el trabajo pesado.
5. Curl desconecta a los 20 s → servidor mata el proceso.
6. El `SyncRun` queda en `running`, sin `finished_at`, y `estado_sync` en `running`.
7. Siguiente tick: ve `running`, devuelve `busy`.
8. Tras 15 min sin heartbeat → zombie cleanup → `run.status = 'failed'`, `estado_sync.status = 'error'`.
9. Siguiente tick: ADESA vuelve a ser candidata → se dispara otra sync → nuevo `run_id` → y se repite.

Resultado: muchos `SyncRun` creados, pocos completados, `run_id` “saltando” y muchas ejecuciones cortadas.

---

## 5. UI pegada en “Sincronizando…” con 2150/2150

### Origen de los datos
- `estado_sync.items_synced` y `estado_sync.total_items` se actualizan cada 50 ítems (líneas 1784–1785).
- `total_items` es `stock_items_count`: ítems que la API ha devuelto hasta ese momento.
- La UI lee `/api/sincronizar/ubicacion/<id>/estado` → `estado.items_synced`, `estado.total_items`.

### Qué pasó
- El proceso se mató tras procesar ~2150 ítems (≈43 batches).
- El último commit dejó `items_synced = 2150`, `total_items = 2150`.
- `status` quedó en `running` porque no hubo limpieza de zombies todavía.
- La UI muestra ese estado “congelado”: “Sincronizando…” y 2150/2150.

### Sobre “el universo real es >5000”
- 2150 es el conteo **parcial** hasta el momento de la muerte del proceso.
- El total real puede ser >5000; nunca se llegó a actualizar porque la sync se cortó.

---

## 6. `location_id` vacío en respuestas `busy`

### Código
```python
return jsonify({
    "success": True,
    "status": "busy",
    "reason": "sync_in_progress"  # o "lock"
}), 200
```

- Por diseño, cuando `status=busy` no se envía `location_id`.
- No es un bug; es comportamiento esperado.

---

## 7. Diferencia manual vs cron

### Manual
- Request HTTP abierta hasta el final.
- El navegador puede hacer timeout, pero el servidor suele mantener el proceso hasta que termina la sync.
- Flujo completo: commit final, swap, email, etc.

### Cron/auto
- Curl cierra la conexión a los 20 s.
- Si el servidor mata el proceso al desconectar, la sync nunca termina.
- Solo se completa si el servidor **no** mata la request al cerrar el cliente.

---

## Posibles soluciones (sin implementar aún)

### A) Evitar que la sync muera con el cierre del cliente

1. **Comprobar en cPanel/Passenger** si hay opciones tipo “abort on client disconnect” y desactivarlas.
2. **Aumentar timeout del proxy** (Apache/Nginx) por encima de la duración máxima de una sync (ej. 30 min).
3. **Endpoint 202 Accepted**: que `POST /ubicacion/<id>` devuelva 202 casi al instante y lance la sync en un worker/thread que no dependa de la conexión del cliente. Esto requiere cambios de arquitectura (thread/worker/Celery, etc.).

### B) Marcar `running` de forma más temprana

- El `status=running` ya se marca antes del trabajo pesado.
- Lo que falta es **asegurar** que el proceso no se mate al desconectar; el marcado en sí está bien.

### C) Corregir el bug de `last_heartbeat_at`

```python
estado_sync.last_heartbeat_at = datetime.utcnow()  # Añadir ()
```

### D) Rotación de ubicaciones

- Excluir ubicaciones en `error` durante N ciclos o N minutos.
- O dar prioridad por `last_sync_at` (la que lleve más tiempo sin sincronizar va primero).
- O round-robin: llevar índice de “siguiente ubicación” y avanzarlo cada vez que se complete una.

### E) Lock por ubicación en el tick

- Antes de devolver `ready` para una ubicación, hacer un “pre-lock” (por ejemplo una tabla `sync_pending`) para que otro tick no la elija hasta que termine o expire.
- Reduce solapamientos y reintentos sobre la misma ubicación.

### F) Timeout / 202

- El curl con 20 s está pensado para “solo disparar”.
- Si el servidor mantiene la sync aunque curl cierre, el flujo es correcto.
- Si no, haría falta soporte asíncrono (202 + worker/thread).

### G) Cálculo de total/progreso

- `total_items` durante la sync es un valor en progreso (items vistos hasta ahora).
- Para la UI se podría:
  - Mantener un “total estimado” o “total del último run completo” para no mostrar 2150/2150 como “total definitivo”.
  - O mostrar “Sincronizando: X items procesados hasta ahora” y no “X de Y” hasta que la sync termine.

---

## Orden de actuación recomendado

1. Corregir `datetime.utcnow` → `datetime.utcnow()`.
2. Confirmar en cPanel/Passenger si se mata la request al desconectar el cliente; ajustar configuración si es posible.
3. Cambiar la prioridad del tick para no elegir siempre ADESA en error (excluir `error` reciente o priorizar por `last_sync_at`).
4. Valorar un “cooling period” para ubicaciones en error (no candidatas durante X minutos tras zombie cleanup).
5. Valorar endpoint 202 + worker si la configuración no permite evitar la muerte del proceso al cerrar el cliente.

---

## Checklist de verificación (servidor)

- [ ] ¿Passenger matando requests al desconectar el cliente?
- [ ] Timeout configurado en Apache/Nginx para `/api/sincronizar/*`.
- [ ] Variables de entorno de Passenger (`PassengerRequestTimeout`, etc.).
- [ ] Logs de Passenger al cortar conexiones.
