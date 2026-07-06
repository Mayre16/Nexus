# Despliegue a producción — aplicación WMS (incluye módulo Abastecimiento)

Este documento resume cómo subir **esta versión** al servidor de producción. El módulo **Abastecimiento** es nuevo: requiere dependencias, variables de entorno y que exista la tabla en la base de datos.

---

## 1. Qué ZIP usar

| Archivo | Contenido |
|---------|-----------|
| **`Ubicaciones-Inventario-produccion-minimo.zip`** (recomendado) | Solo lo esencial para arrancar: `app_wms.py`, `passenger_wsgi.py`, `config.py`, `requirements.txt`, `.htaccess`, carpetas `routes/`, `templates/`, `static/`, `utils/`, `api/`, `database/` (modelos, sin SQLite), `scripts/cpanel_post_deploy.py`, `docs/DEPLOY_PRODUCCION_PASO_A_PASO.md`. **~0,3 MB.** |
| Copia completa del repo (sin `.venv`) | Incluye documentación y scripts de desarrollo; más pesado. |

Para regenerar el ZIP mínimo en tu PC, desde la raíz del proyecto:

```bash
python scripts/crear_zip_minimo.py
```

- **No** se incluye `.venv` (el servidor usa su propio entorno / Pip Install).
- **No** se incluye `database/wms.db` (cada entorno tiene su BD; en producción suele ser MySQL).

---

## 2. Requisitos en el servidor

- Python 3.10+ (o la misma versión que usen hoy en prod).
- Acceso SSH o panel (cPanel, etc.) para subir archivos y ejecutar `pip`.
- Base de datos ya configurada para el WMS (misma que usa la app hoy).

---

## 3. Paso a paso

### 3.0 Solo cPanel (sin terminal SSH) — Setup Python App

Si **no** tienes consola y solo ves **Run Pip Install**, **Execute python script** y **RESTART**:

1. **Subir el ZIP** con el Administrador de archivos y descomprimir sobre la carpeta de la app (haz backup del directorio actual antes).
2. **Run Pip Install** en la pantalla de la aplicación Python para instalar dependencias desde `requirements.txt` (incluye **openpyxl**).
3. **Execute python script**: en el campo de ruta, escribe la **ruta absoluta** al script incluido en el proyecto:
   - Archivo: `scripts/cpanel_post_deploy.py`
   - Ejemplo de ruta (cámbiala por la tuya real; usuario y carpeta suelen aparecer en File Manager):
     - `/home2/adesa/wms.adesa.com.do/scripts/cpanel_post_deploy.py`
   - Pulsa **Run Script**. El script ejecuta `db.create_all()` (crea tablas faltantes, p. ej. `abastecimiento_politica`) y comprueba que **openpyxl** se importa. La salida suele verse en el log de la ejecución o en stderr/stdout del panel.
4. Si el script indica error de **openpyxl**, vuelve al paso 2 o instala manualmente con Pip Install según permita tu hosting.
5. Pulsa **RESTART** en la aplicación Python para recargar el código.
6. Opcional: variables `ABASTECIMIENTO_LOCATION_ID` / `ABASTECIMIENTO_LOCATION_NAME` en el mismo sitio donde configures el entorno (si el panel lo permite).

**Nota:** El campo “Execute python script” admite **ruta a un archivo `.py`**. No uses comandos tipo `pip` ahí; las dependencias van con **Run Pip Install**.

---

### 3.1 Subir y descomprimir

1. Sube el archivo **`Ubicaciones-Inventario-produccion.zip`** al servidor (misma ruta donde suelen desplegar la app, o una carpeta nueva).
2. Descomprime y **sustituye** (o fusiona) los archivos del proyecto actual, según su procedimiento habitual (backup del directorio anterior antes, si aplica).

### 3.2 Entorno virtual (recomendado) — si tienes SSH o terminal

En la carpeta raíz del proyecto:

```bash
python -m venv .venv
```

**Windows:**

```bat
.venv\Scripts\activate
```

**Linux / cPanel terminal:**

```bash
source .venv/bin/activate
```

### 3.3 Instalar dependencias

Incluye **openpyxl** (Excel en Abastecimiento, Ajustes, etc.):

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Comprueba:

```bash
python -c "import openpyxl; print(openpyxl.__version__)"
```

### 3.4 Variables de entorno — Abastecimiento

El módulo usa la ubicación ADM configurada (por defecto nombre **Mirador Sur** si no defines nada).

Opcionales (ajustar a producción):

| Variable | Descripción |
|----------|-------------|
| `ABASTECIMIENTO_LOCATION_ID` | GUID de la ubicación en ADM (si lo dejan vacío, se resuelve por nombre). |
| `ABASTECIMIENTO_LOCATION_NAME` | Nombre de la ubicación en `sync_locations_status` (por defecto `Mirador Sur`). |

Añádelas al mismo sitio donde ya tienen `SQLALCHEMY_DATABASE_URI`, `SECRET_KEY`, etc. (`.env`, panel del host, systemd, etc.).

### 3.5 Base de datos

- Al arrancar, la app ejecuta **`db.create_all()`**: si la tabla **`abastecimiento_politica`** no existe, SQLAlchemy la crea en motores que lo permitan (MySQL/MariaDB incluido).
- Si en producción **no** pueden usar `create_all` y migran a mano, creen la tabla equivalente al modelo `AbastecimientoPolitica` en `database/models.py` (nombre `abastecimiento_politica`, FK a `productos_adm.id`, restricción única `producto_id` + `location_id`).

**Nota:** Los scripts **`scripts/migrar_unique_stock_sqlite.py`** y similares son **solo para SQLite en desarrollo**. En MySQL de producción no deben ejecutarse salvo que tengan un problema equivalente de esquema ya documentado.

### 3.6 Reiniciar el servicio

- Reiniciar **Gunicorn**, **uWSGI**, servicio **Windows**, tarea en cPanel “Passenger”, etc., según cómo ejecuten la app hoy.
- Verificar logs al arranque (sin errores de importación de `openpyxl` ni de blueprints).

### 3.7 Pruebas rápidas en producción

1. Login como **administrador**.
2. Entrar a **Abastecimiento** desde el inicio.
3. **Excel bajo mínimo** / **Excel completo**: debe descargar `.xlsx` con columna **Product ID** (`item_id` ADM).
4. **Importar**: probar con un archivo pequeño exportado desde el mismo entorno.

---

## 4. Rollback

Conservar copia del directorio o ZIP anterior y restaurar archivos + `pip install -r requirements.txt` de la versión previa si hiciera falta.

---

## 5. Resumen de archivos nuevos o relevantes (referencia)

- `routes/abastecimiento.py` — API y Excel.
- `templates/abastecimiento.html`, `static/js/abastecimiento.js`, `static/css/abastecimiento.css`.
- `database/models.py` — modelo `AbastecimientoPolitica`.
- `requirements.txt` — incluye `openpyxl>=3.1.0`.
- `templates/index.html` — enlace al módulo (orden menú).
- `scripts/cpanel_post_deploy.py` — ejecución única en cPanel tras desplegar (tablas + comprobar openpyxl).

---

*Generado para el despliegue del módulo Abastecimiento y cambios asociados.*
