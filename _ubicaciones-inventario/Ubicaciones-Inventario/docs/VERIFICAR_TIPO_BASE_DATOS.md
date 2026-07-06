# 🔍 ¿Qué base de datos estás usando?

## 📋 SITUACIÓN ACTUAL

El sistema está configurado para usar **SQLite por defecto**, pero puede usar **MySQL/MariaDB** si está configurado en cPanel.

---

## ✅ CÓMO VERIFICAR QUÉ BASE DE DATOS ESTÁS USANDO

### **Opción 1: Ver en cPanel (Variables de Entorno)**

1. Ve a **cPanel → Variables de Entorno** o **Application Manager**
2. Busca la variable `DATABASE_URL`
3. Si existe y tiene formato `mysql://...` → Estás usando **MySQL**
4. Si NO existe → Estás usando **SQLite**

### **Opción 2: Verificar archivo de base de datos**

En cPanel, ve a tu directorio de la aplicación:

**Si encuentras:**
- ✅ Archivo `database/wms.db` → Estás usando **SQLite**
- ❌ No existe `wms.db` pero hay base de datos MySQL → Estás usando **MySQL**

### **Opción 3: Ver en phpMyAdmin**

1. Ve a **cPanel → phpMyAdmin**
2. Si ves bases de datos creadas ahí → Probablemente estás usando **MySQL**
3. Si no hay ninguna base de datos en phpMyAdmin → Estás usando **SQLite**

---

## 🎯 RESPUESTA DIRECTA

### **Si usas phpMyAdmin:**
- ✅ **SÍ, estás usando MySQL/MariaDB**
- Las tablas están en phpMyAdmin
- Puedes ejecutar SQL desde phpMyAdmin
- El archivo `desbloquear_sincronizacion.sql` es correcto para ti

### **Si NO usas phpMyAdmin:**
- ❌ **Estás usando SQLite**
- La base de datos es el archivo `database/wms.db`
- NO puedes usar phpMyAdmin para SQLite
- Necesitas usar otro método para desbloquear

---

## 🔧 SOLUCIONES SEGÚN EL TIPO

### **Si usas MySQL (phpMyAdmin):**

1. **Desbloquear sincronización:**
   - Usa `desbloquear_sincronizacion.sql` en phpMyAdmin

2. **Borrar y recrear BD:**
   ```sql
   -- En phpMyAdmin:
   DROP DATABASE nombre_de_tu_bd;
   CREATE DATABASE nombre_de_tu_bd;
   ```
   Luego ejecuta `init_db.py` (creará tablas en MySQL)

3. **Crear tablas:**
   - Ejecuta: `python init_db.py`
   - O desde Python: `db.create_all()`

---

### **Si usas SQLite:**

1. **Desbloquear sincronización:**
   - Usa Python:
   ```python
   from app_wms import app
   from database.models import SyncLocationStatus
   from database import db
   
   with app.app_context():
       SyncLocationStatus.query.filter_by(status='running').update({
           'status': 'error',
           'last_error': 'Proceso interrumpido'
       })
       db.session.commit()
   ```

2. **Borrar y recrear BD:**
   - Elimina el archivo: `database/wms.db`
   - Ejecuta: `python init_db.py`
   - Se creará un nuevo archivo `wms.db` con todas las tablas

3. **Ver tablas:**
   ```bash
   sqlite3 database/wms.db ".tables"
   ```

---

## ❓ ¿CÓMO SABER CON CERTEZA?

**Ejecuta este código Python en cPanel:**

```python
from app_wms import app

with app.app_context():
    from config import Config
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    print(f"Tipo de BD: {db_uri}")
```

**Resultados:**
- Si dice `sqlite:///...` → **SQLite**
- Si dice `mysql://...` → **MySQL**
- Si dice `postgresql://...` → **PostgreSQL**

---

## 📝 NOTA IMPORTANTE

**Para cPanel, es RECOMENDABLE usar MySQL/MariaDB porque:**
- ✅ Mejor rendimiento
- ✅ Soporte concurrente
- ✅ phpMyAdmin disponible
- ✅ Mejor para producción

**Si actualmente usas SQLite y quieres migrar a MySQL:**

1. Crea base de datos MySQL en cPanel
2. Configura variable de entorno `DATABASE_URL`:
   ```
   DATABASE_URL=mysql://usuario:password@localhost/nombre_bd
   ```
3. Ejecuta `init_db.py` (creará tablas en MySQL)
4. (Opcional) Migra datos de SQLite a MySQL

---

## ✅ RESUMEN RÁPIDO

- **Si accedes a phpMyAdmin** → Usas **MySQL** → Usa SQL directo
- **Si NO accedes a phpMyAdmin** → Usas **SQLite** → Usa Python para modificar

**¿Cuál es tu caso?**








