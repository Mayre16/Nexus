# 📦 Instrucciones: Instalar openpyxl en cPanel

## 🎯 Objetivo
Instalar la librería `openpyxl` necesaria para procesar archivos Excel en el módulo de Ajustes.

---

## ✅ OPCIÓN 1: Usar "Run Pip Install" (MÁS FÁCIL)

1. **Asegúrate de que `requirements.txt` esté en la raíz del proyecto** en cPanel
   - Debe contener la línea: `openpyxl>=3.1.0`

2. **En cPanel, ve a "Python App" o "Web Applications"**

3. **Busca la sección "Configuration files"**

4. **Haz clic en el botón "Run Pip Install"** (botón azul con ícono de play)

5. **cPanel leerá automáticamente `requirements.txt`** e instalará todas las dependencias, incluyendo `openpyxl`

6. **Espera a que termine** (puede tardar 1-2 minutos)

7. **Reinicia la aplicación Flask** (toca `tmp/restart.txt` o usa "Restart App")

---

## ✅ OPCIÓN 2: Ejecutar Script Python (Si "Run Pip Install" no funciona)

### Paso 1: Subir el script

1. **Sube el archivo `instalar_openpyxl.py`** a la raíz de tu proyecto en cPanel
   - Mismo lugar donde está `app_wms.py`

### Paso 2: Ejecutar el script

1. **En cPanel, ve a "Python App" o "Web Applications"**

2. **Busca la sección "Execute python script"**

3. **En el campo "Enter the path to the script file"**, escribe:
   ```
   instalar_openpyxl.py
   ```

4. **Haz clic en "Run Script"** (botón azul con ícono de play)

5. **Espera a que termine** (puede tardar 1-2 minutos)

6. **Revisa la salida** - deberías ver:
   ```
   ✅ openpyxl instalado exitosamente!
   ✅ Verificación: openpyxl versión 3.1.2 está instalado
   ```

7. **Reinicia la aplicación Flask** (toca `tmp/restart.txt` o usa "Restart App")

---

## ✅ OPCIÓN 3: Verificar Instalación

Después de instalar, puedes verificar que funcionó:

1. **Crea un script de verificación** `verificar_openpyxl.py`:
   ```python
   try:
       import openpyxl
       print(f"✅ openpyxl versión {openpyxl.__version__} está instalado correctamente")
   except ImportError:
       print("❌ openpyxl NO está instalado")
   ```

2. **Ejecuta el script** desde "Execute python script" en cPanel

---

## 🔍 Solución de Problemas

### ❌ Error: "pip not found"
- **Solución**: Usa `python -m pip install openpyxl` en lugar de `pip install`

### ❌ Error: "Permission denied"
- **Solución**: Verifica que tengas permisos de escritura en el entorno virtual

### ❌ Error: "Timeout"
- **Solución**: La instalación puede tardar. Intenta de nuevo o usa "Run Pip Install"

### ❌ Error: "Module not found" después de instalar
- **Solución**: 
  1. Verifica que instalaste en el entorno virtual correcto
  2. Reinicia la aplicación Flask
  3. Verifica que `requirements.txt` esté actualizado

---

## 📋 Checklist Final

- [ ] `requirements.txt` contiene `openpyxl>=3.1.0`
- [ ] `requirements.txt` está en la raíz del proyecto en cPanel
- [ ] Ejecutado "Run Pip Install" O ejecutado `instalar_openpyxl.py`
- [ ] Verificado que openpyxl está instalado
- [ ] Aplicación Flask reiniciada
- [ ] Probado cargar un archivo Excel en el módulo de Ajustes

---

## 🎉 ¡Listo!

Una vez instalado `openpyxl`, el módulo de Ajustes podrá:
- ✅ Procesar archivos Excel para carga masiva
- ✅ Validar formato de Excel
- ✅ Generar reportes de errores por fila








