# Sistema WMS - Warehouse Management System

Sistema de gestión de almacenes integrado con ADM Cloud para controlar ubicaciones físicas de productos y optimizar procesos de despacho.

## 🚀 Inicio Rápido

### 1. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 2. Inicializar base de datos

```bash
python init_db.py
```

Esto creará:
- Todas las tablas necesarias
- Usuario administrador por defecto:
  - **Email**: `admin@wms.local`
  - **Contraseña**: `admin123`

### 3. Ejecutar la aplicación

```bash
python app_wms.py
```

O si prefieres mantener la app anterior:

```bash
python app.py
```

La aplicación estará disponible en: **http://localhost:5000**

## 📁 Estructura del Proyecto

```
wms/
├── app_wms.py              # Aplicación Flask principal (NUEVA)
├── app.py                  # Aplicación Flask anterior (mantener compatibilidad)
├── config.py               # Configuración del sistema
├── init_db.py              # Script de inicialización de BD
├── passenger_wsgi.py       # Configuración para CPanel
├── requirements.txt        # Dependencias Python
│
├── database/               # Módulo de base de datos
│   ├── __init__.py
│   └── models.py          # Modelos SQLAlchemy
│
├── api/                    # Integración con ADM Cloud
│   ├── __init__.py
│   └── adm_cloud.py       # Cliente API ADM Cloud
│
├── routes/                 # Rutas de la aplicación
│   ├── __init__.py
│   ├── auth.py            # Autenticación
│   ├── facturas.py        # Consulta de facturas
│   ├── despacho.py        # Proceso de picking/despacho
│   ├── stock.py           # Gestión de stock
│   └── dashboard.py       # Dashboard y estadísticas
│
├── utils/                  # Utilidades
│   ├── __init__.py
│   ├── validaciones.py    # Funciones de validación
│   └── helpers.py         # Funciones auxiliares
│
└── templates/              # Plantillas HTML
    └── index.html         # Interfaz web
```

## 🔧 Configuración

### Variables de Entorno

Puedes configurar el sistema usando variables de entorno:

```bash
# ADM Cloud API
ADM_EMAIL=tu_email@example.com
ADM_PASSWORD=tu_password
ADM_APPID=tu_appid
ADM_COMPANY=tu_company_id
ADM_ROLE=Administradores

# Base de datos (para producción)
DATABASE_URL=mysql://user:pass@localhost/dbname

# Entorno
FLASK_ENV=development  # o 'production'
SECRET_KEY=tu_secret_key_super_segura
```

### Archivo config.py

Las credenciales también pueden configurarse directamente en `config.py` (solo para desarrollo).

## 📊 Funcionalidades

### ✅ Implementado

1. **Autenticación de usuarios**
   - Login/Logout
   - Sesiones seguras
   - Roles: despachador, almacenista, administrador

2. **Consulta de facturas desde ADM Cloud**
   - Buscar factura por número (DocID)
   - Ver productos de la factura
   - Cache local de facturas

3. **Proceso de despacho (Picking)**
   - Registrar movimientos de picking
   - Validar stock por ubicación
   - Actualizar estado de facturas

4. **Gestión de stock por ubicación**
   - Consultar stock por SKU y ubicación
   - Calcular stock total WMS

5. **Dashboard básico**
   - Estadísticas de facturas pendientes
   - Movimientos del día

### 🚧 En desarrollo

- Interfaz web completa para despacho
- Transferencias internas
- Reconciliación ADM vs WMS
- Recepción y asignación de ubicaciones
- Reportes avanzados

## 🔐 API Endpoints

### Autenticación

- `POST /api/auth/login` - Login de usuario
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/me` - Obtener usuario actual

### Facturas

- `POST /api/facturas/buscar` - Buscar factura por DocID
- `GET /api/facturas/<docid>` - Obtener factura desde BD local

### Despacho

- `POST /api/despacho/registrar` - Registrar picking

### Stock

- `GET /api/stock/ubicacion` - Obtener stock por ubicación
- `GET /api/stock/total` - Calcular stock total por SKU

### Dashboard

- `GET /api/dashboard/estadisticas` - Estadísticas generales

## 📦 Despliegue en CPanel

### Preparación

1. Sube todos los archivos a tu servidor CPanel
2. Asegúrate de tener Python 3.8+ disponible
3. Instala dependencias:
   ```bash
   pip install -r requirements.txt
   ```

4. Configura variables de entorno en CPanel:
   - `FLASK_ENV=production`
   - `SECRET_KEY=tu_secret_key`
   - `DATABASE_URL=mysql://...`
   - Credenciales ADM Cloud

5. Inicializa la base de datos:
   ```bash
   python init_db.py
   ```

6. El archivo `passenger_wsgi.py` ya está configurado para CPanel

### Estructura en CPanel

```
public_html/
├── app_wms.py
├── passenger_wsgi.py
├── config.py
├── requirements.txt
├── database/
├── api/
├── routes/
└── ...
```

## 🔄 Migraciones y Actualizaciones

Para actualizar la base de datos después de cambios en modelos:

```python
from app_wms import app
from database import db

with app.app_context():
    db.create_all()  # Crea nuevas tablas/columnas
```

## 📝 Notas Importantes

1. **Base de datos**: Por defecto usa SQLite en desarrollo. En producción, usa MySQL/MariaDB.

2. **Contraseñas**: En producción, **DEBES** cambiar el `SECRET_KEY` y usar variables de entorno.

3. **Usuario por defecto**: Cambia la contraseña del administrador después del primer login.

4. **ADM Cloud**: El sistema consulta ADM Cloud en tiempo real. Considera implementar cache para mejorar rendimiento.

## 🐛 Solución de Problemas

### Error: "No module named 'flask'"
```bash
pip install -r requirements.txt
```

### Error: "Database locked" (SQLite)
Asegúrate de que no hay otra instancia de la app corriendo.

### Error: "401 Unauthorized" al consultar ADM Cloud
Verifica las credenciales en `config.py` o variables de entorno.

## 📚 Documentación Adicional

- `REQUISITOS_DESARROLLO_WMS.md` - Requisitos técnicos completos
- `ENTENDIMIENTO_PROYECTO.md` - Resumen del entendimiento del proyecto

## 🤝 Soporte

Para dudas o problemas, consulta la documentación o revisa los logs de la aplicación.

