# Solución: Instalar Dependencias SIN Terminal en CPanel

## 🚫 Problema: No tienes acceso a Terminal

Necesitas instalar dependencias pero no puedes usar Terminal. Aquí están las alternativas:

---

## ✅ SOLUCIÓN 1: Instalar Módulos Individualmente (RECOMENDADO)

En la interfaz de Python App de CPanel, busca la sección **"Modules"** o **"Módulos"**:

### Paso a Paso:

1. En la página de configuración de tu Python App (`wms.adesa.com.do`)
2. Busca la sección **"Modules"** o **"Módulos de Python"** (puede estar en una pestaña o sección separada)
3. Busca un botón que diga **"Install Module"** o **"Instalar Módulo"** o **"Add Module"**
4. Instala estos módulos **UNO POR UNO** (escribe el nombre exacto y busca/instala):

   - `Flask`
   - `Flask-SQLAlchemy`
   - `requests`
   - `bcrypt`
   - `Werkzeug`

### Si no encuentras "Modules", busca:

- **"Python Modules"** en el menú de CPanel
- O puede estar en la misma página de Python App en una pestaña diferente

---

## ✅ SOLUCIÓN 2: Editar requirements.txt y Reintentar

El error puede ser por espacios en blanco o formato incorrecto:

### Paso a Paso:

1. En File Manager, abre `requirements.txt`
2. Verifica que tenga EXACTAMENTE esto (sin espacios extra):

```
Flask>=3.0.0
Flask-SQLAlchemy>=3.1.0
requests>=2.31.0
bcrypt>=4.0.0
Werkzeug>=3.0.0
```

3. Guarda el archivo
4. En Python App, en la sección "Configuration files":
   - Elimina `requirements.txt` si está listado
   - Agrega de nuevo: escribe `requirements.txt` y presiona Enter
5. Intenta "Run Pip Install" de nuevo

---

## ✅ SOLUCIÓN 3: Verificar Ruta del requirements.txt

### Paso a Paso:

1. En File Manager, ve a `/public_html/wms.adesa.com.do/`
2. Verifica que `requirements.txt` esté ahí (junto a `app_wms.py`)
3. Anota la ruta completa (puede verse en la barra de direcciones del File Manager)
4. En Python App, en "Configuration files", prueba agregar la ruta completa:
   ```
   /home/tu_usuario/public_html/wms.adesa.com.do/requirements.txt
   ```

---

## ✅ SOLUCIÓN 4: Crear Script de Instalación (Alternativa)

Si tienes acceso a editar archivos, puedes crear un script temporal:

### Paso a Paso:

1. En File Manager, crea un archivo nuevo: `install_deps.py`
2. Dentro del archivo, escribe:

```python
import subprocess
import sys

dependencias = [
    'Flask>=3.0.0',
    'Flask-SQLAlchemy>=3.1.0',
    'requests>=2.31.0',
    'bcrypt>=4.0.0',
    'Werkzeug>=3.0.0'
]

for dep in dependencias:
    print(f"Instalando {dep}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", dep])

print("¡Todas las dependencias instaladas!")
```

3. En Python App, en la sección "Execute python script":
   - En el campo "Enter the path to the script file", escribe: `install_deps.py`
   - Haz clic en **"Run Script"**
4. Espera a que termine
5. Elimina el archivo `install_deps.py` después

---

## ✅ SOLUCIÓN 5: Solicitar Acceso a Terminal (Si es posible)

Si eres administrador del servidor, puedes:

1. Contactar al proveedor de hosting
2. Solicitar habilitación de Terminal/SSH
3. O solicitar que instalen las dependencias por ti

---

## 🎯 Recomendación Inmediata

**Prueba en este orden:**

1. **Primero**: Busca la sección "Modules" en Python App y instala módulos individualmente (Solución 1)
2. **Si no encuentras Modules**: Usa la Solución 4 (script de instalación)
3. **Como último recurso**: Contacta soporte para instalar las dependencias

---

## ⚠️ Nota Importante

Si NINGUNA de estas soluciones funciona, es posible que:

- Necesites permisos de administrador
- Tu hosting no permita instalar módulos Python (muy raro)
- Necesites contactar al proveedor

**Pero en la mayoría de casos, la Solución 1 (Modules) o Solución 4 (Script) deberían funcionar.**

---

## ✅ Verificar Instalación

Después de instalar, puedes verificar creando un archivo `test_deps.py`:

```python
try:
    import flask
    print("✓ Flask OK")
except:
    print("✗ Flask FALTA")

try:
    import flask_sqlalchemy
    print("✓ Flask-SQLAlchemy OK")
except:
    print("✗ Flask-SQLAlchemy FALTA")

try:
    import requests
    print("✓ requests OK")
except:
    print("✗ requests FALTA")

try:
    import bcrypt
    print("✓ bcrypt OK")
except:
    print("✗ bcrypt FALTA")
```

Ejecuta este script desde Python App para verificar qué módulos están instalados.


