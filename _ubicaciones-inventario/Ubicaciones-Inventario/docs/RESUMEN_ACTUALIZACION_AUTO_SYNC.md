# Resumen de actualización: Mejoras auto-sync

## Qué se solucionó

### 1. Bug de heartbeat (`datetime.utcnow`)

- **Problema:** En `sincronizar_lote_ubicacion` la línea usaba `datetime.utcnow` sin paréntesis, guardando la función en vez de la fecha.
- **Solución:** Se cambió a `datetime.utcnow()` en todos los puntos donde se actualiza el heartbeat.
- **Resultado:** El tick puede detectar correctamente syncs activos y el zombie cleanup funciona como se espera.

### 2. Prioridad fija de ADESA (no rotaba ubicaciones)

- **Problema:** La prioridad prefería siempre ADESA > MIRADOR SUR > resto, aunque ADESA estuviera en `error`.
- **Solución:** La prioridad se ordena por `last_sync_at` (la más antigua primero). Ubicaciones sin sincronizar (`last_sync_at = null`) se priorizan antes.
- **Resultado:** Se reparten las ubicaciones; si ADESA falla, otras pueden sincronizarse.

### 3. Cooldown para ubicaciones en error

- **Problema:** Tras un zombie cleanup, ADESA quedaba en `error` y volvía a elegirse en el siguiente tick.
- **Solución:** Se añadió un cooldown de 30 minutos: si `status == 'error'` y `updated_at` es reciente (< 30 min), esa ubicación se omite.
- **Resultado:** Se evita el ciclo ADESA → error → ADESA mientras otras ubicaciones tienen oportunidad de sincronizarse.

### 4. Progreso en UI durante sync

- **Problema:** Se mostraba "2150 de 2150 productos" como si fuera el total final, cuando en realidad era un parcial.
- **Solución:** Si `status === 'running'`, se muestra "X items procesados (en progreso)" sin denominador.
- **Resultado:** La UI no da la impresión de que la sync terminó cuando está en curso o interrumpida.

---

## Qué esperar tras la actualización

### Comportamiento del tick

1. Ubicaciones en `error` reciente (< 30 min) no se eligen.
2. Orden de prioridad:
   - Primero: `partial` / `paused` (para continuar lotes).
   - Luego: las que llevan más tiempo sin sincronizar (por `last_sync_at`).
3. Si ADESA falla, pasará al menos media hora antes de que vuelva a ser candidata; entretanto se elegirán MIRADOR SUR u otras.

### Comportamiento de la UI

- Con sync en curso: "X items procesados (en progreso)" en lugar de "X de Y".
- Con sync completada/pausada: "X de Y productos" como antes.

### Importante

- El curl timeout (20 s) y la posible terminación por Passenger siguen igual.
- Si el servidor sigue matando la request al desconectar curl, las syncs seguirán interrumpidas.
- Estas mejoras reducen efectos secundarios (ciclo con ADESA, UI confusa) pero no evitan que el servidor pueda matar el proceso.
- Si el problema continúa, el siguiente paso será migrar a CLI (ver docs/EVALUACION_PROPUESTA_AUTO_SYNC_CLI.md).

---

## Archivos a subir en cPanel

Sube o sobrescribe estos archivos en `/home2/adesa/wms.adesa.com.do/`:

| Archivo | Cambios |
|---------|---------|
| `routes/sincronizar.py` | Cooldown, prioridad por `last_sync_at`, ajustes en el tick |
| `templates/admin_nuevo.html` | Texto de progreso durante sync |

**No cambies:** `database/models.py`, `config.py`, `scripts/`, ni otros archivos. No hace falta migración de BD.

---

## Pasos después de subir

1. Reiniciar la app desde **Setup Python App** → Restart.
2. Comprobar logs del cron: `/home2/adesa/logs/auto_sync_*.log`.
3. Esperar algunos ciclos (cada 5 min) y ver si el tick empieza a elegir MIRADOR SUR u otras ubicaciones.
4. Revisar la UI en Admin → Sincronización: el progreso durante sync debe mostrarse como "X items procesados (en progreso)".
