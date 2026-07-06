# DE DÓNDE SACA EL STOCK LA PANTALLA DE AJUSTES

## FUENTE DE DATOS

La pantalla de "Ajustes de Inventario" obtiene la información de stock desde:

### 1. **Tabla: `stock_productos_adm`** (Cache ADM)

Esta es una tabla de **cache local** que almacena el stock de productos por ubicación ADM (macros).

**Ubicación en código:**
- Modelo: `database/models.py` - Clase `StockProductoADM`
- Tabla SQL: `stock_productos_adm`

**Estructura de la tabla:**
```sql
- id (PK)
- producto_id (FK a productos_adm.id)
- location_id (GUID de ubicación ADM, ej: "df40f1ef-92f8-43f2-6166-08de3d0fa411")
- location_name (Nombre de ubicación, ej: "MIRADOR SUR", "ADESA")
- stock (Cantidad, ej: 44.0)
- updated_at (Fecha de última actualización)
```

---

## FLUJO DE DATOS

### Paso 1: Sincronización desde ADM Cloud

**Ubicación:** `routes/sincronizar.py`

Cuando ejecutas "Sincronizar Productos" desde el Panel de Administración:

1. Se conecta a ADM Cloud API
2. Obtiene el stock por ubicación desde `/api/Stock`
3. **Actualiza o crea registros en `stock_productos_adm`**
4. Guarda `location_name`, `location_id`, `stock`, y `updated_at`

**Ejemplo:**
```python
# En sincronizar.py
stock_adm = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    location_id=location_id
).first()

if stock_adm:
    stock_adm.stock = stock_cantidad
    stock_adm.updated_at = datetime.utcnow()
else:
    stock_adm = StockProductoADM(
        producto_id=producto_db.id,
        location_id=location_id,
        location_name=location_name,
        stock=stock_cantidad
    )
    db.session.add(stock_adm)
```

---

### Paso 2: Consulta en Ajustes

**Ubicación:** `routes/ajustes.py` línea 542

Cuando buscas un producto en "Ajustes de Inventario":

1. Busca el producto en `productos_adm` (cache de catálogo)
2. **Consulta `stock_productos_adm`** para obtener el stock por ubicación:
   ```python
   stock_ubicaciones_adm = StockProductoADM.query.filter_by(
       producto_id=producto_db.id
   ).all()
   ```
3. Filtra solo ubicaciones con `stock > 0`
4. Calcula el total sumando todos los stocks
5. Obtiene la fecha de actualización más reciente
6. Devuelve esta información al frontend

**Respuesta JSON:**
```json
{
  "stock_adm": {
    "total": 904.00,
    "ubicaciones": [
      {
        "nombre": "ADESA",
        "id": "...",
        "stock": 860.00,
        "updated_at": "2026-01-23T03:39:00"
      },
      {
        "nombre": "MIRADOR SUR",
        "id": "...",
        "stock": 44.00,
        "updated_at": "2026-01-23T03:39:00"
      }
    ],
    "fecha_actualizacion": "2026-01-23T03:39:00"
  }
}
```

---

### Paso 3: Visualización en Frontend

**Ubicación:** `templates/ajustes.html` líneas 581-602

El frontend recibe la información y la muestra:

```javascript
// Muestra:
// - Cantidad Total: 904.00
// - Última Actualización: 23/01/2026, 03:39 a. m.
// - Distribución por Ubicación ADM:
//   - ADESA: 860.00
//   - MIRADOR SUR: 44.00
```

---

## IMPORTANTE

### ✅ Es una CACHE (no se modifica desde Ajustes)

**Regla de Oro:** El stock ADM (`StockProductoADM`) **NO se modifica** cuando haces un ajuste.

**Razón:** Este stock viene de ADM Cloud y se sincroniza periódicamente. Si lo modificáramos localmente, se perdería en la próxima sincronización.

**Lo que SÍ hace el ajuste:**
- Crea un **movimiento de auditoría** en la tabla `movimientos`
- **NO modifica** `stock_productos_adm`
- El ajuste es solo para **registro/auditoría**, no para cambiar el stock ADM

---

## CUÁNDO SE ACTUALIZA EL STOCK ADM

El stock en `stock_productos_adm` se actualiza **SOLO cuando:**

1. **Sincronizas productos** desde el Panel de Administración
2. La sincronización consulta ADM Cloud API (`/api/Stock`)
3. Actualiza los valores en la cache local

**NO se actualiza cuando:**
- ❌ Haces un ajuste
- ❌ Haces una recepción
- ❌ Haces una transferencia
- ❌ Haces un despacho

---

## RESUMEN

```
ADM Cloud API (/api/Stock)
    ↓
[Sincronización] → Actualiza cache local
    ↓
stock_productos_adm (tabla)
    ↓
[Consulta en Ajustes] → Lee de cache
    ↓
Pantalla de Ajustes → Muestra stock ADM
```

**La pantalla muestra el stock que está en la cache local, que fue sincronizado desde ADM Cloud.**








