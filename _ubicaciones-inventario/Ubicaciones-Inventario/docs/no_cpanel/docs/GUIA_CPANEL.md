# Guía de Despliegue en CPanel

## ✅ Confirmación: La aplicación ESTÁ DISEÑADA para CPanel

Esta aplicación fue diseñada **primero para CPanel** y funciona perfectamente en ese entorno.

---

## 🎯 Estructura Lista para CPanel

### **Archivos Clave Incluidos:**

1. ✅ **`passenger_wsgi.py`** - Archivo requerido por CPanel para ejecutar Flask
2. ✅ **`config.py`** - Configuración que detecta automáticamente producción (CPanel)
3. ✅ **Estructura modular** - Compatible con las restricciones de CPanel
4. ✅ **Variables de entorno** - Soporte para configuración segura en CPanel

---

## 📋 Pasos para Desplegar en CPanel

### **Paso 1: Subir Archivos**

Sube todos los archivos del proyecto a tu directorio en CPanel (típicamente `public_html/` o un subdirectorio):

```
public_html/wms/          (o el nombre que prefieras)
├── app_wms.py
├── passenger_wsgi.py     ⭐ IMPORTANTE: Este archivo es requerido
├── config.py
├── requirements.txt
├── init_db.py
├── database/
├── api/
├── routes/
├── utils/
└── templates/
```

### **Paso 2: Configurar Python App en CPanel**

1. Entra a **cPanel → Software → Setup Python App**
2. Crea una nueva aplicación Python:
   - **Python Version**: 3.8 o superior (3.9, 3.10, 3.11)
   - **App Directory**: `/public_html/wms` (o donde subiste los archivos)
   - **App URL**: `/wms` (o la URL que prefieras)
   - **App Startup File**: `passenger_wsgi.py` ⭐
   - **App Entry Point**: `application`

3. **Instalar dependencias**:
   - En la interfaz de Python App, ve a "Modules"
   - O ejecuta desde terminal de CPanel:
     ```bash
     pip install -r requirements.txt
     ```

### **Paso 3: Configurar Variables de Entorno**

En la interfaz de Python App en CPanel, agrega estas variables:

```
FLASK_ENV=production
SECRET_KEY=tu_secret_key_super_segura_aqui
DATABASE_URL=mysql://usuario:password@localhost/nombre_base_datos
ADM_EMAIL=luis.useche@adesa.com.do
ADM_PASSWORD=Merida.123.
ADM_APPID=cccdf964-1e69-46e7-5ed0-08de4e33921f
ADM_COMPANY=7b5f5222-123e-4dc7-a783-2979ea9e6cff
ADM_ROLE=Administradores
```

### **Paso 4: Configurar Base de Datos**

1. Crea una base de datos MySQL en CPanel:
   - **cPanel → Databases → MySQL Databases**
   - Crea base de datos: `wms_db` (o el nombre que prefieras)
   - Crea usuario y asígnalo a la base de datos
   - Anota las credenciales

2. Actualiza `DATABASE_URL` en variables de entorno:
   ```
   DATABASE_URL=mysql://usuario:password@localhost/wms_db
   ```

3. Inicializa la base de datos (desde terminal de CPanel o SSH):
   ```bash
   cd /home/usuario/public_html/wms
   python init_db.py
   ```

### **Paso 5: Reiniciar la Aplicación**

En la interfaz de Python App, haz clic en **"Restart"** para aplicar los cambios.

---

## 🔧 Configuración del Archivo `passenger_wsgi.py`

El archivo ya está configurado, pero si necesitas ajustar variables de entorno directamente, puedes editarlo:

```python
import os

# Configurar variables de entorno (opcional, mejor usar la interfaz de CPanel)
os.environ['FLASK_ENV'] = 'production'
os.environ['SECRET_KEY'] = 'tu_secret_key'
# ... etc
```

---

## ✅ Ventajas de Esta Configuración

1. **Detecta automáticamente el entorno**:
   - Si `FLASK_ENV=production` → usa `ProductionConfig`
   - Configuración segura (HTTPS, cookies seguras, etc.)

2. **Variables de entorno seguras**:
   - Credenciales no están en el código
   - Fácil cambiar sin modificar archivos

3. **Estructura modular**:
   - Fácil mantener y actualizar
   - Compatible con las limitaciones de CPanel

---

## 🧪 Desarrollo en PC Local

**Puedes desarrollar localmente** para probar y luego subir a CPanel:

### En PC Local:
```bash
# Instalar dependencias
pip install -r requirements.txt

# Inicializar BD (SQLite local)
python init_db.py

# Ejecutar (modo desarrollo)
python app_wms.py
```

### Luego en CPanel:
1. Sube los archivos actualizados
2. Configura variables de entorno
3. Usa MySQL en lugar de SQLite
4. Reinicia la app

**Los mismos archivos funcionan en ambos entornos** gracias a `config.py` que detecta el entorno automáticamente.

---

## 🔒 Seguridad en Producción (CPanel)

### **IMPORTANTE:**

1. ✅ **Cambiar SECRET_KEY**: No uses el valor por defecto en producción
2. ✅ **HTTPS**: Asegúrate de tener SSL configurado
3. ✅ **Variables de entorno**: Nunca subas credenciales en código
4. ✅ **Permisos de archivos**: Base de datos SQLite debe tener permisos correctos (si se usa)

---

## 📝 Checklist Pre-Despliegue

- [ ] Todos los archivos subidos a CPanel
- [ ] `passenger_wsgi.py` está en la raíz del proyecto
- [ ] Python App creada en CPanel apuntando a `passenger_wsgi.py`
- [ ] Dependencias instaladas (`pip install -r requirements.txt`)
- [ ] Variables de entorno configuradas
- [ ] Base de datos MySQL creada y configurada
- [ ] `init_db.py` ejecutado (crear tablas)
- [ ] Aplicación reiniciada
- [ ] Probar acceso a la URL de la aplicación

---

## 🆘 Solución de Problemas

### Error: "No module named 'flask'"
```bash
# Instalar dependencias desde terminal CPanel
cd /ruta/a/tu/app
pip install -r requirements.txt
```

### Error: "Database connection failed"
- Verifica `DATABASE_URL` en variables de entorno
- Verifica que el usuario MySQL tenga permisos
- Verifica que la base de datos exista

### Error: "Application failed to start"
- Verifica que `passenger_wsgi.py` esté en la raíz
- Verifica que el Entry Point sea `application`
- Revisa logs en CPanel → Python App → Logs

### La app carga pero muestra errores 500
- Revisa logs de error en CPanel
- Verifica que todas las dependencias estén instaladas
- Verifica que la base de datos esté inicializada

---

## 📞 ¿Necesitas Ayuda?

Si encuentras problemas al desplegar en CPanel, verifica:
1. Logs de la aplicación en CPanel
2. Logs de error de Python
3. Variables de entorno están correctas
4. Permisos de archivos son correctos

