# 🚀 Guía Completa: Despliegue WMS en CPanel desde Cero

## 📋 Estado Actual vs Estado Objetivo

### ❌ Problema Actual:
- Proyecto duplicado en dos lugares (confusión)
- Dependencias no instaladas
- Rutas inconsistentes entre Python App y subdominio

### ✅ Objetivo Final:
- **Proyecto limpio en:** `/home2/adesa/wms.adesa.com.do/`
- **Sin código en public_html** (solo lo necesario para el subdominio)
- **Python App apuntando correctamente**
- **Dependencias instaladas**
- **Base de datos inicializada**

---

## 🗂️ PARTE 1: Limpiar y Preparar Estructura

### Paso 1.1: Eliminar Python App Existente (Si Existe)

1. En CPanel → **Software** → **Setup Python App**
2. Busca la aplicación `wms.adesa.com.do`
3. Haz clic en **"DESTROY"** para eliminarla completamente
4. Confirma la eliminación

### Paso 1.2: Limpiar Carpetas

En File Manager:

1. **Revisar `/home2/adesa/public_html/wms.adesa.com.do/`:**
   - Si tiene archivos del proyecto (app_wms.py, etc.), **moverlos o respaldarlos**
   - Esta carpeta solo debe tener archivos estáticos si es necesario

2. **Revisar `/home2/adesa/wms.adesa.com.do/`:**
   - Si existe y tiene contenido antiguo, **elimínalo todo**
   - O mejor: elimina la carpeta completamente (se creará de nuevo)

### Paso 1.3: Preparar Archivos del Proyecto

En tu PC local, asegúrate de tener todos estos archivos listos:

```
📦 PROYECTO WMS (para subir)
├── app_wms.py              ⭐
├── passenger_wsgi.py       ⭐
├── config.py               ⭐
├── init_db.py              ⭐
├── requirements.txt        ⭐
├── install_deps.py         ⭐ (script auxiliar)
├── test_deps.py            ⭐ (script auxiliar)
│
├── database/
│   ├── __init__.py
│   └── models.py
│
├── api/
│   ├── __init__.py
│   └── adm_cloud.py
│
├── routes/
│   ├── __init__.py
│   ├── auth.py
│   ├── facturas.py
│   ├── despacho.py
│   ├── stock.py
│   └── dashboard.py
│
├── utils/
│   ├── __init__.py
│   ├── validaciones.py
│   └── helpers.py
│
└── templates/
    └── index.html
```

---

## 🐍 PARTE 2: Crear Python App Correctamente

### Paso 2.1: Crear Nueva Python App

1. CPanel → **Software** → **Setup Python App**
2. Haz clic en **"Create Application"**
3. Configura así:

| Campo | Valor |
|-------|-------|
| **Python Version** | `3.11.13` (o la más reciente disponible) |
| **Application Root** | `wms.adesa.com.do` ⭐ **NO incluyas "public_html"** |
| **Application URL** | `wms.adesa.com.do` (o déjalo vacío para raíz del dominio) |
| **Application Startup File** | `passenger_wsgi.py` |
| **Application Entry Point** | `application` |

4. Haz clic en **"Create"**

**✅ Resultado esperado:**
- CPanel creará automáticamente: `/home2/adesa/wms.adesa.com.do/`
- Esta carpeta tendrá subcarpetas: `public/`, `tmp/`, etc.

### Paso 2.2: Verificar Ruta Creada

En File Manager:
1. Navega a `/home2/adesa/`
2. Verifica que existe la carpeta `wms.adesa.com.do/`
3. Entra y verifica que tiene: `public/`, `tmp/`, `passenger_wsgi.py` (creado por CPanel)

---

## 📤 PARTE 3: Subir Archivos del Proyecto

### Paso 3.1: Subir Archivos a la Ruta Correcta

**IMPORTANTE:** Sube los archivos a `/home2/adesa/wms.adesa.com.do/` (NO a public_html)

En File Manager:

1. Navega a `/home2/adesa/wms.adesa.com.do/`
2. Sube TODOS los archivos del proyecto:
   - `app_wms.py`
   - `passenger_wsgi.py` ⚠️ **Reemplaza el que creó CPanel con el tuyo**
   - `config.py`
   - `init_db.py`
   - `requirements.txt`
   - `install_deps.py`
   - `test_deps.py`
   - Todas las carpetas: `database/`, `api/`, `routes/`, `utils/`, `templates/`

### Paso 3.2: Verificar Estructura Final

En `/home2/adesa/wms.adesa.com.do/` deberías tener:

