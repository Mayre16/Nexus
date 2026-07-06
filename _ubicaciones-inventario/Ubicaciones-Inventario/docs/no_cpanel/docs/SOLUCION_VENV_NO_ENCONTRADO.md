# 🔴 Solución: "Unable to find app venv folder"

## 🚨 Problema

Error:
```
No such application or it's broken. Unable to find app venv folder by this path: 
'/home2/adesa/virtualenv/wms.adesa.com.do'
```

**Causa:** El virtualenv no existe o está corrupto. CPanel debería crearlo automáticamente, pero algo falló.

---

## ✅ SOLUCIÓN: Recrear la Aplicación (Más Rápido y Seguro)

La forma más confiable es destruir y recrear la app. CPanel creará el venv automáticamente.

### Paso 1: Destruir la Aplicación Actual

1. **En Python App**, en la parte superior derecha
2. Haz clic en el botón rojo **"DESTROY"**
3. **Confirma** la eliminación (te pedirá confirmación)
4. Esto eliminará la app pero **NO eliminará tus archivos**

### Paso 2: Crear Nueva Aplicación

1. En la lista de aplicaciones, haz clic en **"CREATE APPLICATION"**
2. Configura así:

| Campo | Valor |
|-------|-------|
| **Python Version** | `3.11.13` (o la que prefieras) |
| **Application Root** | `wms.adesa.com.do` ⭐ |
| **Application URL** | `wms.adesa.com.do` |
| **Application Startup File** | `passenger_wsgi.py` |
| **Application Entry Point** | `application` |

3. Haz clic en **"Create"**

**✅ CPanel creará automáticamente el virtualenv en la ruta correcta.**

### Paso 3: Instalar Dependencias de Nuevo

Como es un venv nuevo, necesitas reinstalar las dependencias:

1. En Python App, sección **"Execute python script"**
2. Ejecuta: `install_deps.py`
3. Espera a que termine
4. Verifica con: `test_deps.py`

### Paso 4: Agregar Variables de Entorno de Nuevo

Las variables de entorno se pierden al destruir la app, así que agrégalas de nuevo:

1. Sección **"Environment variables"**
2. Agrega las 7 variables:
   - `FLASK_ENV` = `production`
   - `SECRET_KEY` = `WMS@ADESA-2026!Kz9#qT4$Lm7^pR2*Xn8?Va6+Hd3=Yc1!uS5%jB0`
   - `ADM_EMAIL` = `luis.useche@adesa.com.do`
   - `ADM_PASSWORD` = `Merida.123.`
   - `ADM_APPID` = `cccdf964-1e69-46e7-5ed0-08de4e33921f`
   - `ADM_COMPANY` = `7b5f5222-123e-4dc7-a783-2979ea9e6cff`
   - `ADM_ROLE` = `Administradores`
3. Haz clic en **"GUARDAR"**

### Paso 5: Inicializar Base de Datos (Si es Necesario)

Si la BD ya está inicializada, puedes saltar esto. Si no:

1. Ejecuta: `init_db.py`
2. Verifica que funcione

### Paso 6: Reiniciar y Probar

1. Haz clic en **"RESTART"** (o **"START APP"** si está detenida)
2. Espera 30 segundos
3. Haz clic en **"OPEN"** o abre: `https://wms.adesa.com.do/`

---

## ⚠️ ALTERNATIVA: Verificar Virtualenv Manualmente

Si no quieres destruir la app, puedes verificar:

### Verificar si Existe el Virtualenv

En File Manager:
1. Ve a: `/home2/adesa/virtualenv/`
2. Busca la carpeta `wms.adesa.com.do`
3. Si NO existe, necesitas recrear la app (usar solución anterior)
4. Si SÍ existe, puede tener permisos incorrectos

### Si el Virtualenv Existe pero da Error

Puede ser un problema de permisos:
1. Verifica permisos de `/home2/adesa/virtualenv/wms.adesa.com.do/`
2. Debe ser `755`
3. Si no, cambia los permisos

---

## 🎯 RECOMENDACIÓN

**Recrear la aplicación es la solución más confiable** porque:
- ✅ CPanel creará el venv correctamente
- ✅ La configuración estará limpia
- ✅ Evita problemas de rutas y permisos
- ⏱️ Solo toma 5 minutos

**Tus archivos NO se eliminarán** al destruir la app, solo se elimina la configuración de CPanel.

---

## ✅ Checklist Post-Recreación

- [ ] App recreada sin errores
- [ ] Virtualenv creado automáticamente (sin error de venv)
- [ ] Dependencias instaladas (`test_deps.py` muestra todo OK)
- [ ] Variables de entorno agregadas (7 variables)
- [ ] App reiniciada
- [ ] "OPEN" funciona sin errores
- [ ] `https://wms.adesa.com.do/` carga correctamente

---

**¡La recreación es rápida y resuelve el problema del venv!** ✅


