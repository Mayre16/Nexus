# 💾 ¿Se puede borrar la base de datos y recrearla desde cero?

**Respuesta corta: SÍ, el sistema puede recrear TODO desde cero usando `init_db.py`**

---

## ✅ LO QUE SÍ SE RECREA AUTOMÁTICAMENTE

### **Tablas de base de datos:**
El sistema puede recrear **TODAS las tablas** automáticamente mediante:

1. **`db.create_all()`** en `app_wms.py` (se ejecuta al iniciar)
2. **`init_db.py`** (script manual para inicializar)

### **Tablas que se crean:**
- ✅ `usuarios`
- ✅ `stock_por_ubicacion` (StockUbicacion)
- ✅ `movimientos`
- ✅ `facturas_procesadas`
- ✅ `pendientes_ubicacion`
- ✅ `productos_adm` (ProductoADM)
- ✅ `stock_productos_adm` (StockProductoADM)
- ✅ `sync_locations_status` (SyncLocationStatus)
- ✅ `discrepancias` (Discrepancia) - **NUEVA**

---

## ✅ LO QUE TAMBIÉN SE RECREA AUTOMÁTICAMENTE

### **Usuario Administrador:**
El script `init_db.py` crea automáticamente un usuario administrador:
- **Email:** `admin@wms.local`
- **Contraseña:** `admin123`
- **Rol:** `administrador`

## ❌ LO QUE NO SE RECREA AUTOMÁTICAMENTE

### **Datos de sincronización:**
Estos datos los llenas manualmente con las sincronizaciones:
- Productos de ADM Cloud
- Stock de ubicaciones
- Estado de sincronización de ubicaciones
- Discrepancias (se generan al sincronizar)

---

## 🔧 PROCESO PARA BORRAR Y RECREAR BD

### **Paso 1: Borrar base de datos**
En cPanel (phpMyAdmin):
```sql
DROP DATABASE nombre_de_tu_bd;
CREATE DATABASE nombre_de_tu_bd;
```

O borrar todas las tablas:
```sql
DROP TABLE IF EXISTS discrepancias;
DROP TABLE IF EXISTS sync_locations_status;
DROP TABLE IF EXISTS stock_productos_adm;
DROP TABLE IF EXISTS productos_adm;
DROP TABLE IF EXISTS pendientes_ubicacion;
DROP TABLE IF EXISTS facturas_procesadas;
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS stock_por_ubicacion;
DROP TABLE IF EXISTS usuarios;
```

### **Paso 2: Recrear tablas**
El sistema las creará automáticamente cuando se inicie (`db.create_all()` en `app_wms.py`).

O ejecutar manualmente:
```python
from app_wms import app
from database import db

with app.app_context():
    db.create_all()
    print("Tablas creadas exitosamente")
```

### **Paso 3: Ejecutar `init_db.py` (Crea usuario admin automáticamente)**

**En cPanel Terminal:**
```bash
cd ~/tu_directorio_app
python init_db.py
```

**Este script automáticamente:**
- ✅ Crea todas las tablas
- ✅ Crea usuario administrador:
  - Email: `admin@wms.local`
  - Contraseña: `admin123`
  - Rol: `administrador`

**NOTA:** Si quieres cambiar el email/contraseña del admin, edita `init_db.py` antes de ejecutarlo.

**Alternativa: Solo crear tablas (sin usuario admin)**
```python
from app_wms import app
from database import db

with app.app_context():
    db.create_all()
    print("Tablas creadas (sin usuario admin)")
```

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### **Antes de borrar la BD:**

1. **Backup:**
   - Haz backup de los datos importantes
   - Especialmente si tienes usuarios, movimientos, o datos históricos

2. **Datos que perderás:**
   - ❌ Todos los usuarios (tendrás que recrear el admin)
   - ❌ Todos los productos sincronizados (tendrás que sincronizar de nuevo)
   - ❌ Todo el stock sincronizado (tendrás que sincronizar todas las ubicaciones)
   - ❌ Historial de movimientos
   - ❌ Facturas procesadas
   - ❌ Discrepancias registradas

3. **Después de borrar:**
   - ✅ Las tablas se crearán automáticamente
   - ✅ Tendrás que crear usuario admin
   - ✅ Tendrás que sincronizar catálogo de productos
   - ✅ Tendrás que sincronizar stock de todas las ubicaciones

---

## ✅ RECOMENDACIÓN

**Mejor opción (si ya tienes usuarios personalizados):** NO borrar toda la BD, solo limpiar datos específicos si es necesario:

```sql
-- Limpiar solo datos de sincronización (mantener usuarios)
DELETE FROM discrepancias;
DELETE FROM sync_locations_status;
DELETE FROM stock_productos_adm;
DELETE FROM productos_adm;
-- Mantener: usuarios, movimientos, facturas_procesadas, etc.
```

Esto te permite:
- ✅ Mantener usuarios (no perder acceso)
- ✅ Mantener historial (movimientos, facturas)
- ✅ Limpiar datos de sincronización para empezar de nuevo

---

## 📋 CHECKLIST POST-BORRADO

Si decides borrar la BD completa:

- [ ] Backup realizado (si había datos importantes)
- [ ] BD borrada o tablas eliminadas
- [ ] Ejecutado `python init_db.py` (crea tablas + usuario admin)
- [ ] Acceso al sistema verificado con `admin@wms.local` / `admin123`
- [ ] Sincronizar catálogo de productos (Panel Admin → "Sincronizar Catálogo")
- [ ] Sincronizar stock de ubicaciones (Panel Admin → Sincronizar ADESA, etc.)

---

**Conclusión:** SÍ puedes borrar y recrear TODO desde cero. Simplemente ejecuta `init_db.py` y tendrás tablas + usuario admin listo. Luego solo necesitas sincronizar los datos de ADM Cloud.

