# Análisis: auto/tick devuelve siempre ADESA

## Causa raíz identificada

### Bug en el criterio de ordenación

En `routes/sincronizar.py` líneas 846-849:

```python
last_sync_ts = last_sync.timestamp() if last_sync else 0
if is_partial:
    return (0, -last_sync_ts, loc_id or "")
return (1, -last_sync_ts, loc_id or "")
```

El sort usa `-last_sync_ts`. Con `sorted(..., key=_priority)` (ascendente):

| Ubicación   | last_sync_at | last_sync_ts | -last_sync_ts  | Orden de sort |
|-------------|--------------|--------------|----------------|---------------|
| 401 BIKE    | Jan 30       | ~1738281600  | -1738281600    | **Segundo**   |
| MIRADOR SUR | Feb 18       | ~1738710000  | -1738710000    | **Intermedio** |
| ADESA       | Feb 19       | ~1738821823  | -1738821823    | **Primero**  |

En orden ascendente, el valor más pequeño va primero: `-1738821823 < -1738710000 < -1738281600`. Por tanto, **ADESA (más reciente) queda primero** y se elige siempre.

El criterio está invertido: se prioriza por **más reciente** en lugar de por **más antigua**.

---

## Verificación de otros aspectos

### 1. Ruta y blueprint

- Ruta: `@sincronizar_bp.route('/api/sincronizar/auto/tick', methods=['POST'])` en `routes/sincronizar.py`.
- Blueprint: `sincronizar_bp` registrado en `app_wms.py` sin `url_prefix`.
- No hay rutas duplicadas para `/api/sincronizar/auto/tick`.

### 2. Origen de datos

- `estados_map`: `SyncLocationStatus.query.all()` clave por `location_id`.
- `ubicaciones_adm`: `adm_client.obtener_ubicaciones()` (API ADM).
- `est` se obtiene con `estados_map.get(ub.get("ID"))`; el `location_id` de ADM coincide con el de la base de datos.

### 3. Criterios adicionales

- No hay whitelist ni filtro por `location_name`.
- Solo se excluyen `running` y, si hay cooldown, `error` reciente.
- El orden lo determina exclusivamente `_priority`.

---

## Corrección propuesta

Cambiar el criterio de ordenación para que la **más antigua** vaya primero (menor timestamp primero):

```python
# Antes (INCORRECTO - prioriza más reciente)
return (1, -last_sync_ts, loc_id or "")

# Después (CORRECTO - prioriza más antigua)
return (1, last_sync_ts, loc_id or "")
```

Con `last_sync_ts` positivo:

- Más antiguo (timestamp pequeño) → clave pequeña → va primero.
- Nunca sincronizado (`last_sync_ts = 0`) → clave 0 → va primero.

Aplicar lo mismo en la rama de `partial`:

```python
if is_partial:
    return (0, last_sync_ts, loc_id or "")  # partial primero, luego por más antigua
return (1, last_sync_ts, loc_id or "")      # resto por más antigua
```

---

## Plan de acción (sin ejecutar aún)

1. En `routes/sincronizar.py`, en la función `_priority` dentro de `auto_tick`:
   - Sustituir `-last_sync_ts` por `last_sync_ts` en ambas ramas (partial y no partial).
2. Subir el archivo actualizado en cPanel.
3. Reiniciar la aplicación.
4. Probar de nuevo el tick: con 401 BIKE y CARPAL con `last_sync_at` de enero, deberían salir antes que ADESA (febrero).

---

## Resultado esperado tras el cambio

- Orden aproximado: 401 BIKE, CARPAL, … (enero) → MIRADOR SUR (feb 18) → ADESA (feb 19).
- El tick debería devolver primero ubicaciones con `last_sync_at` más antiguo.
- ADESA solo se elegiría cuando las demás ya estén sincronizadas más recientemente que ella.
