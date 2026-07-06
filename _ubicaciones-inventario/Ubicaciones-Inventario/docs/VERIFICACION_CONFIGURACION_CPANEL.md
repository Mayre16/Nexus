# VERIFICACIÓN: Configuración de cPanel para resolver 404

## FECHA: 2026-01-27

---

## ✅ ESTADO ACTUAL

Según los logs, la aplicación Flask se está inicializando **correctamente**:
- ✅ Tablas de base de datos verificadas/creadas
- ✅ Blueprints registrados correctamente
- ✅ Aplicación Flask inicializada correctamente
- ✅ Modo: production
- ✅ Debug: False

**PERO** aún se recibe un **404 Not Found** al acceder a `wms.adesa.com.do`.

---

## 🔍 DIAGNÓSTICO

Si la aplicación se inicializa correctamente pero aún da 404, el problema está en la **configuración de Passenger/cPanel**, no en el código.

---

## ✅ VERIFICACIONES EN CPANEL

### **1. Verificar archivo `passenger_wsgi.py`**

**Ubicación esperada:**
```
/home2/adesa/wms.adesa.com.do/passenger_wsgi.py
```

**Contenido esperado:**
- Debe importar `from app_wms import app`
- Debe tener `application = app`
- Debe estar en el directorio raíz del proyecto

**Verificar:**
1. Ir a "File Manager" en cPanel
2. Navegar a `/home2/adesa/wms.adesa.com.do/`
3. Verificar que existe `passenger_wsgi.py`
4. Abrir el archivo y verificar su contenido

---

### **2. Verificar configuración de Python App en cPanel**

**En el panel de control de Python:**

1. **Application root:**
   - Debe ser: `wms.adesa.com.do`
   - O la ruta completa: `/home2/adesa/wms.adesa.com.do`

2. **Application startup file:**
   - Debe ser: `passenger_wsgi.py`
   - **NO** debe ser: `app_wms.py` o cualquier otro archivo

3. **Application Entry point:**
   - Debe ser: `application`
   - **NO** debe ser: `app` o cualquier otro nombre

4. **Application URL:**
   - Debe ser: `wms.adesa.com.do`
   - O: `https://wms.adesa.com.do`

---

### **3. Verificar logs después de reiniciar**

**Después de reiniciar la aplicación, revisar `stderr.log`:**

Deberías ver:
```
passenger_wsgi.py: Aplicacion Flask importada correctamente
passenger_wsgi.py: Tipo de application: <class 'flask.app.Flask'>
passenger_wsgi.py: Directorio del proyecto: /home2/adesa/wms.adesa.com.do
INFO app_wms Tablas de base de datos verificadas/creadas
INFO app_wms Blueprints registrados correctamente
INFO app_wms Aplicacion Flask inicializada correctamente
INFO app_wms Modo: production
INFO app_wms Debug: False
```

**Si NO ves los mensajes de `passenger_wsgi.py`:**
- El archivo `passenger_wsgi.py` no se está ejecutando
- Verificar que "Application startup file" sea `passenger_wsgi.py`

**Si ves ERROR en `passenger_wsgi.py`:**
- Revisar el mensaje de error
- Verificar que `app_wms.py` esté en el directorio correcto
- Verificar que todas las dependencias estén instaladas

---

### **4. Verificar estructura de directorios**

**Estructura esperada:**
```
/home2/adesa/wms.adesa.com.do/
├── passenger_wsgi.py          ← DEBE ESTAR AQUÍ
├── app_wms.py                 ← DEBE ESTAR AQUÍ
├── config.py                  ← DEBE ESTAR AQUÍ
├── database/                   ← DEBE ESTAR AQUÍ
│   ├── __init__.py
│   └── models.py
├── routes/                     ← DEBE ESTAR AQUÍ
│   ├── __init__.py
│   ├── auth.py
│   ├── ajustes.py
│   └── ...
├── templates/                  ← DEBE ESTAR AQUÍ
│   ├── index.html
│   ├── login.html
│   └── ...
└── ...
```

**Verificar:**
1. Todos los archivos deben estar en el mismo directorio raíz
2. No debe haber subdirectorios innecesarios
3. Los archivos no deben estar duplicados en diferentes ubicaciones

---

### **5. Verificar permisos de archivos**

**Permisos esperados:**
- Archivos Python (`.py`): `644` o `755`
- Directorios: `755`
- `passenger_wsgi.py`: Debe ser ejecutable (`755`)

**Verificar:**
1. En "File Manager", hacer clic derecho en `passenger_wsgi.py`
2. Seleccionar "Change Permissions"
3. Verificar que tenga permisos de lectura y ejecución

---

### **6. Verificar versión de Python**

**En el panel de control de Python:**
- **Python version:** Debe ser `3.11.13` (o compatible)
- Verificar que coincida con la versión usada localmente

