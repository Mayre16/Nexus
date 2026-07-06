# ✅ Checklist de Migración SQLite → MySQL

## Estado Actual

- ✅ 1) MySQL operativo en el servidor (localhost:3306)
- ✅ 2) Base de datos creada: `adesa_wms_adesa`
- ✅ 3) Usuario creado: `adesa_wms_user` con ALL PRIVILEGES
- ✅ 4) Contraseña URL-safe configurada
- ✅ 5) Variable de entorno `DATABASE_URL` configurada en Setup Python App

---

## ⏳ Pendiente

### 🔧 Paso 6: Instalar PyMySQL

**Ubicación:** cPanel → Setup Python App → "Run Pip Install"

**Comando:**
```
pymysql
```

O desde Terminal (si tienes acceso):
```bash
pip install pymysql
```

**Verificación:** Debería mostrar "Successfully installed pymysql-x.x.x"

---

### 📤 Paso 7: Subir Archivos Actualizados

Subir estos archivos a cPanel (reemplazar los existentes):

1. **`config.py`** - Actualizado para soportar MySQL
2. **`app_wms.py`** - Actualizado para usar configuración MySQL
3. **`migrar_sqlite_a_mysql.py`** - Script de migración (nuevo)
4. **`limpiar_bd_mysql.py`** - Script para limpiar BD (nuevo, opcional)
5. **`utils/db_helpers.py`** - Helpers de retry (nuevo, necesario)

**Rutas en cPanel:**
- `/home2/adesa/wms.adesa.com.do/config.py`
- `/home2/adesa/wms.adesa.com.do/app_wms.py`
- `/home2/adesa/wms.adesa.com.do/migrar_sqlite_a_mysql.py`
- `/home2/adesa/wms.adesa.com.do/limpiar_bd_mysql.py`
- `/home2/adesa/wms.adesa.com.do/utils/db_helpers.py`

---

### 🔄 Paso 8: Ejecutar Script de Migración

**Ubicación:** cPanel → Setup Python App → "Execute Python script"

**Script:**
```
migrar_sqlite_a_mysql.py
```

**Qué hace:**
- Crea todas las tablas en MySQL
- Migra todos los datos de SQLite a MySQL
- Verifica que todo esté correcto

**Tiempo estimado:** 2-5 minutos (depende del tamaño de la BD)

---

### 🔁 Paso 9: Reiniciar Aplicación

**Ubicación:** cPanel → Setup Python App → "Restart"

**O desde Terminal:**
```bash
touch tmp/restart.txt
```

**Verificación:** La aplicación debería reiniciar y conectarse a MySQL

---

### ✅ Paso 10: Verificar Migración

1. **Acceder a la aplicación:** `https://wms.adesa.com.do`
2. **Verificar que carga sin errores**
3. **Probar login**
4. **Verificar en phpMyAdmin:**
   - Ver que todas las tablas existen
   - Verificar que tienen datos (si migraste)

**Query de verificación en phpMyAdmin:**
```sql
-- Ver todas las tablas
SHOW TABLES;

-- Verificar cantidad de registros
SELECT 
    'usuarios' as tabla, COUNT(*) as registros FROM usuarios
UNION ALL
SELECT 'productos_adm', COUNT(*) FROM productos_adm
UNION ALL
SELECT 'stock_productos_adm', COUNT(*) FROM stock_productos_adm
UNION ALL
SELECT 'sync_runs', COUNT(*) FROM sync_runs;
```

---

## 🚨 Si Hay Errores

### Error: "No module named 'pymysql'"
**Solución:** Instalar PyMySQL (Paso 6)

### Error: "Access denied for user"
**Solución:** Verificar que:
- Usuario y contraseña sean correctos en `DATABASE_URL`
- Usuario tenga ALL PRIVILEGES en la BD

### Error: "Unknown database"
**Solución:** Verificar que el nombre de la BD en `DATABASE_URL` sea correcto (`adesa_wms_adesa`)

### Error: "Table already exists"
**Solución:** Normal si ejecutas el script múltiples veces. El script omite registros duplicados.

---

## 📝 Notas Finales

- **Backup SQLite:** Tu archivo `database/wms.db` se mantiene intacto como backup
- **Rollback:** Si algo falla, puedes volver a SQLite eliminando `DATABASE_URL` de variables de entorno
- **Pruebas:** Después de verificar, puedes usar `limpiar_bd_mysql.py` para empezar de cero

---

## ✅ Resumen de Pasos Pendientes

1. ⏳ Instalar PyMySQL
2. ⏳ Subir archivos actualizados
3. ⏳ Ejecutar script de migración
4. ⏳ Reiniciar aplicación
5. ⏳ Verificar que funciona


