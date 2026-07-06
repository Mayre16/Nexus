# ✅ SOLUCIÓN: Desbloquear Sincronización (SQLite)

**Confirmado:** Estás usando **SQLite** (archivo `wms.db` en `database/`)

---

## 🔧 DESBLOQUEAR SINCRONIZACIÓN

### **Método 1: Script Python (Recomendado)**

1. **Sube el archivo `desbloquear_sincronizacion.py` a cPanel:**
   - En el administrador de archivos, ve a tu directorio `wms.adesa.com.do`
   - Sube el archivo `desbloquear_sincronizacion.py`

2. **Ejecuta desde Terminal de cPanel:**
   ```bash
   cd ~/wms.adesa.com.do
   python desbloquear_sincronizacion.py
   ```

3. **Resultado esperado:**
   ```
   ==================================================
   Desbloquear Sincronización de Ubicaciones
   ==================================================
   🔍 Encontradas 1 ubicación(es) bloqueada(s):
      - ADESA (ID: ...)
   
   ✅ Ubicaciones desbloqueadas correctamente
      Estado cambiado de 'running' a 'error'
   
   📌 Ahora puedes recargar el Panel Admin y sincronizar nuevamente
   ```

4. **Recarga el Panel Admin (F5)** y el botón debería estar habilitado.

---

### **Método 2: Desde Python directamente (si prefieres)**

En Terminal de cPanel:

```python
cd ~/wms.adesa.com.do
python

# Luego ejecuta:
from app_wms import app
from database.models import SyncLocationStatus
from database import db

with app.app_context():
    # Ver ubicaciones bloqueadas
    bloqueadas = SyncLocationStatus.query.filter_by(status='running').all()
    print(f"Bloqueadas: {[l.location_name for l in bloqueadas]}")
    
    # Desbloquear
    SyncLocationStatus.query.filter_by(status='running').update({
        'status': 'error',
        'last_error': 'Proceso interrumpido - reiniciar manualmente'
    })
    db.session.commit()
    print("✅ Desbloqueado")
```

---

## 🗑️ BORRAR Y RECREAR BASE DE DATOS (SQLite)

Si quieres empezar desde cero:

### **Paso 1: Hacer backup (opcional pero recomendado)**

En el administrador de archivos:
1. Selecciona `database/wms.db`
2. Click derecho → **Descargar** o **Comprimir**
3. Guarda una copia por si acaso

### **Paso 2: Eliminar base de datos**

En el administrador de archivos:
1. Ve a `database/`
2. Selecciona `wms.db`
3. Click en **Eliminar**
4. Confirma la eliminación

### **Paso 3: Recrear base de datos**

En Terminal de cPanel:

```bash
cd ~/wms.adesa.com.do
python init_db.py
```

**Resultado esperado:**
```
Creando tablas...
✓ Tablas creadas
✓ Usuario administrador creado
  Email: admin@wms.local
  Contraseña: admin123

Base de datos inicializada correctamente!
```

### **Paso 4: Verificar**

En el administrador de archivos:
- Deberías ver que se creó nuevamente `database/wms.db` (más pequeño, ~1-2 MB inicialmente)

---

## ⚠️ IMPORTANTE: QUÉ SE PIERDE AL BORRAR `wms.db`

- ❌ Todos los usuarios (tendrás que usar `admin@wms.local` / `admin123`)
- ❌ Todos los productos sincronizados
- ❌ Todo el stock sincronizado de ubicaciones
- ❌ Historial de movimientos
- ❌ Facturas procesadas
- ❌ Discrepancias registradas

**Recomendación:** Solo borra si es absolutamente necesario. Mejor opción es solo desbloquear.

---

## ✅ RECOMENDACIÓN FINAL

**Para tu caso específico (botón bloqueado):**

1. ✅ Solo desbloquea (Método 1 arriba)
2. ✅ NO borres la base de datos (tienes 21.64 MB de datos sincronizados)
3. ✅ Recarga el Panel Admin
4. ✅ Sincroniza ADESA nuevamente

---

## 📋 RESUMEN RÁPIDO

- **Base de datos:** SQLite (`database/wms.db`)
- **Desbloquear:** Ejecuta `python desbloquear_sincronizacion.py`
- **Borrar:** Elimina `wms.db` y ejecuta `python init_db.py`
- **NO usar:** phpMyAdmin (no aplica para SQLite)








