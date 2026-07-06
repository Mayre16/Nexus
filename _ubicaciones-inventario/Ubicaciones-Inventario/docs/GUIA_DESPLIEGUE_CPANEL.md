# 📋 Guía Completa de Despliegue en cPanel

## 📦 Archivos a Subir a cPanel

### ✅ Archivos OBLIGATORIOS (Raíz del proyecto)

```
📁 Raíz del dominio (ej: public_html o wms.adesa.com.do)
├── 📄 app_wms.py              ← Aplicación principal Flask
├── 📄 passenger_wsgi.py       ← Entry point para Passenger/WSGI
├── 📄 config.py               ← Configuración del sistema
├── 📄 requirements.txt        ← Dependencias Python
│
├── 📁 api/                    ← Módulo de integración con ADM Cloud
│   ├── __init__.py
│   └── adm_cloud.py
│
├── 📁 database/               ← Módulo de base de datos
│   ├── __init__.py
│   └── models.py              ← Modelos de SQLAlchemy
│
├── 📁 routes/                 ← Blueprints de Flask (rutas)
│   ├── __init__.py
│   ├── auth.py                ← Autenticación
│   ├── dashboard.py           ← Panel principal
│   ├── despacho.py            ← Despacho de facturas
│   ├── productos.py           ← Consulta de productos
│   ├── sincronizar.py         ← Sincronización con ADM Cloud
│   ├── ajustes.py             ← Ajustes de inventario
│   ├── facturas.py            ← Gestión de facturas
│   └── stock.py               ← Gestión de stock
│
├── 📁 templates/              ← Plantillas HTML
│   ├── index.html             ← Dashboard principal
│   ├── login.html             ← Página de login
│   ├── despacho.html          ← Página de despacho
│   ├── productos.html         ← Consulta de productos
│   └── ajustes.html           ← Ajustes de inventario
│
├── 📁 utils/                  ← Utilidades
│   ├── __init__.py
│   ├── helpers.py
│   └── validaciones.py
│
└── 📁 static/                 ← Archivos estáticos (CSS, JS, imágenes)
    ├── css/
    └── js/
```

### ❌ Archivos a EXCLUIR (NO subir)

```
✗ __pycache__/           ← Archivos compilados Python (se generan automáticamente)
✗ *.pyc                  ← Bytecode compilado
✗ .env                   ← Variables de entorno (usar variables de cPanel)
✗ database/wms.db        ← Base de datos local (se crea automáticamente)
✗ migrations/            ← Migraciones (si no las usas)
✗ no_cpanel/            ← Archivos de desarrollo local
✗ *.md                   ← Documentación (opcional, no necesario)
✗ *.txt                  ← Archivos de notas (opcional)
✗ *.bat                  ← Scripts de Windows
✗ crear_zip_cpanel.*     ← Scripts de compresión
```

---

## 🚀 Proceso de Despliegue en cPanel

### Paso 1: Preparar Archivos

1. **Crear un archivo ZIP** con todos los archivos necesarios:
   ```bash
   # Desde la raíz del proyecto, excluyendo archivos innecesarios
   zip -r wms_cpanel.zip . \
     -x "__pycache__/*" \
     -x "*.pyc" \
     -x "*.db" \
     -x "*.log" \
     -x ".env" \
     -x "no_cpanel/*" \
     -x "*.md" \
     -x "*.txt" \
     -x "*.bat"
   ```

2. **O seleccionar manualmente** los archivos/folders necesarios:
   - `app_wms.py`
   - `passenger_wsgi.py`
   - `config.py`
   - `requirements.txt`
   - Todas las carpetas: `api/`, `database/`, `routes/`, `templates/`, `utils/`, `static/`

### Paso 2: Subir a cPanel

