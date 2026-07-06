# 🗄️ Guía de Migración: SQLite → MySQL/MariaDB

## 📋 Prerrequisitos

1. **Acceso a cPanel** con MySQL/MariaDB disponible
2. **Credenciales de base de datos** (host, usuario, contraseña, nombre de BD)
3. **Backup completo** de la base de datos SQLite actual

---

## 🔧 Paso 1: Crear Base de Datos en cPanel

1. **Acceder a cPanel** → Sección "Bases de Datos"
2. **Crear nueva base de datos:**
   - Ir a "MySQL Databases" o "MariaDB Databases"
   - Crear base de datos: `wms_adesa` (o el nombre que prefieras)
   - Anotar el nombre completo: `usuario_wms_adesa` (cPanel agrega prefijo)
3. **Crear usuario de base de datos:**
   - Crear usuario: `wms_user` (o el nombre que prefieras)
   - Asignar contraseña segura
   - Anotar el nombre completo: `usuario_wms_user` (cPanel agrega prefijo)
4. **Asignar privilegios:**
   - Asignar usuario a la base de datos
   - Otorgar **todos los privilegios** (ALL PRIVILEGES)
5. **Anotar información:**
   - **Host:** `localhost` (típicamente)
   - **Base de datos:** `usuario_wms_adesa`
   - **Usuario:** `usuario_wms_user`
   - **Contraseña:** (la que configuraste)

---

## 🔧 Paso 2: Configurar Variables de Entorno en cPanel

1. **Ir a "Variables de Entorno"** en cPanel
2. **Agregar/Actualizar:**
   ```
   DATABASE_URL=mysql+pymysql://usuario_wms_user:CONTRASEÑA@localhost/usuario_wms_adesa?charset=utf8mb4
   ```
   Reemplazar:
   - `usuario_wms_user` → Tu usuario completo de BD
   - `CONTRASEÑA` → Tu contraseña de BD
   - `usuario_wms_adesa` → Tu base de datos completa

---

## 🔧 Paso 3: Instalar PyMySQL (si no está instalado)

En cPanel, ejecutar desde "Terminal" o "Python App":
```bash
pip install pymysql
```

O agregar a `requirements.txt`:
```
pymysql>=1.0.0
```

---

## 🔧 Paso 4: Actualizar Configuración

El archivo `config.py` ya está preparado para usar `DATABASE_URL` de variables de entorno.

**IMPORTANTE:** La configuración de `SQLALCHEMY_ENGINE_OPTIONS` se actualizará automáticamente para MySQL.

---

## 🔧 Paso 5: Migrar Datos (Script de Migración)

Ejecutar el script `migrar_sqlite_a_mysql.py` (se creará a continuación).

---

## 🔧 Paso 6: Verificar Migración

1. **Reiniciar aplicación** en cPanel
2. **Verificar que las tablas se crearon** correctamente
3. **Probar sincronización** de una ubicación pequeña
4. **Verificar datos** en phpMyAdmin o MySQL Workbench

---

## ⚠️ Notas Importantes

- **Backup:** Siempre hacer backup antes de migrar
- **Pruebas:** Probar en un entorno de desarrollo primero si es posible
- **Rollback:** Mantener el archivo SQLite original por si necesitas revertir

---

## 🔍 Verificación Post-Migración

```sql
-- Verificar tablas creadas
SHOW TABLES;

-- Verificar cantidad de registros
SELECT COUNT(*) FROM productos_adm;
SELECT COUNT(*) FROM stock_productos_adm;
SELECT COUNT(*) FROM sync_runs;
SELECT COUNT(*) FROM en_revision;
```

---

## 📞 Soporte

Si encuentras problemas durante la migración, verificar:
1. Credenciales de base de datos correctas
2. Usuario tiene todos los privilegios
3. PyMySQL está instalado
4. Variables de entorno están configuradas


