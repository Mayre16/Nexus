# 📋 Informe: Módulo de Ajustes de Inventario - Funcionamiento Actual

**Fecha:** 2025-01-22  
**Versión del Sistema:** WMS v1.0

---

## 📌 1. Propósito del Módulo

El módulo de **Ajustes de Inventario** permite registrar y gestionar ajustes de stock en ubicaciones físicas del almacén. Su función principal es:

- **Registrar inventario inicial** de productos en ubicaciones físicas específicas
- **Ajustar cantidades** de productos ya existentes en ubicaciones físicas
- **Mantener un historial** de todos los ajustes realizados para auditoría
- **Actualizar el stock físico** en el WMS sin necesidad de documentos de ADM Cloud

---

## 🎯 2. Funcionalidades Principales

### 2.1. Registro de Ajustes Individuales

**Flujo de trabajo:**
1. El usuario busca un producto por:
   - **SKU** (búsqueda directa en ADM Cloud)
   - **Nombre** (búsqueda en catálogo completo, limitada a 5000 productos)
   - **Código de barras** (actualmente usa búsqueda por SKU como fallback)

2. Una vez encontrado el producto, el sistema muestra:
   - Información del producto (nombre, SKU, ID de ADM Cloud)
   - **Stock actual en todas las ubicaciones físicas** donde existe el producto

3. El usuario ingresa:
   - **Ubicación física** (formato: `2-P1-AD-N1` = Piso-Pasillo-Anaquel-Nivel)
   - **Cantidad** (número decimal positivo)

4. Al registrar el ajuste:
   - Si el producto **no existe** en esa ubicación → **crea** un nuevo registro en `StockUbicacion`
   - Si el producto **ya existe** → **actualiza** la cantidad existente
   - Calcula la **diferencia** entre cantidad anterior y nueva
   - Crea un **movimiento de tipo `ADJUSTMENT`** en la tabla `Movimiento`
   - **NO modifica** el stock en ADM Cloud (solo en WMS local)

### 2.2. Historial de Ajustes

**Vista principal del módulo** (al entrar a `/ajustes`):

- **Listado paginado** de todos los ajustes realizados
- **Filtros disponibles:**
  - Fecha desde / hasta
  - Ubicación física
  - Tipo de ajuste (actualmente solo "Ajuste de Inventario")
  - Usuario que realizó el ajuste
  - Búsqueda por texto (notas, ubicación)

- **Información mostrada por ajuste:**
  - Fecha del ajuste
  - Ubicación física
  - Cantidad de productos ajustados
  - Tipo de ajuste
  - Usuario que lo realizó
  - Notas (descripción del ajuste)

- **Acciones disponibles:**
  - **Ver Detalle** → Muestra todos los productos ajustados en ese momento
  - **Editar** → (Funcionalidad pendiente de implementar completamente)

### 2.3. Vista de Detalles de Ajuste

Al hacer clic en "Ver Detalle", se muestra:
- Fecha y hora del ajuste
- Ubicación física
- Usuario que procesó el ajuste
- Lista completa de productos ajustados con sus cantidades
- Notas del ajuste

---

## 🔧 3. Endpoints API Disponibles

### 3.1. Búsqueda de Productos
**`POST /api/ajustes/buscar-producto`**

**Parámetros:**
```json
{
  "busqueda": "SKU123",
  "tipo": "sku"  // "sku", "nombre", "codigo_barras"
}
```

**Respuesta:**
```json
{
  "success": true,
  "producto": {
    "ID": "guid-adm-cloud",
    "SKU": "SKU123",
    "Name": "Nombre del Producto"
  },
  "stock_ubicaciones": [
    {
      "ubicacion": "2-P1-AD-N1",
      "cantidad": 10.5,
      "sku": "SKU123"
    }
  ]
}
```

### 3.2. Registro de Ajuste
**`POST /api/ajustes/registrar`**

**Parámetros:**
```json
{
  "sku": "SKU123",
  "ubicacion": "2-P1-AD-N1",
  "cantidad": 15.0,
  "product_id": "guid-adm-cloud"  // Opcional
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Ajuste registrado exitosamente",
  "stock": {
    "sku": "SKU123",
    "ubicacion": "2-P1-AD-N1",
    "cantidad": 15.0
  },
  "diferencia": 5.0  // Diferencia entre cantidad anterior y nueva
}
```

### 3.3. Listar Ubicaciones Físicas
**`GET /api/ajustes/ubicacion`**

**Respuesta:**
```json
{
  "success": true,
  "ubicaciones": [
    "2-P1-AD-N1",
    "2-P1-AD-N2",
    "2-P2-AI-N1"
  ]
}
```

### 3.4. Historial de Ajustes
**`GET /api/historial/ajustes`**

**Parámetros de consulta:**
- `page`: Número de página (default: 1)
- `per_page`: Registros por página (default: 10)
- `fecha_desde`: Fecha inicio (formato: YYYY-MM-DD)
- `fecha_hasta`: Fecha fin (formato: YYYY-MM-DD)
- `ubicacion_fisica`: Filtro por ubicación
- `tipo_ajuste`: Filtro por tipo
- `usuario_id`: ID del usuario
- `search`: Búsqueda por texto

