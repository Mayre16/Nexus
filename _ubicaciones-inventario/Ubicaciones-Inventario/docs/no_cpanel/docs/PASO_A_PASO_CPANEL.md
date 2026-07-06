# Paso a Paso: Desplegar WMS en CPanel y Probar Conexión ADM

## 🎯 Objetivo
Subir la aplicación a CPanel y verla funcionando, probando la conexión con ADM Cloud.

---

## 📋 PASO 1: Preparar Archivos en tu PC

### 1.1 Verificar que tienes todos los archivos necesarios:

```
Ubicaciones-Inventario/
├── app_wms.py              ⭐ OBLIGATORIO
├── passenger_wsgi.py       ⭐ OBLIGATORIO (para CPanel)
├── config.py               ⭐ OBLIGATORIO
├── requirements.txt        ⭐ OBLIGATORIO
├── init_db.py              ⭐ Para inicializar BD
├── database/               ⭐ Carpeta completa
│   ├── __init__.py
│   └── models.py
├── api/                    ⭐ Carpeta completa
│   ├── __init__.py
│   └── adm_cloud.py
├── routes/                 ⭐ Carpeta completa
│   ├── __init__.py
│   ├── auth.py
│   ├── facturas.py
│   ├── despacho.py
│   ├── stock.py
│   └── dashboard.py
├── utils/                  ⭐ Carpeta completa
│   ├── __init__.py
│   ├── validaciones.py
│   └── helpers.py
└── templates/              ⭐ Carpeta completa
    └── index.html
```

**✅ Verifica que todos estos archivos y carpetas existan antes de subir.**

---

## 📤 PASO 2: Subir Archivos a CPanel

### 2.1 Acceder a File Manager

1. Entra a tu CPanel
2. Busca y abre **"File Manager"** o **"Administrador de Archivos"**
3. Navega a: **`public_html/wms.adesa.com.do`** (o donde quieras la app)

### 2.2 Subir Archivos

**Opción A: Subir por FTP/File Manager**
1. En File Manager, ve a la carpeta destino
2. Haz clic en **"Upload"** o **"Subir"**
3. Selecciona TODOS los archivos y carpetas del proyecto
4. Espera a que termine la subida

**Opción B: Comprimir y subir**
1. En tu PC, comprime todo el proyecto en un ZIP
2. Sube el ZIP a CPanel
3. Extrae el ZIP en File Manager (clic derecho → Extract)

### 2.3 Verificar estructura final en CPanel

Tu carpeta `/public_html/wms.adesa.com.do/` debe tener:

```
wms.adesa.com.do/
├── app_wms.py
├── passenger_wsgi.py       ⭐ DEBE estar en la raíz
├── config.py
├── requirements.txt
├── init_db.py
├── database/
├── api/
├── routes/
├── utils/
└── templates/
```

**✅ IMPORTANTE**: `passenger_wsgi.py` DEBE estar en la misma carpeta que `app_wms.py`

---

## 🐍 PASO 3: Configurar Python App en CPanel

### 3.1 Acceder a Python App

1. En CPanel, busca: **"Software"** → **"Setup Python App"** o **"Aplicaciones Python"**
2. Haz clic para abrir

### 3.2 Crear Nueva Aplicación Python

Haz clic en **"Create Application"** o **"Crear Aplicación"**

Llena los campos:

| Campo | Valor |
|-------|-------|
| **Python Version** | `3.9` o `3.10` o `3.11` (la más reciente disponible) |
| **Application Root** | `/public_html/wms.adesa.com.do` |
| **Application URL** | `/` (o déjalo vacío si quieres en la raíz del dominio) |
| **Application Startup File** | `passenger_wsgi.py` ⭐ |
| **Application Entry Point** | `application` ⭐ |

**⚠️ CRÍTICO:**
- **Application Startup File**: Debe ser exactamente `passenger_wsgi.py`
- **Application Entry Point**: Debe ser exactamente `application`

### 3.3 Crear la Aplicación

Haz clic en **"Create"** o **"Crear"**

Espera a que se cree la aplicación (puede tardar unos segundos).

---

## 📦 PASO 4: Instalar Dependencias

### 4.1 Instalar desde la Interfaz de Python App

En la página de tu Python App creada:

1. Busca la sección **"Modules"** o **"Módulos"**
2. Haz clic en **"Install Module"** o usa Terminal

### 4.2 Instalar desde Terminal (Recomendado)

1. En CPanel, busca: **"Terminal"** o **"SSH Access"**
2. Abre la terminal

Ejecuta estos comandos (uno por uno):

```bash
cd /home/tu_usuario/public_html/wms.adesa.com.do
```

```bash
pip install Flask Flask-SQLAlchemy requests bcrypt Werkzeug
```

O si prefieres desde el archivo requirements.txt:

```bash
pip install -r requirements.txt
```

**✅ Espera a que termine la instalación (puede tardar 1-2 minutos)**

---

## 🔧 PASO 5: Configurar Variables de Entorno

### 5.1 En la Interfaz de Python App

En la página de tu Python App, busca la sección **"Environment Variables"** o **"Variables de Entorno"**

Agrega estas variables (una por una):

| Variable | Valor |
|----------|-------|
| `FLASK_ENV` | `production` |
| `SECRET_KEY` | `clave-secreta-super-segura-cambiar-despues` (cambia esto) |
| `ADM_EMAIL` | `luis.useche@adesa.com.do` |
| `ADM_PASSWORD` | `Merida.123.` |
| `ADM_APPID` | `cccdf964-1e69-46e7-5ed0-08de4e33921f` |
| `ADM_COMPANY` | `7b5f5222-123e-4dc7-a783-2979ea9e6cff` |
| `ADM_ROLE` | `Administradores` |

