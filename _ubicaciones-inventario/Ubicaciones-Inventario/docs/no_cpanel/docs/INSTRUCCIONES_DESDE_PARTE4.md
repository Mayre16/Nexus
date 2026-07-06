# 🚀 Instrucciones Desde PARTE 4: Instalar Dependencias

## ✅ Estado Actual

Ya tienes:
- ✅ Python App creada correctamente
- ✅ Archivos subidos a `/home2/adesa/wms.adesa.com.do/`
- ✅ Estructura correcta

**Ahora vamos a:**
1. Instalar dependencias
2. Configurar variables de entorno
3. Inicializar base de datos
4. Reiniciar y probar

---

## 📦 PASO 4: Instalar Dependencias

### Opción A: Usar install_deps.py (RECOMENDADO - Más Confiable)

#### Paso 4.1: Ejecutar install_deps.py

1. **En la interfaz de Python App** (donde ves "STOP APP" y "RESTART")
2. **Baja hasta la sección** que dice **"Execute python script"**
3. **En el campo** que dice **"Enter the path to the script file"**, escribe exactamente:
   ```
   install_deps.py
   ```
4. **Haz clic en el botón azul** **"Run Script"** (tiene un ícono de play ▶️)
5. **ESPERA 1-2 minutos** mientras instala (puede tardar)

#### Paso 4.2: Verificar el Resultado

Después de ejecutar, deberías ver un output como:

```
============================================================
Instalador de Dependencias para WMS
============================================================

Instalando Flask>=3.0.0...
  ✓ Flask instalado correctamente

Instalando Flask-SQLAlchemy>=3.1.0...
  ✓ Flask-SQLAlchemy instalado correctamente

... (y así con cada módulo)

============================================================
RESUMEN:
============================================================
Módulos instalados: 5/5
✓ Instalados: Flask, Flask-SQLAlchemy, requests, bcrypt, Werkzeug

============================================================
¡TODAS LAS DEPENDENCIAS INSTALADAS EXITOSAMENTE!
============================================================
```

**✅ Si ves ese mensaje final de éxito, las dependencias están instaladas.**

**⚠️ Si ves errores:**
- Anota qué error aparece
- Reintenta ejecutar `install_deps.py` de nuevo
- Si sigue fallando, usa la Opción B

#### Paso 4.3: Verificar con test_deps.py

Para confirmar que todo está bien:

1. **En la misma sección** "Execute python script"
2. **Borra** `install_deps.py` del campo
3. **Escribe:**
   ```
   test_deps.py
   ```
4. **Haz clic en** **"Run Script"**
5. **Deberías ver:**

```
============================================================
Verificación de Dependencias
============================================================

✓ Flask: INSTALADO
✓ Flask-SQLAlchemy: INSTALADO
✓ requests: INSTALADO
✓ bcrypt: INSTALADO
✓ Werkzeug: INSTALADO

============================================================
RESUMEN:
============================================================
Instalados: 5/5
Faltantes: 0/5

✓ TODAS LAS DEPENDENCIAS ESTÁN INSTALADAS
============================================================
```

**✅ Si ves "TODAS LAS DEPENDENCIAS ESTÁN INSTALADAS", continúa al Paso 5.**

**⚠️ Si falta algún módulo:**
- Ejecuta `install_deps.py` de nuevo
- Luego vuelve a ejecutar `test_deps.py` para verificar

---

### Opción B: Usar Run Pip Install (Alternativa)

Si `install_deps.py` no funciona:

1. **En Python App**, busca la sección **"Configuration files"**
2. **Verifica** que `requirements.txt` esté listado en la tabla
3. **Si NO está listado:**
   - En el campo "Add another file and press enter", escribe: `requirements.txt`
   - Haz clic en **"Add"** (botón con +)
4. **Haz clic en el botón azul** **"Run Pip Install"** (tiene ícono de play ▶️)
5. **Espera** a que termine (puede tardar 1-2 minutos)

**⚠️ Si da error**, vuelve a usar la Opción A.

---

## 🔧 PASO 5: Configurar Variables de Entorno

**⚠️ IMPORTANTE: Haz esto DESPUÉS de instalar dependencias (Paso 4)**

### Paso 5.1: Ir a la Sección de Variables

1. **En Python App**, baja hasta la sección que dice **"Environment variables"**
2. Verás una tabla con columnas: "Name", "Value", "Actions"
3. Si hay variables ya agregadas, está bien (pueden ser de pruebas anteriores)

### Paso 5.2: Agregar Variables (Una por Una)

Haz clic en el botón **"+ ADD VARIABLE"** (botón azul con +)

**Agrega estas variables UNA POR UNA** (haz clic en "+ ADD VARIABLE" para cada una):

#### Variable 1: FLASK_ENV
- **Name:** `FLASK_ENV`
- **Value:** `production`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 2: SECRET_KEY
- **Name:** `SECRET_KEY`
- **Value:** `WMS@ADESA-2026!Kz9#qT4$Lm7^pR2*Xn8?Va6+Hd3=Yc1!uS5%jB0`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 3: ADM_EMAIL
- **Name:** `ADM_EMAIL`
- **Value:** `luis.useche@adesa.com.do`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 4: ADM_PASSWORD
- **Name:** `ADM_PASSWORD`
- **Value:** `Merida.123.`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 5: ADM_APPID
- **Name:** `ADM_APPID`
- **Value:** `cccdf964-1e69-46e7-5ed0-08de4e33921f`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 6: ADM_COMPANY
- **Name:** `ADM_COMPANY`
- **Value:** `7b5f5222-123e-4dc7-a783-2979ea9e6cff`
- Haz clic en **"Add"** o **"Guardar"**

