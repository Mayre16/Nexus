# 🔧 PASO A PASO: Desbloquear Sincronización (cPanel - Sin Terminal)

**Usando: "Execute python script" en Web Applications**

---

## 📋 PASO 1: Subir el Script

1. **En el Administrador de Archivos de cPanel:**
   - Ve a: `wms.adesa.com.do/`
   - Asegúrate de que el archivo `desbloquear_sincronizacion.py` esté en ese directorio (donde está `app_wms.py`)

2. **Si NO lo tienes, créalo:**
   - Click en **"Archivo"** (o "File")
   - Nombre: `desbloquear_sincronizacion.py`
   - Click en **"Crear"**
   - Pega este contenido:

```python
"""
Script para desbloquear sincronización de ubicaciones
Funciona con SQLite y MySQL/MariaDB

Ejecutar: python desbloquear_sincronizacion.py
"""
from app_wms import app
from database.models import SyncLocationStatus
from database import db

def desbloquear_sincronizaciones():
    """Desbloquea todas las ubicaciones que quedaron en estado 'running'"""
    with app.app_context():
        try:
            # Buscar todas las ubicaciones bloqueadas
            bloqueadas = SyncLocationStatus.query.filter_by(status='running').all()
            
            if not bloqueadas:
                print("✅ No hay ubicaciones bloqueadas (status='running')")
                return
            
            print(f"🔍 Encontradas {len(bloqueadas)} ubicación(es) bloqueada(s):")
            for loc in bloqueadas:
                print(f"   - {loc.location_name} (ID: {loc.location_id})")
            
            # Desbloquear todas
            SyncLocationStatus.query.filter_by(status='running').update({
                'status': 'error',
                'last_error': 'Proceso interrumpido - reiniciar manualmente'
            })
            
            db.session.commit()
            print("\n✅ Ubicaciones desbloqueadas correctamente")
            print("   Estado cambiado de 'running' a 'error'")
            print("\n📌 Ahora puedes recargar el Panel Admin y sincronizar nuevamente")
            
        except Exception as e:
            print(f"❌ Error al desbloquear: {e}")
            db.session.rollback()

if __name__ == '__main__':
    print("=" * 50)
    print("Desbloquear Sincronización de Ubicaciones")
    print("=" * 50)
    desbloquear_sincronizaciones()
```

   - Click en **"Guardar"**

---

## 📋 PASO 2: Ejecutar el Script desde Web Applications

1. **Ve a Web Applications en cPanel:**
   - En cPanel, busca **"Web Applications"** o **"Application Manager"**
   - Click en el ícono de lápiz (editar) de **"WMS.ADESA.COM.DO/"**

2. **Desplázate hacia abajo** hasta la sección:
   - **"Execute python script"**
   - Verás un campo de texto: **"Enter the path to the script file"**

3. **Escribe la ruta del script:**
   - En el campo de texto, escribe:
     ```
     desbloquear_sincronizacion.py
     ```
   - **NOTA:** Si estás en el directorio raíz de la aplicación, solo necesitas el nombre del archivo.

4. **Click en el botón azul "Run Script"** (con ícono de play ▶️)

5. **Espera el resultado:**
   - Verás la salida en pantalla, algo como:
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

---

## 📋 PASO 3: Verificar que Funcionó

1. **Ve a tu aplicación:**
   - Click en el botón **"OPEN"** (botón azul con ícono de enlace externo)
   - O ve manualmente a: `https://wms.adesa.com.do`

2. **Inicia sesión** (si es necesario)

3. **Ve al Panel Admin:**
   - Click en **"⚙️ Panel de Administración"**

4. **Verifica el estado de ADESA:**
   - El botón de ADESA debería cambiar de:
     - ❌ **"🔄 Sincronizando..."** (bloqueado)
     - ✅ **"🔄 Sincronizar"** (habilitado)

5. **Intenta sincronizar:**
   - Click en **"🔄 Sincronizar"** en ADESA
   - Debería funcionar normalmente ahora

---

## 🔄 SI NECESITAS RECREAR LA BASE DE DATOS

### **Solo si es absolutamente necesario:**

**PASO 1:** Eliminar la base de datos actual
- En Administrador de Archivos, ve a: `database/wms.db`
- Selecciona el archivo
- Click en **"Eliminar"**
- Confirma

**PASO 2:** Ejecutar `init_db.py`
- En Web Applications → Editar "WMS.ADESA.COM.DO/"
- En "Execute python script", escribe:
  ```
  init_db.py
  ```
- Click en **"Run Script"**

**Resultado esperado:**
```
Creando tablas...
✓ Tablas creadas
✓ Usuario administrador creado
  Email: admin@wms.local
  Contraseña: admin123
```

---

## ⚠️ TROUBLESHOOTING

### **Error: "No module named 'app_wms'"**
**Solución:** Asegúrate de que el script esté en el mismo directorio que `app_wms.py`

### **Error: "File not found"**
**Solución:** Verifica que escribiste correctamente el nombre del archivo:
- ✅ Correcto: `desbloquear_sincronizacion.py`
- ❌ Incorrecto: `/desbloquear_sincronizacion.py` o `./desbloquear_sincronizacion.py`

### **No se ve ningún output**
**Solución:** El script se ejecutó pero sin mostrar nada. Verifica en el Panel Admin si el botón cambió.

---

## ✅ RESUMEN RÁPIDO

1. ✅ Archivo `desbloquear_sincronizacion.py` en `wms.adesa.com.do/`
2. ✅ Web Applications → Editar "WMS.ADESA.COM.DO/"
3. ✅ "Execute python script" → Escribir: `desbloquear_sincronizacion.py`
4. ✅ Click "Run Script"
5. ✅ Verificar en Panel Admin que el botón esté habilitado

**¡Listo!** 🎉








