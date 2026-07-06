# INSTRUCCIONES: INSTRUMENTACIÓN PARA DIAGNÓSTICO DE ERROR 2013

**Fecha:** 30 de Enero, 2026  
**Objetivo:** Capturar información detallada sobre el error "does not return rows" que causa la cascada 2014 → 2013

---

## 1. CAMBIOS IMPLEMENTADOS

### 1.1 Modificaciones en `utils/db_helpers.py`

- ✅ Agregado parámetros opcionales `tag` y `meta` a `db_query_with_retry()`
- ✅ Logging detallado antes y después de ejecutar queries
- ✅ Detección específica del error "does not return rows"
- ✅ **Rollback SIEMPRE antes de retornar None** (corrige el problema identificado)

### 1.2 Modificaciones en `routes/sincronizar.py`

- ✅ Agregados tags y metadatos a las queries críticas dentro del loop:
  - `buscar_producto_stock_positivo`
  - `buscar_producto_stock_cero`
  - `buscar_stock_new`
  - `buscar_stock_cero_new`
  - `buscar_stock_existentes_old`
  - `verificar_sync_curso`

---

## 2. QUÉ HACER AHORA

### Paso 1: Subir los archivos modificados al servidor

Sube estos archivos a tu servidor (cPanel):
- `utils/db_helpers.py`
- `routes/sincronizar.py`

### Paso 2: Ejecutar una sincronización de prueba

1. Ve al Panel de Administración
2. Selecciona una ubicación (preferiblemente ADESA si tiene muchos productos)
3. Haz clic en "Re-sincronizar"
4. **NO interrumpas el proceso** - déjalo correr hasta que termine o falle

### Paso 3: Monitorear los logs

Mientras la sincronización corre, monitorea los logs en tiempo real:

**En cPanel:**
- Ve a "Errors" o "Logs"
- Busca el archivo de log de la aplicación (ej: `error_log`, `stderr.log`, o el log de Python)

**O si tienes acceso SSH:**
```bash
tail -f /ruta/a/tu/log/error_log
```

---

## 3. QUÉ BUSCAR EN LOS LOGS

### 3.1 Logs de Inicio de Queries (DEBUG)

Cuando una query se ejecuta exitosamente, verás:
```
[buscar_producto_stock_positivo] Ejecutando query (intento 1/3) | item_id=12345, item_sku=ABC123, skip=0, lote=1, run_id=16, location_name=ADESA
[buscar_producto_stock_positivo] Query exitosa | item_id=12345, item_sku=ABC123, skip=0, lote=1, run_id=16, location_name=ADESA
```

### 3.2 Error Crítico: "does not return rows"

**⚠️ ESTE ES EL ERROR QUE BUSCAMOS:**

```
[buscar_stock_new] ⚠️ ERROR CRÍTICO: 'does not return rows' detectado (intento 1/3) | producto_id=4112, item_id=12345, item_sku=ABC123, location_id=fdb149a8-..., run_id=16, skip=100, lote=3, stock=50.0 | Error: This result object does not return rows. It has been closed automatically.
```

**Información clave que necesitamos:**
- **Tag:** Identifica qué query falló (ej: `buscar_stock_new`, `buscar_producto_stock_positivo`)
- **Metadatos:** Contexto completo (item_id, producto_id, run_id, skip, lote, etc.)
- **Momento:** ¿En qué punto de la sincronización ocurrió? (skip, lote)

### 3.3 Cascada de Errores (Secundarios)

Después del error "does not return rows", verás:
```
[buscar_stock_new] Error inesperado en query (intento 1/3) | ... | Error: This result object does not return rows...
pymysql.err.OperationalError: (2014, 'Command Out of Sync')
pymysql.err.OperationalError: (2013, 'Lost connection to MySQL server during query')
```

---

## 4. QUÉ ESPERAR AL FINAL

### Escenario A: Sincronización Exitosa

