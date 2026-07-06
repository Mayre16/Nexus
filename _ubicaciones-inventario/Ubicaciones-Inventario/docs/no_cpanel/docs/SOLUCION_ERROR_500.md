# 🔴 Solución: Error 500 Internal Server Error

## 🎉 Buenas Noticias

El error **500** es mejor que 404/403 porque significa:
- ✅ La aplicación está corriendo
- ✅ Python App está funcionando
- ✅ El dominio está bien configurado
- ⚠️ Pero hay un error en el código o configuración

---

## 🔍 PASO 1: Revisar Logs de Error (CRÍTICO)

Los logs te dirán exactamente qué está fallando.

### Opción A: Revisar stderr.log

1. **En File Manager**, ve a: `/home2/adesa/wms.adesa.com.do/`
2. **Abre el archivo** `stderr.log`
3. **Revisa las ÚLTIMAS líneas** (al final del archivo)
4. **Busca errores** como:
   - `ImportError`
   - `ModuleNotFoundError`
   - `AttributeError`
   - `SyntaxError`
   - `FileNotFoundError`
   - Líneas que digan `Traceback` o `Error`

**📋 Copia las últimas 20-30 líneas del log** para ver el error exacto.

### Opción B: Ver Logs en Python App

Algunos CPanel tienen sección de logs:
1. En Python App, busca sección **"Logs"** o **"Error Log"**
2. Revisa los errores ahí

---

## 🔧 ERRORES COMUNES Y SOLUCIONES

### Error 1: ModuleNotFoundError (Dependencias Faltantes)

**Síntoma en stderr.log:**
```
ModuleNotFoundError: No module named 'flask'
```

**Solución:**
1. Ejecuta `install_deps.py` de nuevo
2. Verifica con `test_deps.py`
3. Reinicia la app

---

### Error 2: ImportError (Archivos Faltantes)

**Síntoma en stderr.log:**
```
ImportError: cannot import name 'app' from 'app_wms'
```

**Solución:**
1. Verifica que `app_wms.py` esté en `/home2/adesa/wms.adesa.com.do/`
2. Verifica que tenga el contenido correcto
3. Verifica permisos (debe ser 644 o 755)

---

### Error 3: Database Error

**Síntoma en stderr.log:**
```
OperationalError: unable to open database file
```

**Solución:**
1. Verifica permisos de la carpeta `database/` (debe ser 755)
2. Verifica que `database/wms.db` exista (o se cree automáticamente)
3. Si no existe, ejecuta `init_db.py` de nuevo

---

### Error 4: Configuración Incorrecta

**Síntoma en stderr.log:**
```
KeyError: 'ADM_EMAIL'
```

**Solución:**
1. Verifica que todas las variables de entorno estén agregadas
2. Verifica que estén guardadas (clic en "GUARDAR")
3. Reinicia la app después de agregar variables

---

### Error 5: Permisos Incorrectos

**Síntoma en stderr.log:**
```
PermissionError: [Errno 13] Permission denied
```

**Solución:**
1. Verifica permisos de todos los archivos (deben ser 644)
2. Verifica permisos de todas las carpetas (deben ser 755)
3. Cambia permisos si es necesario

---

## 📋 PASO 2: Verificar Estado de la Aplicación

### Verificar que Todo Esté Correcto

1. **Archivos en lugar correcto:**
   - `/home2/adesa/wms.adesa.com.do/`
   - Verifica que `app_wms.py` y `passenger_wsgi.py` estén ahí

2. **Dependencias instaladas:**
   - Ejecuta `test_deps.py` para verificar

3. **Variables de entorno:**
   - Verifica que las 7 variables estén agregadas y guardadas

4. **Base de datos:**
   - Verifica que `database/wms.db` exista o ejecuta `init_db.py`

---

## 🎯 PROCESO DE DIAGNÓSTICO

**Sigue este orden:**

1. **Revisa stderr.log** → Identifica el error exacto
2. **Según el error**, aplica la solución correspondiente arriba
3. **Reinicia la app** después de cada cambio
4. **Prueba de nuevo** en el navegador

---

## ⚡ SOLUCIÓN RÁPIDA (Si no puedes ver los logs)

### Paso 1: Verificar Dependencias

1. Ejecuta `test_deps.py`
2. Si falta algo, ejecuta `install_deps.py`

### Paso 2: Reinicializar Base de Datos

1. Ejecuta `init_db.py` de nuevo
2. Verifica que no haya errores

### Paso 3: Verificar Variables de Entorno

1. Verifica que las 7 variables estén agregadas
2. Haz clic en "GUARDAR"
3. Reinicia la app

### Paso 4: Reiniciar

1. Haz clic en "RESTART"
2. Espera 30 segundos
3. Prueba de nuevo

---

## 📝 Información Necesaria

**Para ayudarte mejor, necesito:**

1. **¿Qué error aparece en `stderr.log`?** (copia las últimas 20-30 líneas)
2. **¿Las dependencias están instaladas?** (ejecuta `test_deps.py`)
3. **¿Qué resultado da `test_deps.py`?**
4. **¿Todas las variables de entorno están agregadas y guardadas?**

---

**¡Revisa el `stderr.log` primero para ver el error exacto!** 🔍


