# ✅ Guía de Verificación - Sincronización con Staging Cache

## 📋 Checklist de Verificación

### 1. ✅ Verificar Estado en la Interfaz Web

**Ubicación sincronizada:**
- [ ] El estado cambió de "Sincronizando..." a "Sincronizado" (o "Error" si falló)
- [ ] La barra de progreso llegó al 100%
- [ ] Se muestra la fecha/hora de "Última sincronización"
- [ ] No hay mensajes de error en rojo

---

### 2. ✅ Verificar en los Logs

**Buscar en los logs de cPanel:**
```
grep -i "sincronización con staging" error_log
```

**Debes ver:**
- ✅ `"Iniciando sincronización con staging: [NOMBRE] (ID: [ID], run_id: [NÚMERO])"`
- ✅ `"Eliminados X registros legacy (sin sync_run_id) de [NOMBRE]"` (si había registros antiguos)
- ✅ `"SyncRun [run_id] completado con status: done"` (o `partial`/`failed`)
- ✅ `"Atomic swap completado: current_run_id = [run_id]"`

**Si hubo discrepancias:**
- ✅ `"Discrepancias detectadas: X items"`
- ✅ `"Email de discrepancias enviado a luis.useche@adesa.com.do"`

---

### 3. ✅ Verificar Base de Datos (SQLite)

**Abrir la base de datos y ejecutar:**

#### 3.1 Verificar que se creó el SyncRun
```sql
SELECT * FROM sync_runs 
WHERE location_id = '[ID_UBICACION]' 
ORDER BY started_at DESC 
LIMIT 1;
```

**Debes ver:**
- `status = 'done'` (o `'partial'`/`'failed'`)
- `finished_at` con fecha/hora
- `total_items_processed > 0`
- `is_full_sync = 1` (si fue sync completa)

#### 3.2 Verificar que se actualizó current_run_id
```sql
SELECT location_name, current_run_id, running_run_id, status 
FROM sync_locations_status 
WHERE location_id = '[ID_UBICACION]';
```

**Debes ver:**
- `current_run_id = [run_id del SyncRun]` (el mismo número del paso 3.1)
- `running_run_id = NULL` (ya no está corriendo)
- `status = 'done'` (o `'partial'`/`'failed'`)

#### 3.3 Verificar que los registros tienen sync_run_id
```sql
SELECT COUNT(*) as total, 
       COUNT(sync_run_id) as con_run_id,
       COUNT(CASE WHEN sync_run_id IS NULL THEN 1 END) as sin_run_id
FROM stock_productos_adm 
WHERE location_id = '[ID_UBICACION]';
```

**Debes ver:**
- `con_run_id = total` (todos tienen sync_run_id)
- `sin_run_id = 0` (ninguno sin sync_run_id)

#### 3.4 Verificar discrepancias detectadas (si aplica)
```sql
SELECT COUNT(*) as total_discrepancias,
       COUNT(CASE WHEN severidad = 'critica' THEN 1 END) as criticas,
       COUNT(CASE WHEN severidad = 'alta' THEN 1 END) as altas,
       COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes
FROM en_revision 
WHERE location_id = '[ID_UBICACION]' 
  AND run_detectado = [run_id del paso 3.1];
```

**Si hay discrepancias:**
- Verás el total y desglose por severidad
- Si no hay, el resultado será `total_discrepancias = 0`

---

### 4. ✅ Verificar Endpoints de Admin (API)

**Necesitas estar autenticado como administrador.**

#### 4.1 Ver historial de sincronizaciones
```
GET /api/sync-runs?location_id=[ID_UBICACION]&page=1&per_page=10
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": [
    {
      "run_id": 1,
      "location_id": "...",
      "location_name": "...",
      "status": "done",
      "started_at": "2026-01-29T...",
      "finished_at": "2026-01-29T...",
      "total_items_processed": 1234,
      "total_items_adm": 1234,
      "is_full_sync": true
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 10,
    "total": 1,
    "pages": 1
  }
}
```

#### 4.2 Ver discrepancias detectadas (si hay)
```
GET /api/en-revision?location_id=[ID_UBICACION]&estado=pendiente&page=1&per_page=50
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "sku": "SKU123",
      "location_name": "...",
      "motivo": "...",
      "tipo": "cambio_brusco",
      "severidad": "alta",
      "estado": "pendiente",
      "stock_old": 10.0,
      "stock_new": 50.0,
      "stock_fisico": null,
      "fecha_deteccion": "2026-01-29T..."
    }
  ],
  "pagination": {...}
}
```

