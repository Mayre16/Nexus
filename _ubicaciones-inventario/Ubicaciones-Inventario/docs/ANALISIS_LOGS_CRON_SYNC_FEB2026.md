# Análisis: Logs Auto-Sync vía Cron (Feb 2026)

## Resumen ejecutivo

Los logs de `Logs-auto-sync/` confirman que **la sync disparada por cron no completa**. El patrón se repite en todos los días analizados. La causa raíz sigue siendo la misma: **cuando curl cierra la conexión a los 20 segundos, el servidor (LiteSpeed/Passenger) mata el proceso**, dejando syncs a medias que luego el zombie cleanup marca como error tras 15 minutos sin heartbeat.

---

## 1. Evidencia de los logs

### 1.1 Curl siempre hace timeout

En **todas** las ejecuciones de sync vía cron aparece:

```
curl: (28) Operation timed out after 20000 milliseconds with 0 bytes received
```

- **20000 ms** = 20 segundos (el `-m 20` del script)
- **0 bytes received** = el servidor no envió ninguna respuesta antes de que curl cortara

### 1.2 Ciclo típico

| Fase | Comportamiento |
|------|----------------|
| **ready** | Tick devuelve `status=ready` + `location_id` → cron dispara sync |
| **Sync** | curl hace POST a `/api/sincronizar/ubicacion/<id>` → timeout a los 20s |
| **busy** | Durante ~15 min el tick devuelve `status=busy` (hay una sync en "running") |
| **Zombie cleanup** | Tras 15 min sin heartbeat, el tick marca la sync como zombie → `status=error` |
| **ready** | En el siguiente tick vuelve a `ready` → se dispara otra sync → se repite el ciclo |

### 1.3 Ejemplo de ciclo (19-Feb, 00:00–00:25)

```
00:00:02  ready → Disparando sync (fdb149a8...)
00:00:23  curl timeout 20s
00:05:01  busy (no action)
00:10:02  busy
00:15:02  busy
00:20:02  ready → Disparando sync otra vez
00:20:23  curl timeout 20s
...
```

### 1.4 `status=` vacío

En varios logs aparece:

```
Tick response: status= location_id= target=full
No action: status=
```

**Causa:** El tick usa `curl -m 10`. Si el servidor está cargado (otra sync en curso, etc.), el tick tarda más de 10 segundos y curl devuelve timeout → el script recibe `{}` y `status` queda vacío.

---

## 2. Relación con la captura del WMS

La captura muestra:

- **PERSAN SPORT, PROO MTB, WILD BALANCE**: estado **ERROR**
- **Progreso**: "2100 de 2100", "2200 de 2200" (100%)
- **Mensaje**: "Sync detenida (zombie cleanup - sin heartbeat 15 min)"

### Interpretación

1. **100% de progreso**: La sync llegó a procesar todos los items (o casi) antes de morir. El heartbeat se actualiza cada 50 items; si el proceso corre varios minutos, puede llegar a 100% y luego morir.
2. **Zombie cleanup**: El proceso dejó de enviar heartbeats hace más de 15 minutos. El tick lo marca como zombie y pone `status=error`.
3. **Por qué muere**: Aunque la regla `noabort` esté en `.htaccess`, puede que:
   - No esté desplegada en producción
   - LiteSpeed no aplique la regla (p.ej. `IfModule Litespeed` no coincide)
   - Otra limitación (timeout de Passenger, memoria, etc.) mate el proceso más tarde

---

## 3. Causas raíz identificadas

| # | Causa | Evidencia |
|---|-------|------------|
| 1 | **Curl cierra a los 20s** | Siempre `Operation timed out after 20000 milliseconds` |
| 2 | **Servidor mata el proceso al cerrar el cliente** | Sync manual OK, cron siempre falla; zombie cleanup tras 15 min |
| 3 | **`noabort` posiblemente no activo** | Si estuviera activo, la sync debería seguir tras el cierre de curl |
| 4 | **Tick con timeout 10s** | Cuando el servidor va lento, el tick devuelve `status=` vacío |

---

## 4. Diferencia cron vs panel manual

| Aspecto | Cron | Panel manual |
|---------|------|--------------|
| Cliente | curl con `-m 20` | Navegador |
| Comportamiento | Cierra conexión a los 20s | Mantiene conexión hasta la respuesta |
| Efecto en servidor | LiteSpeed interpreta desconexión → aborta proceso | Proceso sigue hasta terminar |
| Resultado | Sync interrumpida → zombie → error | Sync completada correctamente |

---

## 5. Recomendaciones

### 5.1 Confirmar y activar `noabort` (prioridad alta)

1. Verificar que el `.htaccess` con la regla `noabort` está desplegado en producción.
2. Si el hosting usa LiteSpeed, comprobar que `IfModule Litespeed` se cumple.
3. Si no aplica, valorar configurar `noabort` desde el WebAdmin de LiteSpeed para las rutas de sync.

### 5.2 Aumentar timeout del tick (prioridad media)

El tick con `curl -m 10` puede devolver vacío cuando el servidor está cargado. Subir a 30–60 segundos reduciría los `status=` vacíos.

### 5.3 Alternativa: ejecutar sync por CLI en el servidor

En lugar de llamar vía HTTP desde cron, ejecutar un script Python en el servidor que llame directamente a la lógica de sync (sin pasar por HTTP). Así se evita el problema de desconexión del cliente.

---

## 6. Archivos de log analizados

- `auto_sync_20260218.log` – `auto_sync_20260225.log`
- Patrón consistente en todos los días