**📝 Nota**: Puedes dejar `DATABASE_URL` vacío por ahora (usará SQLite para pruebas)

### 5.2 Guardar Cambios

Haz clic en **"Save"** o **"Guardar"** después de agregar cada variable.

---

## 💾 PASO 6: Inicializar Base de Datos

### 6.1 Ejecutar init_db.py desde Terminal

En Terminal de CPanel:

```bash
cd /home/tu_usuario/public_html/wms.adesa.com.do
python init_db.py
```

**✅ Deberías ver mensajes como:**
```
Creando tablas...
✓ Tablas creadas
✓ Usuario administrador creado
Email: admin@wms.local
Contraseña: admin123
```

Si hay errores, verifica:
- Que todas las dependencias estén instaladas
- Que tengas permisos de escritura en la carpeta

---

## 🔄 PASO 7: Reiniciar la Aplicación

### 7.1 Reiniciar desde la Interfaz

1. En la página de tu Python App
2. Busca el botón **"Restart"** o **"Reiniciar"**
3. Haz clic para reiniciar la aplicación

**⚠️ IMPORTANTE**: Después de cualquier cambio, SIEMPRE reinicia la aplicación.

---

## 🌐 PASO 8: Activar el Dominio (Si está apagado)

### 8.1 En la Imagen que compartiste

Veo que tu dominio `wms.adesa.com.do` está **"Apagado"**.

1. En CPanel, busca la sección de dominios o subdominios
2. Encuentra `wms.adesa.com.do`
3. **Activa el toggle** para encenderlo
4. O haz clic en **"Administrar"** para configurarlo

### 8.2 Verificar la URL

La aplicación debería estar disponible en:
- `https://wms.adesa.com.do/` 
- O la URL que configuraste en el Application URL

---

## ✅ PASO 9: Probar la Aplicación

### 9.1 Abrir en el Navegador

Abre tu navegador y ve a: `https://wms.adesa.com.do/`

**Deberías ver:**
- La interfaz de la aplicación (página principal)

### 9.2 Probar Conexión con ADM Cloud

1. En la página, busca la sección **"Verificar Conexión"** (si existe en index.html)
2. O accede directamente a: `https://wms.adesa.com.do/api/auth/me` (debe pedir login)

### 9.3 Probar desde Terminal (curl)

En Terminal de CPanel:

```bash
curl https://wms.adesa.com.do/
```

Deberías ver el HTML de la página.

---

## 🐛 PASO 10: Verificar Logs si Hay Errores

### 10.1 Ver Logs de Error

En la interfaz de Python App:
1. Busca la sección **"Logs"** o **"Registros"**
2. Haz clic en **"Error Log"** o **"Registro de Errores"**
3. Revisa si hay errores

### 10.2 Errores Comunes

**Error: "No module named 'flask'"**
```bash
# Solución: Instalar dependencias
pip install Flask Flask-SQLAlchemy requests bcrypt Werkzeug
```

**Error: "Application failed to start"**
- Verifica que `passenger_wsgi.py` esté en la raíz
- Verifica que Entry Point sea `application`

**Error: "Database locked" o errores de BD**
- Verifica permisos de escritura en la carpeta
- Ejecuta `python init_db.py` de nuevo

**Error: "401 Unauthorized" al conectar con ADM**
- Verifica variables de entorno `ADM_EMAIL`, `ADM_PASSWORD`, etc.
- Verifica que no haya espacios extra en los valores

---

## 📝 Checklist Final

Antes de considerar que está funcionando:

- [ ] Todos los archivos subidos a CPanel
- [ ] `passenger_wsgi.py` en la raíz del proyecto
- [ ] Python App creada con `passenger_wsgi.py` como Startup File
- [ ] Entry Point configurado como `application`
- [ ] Dependencias instaladas (`pip install ...`)
- [ ] Variables de entorno configuradas (ADM_EMAIL, ADM_PASSWORD, etc.)
- [ ] `init_db.py` ejecutado sin errores
- [ ] Aplicación reiniciada
- [ ] Dominio activado (toggle ON)
- [ ] Página carga en el navegador
- [ ] Logs sin errores críticos

---

## 🎯 Próximos Pasos Después de que Funcione

Una vez que veas la aplicación corriendo:

1. **Probar conexión ADM**: Usar la sección "Verificar Conexión"
2. **Iniciar sesión**: Usar `admin@wms.local` / `admin123`
3. **Probar búsqueda de facturas**: Desde la interfaz
4. **Crear interfaces HTML**: Para las funcionalidades faltantes

---

## 💡 Notas Importantes

1. **Reinicia siempre después de cambios**: Python App → Restart
2. **Verifica logs si algo falla**: Los logs te dicen qué está mal
3. **Variables de entorno**: Son sensibles a espacios, verifica que no haya espacios extra
4. **Permisos**: La carpeta debe tener permisos de lectura/escritura

---

## 🆘 Si Necesitas Ayuda

Si encuentras algún error específico:
1. Copia el mensaje exacto del error
2. Revisa los logs en Python App
3. Verifica que todos los pasos anteriores se completaron
4. Compara tu estructura de archivos con la lista del Paso 1

**¡La aplicación debería estar funcionando después de estos pasos!** 🎉

