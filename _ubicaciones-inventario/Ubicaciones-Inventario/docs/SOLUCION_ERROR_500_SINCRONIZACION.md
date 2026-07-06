# 🔧 SOLUCIÓN: Error 500 en Sincronización de Ubicaciones

**Fecha:** 2026-01-22  
**Problema:** Error 500 al sincronizar ubicaciones después de las últimas actualizaciones

---

## 🔍 DIAGNÓSTICO

El error 500 probablemente se debe a que en cPanel faltan las nuevas columnas o tablas que agregamos.

---

## ✅ SOLUCIÓN PASO A PASO

### PASO 1: Verificar que la migración se ejecutó en cPanel

**En cPanel → "Execute python script":**

1. Ejecuta: `verificar_migracion.py`
2. Verifica que todas las tablas y columnas existan

**Si falta algo:**
- Ejecuta: `migrar_tablas_nuevas.py`

---

### PASO 2: Verificar que la tabla `sync_locations_status` existe

**En cPanel → "Execute python script":**

Crea y ejecuta este script temporal:

```python
from app_wms import app
from database import db
from database.models import SyncLocationStatus

with app.app_context():
    db.create_all()
    print("Tablas creadas/verificadas")
```

---

### PASO 3: Verificar logs de error

**En cPanel → Error Logs o Application Logs:**

Busca el error específico que está causando el 500. Los errores más comunes son:

1. **"no such column: location_id"**
   - Solución: Ejecutar `migrar_tablas_nuevas.py`

2. **"no such table: sync_locations_status"**
   - Solución: Ejecutar `db.create_all()` o el script del PASO 2

3. **"OperationalError: database is locked"**
   - Solución: Esperar unos segundos y reintentar

---

### PASO 4: Verificar que los archivos están actualizados

**Archivos que DEBEN estar en cPanel:**

1. ✅ `database/models.py` (con nuevos modelos)
2. ✅ `routes/sincronizar.py` (sin cambios recientes, pero verificar)
3. ✅ `migrar_tablas_nuevas.py` (para ejecutar si falta algo)

---

## 🔧 SCRIPT DE CORRECCIÓN RÁPIDA

Crea este archivo en cPanel: `corregir_sincronizacion.py`

```python
"""
Script para corregir problemas de sincronización
Ejecutar en cPanel: python corregir_sincronizacion.py
"""
from app_wms import app
from database import db
from database.models import SyncLocationStatus, FacturaProcesada, TransferenciaProcesada, MapeoUbicacionADM_WMS
from sqlalchemy import inspect, text

def corregir():
    """Corrige problemas comunes de sincronización"""
    with app.app_context():
        print("=" * 60)
        print("CORRECCION DE SINCRONIZACION")
        print("=" * 60)
        
        # 1. Crear todas las tablas
        print("\n[1] Creando/verificando tablas...")
        try:
            db.create_all()
            print("[OK] Tablas creadas/verificadas")
        except Exception as e:
            print(f"[ERROR] Error al crear tablas: {e}")
            import traceback
            traceback.print_exc()
            return
        
        # 2. Verificar y agregar columnas faltantes en facturas_procesadas
        print("\n[2] Verificando columnas de facturas_procesadas...")
        inspector = inspect(db.engine)
        try:
            columnas = inspector.get_columns('facturas_procesadas')
            nombres_columnas = [col['name'] for col in columnas]
            
            if 'location_id' not in nombres_columnas:
                print("[*] Agregando columna 'location_id'...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_id VARCHAR(100)"))
                print("[OK] Columna 'location_id' agregada")
            
            if 'location_name' not in nombres_columnas:
                print("[*] Agregando columna 'location_name'...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_name VARCHAR(200)"))
                print("[OK] Columna 'location_name' agregada")
            
            db.session.commit()
            print("[OK] Columnas verificadas")
        except Exception as e:
            print(f"[ERROR] Error al verificar columnas: {e}")
            db.session.rollback()
            import traceback
            traceback.print_exc()
        
        # 3. Verificar que sync_locations_status existe
        print("\n[3] Verificando tabla sync_locations_status...")
        tablas = inspector.get_table_names()
        if 'sync_locations_status' in tablas:
            print("[OK] Tabla 'sync_locations_status' existe")
        else:
            print("[ERROR] Tabla 'sync_locations_status' NO existe")
            print("[*] Intentando crear...")
            try:
                SyncLocationStatus.__table__.create(db.engine, checkfirst=True)
                print("[OK] Tabla 'sync_locations_status' creada")
            except Exception as e:
                print(f"[ERROR] No se pudo crear: {e}")
        
        print("\n" + "=" * 60)
        print("CORRECCION COMPLETADA")
        print("=" * 60)
        print("\nAhora intenta sincronizar una ubicación de nuevo.")

if __name__ == '__main__':
    corregir()
```

---

## 📋 CHECKLIST DE VERIFICACIÓN

- [ ] Ejecutado `migrar_tablas_nuevas.py` en cPanel
- [ ] Ejecutado `verificar_migracion.py` en cPanel (todo OK)
- [ ] Verificado logs de error en cPanel
- [ ] Ejecutado `corregir_sincronizacion.py` si hay problemas
- [ ] Probado sincronizar una ubicación

---

## 🚨 ERRORES COMUNES Y SOLUCIONES

### Error: "no such column: location_id"
**Solución:** Ejecutar `migrar_tablas_nuevas.py` o `corregir_sincronizacion.py`

### Error: "no such table: sync_locations_status"
**Solución:** Ejecutar `db.create_all()` o `corregir_sincronizacion.py`

### Error: "database is locked"
**Solución:** Esperar 10-30 segundos y reintentar

### Error: "OperationalError: table already exists"
**Solución:** Normal, ignorar. El script verifica antes de crear.

---

## 📝 PRÓXIMOS PASOS

1. Ejecuta `corregir_sincronizacion.py` en cPanel
2. Verifica que no haya errores
3. Intenta sincronizar una ubicación
4. Si sigue fallando, revisa los logs de error específicos

---

**¿Necesitas ayuda con algún paso específico?** Puedo ayudarte a revisar los logs o ajustar el script.




