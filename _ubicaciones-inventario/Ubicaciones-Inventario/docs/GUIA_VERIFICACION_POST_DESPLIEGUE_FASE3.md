# Guía de Verificación Post-Despliegue - Fase 3

## 📋 Resumen de Cambios Implementados

Esta guía cubre la verificación de los cambios implementados en la **Fase 3** de mejoras del sistema WMS:

1. **Mapeo de flag `Inactive`** → `ProductoADM.activo` y visualización en búsqueda
2. **Corrección de progreso** de sincronización (evitar "procesados > total")
3. **ShowNoStock=true para ADESA** con protecciones (caps de seguridad)
4. **Estado `partial`** para sincronizaciones incompletas
5. **Lógica mejorada** de "desaparecido => 0" (solo en syncs completas)

---

## 🚀 Paso 1: Reiniciar la Aplicación

### Opción A: Desde cPanel (Recomendado)
1. Accede a **cPanel** → **Python App** o **Passenger**
2. Busca tu aplicación (`wms.adesa.com.do`)
3. Haz clic en **"Restart"** o **"Reload"**

### Opción B: Tocar archivo de reinicio
1. En el File Manager de cPanel, navega a la carpeta de tu aplicación
2. Crea o modifica el archivo `tmp/restart.txt`
3. Guarda el archivo (esto fuerza el reinicio de Passenger)

### Verificación
- Espera 10-15 segundos después del reinicio
- Accede a `https://wms.adesa.com.do` y verifica que la aplicación carga correctamente

---

## 📊 Paso 2: Verificar Logs de Inicio

### Logs Esperados al Iniciar
```
INFO app_wms Tablas de base de datos verificadas/creadas
INFO app_wms Aplicación Flask iniciada correctamente
```

### Si ves errores
- Revisa que todos los archivos se subieron correctamente
- Verifica que `database/models.py` tiene el enum `status` con valor `'partial'`
- Confirma que `api/adm_cloud.py` tiene el parámetro `show_no_stock` en `obtener_stock`

---

## 🔄 Paso 3: Sincronizar Catálogo (Fase 1)

### Acción
1. Ve a **Admin** → **Sincronización de Catálogo**
2. Haz clic en **"Sincronizar Catálogo"**
3. Espera a que termine (puede tardar varios minutos)

### Logs Esperados
```
INFO sincronizar Iniciando sincronización de catálogo...
INFO sincronizar Procesando lote X de productos...
INFO sincronizar Productos actualizados: X, creados: Y
INFO sincronizar Sincronización de catálogo completada
```

### Verificación en Base de Datos (Opcional)
```sql
-- Verificar que productos tienen activo mapeado
SELECT sku, nombre, activo, synced_at 
FROM productos_adm 
WHERE activo = 0 
LIMIT 10;

-- Deberías ver productos con activo = 0 (inactivos)
```

### Verificación en UI
- En **Admin** → **Sincronización de Catálogo**, debería aparecer la **"Última sincronización"** con fecha/hora correcta (hora de RD, no UTC+4)

---

## 📦 Paso 4: Sincronizar ADESA (Fase 3 - ShowNoStock)

### Acción
1. Ve a **Admin** → **Sincronización por Ubicaciones**
2. Haz clic en **"Sincronizar"** para **ADESA**
3. **IMPORTANTE:** Esta sincronización puede tardar más tiempo porque ahora incluye items con stock=0

### Logs Esperados
```
INFO sincronizar Iniciando sincronización de ubicación: ADESA (ID: ...)
INFO sincronizar Usando ShowNoStock=true para ADESA (incluirá items con stock=0)
INFO sincronizar Procesando lote 1 (skip=0, take=50)...
INFO sincronizar Items con stock > 0: X, Items con stock = 0: Y
INFO sincronizar Commit realizado (cada 200 items)
...
INFO sincronizar Sincronización completada: X items procesados
```

### Verificaciones Importantes

#### ✅ Progreso Correcto
- El contador **NO** debería mostrar "procesados > total"
- Ejemplo correcto: `"4500 de 4500"` o `"4500 de 4542"`
- Ejemplo incorrecto: `"972 de 928"` ❌

#### ✅ Items con Stock=0
- En los logs deberías ver: `"Items con stock = 0: X"`
- Esto confirma que `ShowNoStock=true` está funcionando

#### ✅ Caps de Seguridad
- Si la sincronización se detiene antes de terminar, verifica el status:
  - `status = 'done'` → Sincronización completa
  - `status = 'partial'` → Se alcanzó un cap (normal, no es error)
  - `status = 'error'` → Hubo un error real