#### Variable 7: ADM_ROLE
- **Name:** `ADM_ROLE`
- **Value:** `Administradores`
- Haz clic en **"Add"** o **"Guardar"**

### Paso 5.3: Verificar Variables Agregadas

Al final, en la tabla de "Environment variables" deberías ver 7 filas:

| Name | Value |
|------|-------|
| FLASK_ENV | production |
| SECRET_KEY | WMS@ADESA-2026!... |
| ADM_EMAIL | luis.useche@adesa.com.do |
| ADM_PASSWORD | Merida.123. |
| ADM_APPID | cccdf964-1e69-46e7-5ed0-08de4e33921f |
| ADM_COMPANY | 7b5f5222-123e-4dc7-a783-2979ea9e6cff |
| ADM_ROLE | Administradores |

**✅ Si ves todas estas variables, continúa al Paso 6.**

### Paso 5.4: Guardar Configuración

**⚠️ IMPORTANTE:** Después de agregar todas las variables:

1. **Sube arriba** en la página de Python App
2. **Haz clic en el botón azul** **"GUARDAR"** (está arriba a la derecha, junto a "CANCEL" y "DESTROY")
3. **Espera** a que guarde (puede mostrar un mensaje de confirmación)

---

## 💾 PASO 6: Inicializar Base de Datos

### Paso 6.1: Ejecutar init_db.py

1. **En Python App**, ve a la sección **"Execute python script"**
2. **En el campo** "Enter the path to the script file", escribe:
   ```
   init_db.py
   ```
3. **Haz clic en** **"Run Script"**
4. **Espera** a que termine (debería ser rápido, menos de 30 segundos)

### Paso 6.2: Verificar Resultado

Deberías ver un output como:

```
Creando tablas...
✓ Tablas creadas
✓ Usuario administrador creado
Email: admin@wms.local
Contraseña: admin123

Base de datos inicializada correctamente!
```

**✅ Si ves ese mensaje, la BD está inicializada correctamente.**

**⚠️ Si ves error:**
- Si dice `ModuleNotFoundError: No module named 'flask'`:
  → Las dependencias no están instaladas, vuelve al Paso 4
- Si dice otro error:
  → Anota el error exacto y revisa los logs (ver Paso 7.3)

---

## 🔄 PASO 7: Reiniciar y Probar la Aplicación

### Paso 7.1: Guardar y Reiniciar

1. **En Python App**, sube arriba
2. **Verifica** que el botón diga **"RESTART"** o **"START APP"**
3. **Haz clic en** **"RESTART"** (o **"START APP"** si está detenida)
4. **Espera** unos segundos a que reinicie

**O si prefieres:**
- Haz clic en **"GUARDAR"** primero
- Luego haz clic en **"RESTART"**

### Paso 7.2: Probar en el Navegador

1. **Abre tu navegador** (Chrome, Firefox, etc.)
2. **Ve a:**
   ```
   https://wms.adesa.com.do/
   ```
3. **Deberías ver:**
   - La página de la aplicación cargando
   - O la interfaz de inicio
   - O algún contenido (depende de qué tenga index.html)

**✅ Si la página carga (aunque sea básica), ¡la aplicación está funcionando!**

**⚠️ Si no carga:**
- Espera 1-2 minutos y vuelve a intentar (a veces tarda en iniciar)
- Si sigue sin cargar, revisa los logs (Paso 7.3)

### Paso 7.3: Revisar Logs (Si Hay Errores)

Si algo no funciona, revisa los logs:

1. **En File Manager**, ve a: `/home2/adesa/wms.adesa.com.do/`
2. **Abre el archivo** `stderr.log`
3. **Revisa las últimas líneas** (al final del archivo)
4. **Busca errores** (líneas que digan "Error", "Traceback", etc.)

**Errores comunes y soluciones:**

| Error | Solución |
|-------|----------|
| `ModuleNotFoundError: No module named 'flask'` | Vuelve al Paso 4, instala dependencias |
| `Could not open requirements file` | Verifica que requirements.txt esté en la ruta correcta |
| `Database locked` | La BD puede estar en uso, espera y reinicia |
| `ImportError` | Verifica que todos los archivos estén en la ruta correcta |

---

## ✅ Checklist Final

Antes de considerar que todo está funcionando:

- [ ] Dependencias instaladas (test_deps.py muestra todo OK)
- [ ] Variables de entorno agregadas (7 variables en la tabla)
- [ ] Variables guardadas (clic en "GUARDAR")
- [ ] init_db.py ejecutado sin errores
- [ ] Aplicación reiniciada (botón "RESTART" presionado)
- [ ] `https://wms.adesa.com.do/` carga en el navegador
- [ ] Logs sin errores críticos

---

## 🎯 Resumen del Proceso Completo

```
Paso 4: Ejecutar install_deps.py → Verificar con test_deps.py
   ↓
Paso 5: Agregar 7 variables de entorno → Clic en "GUARDAR"
   ↓
Paso 6: Ejecutar init_db.py → Verificar que creó las tablas
   ↓
Paso 7: Clic en "RESTART" → Probar https://wms.adesa.com.do/
   ↓
✅ ¡Aplicación funcionando!
```

---

## 🆘 Si Algo Falla

**Sigue este orden para diagnosticar:**

1. **Revisa test_deps.py**: ¿Están todas las dependencias instaladas?
2. **Revisa stderr.log**: ¿Qué error específico aparece?
3. **Verifica variables**: ¿Están las 7 variables agregadas y guardadas?
4. **Verifica archivos**: ¿Están todos los archivos en `/home2/adesa/wms.adesa.com.do/`?
5. **Reinicia de nuevo**: A veces un segundo reinicio ayuda

---

**¡Con estos pasos deberías tener todo funcionando!** 🎉