1. **Acceder a File Manager** en cPanel
2. **Navegar** a la carpeta del dominio (ej: `public_html/` o `wms.adesa.com.do/`)
3. **Subir el ZIP** usando "Upload"
4. **Extraer** el ZIP usando "Extract"
5. **Verificar** que todos los archivos estén en su lugar

### Paso 3: Configurar Entorno Virtual (Python)

1. **Crear Virtual Environment**:
   ```bash
   # En Terminal de cPanel o SSH
   cd ~/public_html  # o la carpeta de tu dominio
   python3.11 -m venv venv  # o la versión disponible
   ```

2. **Activar Virtual Environment**:
   ```bash
   source venv/bin/activate
   ```

3. **Instalar Dependencias**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

### Paso 4: Configurar Variables de Entorno (cPanel)

1. **Ir a "Python App"** en cPanel
2. **Crear nueva aplicación** o editar existente:
   - **App directory**: `/home/usuario/public_html` (o tu carpeta)
   - **App URL**: `/` (o la URL deseada)
   - **Application startup file**: `passenger_wsgi.py`
   - **Application Entry point**: `application`

3. **Configurar Variables de Entorno** (si las necesitas):
   ```
   FLASK_ENV=production
   SECRET_KEY=tu-clave-secreta-muy-segura
   DATABASE_URL=sqlite:///path/to/wms.db
   ```

4. **Guardar** y **Restart** la aplicación

### Paso 5: Verificar Permisos

