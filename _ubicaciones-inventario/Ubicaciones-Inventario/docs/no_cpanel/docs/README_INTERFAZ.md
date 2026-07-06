# 🌐 Interfaz Web para Consultar ADM Cloud API

## 📋 Descripción

Interfaz web simple para consultar información del ERP ADM Cloud a través del API.

**Funcionalidades:**
- 🔍 Buscar productos por SKU
- 📋 Listar productos
- 📊 Ver todos los datos de un producto

## 🚀 Instalación

### 1. Instalar dependencias

```bash
pip install -r requirements_web.txt
```

### 2. Ejecutar la aplicación

```bash
python app.py
```

### 3. Abrir en el navegador

Abre tu navegador y ve a:
```
http://localhost:5000
```

## 🎯 Uso

### Buscar Producto por SKU

1. En la pestaña "Buscar por SKU"
2. Ingresa el SKU (ej: `CJX1`)
3. Haz clic en "Buscar"
4. Verás todos los datos del producto

### Listar Productos

1. En la pestaña "Listar Productos"
2. Haz clic en "Cargar Productos"
3. Verás una lista de productos

## ⚙️ Configuración

Las credenciales están configuradas en `app.py`:

```python
API_CONFIG = {
    "api_base": "https://api.admcloud.net/api/",
    "email": "tu_email@ejemplo.com",
    "password": "tu_password",
    "appid": "tu_appid",
    "company": "tu_company",
    "role": "tu_role"
}
```

## 🔧 Estructura

- `app.py` - Aplicación Flask principal
- `templates/index.html` - Interfaz web
- `requirements_web.txt` - Dependencias

## 📝 Notas

- La aplicación se ejecuta en modo debug (desarrollo)
- Para producción, desactiva el modo debug
- Los datos se obtienen en tiempo real del API