---

## 🔧 SOLUCIONES PASO A PASO

### **SOLUCIÓN 1: Verificar y corregir "Application startup file"**

1. Ir a "Python App" en cPanel
2. Buscar la aplicación `wms.adesa.com.do`
3. Verificar que "Application startup file" sea **exactamente**: `passenger_wsgi.py`
4. Si no lo es, cambiarlo y hacer clic en "GUARDAR"
5. Reiniciar la aplicación

---

### **SOLUCIÓN 2: Verificar y corregir "Application Entry point"**

1. En el panel de control de Python
2. Verificar que "Application Entry point" sea **exactamente**: `application`
3. Si no lo es, cambiarlo y hacer clic en "GUARDAR"
4. Reiniciar la aplicación

---

### **SOLUCIÓN 3: Recrear la aplicación Python**

Si las soluciones anteriores no funcionan:

1. **HACER BACKUP PRIMERO** de todos los archivos
2. En el panel de control de Python
3. Hacer clic en "DESTROY" (esto NO elimina los archivos, solo la configuración)
4. Crear una nueva aplicación Python:
   - **Application root:** `wms.adesa.com.do`
   - **Application URL:** `wms.adesa.com.do`
   - **Application startup file:** `passenger_wsgi.py`
   - **Application Entry point:** `application`
   - **Python version:** `3.11.13`
5. Guardar y reiniciar

---

### **SOLUCIÓN 4: Verificar logs de Passenger**

**Ubicación de logs:**
- `/home2/adesa/wms.adesa.com.do/stderr.log`
- `/home2/adesa/wms.adesa.com.do/stdout.log`
- Logs de Passenger (si están disponibles en cPanel)

**Buscar:**
- Errores de importación
- Errores de permisos
- Errores de configuración
- Mensajes de `passenger_wsgi.py`

---

## 📋 CHECKLIST DE VERIFICACIÓN

Antes de reportar el problema, verificar:

- [ ] `passenger_wsgi.py` existe en el directorio raíz
- [ ] "Application startup file" es `passenger_wsgi.py`
- [ ] "Application Entry point" es `application`
- [ ] "Application root" es correcto
- [ ] Los logs muestran mensajes de `passenger_wsgi.py`
- [ ] Los permisos de `passenger_wsgi.py` son correctos (755)
- [ ] La versión de Python es correcta (3.11.13)
- [ ] Todos los archivos están en el directorio correcto
- [ ] La aplicación se ha reiniciado después de los cambios

---

## 🚨 ERRORES COMUNES

### **Error 1: "Application startup file" incorrecto**

**Síntoma:** La aplicación se inicializa pero da 404

**Causa:** cPanel está buscando `app_wms.py` en lugar de `passenger_wsgi.py`

**Solución:** Cambiar "Application startup file" a `passenger_wsgi.py`

---

### **Error 2: "Application Entry point" incorrecto**

**Síntoma:** La aplicación se inicializa pero da 404

**Causa:** cPanel está buscando `app` en lugar de `application`

**Solución:** Cambiar "Application Entry point" a `application`

---

### **Error 3: Archivo `passenger_wsgi.py` no encontrado**

**Síntoma:** Error en logs: "No module named 'app_wms'" o similar

**Causa:** El archivo no está en el directorio correcto o tiene otro nombre

**Solución:** Verificar que `passenger_wsgi.py` esté en el directorio raíz

---

### **Error 4: Permisos incorrectos**

**Síntoma:** Error de permisos en logs

**Causa:** El archivo no tiene permisos de ejecución

**Solución:** Cambiar permisos de `passenger_wsgi.py` a `755`

---

## 📝 PRÓXIMOS PASOS

1. **Subir archivos actualizados:**
   - `passenger_wsgi.py` (con logging adicional)
   - `app_wms.py` (con logging adicional)

2. **Verificar configuración en cPanel:**
   - "Application startup file": `passenger_wsgi.py`
   - "Application Entry point": `application`

3. **Reiniciar la aplicación:**
   - Hacer clic en "RESTART" en el panel de control

4. **Revisar logs:**
   - Verificar que aparezcan los mensajes de `passenger_wsgi.py`
   - Si hay errores, compartir el mensaje completo

5. **Probar la aplicación:**
   - Acceder a `wms.adesa.com.do`
   - Verificar que cargue correctamente

---

## ✅ CONCLUSIÓN

Si la aplicación se inicializa correctamente pero da 404, el problema está en la **configuración de Passenger/cPanel**, no en el código. Sigue las verificaciones anteriores para identificar y resolver el problema.

**Acción inmediata recomendada:**
1. Verificar que "Application startup file" sea `passenger_wsgi.py`
2. Verificar que "Application Entry point" sea `application`
3. Reiniciar la aplicación
4. Revisar los logs para ver los mensajes de `passenger_wsgi.py`