1. **Archivos Python**: `644` (rw-r--r--)
2. **Directorios**: `755` (rwxr-xr-x)
3. **Carpeta database/**: Debe tener permisos de escritura (`755` o `775`)

### Paso 6: Probar la Aplicación

1. **Abrir** la URL de tu aplicación en el navegador
2. **Verificar** que cargue la página de login
3. **Probar** el login con tus credenciales
4. **Verificar** que todos los módulos funcionen

---

## 🔄 Proceso de Sincronización (Paso a Paso)

### 📊 Resumen del Proceso

La sincronización trae productos y stock desde **ADM Cloud** a la **base de datos local** del WMS para consultas rápidas.

### 🔍 Detalle Paso a Paso

#### **FASE 1: Preparación (0%)**

1. **Limpiar progreso anterior**
   - Borra cualquier progreso de sincronización previa del usuario
   - Inicializa el sistema de seguimiento de progreso

2. **Crear tablas si no existen**
   - Verifica/crea tablas: `ProductoADM`, `StockProductoADM`
   - Asegura que la base de datos esté lista

3. **Inicializar cliente ADM Cloud**
   - Conecta con la API de ADM Cloud usando credenciales
   - Prepara las solicitudes HTTP autenticadas

**Progreso: 0%** - "Iniciando sincronización..."

---

#### **FASE 2: Obtener Productos (1% - 10%)**

1. **Obtener productos en lotes**
   - Llamadas a `/api/items/` con paginación
   - Lotes de 50 productos por solicitud
   - Máximo esperado: 5000 productos

2. **Iteración por lotes**
   - Para cada lote:
     - Solicita: `GET /api/items/?skip=X&take=50`
     - Recibe lista de productos (ID, SKU, Name, Barcode, etc.)
     - Agrega productos a la lista acumulada
     - Actualiza progreso: `1% + (productos_obtenidos / 5000) * 9%`
   
3. **Condición de parada**
   - Si recibe menos de 50 productos → no hay más
   - Si alcanza el límite de 5000 → detiene búsqueda

**Progreso: 1% - 10%** - "Obteniendo productos desde ADM Cloud... X productos (Y%)"

**Datos obtenidos**:
```python
productos_adm = [
    {
        "ID": "guid-del-producto",
        "SKU": "VP1",
        "Name": "Nombre del Producto",
        "Barcode": "1234567890",
        ...
    },
    ...
]
```

---

#### **FASE 3: Obtener Ubicaciones (10% - 12%)**

1. **Obtener ubicaciones ADM**
   - Una sola llamada: `GET /api/Locations/?skip=0&take=50`
   - Recibe lista de ubicaciones (ID, Name)

2. **Crear mapa de ubicaciones**
   - Construye diccionario: `{location_id: location_name}`
   - Ejemplo: `{"guid-1": "ADESA", "guid-2": "MIRADOR SUR", ...}`

**Progreso: 10% - 12%** - "Ubicaciones obtenidas: X. Obteniendo stock..."

**Datos obtenidos**:
```python
ubicaciones_map = {
    "guid-1": "ADESA",
    "guid-2": "MIRADOR SUR",
    ...
}
```

---

#### **FASE 4: Obtener Stock por Ubicación (12% - 20%)**

1. **Para cada ubicación**:
   - Itera sobre todas las ubicaciones obtenidas

2. **Obtener stock con paginación**:
   - Para cada ubicación:
     - Solicita: `GET /api/Stock/?LocationID=XXX&skip=Y&take=500`
     - Recibe lista de items con stock > 0
     - Lotes de 500 items por solicitud
     - **IMPORTANTE**: Solo devuelve items con stock > 0

3. **Procesar cada item de stock**:
   - Extrae `ItemID` (puede estar en `ItemID`, `ID`, o `Item.ID`)
   - Extrae `SKU` (puede estar en `SKU`, `ItemSKU`, o `Item.SKU`)
   - Extrae `Stock` (prioriza campo `Stock`, luego `QuantityOnHand`, `Quantity`, etc.)
   - Almacena: `stock_por_ubicacion[location_id][item_id] = {stock, sku}`

4. **Actualizar progreso por ubicación**:
   - `12% + (ubicaciones_procesadas / total_ubicaciones) * 8%`

**Progreso: 12% - 20%** - "Obteniendo stock para [UBICACIÓN]... (X/Y) - Z%"

**Datos obtenidos**:
```python
stock_por_ubicacion = {
    "guid-1": {  # ADESA
        "item-guid-1": {"stock": 863.0, "sku": "VP1"},
        "item-guid-2": {"stock": 50.0, "sku": "VP2"},
        ...
    },
    "guid-2": {  # MIRADOR SUR
        "item-guid-1": {"stock": 44.0, "sku": "VP1"},
        ...
    }
}
```

**Regla importante**: Si un producto existe en `/Items` pero NO aparece en `/Stock?LocationID=XXX`, su stock en esa ubicación es **0**.

---

#### **FASE 5: Guardar Productos en BD (20% - 95%)**

1. **Para cada producto obtenido**:
   - Itera sobre todos los productos de `productos_adm`
   - Actualiza progreso cada 50 productos: `20% + (productos_procesados / total) * 75%`

2. **Buscar o crear producto en BD**:
   - Busca `ProductoADM` por `item_id`
   - Si existe → actualiza: `nombre`, `sku`, `codigo_barras`, `updated_at`
   - Si no existe → crea nuevo registro

3. **Para cada ubicación**:
   - Busca stock del producto en `stock_por_ubicacion[location_id][item_id]`
   - Si existe en el mapa → usa ese valor
   - Si NO existe → stock = 0 (porque ADM no devuelve stock 0)

4. **Buscar o crear registro de stock**:
   - Busca `StockProductoADM` por `producto_id` + `location_id`
   - Si existe → actualiza: `stock`, `location_name`, `updated_at`
   - Si no existe → crea nuevo registro (incluso si stock = 0)

5. **Commit periódico**:
   - Cada 100 productos → `db.session.commit()`
   - Evita pérdida de datos si hay timeout
   - Permite recuperar progreso parcial

**Progreso: 20% - 95%** - "Procesando productos... X/Y (Z%)"

**Ejemplo de datos guardados**:
```sql
-- Tabla ProductoADM
INSERT INTO producto_adm (item_id, sku, nombre, codigo_barras, updated_at)
VALUES ('guid-1', 'VP1', 'Nombre Producto', '123456', NOW());

-- Tabla StockProductoADM
INSERT INTO stock_producto_adm (producto_id, location_id, location_name, stock, updated_at)
VALUES (1, 'guid-1', 'ADESA', 863.0, NOW());

INSERT INTO stock_producto_adm (producto_id, location_id, location_name, stock, updated_at)
VALUES (1, 'guid-2', 'MIRADOR SUR', 44.0, NOW());
```

---

#### **FASE 6: Finalización (95% - 100%)**

1. **Marcar fecha de sincronización**:
   - Actualiza `synced_at` en todos los productos

2. **Commit final**:
   - `db.session.commit()` → guarda todos los cambios pendientes

3. **Limpiar progreso**:
   - Espera 5 segundos
   - Borra el progreso de sincronización del usuario

**Progreso: 100%** - "Sincronización completada: X productos procesados (100%)"

---

### 📈 Resumen de Progreso

| Fase | Progreso | Actividad | Tiempo Aprox. |
|------|----------|-----------|---------------|
| Preparación | 0% | Inicialización | ~1 seg |
| Obtener Productos | 1% - 10% | Descarga productos | ~30-60 seg |
| Obtener Ubicaciones | 10% - 12% | Descarga ubicaciones | ~2 seg |
| Obtener Stock | 12% - 20% | Descarga stock por ubicación | ~60-120 seg |
| Guardar en BD | 20% - 95% | Procesa y guarda productos | ~60-180 seg |
| Finalización | 95% - 100% | Commit final | ~2 seg |

**Tiempo total estimado**: 3-6 minutos (depende de cantidad de productos)

---

### 🔑 Puntos Clave

1. **Paginación**: Todo se obtiene en lotes para manejar grandes volúmenes
2. **Stock 0**: Si un producto no aparece en `/Stock`, su stock es 0
3. **Commits periódicos**: Cada 100 productos para evitar pérdida de datos
4. **Progreso en tiempo real**: Se actualiza cada 50 productos procesados
5. **Base de datos local**: Permite consultas rápidas sin depender de ADM Cloud

---

## ✅ Checklist de Verificación

### Antes de Subir:
- [ ] Todos los archivos `.py` están presentes
- [ ] `requirements.txt` está actualizado
- [ ] `passenger_wsgi.py` existe y está correcto
- [ ] `config.py` tiene las credenciales correctas
- [ ] Excluidos archivos `__pycache__`, `.pyc`, `.db`, etc.

### Después de Subir:
- [ ] Virtual environment creado y activado
- [ ] Dependencias instaladas (`pip install -r requirements.txt`)
- [ ] Aplicación Python configurada en cPanel
- [ ] Permisos correctos en archivos y carpetas
- [ ] Aplicación se inicia correctamente
- [ ] Login funciona
- [ ] Sincronización funciona y muestra progreso

---

## 🐛 Troubleshooting

### Error: "No module named 'flask'"
- **Solución**: Instalar dependencias: `pip install -r requirements.txt`

### Error: "Database locked"
- **Solución**: Verificar permisos en carpeta `database/` (debe ser 755 o 775)

### Error: "Timeout during synchronization"
- **Solución**: Los commits periódicos cada 100 productos previenen pérdida de datos. Reiniciar sincronización.

### Sincronización no muestra progreso
- **Solución**: Verificar que el endpoint `/api/sincronizar/progreso` esté funcionando

### Stock muestra 0.00 cuando debería tener valor
- **Solución**: Verificar que el campo `Stock` se esté extrayendo correctamente del API de ADM Cloud

---

## 📝 Notas Adicionales

- La sincronización puede tomar varios minutos dependiendo de la cantidad de productos
- El progreso se actualiza en tiempo real en la interfaz web
- Los datos se guardan periódicamente para evitar pérdida en caso de timeout
- Solo se muestran ubicaciones con stock > 0 en la consulta de productos









