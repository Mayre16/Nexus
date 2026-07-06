# SOLUCIÓN: Error 404 Not Found (LiteSpeed Web Server)

## FECHA: 2026-01-26

---

## 🔴 PROBLEMA

El servidor está devolviendo un error **404 Not Found** de LiteSpeed Web Server. Esto significa que la aplicación Flask no está respondiendo o no está corriendo.

---

## 🔍 CAUSAS POSIBLES

### **1. La aplicación no está corriendo**
- La aplicación necesita ser iniciada desde el panel de control de Python en cPanel
- Si se detuvo, no responderá a las peticiones HTTP

### **2. Error en tiempo de ejecución**
- Hay un error de sintaxis o importación que impide que la aplicación inicie
- El error no se ve hasta que se intenta ejecutar la aplicación

### **3. Archivo `passenger_wsgi.py` incorrecto**
- El archivo WSGI no está configurado correctamente
- La variable `application` no está definida

### **4. Cambios recientes no aplicados**
- Los archivos modificados no se han subido al servidor
- Hay una diferencia entre el código local y el del servidor

---

## ✅ SOLUCIONES PASO A PASO

### **PASO 1: Verificar que la aplicación esté corriendo**

1. **Ir al panel de control de Python en cPanel:**
   - Buscar "Python" o "Python App"
   - Encontrar la aplicación `wms.adesa.com.do`

2. **Verificar el estado:**
   - Si hay un botón **"START APP"** o **"RESTART"**, hacer clic
   - Si hay un botón **"STOP APP"**, la aplicación está detenida

3. **Reiniciar la aplicación:**
   - Hacer clic en **"RESTART"** para reiniciar la aplicación
   - Esperar unos segundos a que se inicie

---

### **PASO 2: Verificar logs de errores**

1. **En el panel de control de Python:**
   - Buscar la sección de **"Logs"** o **"Error Logs"**
   - Revisar `stderr.log` o `stdout.log`

2. **Buscar errores comunes:**
   - `ImportError`: Falta una importación
   - `SyntaxError`: Error de sintaxis
   - `ModuleNotFoundError`: Módulo no encontrado
   - `AttributeError`: Atributo no encontrado

3. **Si hay errores:**
   - Copiar el mensaje de error completo
   - Revisar el archivo mencionado en el error
   - Corregir el error y volver a subir el archivo

---

### **PASO 3: Verificar archivo `passenger_wsgi.py`**

El archivo debe tener este contenido:

```python
"""
Archivo WSGI para CPanel (Passenger)
Este archivo permite ejecutar la aplicación Flask en CPanel
"""
import sys
import os

# Obtener el directorio del proyecto de forma absoluta
project_dir = os.path.dirname(os.path.abspath(__file__))

# Agregar el directorio del proyecto al path
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

# Cambiar al directorio del proyecto (importante para rutas relativas)
os.chdir(project_dir)

# Importar la aplicación Flask
# Passenger espera que la variable se llame 'application'
from app_wms import app
application = app
```

**Verificar:**
- ✅ El archivo existe en el directorio raíz del proyecto
- ✅ La variable `application` está definida
- ✅ La importación `from app_wms import app` es correcta

---

### **PASO 4: Verificar archivos subidos**

**Archivos que deben estar en el servidor:**

1. **Archivos modificados recientemente:**
   - `routes/historiales.py` ✅
   - `templates/ajustes_historial.html` ✅

2. **Archivos principales:**
   - `app_wms.py` ✅
   - `passenger_wsgi.py` ✅
   - `config.py` ✅
   - `database/` (directorio completo) ✅
   - `routes/` (directorio completo) ✅
   - `templates/` (directorio completo) ✅

**Verificar que los archivos estén actualizados:**
- Comparar fechas de modificación
- Verificar que los cambios recientes estén presentes

---

### **PASO 5: Probar importación manual**

