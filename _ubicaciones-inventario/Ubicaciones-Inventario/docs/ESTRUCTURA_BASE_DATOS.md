# Estructura de Base de Datos - WMS

## Resumen de Tablas

La base de datos SQLite tiene **6 tablas principales**:

---

## 1. Tabla: `usuarios`
**Propósito:** Almacena los usuarios del sistema (despachadores, almacenistas, administradores)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del usuario |
| `nombre` | String(100) | Nombre completo del usuario |
| `email` | String(100) | Email (único, usado para login) |
| `password_hash` | String(255) | Contraseña encriptada con bcrypt |
| `rol` | String(50) | Rol: `despachador`, `almacenista`, `administrador` |
| `activo` | Boolean | Si el usuario está activo o no |
| `created_at` | DateTime | Fecha de creación del usuario |

**Relaciones:**
- Un usuario puede tener muchos `movimientos`
- Un usuario puede tener muchas `facturas_procesadas`

---

## 2. Tabla: `stock_por_ubicacion`
**Propósito:** Almacena el stock físico de productos en ubicaciones del almacén (nomenclatura: `2-P1-AD-N1`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del registro |
| `product_id` | String(100) | ItemID (GUID) del producto en ADM Cloud |
| `sku` | String(100) | SKU del producto (índice) |
| `ubicacion` | String(50) | Ubicación física (ej: `2-P1-AD-N1`) (índice) |
| `cantidad` | Numeric(10,2) | Cantidad de stock en esta ubicación |
| `updated_at` | DateTime | Fecha de última actualización |

**Restricción única:**
- No puede haber dos registros con el mismo `product_id` y `ubicacion`

**Ejemplo:**
- SKU: `VP1`
- Ubicación: `2-P1-AD-N1`
- Cantidad: `5.00`

---

## 3. Tabla: `movimientos`
**Propósito:** Registra todos los movimientos de inventario (historial de transacciones)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del movimiento |
| `tipo` | String(20) | Tipo: `RECEIPT`, `PICK`, `TRANSFER`, `ADJUSTMENT` (índice) |
| `product_id` | String(100) | ItemID (GUID) del producto |
| `sku` | String(100) | SKU del producto (índice) |
| `ubicacion_origen` | String(50) | Ubicación de origen (si aplica) |
| `ubicacion_destino` | String(50) | Ubicación de destino (si aplica) |
| `cantidad` | Numeric(10,2) | Cantidad movida |
| `factura_id` | String(100) | DocID de la factura (índice) |
| `factura_guid` | String(100) | GUID completo de la factura (índice) |
| `usuario_id` | Integer (FK) | ID del usuario que hizo el movimiento |
| `timestamp` | DateTime | Fecha y hora del movimiento (índice) |
| `notas` | Text | Notas adicionales del movimiento |

**Tipos de movimientos:**
- `RECEIPT`: Recepción de mercancía
- `PICK`: Picking/Despacho de producto
- `TRANSFER`: Transferencia entre ubicaciones
- `ADJUSTMENT`: Ajuste de inventario

---

## 4. Tabla: `facturas_procesadas`
**Propósito:** Cache de facturas de ADM Cloud y control de estado de despacho

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único de la factura |
| `factura_docid` | String(50) | DocID de la factura (ej: `2967`) (índice) |
| `factura_guid` | String(100) | GUID completo de la factura (único) |
| `tipo_factura` | String(20) | Tipo: `CASH`, `CREDIT`, `ORDER` |
| `cliente` | String(200) | Nombre del cliente |
| `fecha` | DateTime | Fecha de la factura |
| `total` | Numeric(10,2) | Total de la factura |
| `estado_despacho` | String(20) | Estado: `PENDIENTE`, `EN_PROCESO`, `COMPLETO`, `CANCELADO` |
| `usuario_despachador` | Integer (FK) | ID del usuario despachador |
| `fecha_inicio` | DateTime | Fecha de inicio del despacho |
| `completed_at` | DateTime | Fecha de completado del despacho |
| `created_at` | DateTime | Fecha de creación del registro |
| `updated_at` | DateTime | Fecha de última actualización |
| `productos_json` | Text | JSON con todos los productos de la factura (cache) |

**El campo `productos_json` contiene:**
```json
[
  {
    "SKU": "VP1",
    "Name": "Park Tool Parcho Vulcanizado #VP-1",
    "Quantity": 5.0,
    "ItemID": "0c105153-8ebb-4ff3-4eb7-08dd1ac8414f"
  },
  ...
]
```

---

## 5. Tabla: `pendientes_ubicacion`
**Propósito:** Productos que llegaron pero aún no tienen ubicación asignada (recepción)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del registro |
| `product_id` | String(100) | ItemID (GUID) del producto |
| `sku` | String(100) | SKU del producto |
| `cantidad` | Numeric(10,2) | Cantidad recibida |
| `referencia_compra` | String(100) | ID de la orden de compra (PurchaseOrder) |
| `status` | String(20) | Estado: `PENDIENTE`, `ASIGNADA` |
| `ubicacion_asignada` | String(50) | Ubicación asignada (si aplica) |
| `usuario_asigno` | Integer (FK) | ID del usuario que asignó la ubicación |
| `created_at` | DateTime | Fecha de creación |
| `updated_at` | DateTime | Fecha de última actualización |

---

## 6. Tabla: `productos_adm` ⭐ NUEVA
**Propósito:** Cache local de productos de ADM Cloud para búsquedas rápidas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del producto |
| `item_id` | String(100) | GUID del producto en ADM Cloud (único, índice) |
| `nombre` | String(500) | Nombre del producto |
| `sku` | String(100) | SKU del producto (índice) |
| `codigo_barras` | String(100) | Código de barras (si existe) (índice) |
| `activo` | Boolean | Si el producto está activo |
| `updated_at` | DateTime | Fecha de última actualización |
| `synced_at` | DateTime | Fecha de última sincronización desde ADM Cloud |

**Relaciones:**
- Un producto puede tener muchas entradas en `stock_productos_adm`

---

## 7. Tabla: `stock_productos_adm` ⭐ NUEVA
**Propósito:** Cache del stock de productos ADM por ubicación ADM Cloud

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del registro |
| `producto_id` | Integer (FK) | ID del producto en `productos_adm` (índice) |
| `location_id` | String(100) | GUID de la ubicación ADM Cloud |
| `location_name` | String(200) | Nombre de la ubicación (ej: `ADESA`, `Sucursal 1`) |
| `stock` | Numeric(10,2) | Cantidad de stock en esta ubicación ADM |
| `updated_at` | DateTime | Fecha de última actualización |

**Restricción única:**
- No puede haber dos registros con el mismo `producto_id` y `location_id`

**Ejemplo:**
- Producto: `VP1`
- Ubicación ADM: `ADESA`
- Stock: `25.50`

---

## Relaciones entre Tablas

```
usuarios (1) ────┐
                 ├─── (N) movimientos
                 └─── (N) facturas_procesadas

productos_adm (1) ──── (N) stock_productos_adm

stock_por_ubicacion (independiente)
movimientos (independiente)
facturas_procesadas (independiente)
pendientes_ubicacion (independiente)
```

---

## Diferencia entre Ubicaciones

### Ubicaciones ADM Cloud (`stock_productos_adm`)
- Son las **ubicaciones virtuales** de ADM Cloud
- Ejemplos: `ADESA`, `Sucursal 1`, `Almacén Central`
- Se sincronizan desde ADM Cloud API
- Representan el stock en el sistema contable

### Ubicaciones Físicas WMS (`stock_por_ubicacion`)
- Son las **ubicaciones físicas** dentro del almacén
- Nomenclatura: `2-P1-AD-N1` (Piso-Pasillo-Anaquel-Nivel)
- Se registran manualmente en el sistema WMS
- Representan dónde está físicamente el producto

---

## Índices de Base de Datos

### Para búsquedas rápidas:
- `usuarios.email` (único)
- `stock_por_ubicacion.sku` (índice)
- `stock_por_ubicacion.ubicacion` (índice)
- `movimientos.tipo` (índice)
- `movimientos.sku` (índice)
- `movimientos.factura_id` (índice)
- `movimientos.factura_guid` (índice)
- `movimientos.timestamp` (índice)
- `facturas_procesadas.factura_docid` (índice)
- `productos_adm.item_id` (único, índice)
- `productos_adm.sku` (índice)
- `productos_adm.codigo_barras` (índice)
- `stock_productos_adm.producto_id` (índice)

---

## Tamaño Estimado de Datos

- **Usuarios:** ~10-50 registros
- **Productos ADM:** ~1,000-5,000 productos
- **Stock Productos ADM:** ~5,000-20,000 registros (productos × ubicaciones ADM)
- **Stock por Ubicación:** ~1,000-10,000 registros (productos × ubicaciones físicas)
- **Movimientos:** Crecimiento continuo (historial completo)
- **Facturas Procesadas:** ~100-1,000 facturas activas
- **Pendientes Ubicación:** ~0-100 registros (temporal)

---

## Archivo de Base de Datos

- **Tipo:** SQLite
- **Ubicación:** `instance/wms.db` (o según configuración en `config.py`)
- **Tamaño estimado:** 10-50 MB para una instalación típica