### Verificación en Base de Datos (Opcional)
```sql
-- Verificar items con stock=0 sincronizados
SELECT COUNT(*) 
FROM stock_productos_adm 
WHERE ubicacion_adm = 'ADESA' AND cantidad = 0;

-- Verificar status de sincronización
SELECT location_name, status, items_synced, total_items, last_sync_at
FROM sync_locations_status
WHERE location_name = 'ADESA';
```

---

## 🔍 Paso 5: Verificar Búsqueda de Productos (Fase 1)

### Acción
1. Ve a **Buscar Producto**
2. Busca un producto que **sabes que está inactivo en ADM**
3. O busca cualquier producto y verifica la visualización

### Verificaciones

#### ✅ Badge "INACTIVO EN ADM"
- Si el producto está inactivo (`activo = false`), deberías ver un badge rojo:
  ```
  [INACTIVO EN ADM]
  ```
- Este badge aparece junto al nombre del producto

#### ✅ Fecha de Actualización
- En la sección **"Stock en Base de Datos (Cache ADM)"**, debería aparecer:
  - **"Última actualización: [fecha/hora]"**
  - La hora debe estar en **hora de RD** (no UTC+4)

#### ✅ Stock Incluyendo Ceros
- Si un producto tiene stock=0 en ADESA, debería mostrarse como `0` (no como "sin info")

---

## ⚠️ Paso 6: Manejo de Errores y Casos Edge

### Si la Sincronización se Detiene (Status = 'partial')

**Esto es NORMAL** si se alcanzó un cap de seguridad:
- **Max requests:** 800 requests (para ADESA)
- **Max minutos:** 25 minutos
- **Max items procesados:** 50,000 items

**Qué hacer:**
1. Espera unos minutos
2. Haz clic en **"Sincronizar"** nuevamente
3. El sistema continuará desde donde se quedó (`skip_actual`)

### Si Ves "procesados > total"

**Esto NO debería pasar** con los cambios implementados. Si ocurre:
1. Revisa los logs para ver si hay duplicados
2. Verifica que el archivo `routes/sincronizar.py` tiene la corrección en las líneas 1107-1110
3. Reporta el caso con los logs completos

### Si No Aparece el Badge "INACTIVO EN ADM"

**Verificaciones:**
1. Confirma que el catálogo se sincronizó después de subir los cambios
2. Verifica en BD: `SELECT sku, activo FROM productos_adm WHERE sku = 'TU_SKU'`
3. Si `activo = 0` pero no aparece el badge, revisa `templates/productos.html` línea 546

---

## 📝 Checklist de Verificación Completa

- [ ] Aplicación reiniciada correctamente
- [ ] Logs de inicio sin errores
- [ ] Sincronización de catálogo completada
- [ ] Última sincronización de catálogo visible en Admin
- [ ] Sincronización de ADESA iniciada con `ShowNoStock=true`
- [ ] Logs muestran items con stock=0 siendo procesados
- [ ] Progreso NO muestra "procesados > total"
- [ ] Badge "INACTIVO EN ADM" aparece para productos inactivos
- [ ] Fecha de actualización visible y en hora correcta (RD)
- [ ] Stock=0 se muestra correctamente en búsqueda

---

## 🐛 Troubleshooting

### Error: "AttributeError: 'SyncLocationStatus' object has no attribute 'status'"
**Causa:** El modelo no tiene el enum actualizado  
**Solución:** Verifica que `database/models.py` línea 261 tiene `status` con valores: `'pending', 'running', 'done', 'error', 'partial'`

### Error: "TypeError: obtener_stock() got an unexpected keyword argument 'show_no_stock'"
**Causa:** El archivo `api/adm_cloud.py` no se actualizó  
**Solución:** Verifica que `api/adm_cloud.py` línea 754 tiene el parámetro `show_no_stock` en la firma de `obtener_stock`

### Sincronización muy lenta o timeout
**Causa:** `ShowNoStock=true` aumenta el volumen de datos  
**Solución:** Esto es esperado. Los caps de seguridad están diseñados para prevenir timeouts. Si se alcanza un cap, el status será `partial` y puedes continuar después.

### Badge no aparece aunque el producto está inactivo
**Causa:** El catálogo no se sincronizó después de los cambios  
**Solución:** Ejecuta una sincronización de catálogo completa

---

## 📞 Soporte

Si encuentras problemas que no se resuelven con esta guía:
1. Revisa los logs completos en cPanel
2. Verifica que todos los archivos se subieron correctamente
3. Confirma que la aplicación se reinició después de subir los archivos
4. Documenta el error con logs y pasos para reproducirlo

---

## 📅 Fecha de Implementación

**Fecha:** 2026-01-28  
**Versión:** Fase 3 - ShowNoStock + Inactive Flag + Progress Fix  
**Archivos Modificados:**
- `routes/sincronizar.py`
- `routes/productos.py`
- `templates/productos.html`
- `api/adm_cloud.py`
- `database/models.py`



