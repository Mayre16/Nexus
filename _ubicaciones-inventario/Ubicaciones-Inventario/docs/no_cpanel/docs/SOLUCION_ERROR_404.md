# 🔴 Solución: Error 404 Not Found

## 🚨 Problema

Al abrir `https://wms.adesa.com.do/` aparece: **404 Not Found**

Esto significa que el servidor no encuentra la aplicación o no está corriendo correctamente.

---

## 🔍 DIAGNÓSTICO PASO A PASO

### PASO 1: Verificar Estado de la Aplicación en Python App

1. **Ve a CPanel → Setup Python App**
2. **Busca tu aplicación** `wms.adesa.com.do`
3. **Verifica qué dice:**
   - ¿Ves botón **"START APP"**? → La app está detenida
   - ¿Ves botón **"STOP APP"**? → La app está corriendo
   - ¿Ves botón **"RESTART"**? → La app está corriendo

**Si ves "START APP":**
- Haz clic en **"START APP"**
- Espera 30 segundos
- Intenta abrir `https://wms.adesa.com.do/` de nuevo

**Si ves "STOP APP" o "RESTART":**
- La app está corriendo, pero hay otro problema → Continúa al Paso 2

---

### PASO 2: Revisar Logs de Error

Los logs te dirán qué está pasando:

1. **En File Manager**, ve a: `/home2/adesa/wms.adesa.com.do/`
2. **Abre el archivo** `stderr.log`
3. **Revisa las ÚLTIMAS líneas** (al final del archivo)
4. **Busca errores** como:
   - `ImportError`
   - `ModuleNotFoundError`
   - `SyntaxError`
   - `FileNotFoundError`

**📋 Copia los errores que veas** para diagnosticar.

---

### PASO 3: Verificar Configuración del Dominio

Puede haber un desajuste entre el dominio y la Python App:

#### Opción A: Verificar en Python App

1. En Python App, verifica:
   - **Application URL:** Debe ser `wms.adesa.com.do` o `/`
   - **Application root:** Debe ser `wms.adesa.com.do` (sin public_html)

#### Opción B: Verificar Dominio en CPanel

1. **CPanel → Domains** (o "List Domains")
2. **Busca** `wms.adesa.com.do`
3. **Verifica:**
   - ¿Está **activo**? (toggle ON)
   - ¿A qué **directorio raíz** apunta? (debería ser `/public_html/wms.adesa.com.do`)
   - **⚠️ PROBLEMA COMÚN:** Si el dominio apunta a `public_html/wms.adesa.com.do` pero la Python App está en `/home2/adesa/wms.adesa.com.do`, hay un desajuste

---

### PASO 4: Soluciones Según el Problema

#### SOLUCIÓN 1: App no está corriendo

**Síntoma:** Ves "START APP" en Python App

**Solución:**
1. Haz clic en **"START APP"**
2. Espera 30 segundos
3. Intenta abrir `https://wms.adesa.com.do/` de nuevo

---

#### SOLUCIÓN 2: Error en los logs (ImportError, ModuleNotFoundError)

**Síntoma:** En `stderr.log` ves errores como:
```
ModuleNotFoundError: No module named 'flask'
ImportError: cannot import name 'app'
```

**Solución:**
1. Ejecuta `install_deps.py` de nuevo (Python App → Execute python script)
2. Verifica con `test_deps.py`
3. Reinicia la app (botón "RESTART")

---

#### SOLUCIÓN 3: Desajuste entre dominio y Python App

**Síntoma:** El dominio apunta a `public_html/wms.adesa.com.do` pero la app está en `/home2/adesa/wms.adesa.com.do`

**Solución A (Recomendada): Cambiar Application Root**

1. En Python App, cambia **Application root** a:
   ```
   public_html/wms.adesa.com.do
   ```
2. Mueve todos los archivos a `/home2/adesa/public_html/wms.adesa.com.do/`
3. Guarda y reinicia

**Solución B: Usar un subdirectorio para la app**

1. Mantén los archivos en `/home2/adesa/wms.adesa.com.do/`
2. En el dominio, configura un subdirectorio o subdominio

---

#### SOLUCIÓN 4: passenger_wsgi.py incorrecto

**Síntoma:** Errores relacionados con `application` en los logs

**Solución:**
1. Verifica que `passenger_wsgi.py` tenga este contenido:

```python
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app_wms import app as application

if __name__ == "__main__":
    application.run()
```

2. Verifica que esté en: `/home2/adesa/wms.adesa.com.do/passenger_wsgi.py`

---

#### SOLUCIÓN 5: Archivos faltantes o en ruta incorrecta

**Síntoma:** Errores como `FileNotFoundError` o `No such file or directory`

**Solución:**
1. Verifica que todos los archivos estén en `/home2/adesa/wms.adesa.com.do/`:
   - `app_wms.py` ✅
   - `passenger_wsgi.py` ✅
   - `config.py` ✅
   - Carpetas: `database/`, `api/`, `routes/`, `utils/`, `templates/` ✅

---

### PASO 5: Verificar desde Python App (Prueba Rápida)

1. En Python App, busca el botón **"OPEN"** (junto a Application URL)
2. Haz clic en **"OPEN"**
3. ¿Se abre la aplicación? Si sí, el problema es la configuración del dominio.

---

## 🎯 Diagnóstico Rápido: Responde estas preguntas

1. **¿Qué botón ves en Python App?**
   - [ ] START APP
   - [ ] STOP APP / RESTART

2. **¿Qué errores ves en `stderr.log`?**
   - [ ] No hay errores
   - [ ] ModuleNotFoundError
   - [ ] ImportError
   - [ ] Otro error: _______________

3. **¿Cuál es el Application root en Python App?**
   - [ ] `wms.adesa.com.do`
   - [ ] `public_html/wms.adesa.com.do`
   - [ ] Otro: _______________

4. **¿Dónde están los archivos?**
   - [ ] `/home2/adesa/wms.adesa.com.do/`
   - [ ] `/home2/adesa/public_html/wms.adesa.com.do/`

---

## ⚡ Solución Rápida (Más Probable)

**Intenta esto primero:**

1. **En Python App:**
   - Verifica que Application root sea: `wms.adesa.com.do`
   - Haz clic en **"GUARDAR"**
   - Haz clic en **"RESTART"**
   - Espera 1 minuto

2. **Abre el botón "OPEN"** en Python App (junto a Application URL)
   - Si funciona ahí, el problema es la configuración del dominio
   - Si NO funciona, revisa los logs

3. **Si el botón "OPEN" funciona:**
   - El problema es que el dominio no está apuntando a la Python App
   - Necesitas configurar el dominio para que use la Python App

---

## 📝 Información Necesaria para Diagnóstico

Para ayudarte mejor, necesito saber:

1. ¿Qué dice el botón en Python App? (START/STOP/RESTART)
2. ¿Qué errores hay en `stderr.log`? (copia las últimas líneas)
3. ¿Cuál es el Application root configurado?
4. ¿Qué pasa cuando haces clic en el botón "OPEN" de Python App?

---

**Con esta información podré darte la solución exacta.** 🔧