Si la sincronización completa exitosamente:
- ✅ Verás logs normales con tags y metadatos
- ✅ No habrá errores "does not return rows"
- ✅ La sincronización terminará con estado "done"

**Acción:** Si esto ocurre, el problema puede ser intermitente. Ejecuta otra sincronización para ver si el error aparece.

### Escenario B: Error "does not return rows" Capturado

Si el error ocurre, verás:
- ⚠️ Log con tag específico y metadatos completos
- ⚠️ Cascada de errores 2014 → 2013
- ❌ Sincronización falla

**Acción:** Copia TODOS los logs relacionados, especialmente:
1. El log con el tag que causó "does not return rows"
2. Los metadatos completos (item_id, producto_id, run_id, skip, lote, etc.)
3. El stack trace completo
4. Los logs de los errores 2014 y 2013

### Escenario C: Error sin Tag

Si ves un error "does not return rows" pero SIN tag:
- Significa que ocurrió en una query que NO está instrumentada
- Busca en el stack trace qué función/archivo causó el error

**Acción:** Comparte el stack trace completo para identificar la query faltante.

---

## 5. INFORMACIÓN A RECOPILAR

Cuando el error ocurra, necesitamos:

### 5.1 Información del Error

```
✅ Tag de la query que falló (ej: "buscar_stock_new")
✅ Metadatos completos (item_id, producto_id, run_id, skip, lote, stock, etc.)
✅ Stack trace completo
✅ Timestamp exacto del error
✅ Momento en la sincronización (skip, lote, items procesados)
```

### 5.2 Contexto de la Sincronización

```
✅ Ubicación sincronizada (location_name)
✅ Run ID (run_id)
✅ Total de items procesados antes del error
✅ Tiempo transcurrido desde inicio de sync
✅ Estado de la base de datos (¿había otras operaciones corriendo?)
```

### 5.3 Logs Completos

Copia estos logs en orden cronológico:
1. Logs de inicio de sincronización
2. Logs de queries exitosas (últimos 10-20 antes del error)
3. **Log del error "does not return rows" (con tag y metadatos)**
4. Logs de errores 2014 y 2013
5. Logs de rollback/teardown

---

## 6. PRÓXIMOS PASOS DESPUÉS DE CAPTURAR EL ERROR

Una vez que tengas la información:

1. **Comparte los logs completos** (especialmente el que tiene el tag y metadatos)
2. **Identificaremos la query exacta** que causa el problema
3. **Implementaremos la corrección específica** para esa query
4. **Corregiremos el manejo de errores** en `db_query_with_retry()` (ya parcialmente corregido con rollback)

---

## 7. NOTAS IMPORTANTES

### 7.1 Los Logs Pueden Ser Verbosos

Con la instrumentación activa, los logs pueden ser más largos de lo normal. Esto es esperado y necesario para el diagnóstico.

### 7.2 No Modificar Nada Mientras Pruebas

- No cambies código mientras ejecutas la prueba
- No reinicies el servidor durante la sincronización
- Deja que el proceso complete o falle naturalmente

### 7.3 Si No Ocurre el Error

Si ejecutas varias sincronizaciones y el error NO aparece:
- El problema puede ser intermitente
- Puede estar relacionado con condiciones específicas (carga, timing, etc.)
- Comparte los logs de todas las ejecuciones para análisis

---

## 8. RESUMEN DE CHECKLIST

Antes de ejecutar la prueba:
- [ ] Archivos `utils/db_helpers.py` y `routes/sincronizar.py` subidos al servidor
- [ ] Acceso a logs configurado (cPanel o SSH)

Durante la prueba:
- [ ] Sincronización iniciada
- [ ] Logs siendo monitoreados en tiempo real
- [ ] Proceso NO interrumpido

Después del error (si ocurre):
- [ ] Logs completos copiados
- [ ] Tag y metadatos identificados
- [ ] Stack trace completo capturado
- [ ] Información de contexto recopilada

---

**Fin de Instrucciones**