Si tienes acceso SSH o "Execute Python Script" en cPanel:

```python
import sys
import os

# Agregar el directorio del proyecto
project_dir = '/home2/adesa/wms.adesa.com.do'
sys.path.insert(0, project_dir)
os.chdir(project_dir)

# Intentar importar
try:
    from app_wms import app
    print("✅ Importación exitosa")
    print(f"App: {app}")
except Exception as e:
    print(f"❌ Error al importar: {e}")
    import traceback
    traceback.print_exc()
```

**Si hay error:**
- El mensaje indicará qué archivo tiene el problema
- Corregir el error y volver a probar

---

## 🔧 VERIFICACIÓN RÁPIDA

### **Checklist:**

- [ ] La aplicación está corriendo (botón "RESTART" en cPanel)
- [ ] El archivo `passenger_wsgi.py` existe y está correcto
- [ ] Los archivos modificados están subidos al servidor
- [ ] No hay errores en los logs (`stderr.log`, `stdout.log`)
- [ ] La importación manual funciona sin errores

---

## 📋 LOGS A REVISAR

### **Ubicación de logs en cPanel:**

1. **Panel de control de Python:**
   - Sección "Logs" o "Error Logs"
   - Archivos: `stderr.log`, `stdout.log`

2. **Panel de control general:**
   - "Error Log" o "Error Logs"
   - Buscar errores recientes relacionados con Python/Flask

3. **Logs del servidor:**
   - `/home2/adesa/wms.adesa.com.do/stderr.log`
   - `/home2/adesa/wms.adesa.com.do/stdout.log`

---

## 🚨 ERRORES COMUNES Y SOLUCIONES

### **Error 1: `ImportError: cannot import name 'X'`**

**Causa:** Falta una importación o hay un error de sintaxis en el archivo importado.

**Solución:**
1. Revisar el archivo mencionado en el error
2. Verificar que todas las importaciones estén correctas
3. Verificar que no haya errores de sintaxis

---

### **Error 2: `ModuleNotFoundError: No module named 'X'`**

**Causa:** Falta instalar una dependencia.

**Solución:**
1. Verificar `requirements.txt`
2. Ejecutar `pip install -r requirements.txt` en el entorno virtual
3. Reiniciar la aplicación

---

### **Error 3: `SyntaxError: invalid syntax`**

**Causa:** Error de sintaxis en el código Python.

**Solución:**
1. Revisar el archivo mencionado en el error
2. Verificar la línea indicada
3. Corregir el error de sintaxis

---

### **Error 4: `AttributeError: 'X' object has no attribute 'Y'`**

**Causa:** Se está intentando acceder a un atributo que no existe.

**Solución:**
1. Revisar el código donde se usa el atributo
2. Verificar que el objeto tenga ese atributo
3. Corregir el nombre del atributo o agregar el atributo faltante

---

## 📝 PRÓXIMOS PASOS

1. **Revisar logs en cPanel:**
   - Ir a "Python App" → "Logs"
   - Buscar errores recientes
   - Copiar el mensaje de error completo

2. **Reiniciar la aplicación:**
   - Hacer clic en "RESTART" en el panel de control
   - Esperar a que se inicie

3. **Probar la aplicación:**
   - Intentar acceder a `wms.adesa.com.do`
   - Verificar que responda correctamente

4. **Si persiste el error:**
   - Compartir el mensaje de error completo de los logs
   - Revisar los archivos modificados recientemente
   - Verificar que todos los archivos estén subidos

---

## ✅ CONCLUSIÓN

El error 404 de LiteSpeed generalmente se debe a que la aplicación no está corriendo o hay un error que impide que inicie. Sigue los pasos anteriores para identificar y resolver el problema.

**Acción inmediata recomendada:**
1. Ir al panel de control de Python en cPanel
2. Hacer clic en "RESTART" para reiniciar la aplicación
3. Revisar los logs si el error persiste