**Respuesta:**
```json
{
  "success": true,
  "ajustes": [
    {
      "id": "2025-01-22T10:30:00_2-P1-AD-N1",
      "fecha": "2025-01-22T10:30:00Z",
      "ubicacion_fisica": "2-P1-AD-N1",
      "cantidad_productos": 3,
      "tipo_ajuste": "Ajuste de Inventario",
      "usuario": "Juan Pérez",
      "notas": "Ajuste de inventario inicial..."
    }
  ],
  "total": 50,
  "page": 1,
  "per_page": 10,
  "pages": 5
}
```

### 3.5. Detalles de un Ajuste
**`GET /api/detalles/ajuste/<ajuste_id>`**

**Parámetro:** `ajuste_id` en formato `timestamp_ubicacion` (ej: `2025-01-22T10:30:00_2-P1-AD-N1`)

**Respuesta:**
```json
{
  "success": true,
  "ajuste": {
    "id": "2025-01-22T10:30:00_2-P1-AD-N1",
    "fecha": "2025-01-22T10:30:00Z",
    "ubicacion": "2-P1-AD-N1",
    "usuario": {
      "id": 1,
      "nombre": "Juan Pérez"
    },
    "productos": [
      {
        "sku": "SKU123",
        "product_id": "guid-adm",
        "cantidad": 10.5,
        "notas": "Ajuste de inventario inicial..."
      }
    ],
    "total_productos": 3,
    "total_movimientos": 3,
    "notas": "Ajuste de inventario inicial. Ubicación: 2-P1-AD-N1. Anterior: 5, Nuevo: 10"
  }
}
```

---

## 💾 4. Estructura de Datos

### 4.1. Tabla `StockUbicacion`
Almacena el stock físico de productos por ubicación:

```python
- id: int (PK)
- product_id: string (ID de ADM Cloud)
- sku: string (SKU del producto)
- ubicacion: string (Código de ubicación física)
- cantidad: float (Cantidad en stock)
- updated_at: datetime (Última actualización)
```

### 4.2. Tabla `Movimiento`
Registra todos los movimientos de inventario, incluyendo ajustes:

```python
- id: int (PK)
- tipo: string ("ADJUSTMENT" para ajustes)
- product_id: string
- sku: string
- ubicacion_origen: string (None para ajustes positivos)
- ubicacion_destino: string (Ubicación física del ajuste)
- cantidad: float (Diferencia absoluta)
- usuario_id: int (FK a Usuario)
- timestamp: datetime (Fecha/hora del ajuste)
- notas: string (Descripción del ajuste)
- factura_guid: string (None para ajustes)
- factura_id: string (None para ajustes)
```

**Lógica de ajustes:**
- Si `diferencia > 0` (aumento): `ubicacion_destino` = ubicación, `ubicacion_origen` = None
- Si `diferencia < 0` (disminución): `ubicacion_origen` = ubicación, `ubicacion_destino` = None
- `cantidad` siempre es el valor absoluto de la diferencia

### 4.3. Agrupación de Ajustes en Historial

Los ajustes se agrupan por:
- **`timestamp`** (fecha/hora exacta)
- **`ubicacion_destino`** (ubicación física)

Esto significa que si se ajustan múltiples productos en la misma ubicación al mismo tiempo, se agrupan como un solo "ajuste" en el historial.

---

## 🔄 5. Flujo de Trabajo Completo

### 5.1. Crear un Nuevo Ajuste

```
1. Usuario accede a /ajustes/nuevo
2. Busca producto por SKU/Nombre/Código de barras
3. Sistema consulta ADM Cloud para obtener información del producto
4. Sistema consulta base de datos local para mostrar stock actual en ubicaciones físicas
5. Usuario ingresa:
   - Ubicación física (ej: 2-P1-AD-N1)
   - Cantidad nueva
6. Sistema valida:
   - SKU válido
   - Ubicación válida
   - Cantidad válida (> 0)
7. Sistema busca/crea registro en StockUbicacion
8. Calcula diferencia (cantidad_nueva - cantidad_anterior)
9. Si diferencia != 0:
   - Actualiza StockUbicacion
   - Crea Movimiento tipo ADJUSTMENT
10. Confirma éxito al usuario
```

### 5.2. Consultar Historial

```
1. Usuario accede a /ajustes (vista principal)
2. Sistema carga historial desde /api/historial/ajustes
3. Usuario puede aplicar filtros:
   - Fechas
   - Ubicación
   - Usuario
   - Búsqueda por texto
4. Sistema muestra resultados paginados
5. Usuario puede:
   - Ver detalle de un ajuste
   - Crear nuevo ajuste
```

---

## ⚠️ 6. Limitaciones y Características Actuales

### 6.1. Limitaciones

1. **Ajustes individuales:**
   - Solo permite ajustar **un producto a la vez**
   - No permite ajustar múltiples productos en una sola operación
   - No permite crear "ajustes masivos" o "ajustes por lote"

