# INSTRUCCIONES: Migración y Crear Índices usando "Execute python script" en cPanel

## ⚠️ IMPORTANTE: Ejecutar en orden

Debes ejecutar **DOS scripts en orden**:
1. Primero: `migrar_tablas.py` (agrega columnas nuevas)
2. Segundo: `crear_indices.py` (crea los índices)

---

## PASO 1: Subir los archivos

1. Ve al **Administrador de Archivos** en cPanel
2. Navega a la raíz del proyecto: `/home2/adesa/wms.adesa.com.do`
3. Sube estos archivos a esa ubicación:
   - `migrar_tablas.py` ← **NUEVO, ejecutar primero**
   - `crear_indices.py`

---

## PASO 2: Ejecutar migración de columnas

**Ejecutar PRIMERO `migrar_tablas.py`:**

1. Ve a la sección **"Execute python script"** en cPanel
2. En el campo **"Enter the path to the script file"**, ingresa:
   ```
   migrar_tablas.py
   ```
3. Haz clic en **"Run Script"**

**Deberías ver:**
```
🔍 Verificando estructura de tablas...

➕ Agregando columna sync_run_id a stock_productos_adm...
✓ Columna sync_run_id agregada a stock_productos_adm
➕ Agregando columna current_run_id a sync_locations_status...
✓ Columna current_run_id agregada a sync_locations_status
➕ Agregando columna running_run_id a sync_locations_status...
✓ Columna running_run_id agregada a sync_locations_status

✅ Migración de columnas completada exitosamente

📝 Ahora puedes ejecutar crear_indices.py para crear los índices
```

---

## PASO 3: Ejecutar creación de índices

**Ejecutar SEGUNDO `crear_indices.py`:**

1. En la misma sección **"Execute python script"**
2. En el campo **"Enter the path to the script file"**, ingresa:
   ```
   crear_indices.py
   ```
3. Haz clic en **"Run Script"**

1. Ve a la sección **"Execute python script"** en cPanel
2. En el campo **"Enter the path to the script file"**, ingresa:
   ```
   crear_indices.py
   ```
   O la ruta completa:
   ```
   /home2/adesa/wms.adesa.com.do/crear_indices.py
   ```
3. Haz clic en **"Run Script"**

## PASO 3: Verificar resultado

Deberías ver una salida similar a:

```
✓ Índice idx_stock_producto_run creado
✓ Índice idx_stock_run_id creado
✓ Índice idx_stock_location_run creado
✓ Índice idx_en_revision_location creado
✓ Índice idx_en_revision_sku creado
✓ Índice idx_en_revision_fecha creado
✓ Índice idx_sync_run_location_status creado

✅ Todos los índices creados exitosamente
```

## PASO 4: Limpiar (opcional)

Después de verificar que los índices se crearon correctamente, puedes eliminar el archivo `crear_indices.py` desde el Administrador de Archivos.

---

**Nota:** Si ves algún error, verifica que:
1. La aplicación Flask se haya reiniciado al menos una vez (para crear las tablas)
2. El archivo `crear_indices.py` esté en la raíz del proyecto
3. La ruta ingresada sea correcta

