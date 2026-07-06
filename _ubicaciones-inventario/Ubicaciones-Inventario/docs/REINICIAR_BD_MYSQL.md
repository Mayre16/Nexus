# 🔄 Cómo Reiniciar la Base de Datos MySQL

## ⚠️ ADVERTENCIA

**Reiniciar la base de datos elimina TODOS los datos.** Úsalo solo para:
- Pruebas de migración
- Empezar de cero después de pruebas
- Desarrollo/testing

---

## 📋 Opciones para Reiniciar

### Opción 1: Script Automático (Recomendado)

1. **Subir el archivo `limpiar_bd_mysql.py`** a cPanel
2. **Ejecutar desde "Execute Python script":**
   ```
   limpiar_bd_mysql.py
   ```
3. **Confirmar** escribiendo `SI` cuando se solicite
4. El script:
   - Elimina todas las tablas
   - Las recrea vacías
   - Crea la configuración de notificaciones por defecto

---

### Opción 2: Desde phpMyAdmin (cPanel)

1. **Acceder a phpMyAdmin** desde cPanel
2. **Seleccionar tu base de datos** (ej: `usuario_wms_adesa`)
3. **Ir a la pestaña "SQL"**
4. **Ejecutar:**
   ```sql
   -- Eliminar todas las tablas
   SET FOREIGN_KEY_CHECKS = 0;
   
   DROP TABLE IF EXISTS en_revision;
   DROP TABLE IF EXISTS sync_runs;
   DROP TABLE IF EXISTS stock_productos_adm;
   DROP TABLE IF EXISTS stock_por_ubicacion;
   DROP TABLE IF EXISTS sync_locations_status;
   DROP TABLE IF EXISTS productos_adm;
   DROP TABLE IF EXISTS ubicaciones_fisicas;
   DROP TABLE IF EXISTS usuarios;
   DROP TABLE IF EXISTS notificaciones_config;
   
   SET FOREIGN_KEY_CHECKS = 1;
   ```
5. **Ejecutar el script de migración** nuevamente para crear las tablas:
   ```
   migrar_sqlite_a_mysql.py
   ```

---

### Opción 3: Eliminar y Recrear Base de Datos (Más drástico)

1. **En cPanel → MySQL Databases:**
   - Eliminar la base de datos actual
   - Crear una nueva base de datos con el mismo nombre
   - Reasignar el usuario
2. **Ejecutar el script de migración:**
   ```
   migrar_sqlite_a_mysql.py
   ```

---

## ✅ Después de Reiniciar

1. **Verificar que las tablas se crearon:**
   - En phpMyAdmin, deberías ver todas las tablas vacías
   
2. **Si necesitas datos de prueba:**
   - Ejecutar `migrar_sqlite_a_mysql.py` nuevamente para migrar desde SQLite
   - O crear datos manualmente desde la aplicación

3. **Reiniciar la aplicación** en cPanel

---

## 🔒 Seguridad

- **Backup antes de limpiar:** Siempre hacer backup si hay datos importantes
- **Confirmación:** El script requiere confirmación explícita (`SI`)
- **Solo pruebas:** No usar en producción con datos reales

---

## 📝 Notas

- El script `migrar_sqlite_a_mysql.py` puede ejecutarse múltiples veces
- Si un registro ya existe, se omite (no duplica)
- Puedes mantener tu SQLite como backup permanente