2. **Búsqueda de productos:**
   - Búsqueda por nombre está limitada a 5000 productos (puede ser lenta)
   - Búsqueda por código de barras usa fallback a SKU (no es búsqueda real por código)

3. **Validación de ubicaciones:**
   - No valida que la ubicación física exista en la tabla `UbicacionFisica`
   - Acepta cualquier string como ubicación (solo valida formato básico)

4. **Edición de ajustes:**
   - El botón "Editar" existe en el historial pero **no está completamente implementado**
   - No permite modificar o eliminar ajustes ya registrados

5. **Integración con ADM Cloud:**
   - **NO sincroniza** los ajustes con ADM Cloud
   - Los ajustes solo afectan el stock físico del WMS
   - Si un producto no existe en ADM Cloud, usa el SKU como `product_id` temporal

6. **Notas/Justificación:**
   - Las notas se generan automáticamente
   - No permite al usuario agregar notas personalizadas o justificación del ajuste

7. **Agrupación de ajustes:**
   - Los ajustes se agrupan por timestamp y ubicación
   - Si se ajustan productos diferentes en la misma ubicación al mismo tiempo, se agrupan
   - Esto puede ser confuso si se quieren ver ajustes individuales

### 6.2. Características Positivas

1. ✅ **Historial completo** con filtros y paginación
2. ✅ **Vista de detalles** para auditoría
3. ✅ **Integración con ADM Cloud** para búsqueda de productos
4. ✅ **Muestra stock actual** antes de ajustar
5. ✅ **Registro de usuario** que realiza el ajuste
6. ✅ **Cálculo automático** de diferencias
7. ✅ **Validaciones básicas** de datos

---

## 🔗 7. Integración con Otros Módulos

### 7.1. Módulo de Productos
- **Consulta:** El módulo de productos puede mostrar el stock físico de ubicaciones, que incluye los ajustes realizados

### 7.2. Módulo de Despacho
- **Impacto:** Los ajustes afectan el stock disponible para despacho
- Si se ajusta una cantidad negativa, puede hacer que el stock disponible sea menor

### 7.3. Módulo de Recepciones
- **Independiente:** Los ajustes no están relacionados con recepciones
- Ambos modifican `StockUbicacion` pero de forma independiente

### 7.4. Base de Datos
- **Tablas utilizadas:**
  - `StockUbicacion` (lectura y escritura)
  - `Movimiento` (escritura)
  - `Usuario` (lectura para mostrar quién hizo el ajuste)
  - `ProductoADM` (no se usa directamente, pero se consulta ADM Cloud)

---

## 📊 8. Casos de Uso Actuales

### 8.1. Inventario Inicial
**Escenario:** Almacén nuevo o producto nuevo que se coloca por primera vez en una ubicación física.

**Proceso:**
1. Buscar producto
2. Ingresar ubicación física
3. Ingresar cantidad inicial
4. Registrar ajuste

**Resultado:** Se crea registro en `StockUbicacion` con la cantidad inicial.

### 8.2. Corrección de Stock
**Escenario:** Se detecta una discrepancia entre el stock físico real y el registrado en el sistema.

**Proceso:**
1. Buscar producto
2. Ver stock actual en ubicaciones
3. Ingresar ubicación y cantidad corregida
4. Registrar ajuste

**Resultado:** Se actualiza `StockUbicacion` y se registra la diferencia como movimiento.

### 8.3. Ajuste por Pérdida/Daño
**Escenario:** Producto dañado o perdido que debe ser descontado del inventario.

**Proceso:**
1. Buscar producto
2. Ver stock actual
3. Ingresar ubicación y cantidad reducida (menor que la actual)
4. Registrar ajuste

**Resultado:** Se reduce el stock y se crea movimiento con `ubicacion_origen` (disminución).

---

## 🎯 9. Resumen Ejecutivo

El módulo de Ajustes de Inventario actualmente permite:

✅ **Registrar ajustes individuales** de productos en ubicaciones físicas  
✅ **Mantener historial** completo con filtros y paginación  
✅ **Consultar detalles** de ajustes realizados  
✅ **Actualizar stock físico** en el WMS  
✅ **Integración básica** con ADM Cloud para búsqueda de productos  

❌ **No permite ajustes masivos** (múltiples productos a la vez)  
❌ **No permite editar/eliminar** ajustes ya registrados  
❌ **No sincroniza con ADM Cloud** (solo afecta WMS local)  
❌ **No valida ubicaciones físicas** contra tabla de ubicaciones  
❌ **No permite notas personalizadas** del usuario  
❌ **Búsqueda limitada** (especialmente por nombre y código de barras)  

---

**Próximos pasos sugeridos:**
- Implementar ajustes masivos/lotes
- Agregar validación de ubicaciones físicas
- Permitir notas/justificación personalizadas
- Mejorar búsqueda de productos
- Implementar edición/eliminación de ajustes
- Considerar sincronización con ADM Cloud (opcional)