```
wms.adesa.com.do/
├── public/              (creado por CPanel - NO TOCAR)
├── tmp/                 (creado por CPanel - NO TOCAR)
├── __pycache__/         (se crea automático)
│
├── app_wms.py           ✅ TUYO
├── passenger_wsgi.py    ✅ TUYO (reemplaza el de CPanel)
├── config.py            ✅ TUYO
├── init_db.py           ✅ TUYO
├── requirements.txt     ✅ TUYO
├── install_deps.py      ✅ TUYO
├── test_deps.py         ✅ TUYO
│
├── database/            ✅ TUYO
├── api/                 ✅ TUYO
├── routes/              ✅ TUYO
├── utils/               ✅ TUYO
└── templates/           ✅ TUYO
```

### Paso 3.3: Verificar passenger_wsgi.py

Abre `passenger_wsgi.py` en File Manager y verifica que tenga:

```python
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app_wms import app as application

if __name__ == "__main__":
    application.run()
```

Si el archivo es diferente, reemplázalo con el contenido correcto.

---

## 📦 PARTE 4: Instalar Dependencias (SIN Terminal)

### Opción A: Usar install_deps.py (RECOMENDADO)

#### Paso 4.1: Verificar requirements.txt

En File Manager, abre `requirements.txt` y verifica que tenga:

```
Flask>=3.0.0
Flask-SQLAlchemy>=3.1.0
requests>=2.31.0
bcrypt>=4.0.0
Werkzeug>=3.0.0
```

#### Paso 4.2: Ejecutar install_deps.py

1. En Python App (CPanel), ve a la sección **"Execute python script"**
2. En el campo **"Enter the path to the script file"**, escribe:
   ```
   install_deps.py
   ```
3. Haz clic en **"Run Script"**
4. **Espera 1-2 minutos** mientras instala
5. Verifica el output:
   - Debe mostrar: `✓ Flask instalado correctamente`
   - Y similar para cada módulo
   - Al final: `¡TODAS LAS DEPENDENCIAS INSTALADAS EXITOSAMENTE!`

#### Paso 4.3: Verificar Instalación

1. En Python App, sección **"Execute python script"**
2. En el campo, escribe:
   ```
   test_deps.py
   ```
3. Haz clic en **"Run Script"**
4. Debe mostrar:
   ```
   ✓ Flask: INSTALADO
   ✓ Flask-SQLAlchemy: INSTALADO
   ✓ requests: INSTALADO
   ✓ bcrypt: INSTALADO
   ✓ Werkzeug: INSTALADO
   ```

**Si algún módulo falta**, ejecuta `install_deps.py` de nuevo.

### Opción B: Usar Run Pip Install (Alternativa)

Si prefieres usar la interfaz de CPanel:

1. En Python App, sección **"Configuration files"**
2. Verifica que `requirements.txt` esté listado
3. Si no está:
   - Haz clic en el campo "Add another file"
   - Escribe: `requirements.txt`
   - Presiona Enter
4. Haz clic en **"Run Pip Install"**
5. Espera a que termine (puede tardar)

**⚠️ Si da error**, usa la Opción A (install_deps.py).

---

## 🔧 PARTE 5: Configurar Variables de Entorno

### Paso 5.1: Agregar Variables

En Python App, sección **"Environment variables"**:

Haz clic en **"+ ADD VARIABLE"** y agrega estas una por una:

| Name | Value |
|------|-------|
| `FLASK_ENV` | `production` |
| `SECRET_KEY` | `WMS@ADESA-2026!Kz9#qT4$Lm7^pR2*Xn8?Va6+Hd3=Yc1!uS5%jB0` |
| `ADM_EMAIL` | `luis.useche@adesa.com.do` |
| `ADM_PASSWORD` | `Merida.123.` |
| `ADM_APPID` | `cccdf964-1e69-46e7-5ed0-08de4e33921f` |
| `ADM_COMPANY` | `7b5f5222-123e-4dc7-a783-2979ea9e6cff` |
| `ADM_ROLE` | `Administradores` |

**⚠️ IMPORTANTE:** No agregues `DATABASE_URL` todavía (usaremos SQLite primero).

### Paso 5.2: Guardar

Haz clic en **"GUARDAR"** (botón azul arriba a la derecha).

---

## 💾 PARTE 6: Inicializar Base de Datos

### Paso 6.1: Ejecutar init_db.py

1. En Python App, sección **"Execute python script"**
2. En el campo, escribe:
   ```
   init_db.py
   ```
3. Haz clic en **"Run Script"**
4. **Debería funcionar sin errores** (si las dependencias están instaladas)

