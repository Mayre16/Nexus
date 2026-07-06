# Solución: Error "Could not open requirements file"

## 🔴 Error que estás viendo:
```
ERROR: Could not open requirements file: [Errno 2] No such file or directory
```

## 🔍 Problema Identificado

CPanel está buscando el archivo `requirements.txt` pero no lo encuentra en la ruta esperada. Esto puede deberse a:

1. **Ruta relativa incorrecta** en la configuración de Python App
2. **El archivo no está en la raíz** de la aplicación
3. **Permisos incorrectos** del archivo

## ✅ Soluciones

### SOLUCIÓN 1: Verificar que requirements.txt está en la raíz (RECOMENDADO)

**En File Manager de CPanel:**

1. Ve a: `/public_html/wms.adesa.com.do/`
2. Verifica que `requirements.txt` esté ahí (junto a `app_wms.py` y `passenger_wsgi.py`)
3. Verifica los permisos del archivo (debe ser `644`)

### SOLUCIÓN 2: Instalar dependencias manualmente (MÁS RÁPIDO)

En lugar de usar "Run Pip Install", instala las dependencias desde Terminal:

1. En CPanel, ve a **Terminal** o **SSH Access**
2. Ejecuta estos comandos:

```bash
cd /home/tu_usuario/public_html/wms.adesa.com.do
```

```bash
pip install Flask Flask-SQLAlchemy requests bcrypt Werkzeug
```

**O si el archivo requirements.txt está correcto:**

```bash
pip install -r requirements.txt
```

### SOLUCIÓN 3: Revisar ruta en Python App

En la configuración de Python App:

1. Verifica que **Application root** sea:
   - `wms.adesa.com.do` (relativa)
   - O la ruta completa: `/home/tu_usuario/public_html/wms.adesa.com.do`

2. El `requirements.txt` debe estar en esa ruta exacta

### SOLUCIÓN 4: Eliminar y volver a agregar requirements.txt

En la sección "Configuration files" de Python App:

1. Haz clic en el icono de **Eliminar** (🗑️) junto a `requirements.txt`
2. En el campo "Add another file and press enter", escribe:
   ```
   requirements.txt
   ```
3. Presiona Enter
4. Verifica que se agregó correctamente

## 🎯 Recomendación Inmediata

**Haz esto AHORA:**

1. **Ignora el error por ahora** (cierra el mensaje de error)

2. **Instala las dependencias desde Terminal:**
   ```
   cd /home/tu_usuario/public_html/wms.adesa.com.do
   pip install Flask Flask-SQLAlchemy requests bcrypt Werkzeug
   ```

3. **Continúa con el resto de los pasos:**
   - Configurar variables de entorno
   - Inicializar base de datos
   - Reiniciar la aplicación

El error de `requirements.txt` no es crítico si instalas las dependencias manualmente.

## ✅ Verificación

Después de instalar dependencias, verifica que funcionó:

```bash
python -c "import flask; print('Flask OK')"
python -c "import flask_sqlalchemy; print('Flask-SQLAlchemy OK')"
```

Si ambos comandos no dan error, las dependencias están instaladas correctamente.

## 📝 Nota

El error de `requirements.txt` en CPanel es común y no impide que la aplicación funcione si instalas las dependencias manualmente desde Terminal.