**Si no hay discrepancias:**
- `"data": []` (array vacío)
- `"pagination.total": 0`

---

### 5. ✅ Verificar Email (si hubo discrepancias)

**Si se detectaron discrepancias:**
- [ ] Revisar el correo de `luis.useche@adesa.com.do`
- [ ] Debe llegar un email con asunto: `"Discrepancias detectadas en sincronización: [NOMBRE_UBICACION]"`
- [ ] El email debe incluir:
  - Resumen de discrepancias por severidad
  - Top 10 discrepancias más críticas
  - Enlaces para revisar en el sistema

**Si NO hubo discrepancias:**
- No se envía email (comportamiento esperado)

---

### 6. ✅ Verificar Funcionamiento del Cache (LIVE/OLD)

**Después de la primera sincronización, hacer una segunda:**

#### 6.1 Primera sincronización (run_id = 1)
- Se crea `SyncRun` con `run_id = 1`
- Se insertan registros con `sync_run_id = 1`
- `current_run_id = 1` (ahora es LIVE)

#### 6.2 Segunda sincronización (run_id = 2)
- Se crea `SyncRun` con `run_id = 2`
- Se insertan registros con `sync_run_id = 2` (NEW)
- Los registros con `sync_run_id = 1` ahora son OLD
- `current_run_id = 2` (ahora es LIVE, el 1 es OLD)

**Verificar:**
```sql
-- Verificar que hay 2 runs
SELECT run_id, status, started_at 
FROM sync_runs 
WHERE location_id = '[ID_UBICACION]' 
ORDER BY started_at DESC;

-- Verificar que hay registros con ambos run_id
SELECT sync_run_id, COUNT(*) as total
FROM stock_productos_adm 
WHERE location_id = '[ID_UBICACION]'
GROUP BY sync_run_id;
```

**Debes ver:**
- 2 registros en `sync_runs`
- Registros con `sync_run_id = 1` (OLD)
- Registros con `sync_run_id = 2` (LIVE)
- `current_run_id = 2` en `sync_locations_status`

---

### 7. ✅ Verificar que Operaciones Usan LIVE Cache

**Probar una transferencia o ajuste:**
- [ ] Realizar una transferencia entre ubicaciones
- [ ] Verificar que usa el stock del `current_run_id` (LIVE)
- [ ] Verificar que NO usa registros con `sync_run_id` antiguo

**En los logs, buscar:**
```
"obtener_stock_vigente: usando current_run_id = [NÚMERO]"
```

---

## 🚨 Problemas Comunes y Soluciones

### ❌ Error: "UNIQUE constraint failed"
**Causa:** Registros legacy sin `sync_run_id`  
**Solución:** Ya está resuelto con la limpieza automática. Si persiste, ejecutar `limpiar_registros_legacy.py`

### ❌ Status queda en "running" indefinidamente
**Causa:** Sync falló pero no se actualizó el status  
**Solución:** Verificar logs para ver el error. El status debería cambiar a `'failed'` automáticamente.

### ❌ No se detectan discrepancias cuando deberían
**Causa:** Primera sincronización (no hay OLD para comparar)  
**Solución:** Normal. Las discrepancias se detectan desde la segunda sincronización.

### ❌ Email no se envía
**Causa:** Variables de entorno SMTP no configuradas  
**Solución:** Verificar que `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` estén configuradas en cPanel.

---

## ✅ Resumen: ¿Todo Funcionó?

**Sí, si:**
- ✅ Status = "done" en la interfaz
- ✅ `current_run_id` está actualizado en la BD
- ✅ Todos los registros tienen `sync_run_id`
- ✅ Los endpoints `/api/sync-runs` y `/api/en-revision` funcionan
- ✅ (Si hubo discrepancias) Email llegó correctamente

**No, si:**
- ❌ Status = "error" o "running" indefinidamente
- ❌ `current_run_id = NULL` o no se actualizó
- ❌ Hay registros sin `sync_run_id`
- ❌ Los endpoints devuelven error 500
- ❌ (Si hubo discrepancias) Email no llegó

---

## 📞 Siguiente Paso

Una vez verificado todo, puedes:
1. Sincronizar las demás ubicaciones
2. Revisar las discrepancias detectadas (si hay)
3. Configurar el job de limpieza diaria (opcional)


