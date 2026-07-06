# 🔴 Solución: Error 403 Forbidden

## 🚨 Problema

- Error **403 Forbidden** al hacer clic en "OPEN"
- Los archivos aparecen en `public_html/wms.adesa.com.do/` (no sabemos quién los movió)
- `stderr.log` está vacío (0 bytes)

---

## 🔍 DIAGNÓSTICO

### Problema Principal: Archivos en Lugar Incorrecto

**Los archivos están en:**
- ❌ `/home2/adesa/public_html/wms.adesa.com.do/`

**Pero Python App está configurado para:**
- ✅ `/home2/adesa/wms.adesa.com.do/`

**Por eso el 403:** Python App busca los archivos en una ruta, pero están en otra.

---

## ✅ SOLUCIÓN: Alinear Configuración con Ubicación Real

Tenemos dos opciones:

### OPCIÓN A: Cambiar Python App para que apunte a public_html (RECOMENDADO)

Si los archivos ya están en `public_html/wms.adesa.com.do/`, cambiemos la configuración de Python App.

#### Paso 1: Verificar Dónde Están los Archivos

En File Manager:
- Ve a `/home2/adesa/public_html/wms.adesa.com.do/`
- Verifica que veas: `app_wms.py`, `passenger_wsgi.py`, `config.py`, y todas las carpetas

#### Paso 2: Cambiar Application Root en Python App

1. **En Python App** (CPanel → Setup Python App → WMS.ADESA.COM.DO/)
2. Busca el campo **"Application root"**
3. **Cámbialo de:** `wms.adesa.com.do`
   **A:** `public_html/wms.adesa.com.do`
4. Haz clic en **"GUARDAR"** (arriba a la derecha)
5. Haz clic en **"RESTART"**

#### Paso 3: Verificar

1. Espera 30 segundos
2. Haz clic en **"OPEN"** de nuevo
3. Debería funcionar ahora

---

### OPCIÓN B: Mover Archivos de Vuelta (Alternativa)

Si prefieres mantener los archivos fuera de public_html:

#### Paso 1: Mover Archivos

En File Manager:

1. Ve a `/home2/adesa/public_html/wms.adesa.com.do/`
2. Selecciona **TODOS** los archivos y carpetas:
   - `app_wms.py`
   - `passenger_wsgi.py`
   - `config.py`
   - `init_db.py`
   - `requirements.txt`
   - `install_deps.py`
   - `test_deps.py`
   - Carpetas: `api/`, `database/`, `routes/`, `templates/`, `utils/`
3. Haz clic en **"Mover"**
4. Destino: `/home2/adesa/wms.adesa.com.do`
5. Confirma

#### Paso 2: Verificar Application Root

En Python App:
- **Application root** debe ser: `wms.adesa.com.do` (sin public_html)
- Si no, cámbialo y guarda

#### Paso 3: Reiniciar

1. Haz clic en **"GUARDAR"**
2. Haz clic en **"RESTART"**

---

## 🔍 VERIFICACIONES ADICIONALES

### Verificar .htaccess (Puede Causar 403)

1. En File Manager, ve a `/home2/adesa/public_html/wms.adesa.com.do/`
2. Busca archivo `.htaccess`
3. Si existe, **elimínalo temporalmente** o renómbralo a `.htaccess.bak`
4. Reinicia la app
5. Prueba de nuevo

**⚠️ Nota:** Un `.htaccess` puede estar bloqueando el acceso a Passenger.

---

### Verificar Permisos

Los archivos deben tener estos permisos:

- **Archivos .py:** `644` o `755`
- **Carpetas:** `755`
- **passenger_wsgi.py:** `644` o `755`

**Para verificar/cambiar permisos:**

1. En File Manager, haz clic derecho en un archivo
2. Selecciona **"Permisos"**
3. Verifica que sea `644` para archivos, `755` para carpetas

---

## 🎯 RECOMENDACIÓN INMEDIATA

**Haz esto AHORA:**

### Paso 1: Verificar Dónde Están los Archivos Realmente

En File Manager, verifica:

**¿Dónde están los archivos?**
- [ ] `/home2/adesa/public_html/wms.adesa.com.do/` → Usa Opción A
- [ ] `/home2/adesa/wms.adesa.com.do/` → Usa Opción B

### Paso 2: Seguir la Opción Correspondiente

**Si están en `public_html/` (Opción A):**
1. Cambia Application root a: `public_html/wms.adesa.com.do`
2. Guarda y reinicia

**Si están fuera de `public_html/` (Opción B):**
1. Verifica que Application root sea: `wms.adesa.com.do`
2. Si hay `.htaccess`, elimínalo o renómbralo
3. Guarda y reinicia

---

## 📋 Checklist Post-Solución

- [ ] Application root coincide con dónde están los archivos
- [ ] Archivos tienen permisos correctos (644/755)
- [ ] No hay `.htaccess` bloqueando (o está correctamente configurado)
- [ ] Python App reiniciada
- [ ] "OPEN" funciona sin 403

---

## 🔍 Si Sigue el 403

1. **Revisa stderr.log de nuevo** (puede tener errores nuevos después del cambio)
2. **Verifica permisos** de la carpeta completa (debe ser 755)
3. **Verifica que passenger_wsgi.py** esté en la ruta correcta
4. **Contacta soporte** si nada funciona

---

**¡Empieza verificando dónde están los archivos y sigue la opción correspondiente!** 🔧