### Paso 6.2: Verificar Resultado

Deberías ver mensajes como:

```
Creando tablas...
✓ Tablas creadas
✓ Usuario administrador creado
Email: admin@wms.local
Contraseña: admin123
```

Si hay errores, verifica:
- Que las dependencias estén instaladas (ejecuta `test_deps.py`)
- Que los archivos estén en la ruta correcta
- Revisa los logs (ver Parte 8)

---

## 🔄 PARTE 7: Reiniciar y Probar

### Paso 7.1: Reiniciar Aplicación

1. En Python App, haz clic en **"GUARDAR"** (si no lo hiciste antes)
2. Busca el botón **"RESTART APP"** o **"START APP"**
3. Haz clic para reiniciar/iniciar

### Paso 7.2: Probar la Aplicación

1. Abre tu navegador
2. Ve a: `https://wms.adesa.com.do/`
3. **Debería cargar la aplicación** (puede mostrar la interfaz básica)

Si no carga:
- Revisa los logs (Parte 8)
- Verifica que el dominio esté activo en CPanel → Domains

---

## 📊 PARTE 8: Revisar Logs y Debugging

### Paso 8.1: Ubicación de Logs

Los logs están en:

1. **Error Log de la App:**
   - En Python App, busca sección **"Logs"**
   - O revisa: `/home2/adesa/wms.adesa.com.do/stderr.log`

2. **Error Log de CPanel:**
   - CPanel → **Metrics** → **Errors**
   - O busca en File Manager: `logs/` en la raíz

### Paso 8.2: Cómo Revisar stderr.log

En File Manager:

1. Ve a `/home2/adesa/wms.adesa.com.do/`
2. Abre `stderr.log`
3. Revisa los errores más recientes (al final del archivo)

**Errores comunes:**

```
ModuleNotFoundError: No module named 'flask'
```
→ **Solución:** Instala dependencias (Parte 4)

```
Error: Could not open requirements file
```
→ **Solución:** Verifica que requirements.txt esté en `/home2/adesa/wms.adesa.com.do/`

```
Database locked
```
→ **Solución:** Verifica permisos de la carpeta database/

---

## ✅ Checklist Final

Antes de considerar que todo está funcionando:

- [ ] Python App creada con Application Root: `wms.adesa.com.do` (sin public_html)
- [ ] Archivos subidos a `/home2/adesa/wms.adesa.com.do/`
- [ ] `passenger_wsgi.py` es el correcto (no el de CPanel)
- [ ] Dependencias instaladas (verificado con `test_deps.py`)
- [ ] Variables de entorno configuradas
- [ ] `init_db.py` ejecutado exitosamente
- [ ] Aplicación reiniciada
- [ ] `https://wms.adesa.com.do/` carga correctamente
- [ ] Logs sin errores críticos

---

## 🎯 Estructura Final Correcta

```
/home2/adesa/
│
├── public_html/
│   └── wms.adesa.com.do/        (vacío o solo archivos estáticos si necesario)
│
└── wms.adesa.com.do/             ⭐ PROYECTO COMPLETO AQUÍ
    ├── public/                   (CPanel - NO TOCAR)
    ├── tmp/                      (CPanel - NO TOCAR)
    ├── app_wms.py                ✅
    ├── passenger_wsgi.py         ✅
    ├── config.py                 ✅
    ├── init_db.py                ✅
    ├── requirements.txt          ✅
    ├── database/                 ✅
    ├── api/                      ✅
    ├── routes/                   ✅
    ├── utils/                    ✅
    └── templates/                ✅
```

---

## 🆘 Solución de Problemas Rápida

| Problema | Solución |
|----------|----------|
| ModuleNotFoundError | Ejecuta `install_deps.py` |
| Could not open requirements | Verifica que esté en `/home2/adesa/wms.adesa.com.do/` |
| App no carga | Verifica Application Root y reinicia |
| Database locked | Verifica permisos (chmod 755 en database/) |
| Variables no se guardan | Haz clic en "GUARDAR" después de agregar |

---

## 📝 Notas Importantes

1. **NO mezcles rutas:** El proyecto va en `/home2/adesa/wms.adesa.com.do/`, NO en public_html
2. **NO edites carpetas de CPanel:** No toques `public/` o `tmp/` que creó CPanel
3. **Reinicia siempre:** Después de cambios, reinicia la aplicación
4. **Revisa logs:** Si algo falla, los logs te dirán qué pasa

---

**¡Con esta guía deberías tener todo funcionando correctamente!** 🎉


