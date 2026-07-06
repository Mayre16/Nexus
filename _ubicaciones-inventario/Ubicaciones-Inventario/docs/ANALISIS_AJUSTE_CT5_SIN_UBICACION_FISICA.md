# Análisis: Ajuste de Stock sin Ubicación Física (Producto CT-5)

**Producto:** Park Tool Llave Cadena #CT-5  
**SKU:** CT-5  
**ID:** 76ad64dc-7e8f-4759-4e54-08dd1ac8414f  

**Síntoma:** El sistema responde 200 OK al registrar un ajuste (9 unidades en TIENDA dentro de ADESA), pero al consultar el producto sigue mostrando "No hay stock registrado en ubicaciones físicas".

**Actualización (evidencia de red):** La respuesta real del backend fue:
```json
{
    "advertencia": "No se crearon movimientos",
    "message": "No se crearon movimientos. Verifica que haya diferencia entre el stock actual y el ajuste deseado.",
    "movimientos": [],
    "success": true,
    "total_movimientos": 0
}
```
Esto indica que **ningún movimiento fue creado** — el backend procesó la solicitud pero determinó que no había diferencia que registrar.

---

## 0. Causa raíz más probable (a partir de la respuesta)

Con `total_movimientos: 0`, el backend **no creó movimientos** porque para cada asignación calculó `diferencia = 0` (stock deseado = stock actual).

**Posibles escenarios que producen diferencia = 0:**

| Tipo asignación | Condición para diferencia = 0 |
|-----------------|--------------------------------|
| `tipo: 'fisica'` (TIENDA) | Ya existía `StockUbicacion` con cantidad 9 → no habría "sin ubicación física" |
| `tipo: 'adm'` (ADESA) | Cache ADM ya tiene 9 → diferencia 0 |
| **Solo se envió `tipo: 'adm'`** | Si el payload incluyó ADESA como ubicación ADM (9) y el cache ya tiene 9, no se crea movimiento. **Y no se toca `StockUbicacion`**, por eso sigue "sin ubicación física". |

**Conclusión (descartada):** El payload sí incluye correctamente `tipo: 'fisica'` con `ubicacion: "TIENDA"` y `cantidad: 9`. El frontend está enviando los datos bien. **La causa está en el backend.**

---

## 1. Flujo del sistema

### 1.1 Envío del formulario (frontend)

Cuando eliges ADESA con 9 unidades y agregas TIENDA con 9 unidades, el frontend envía:

```json
{
  "productos": [{
    "sku": "CT-5",
    "item_id": "76ad64dc-7e8f-4759-4e54-08dd1ac8414f",
    "asignaciones": [{
      "ubicacion": "TIENDA",
      "cantidad": 9,
      "tipo": "fisica",
      "location_id": "<location_id_de_adesa>"
    }]
  }],
  "notas": ""
}
```

**Importante:** Solo se envían asignaciones `tipo: 'fisica'` cuando ADESA está seleccionada. No se envía una asignación `tipo: 'adm'` para ADESA.

### 1.2 Procesamiento en el backend (POST /api/ajustes/registrar)

1. **Validación previa**  
   Para cada asignación `tipo='fisica'` se comprueba que la ubicación exista y esté activa:

   ```python
   ubicacion_fisica = UbicacionFisica.query.filter_by(
       codigo=ubicacion,  # ej: "TIENDA"
       activa=True
   ).first()
   ```

   - Si **no existe "TIENDA"** en `ubicaciones_fisicas` (o está inactiva) → **400** con mensaje:  
     `"La ubicación física 'TIENDA' no existe o está inactiva"`.

2. **Actualización de StockUbicacion**  
   Si la validación pasa:
   - Se crea o actualiza `StockUbicacion` (product_id, sku, ubicacion="TIENDA", cantidad=9).
   - Se crea un `Movimiento` tipo ADJUSTMENT.
   - Se hace `db.session.commit()`.

3. **Respuesta**  
   Si todo va bien → 200 con `success: true` y `total_movimientos >= 1`.

### 1.3 Consulta posterior (POST /api/ajustes/buscar-producto)

```python
stock_ubicaciones = StockUbicacion.query.filter_by(sku=producto_db.sku).all()
```

El `producto_db` viene de `ProductoADM` (cache local). Se filtra por `sku` del producto cacheado.

---

## 2. Posibles causas del problema

### A) Ubicación "TIENDA" no existe o está inactiva

Si "TIENDA" no está en `ubicaciones_fisicas` con `activa=True`, el backend debe responder **400**, no 200.

**Verificación:** Revisar que exista un registro con `codigo = 'TIENDA'` y `activa = True` en la tabla `ubicaciones_fisicas`.

### B) Diferencia de mayúsculas/minúsculas en SKU

- El frontend envía `sku` en mayúsculas (p. ej. `"CT-5"`).
- El backend guarda ese valor en `StockUbicacion.sku`.
- La consulta usa `producto_db.sku` desde `ProductoADM`.

Si en `ProductoADM` el SKU está guardado distinto (p. ej. `"ct-5"` vs `"CT-5"`), la consulta por `filter_by(sku=producto_db.sku)` puede no devolver filas, dependiendo del motor de base de datos y collation.

**Verificación:** Comprobar cómo está guardado el SKU en `ProductoADM` para este producto y si coincide con lo que se guarda en `StockUbicacion`.

### C) Producto no encontrado en cache (ProductoADM)

Si el producto no está en `ProductoADM`:
- La búsqueda para ajuste puede fallar antes de llegar al ajuste.
- O el backend podría usar otro origen (p. ej. ADM Cloud) y crear el registro con un `item_id` distinto.

**Verificación:** Asegurarse de que el producto CT-5 exista en `ProductoADM` con el mismo `item_id` y `sku` que se usan en el ajuste.

### D) Respuesta 200 por otra razón

Si se recibe 200 con `total_movimientos = 0`, el frontend muestra advertencia de "No se crearon movimientos", no un éxito claro.

**Verificación:** Revisar la respuesta completa de `/api/ajustes/registrar` (JSON) para ver:
- `success`
- `total_movimientos`
- `movimientos`

### E) Consulta desde otra página o con otro criterio

Si la consulta se hace en otra pantalla que use otro endpoint o filtros distintos, puede no reflejar el stock físico del ajuste.

**Verificación:** Confirmar que se está mirando exactamente la pantalla de ajustes y que se usa el producto buscado por SKU (CT-5).

---

## 3. Pasos de diagnóstico sugeridos

### Paso 1: Comprobar ubicación "TIENDA"

Consultar en la base de datos:

```sql
SELECT id, codigo, activa FROM ubicaciones_fisicas WHERE codigo = 'TIENDA';
```

Si no existe o `activa = 0`, hay que darla de alta o activarla.

### Paso 2: Revisar payload de la petición (crítico)

En DevTools → pestaña **Network**:

1. Filtrar por `registrar`.
2. Repetir el ajuste (ADESA + TIENDA 9).
3. Seleccionar la petición POST y abrir la pestaña **Payload** o **Request**.
4. Ver el JSON enviado, especialmente `productos[0].asignaciones`:
   - Si solo hay `tipo: 'adm'` (ej. ADESA, MIRADOR SUR) → el frontend no está enviando las ubicaciones físicas.
   - Si hay `tipo: 'fisica'` con `ubicacion: "TIENDA"` → el problema está en el backend (ubicación no existe o diferencia=0 por otra razón).

### Paso 3: Revisar respuesta de registrar

Ver la respuesta JSON: `success`, `total_movimientos`, `movimientos`. Si `total_movimientos: 0`, el backend no creó ningún cambio.

### Paso 4: Revisar stock físico en BD

Después del ajuste:

```sql
SELECT id, product_id, sku, ubicacion, cantidad 
FROM stock_por_ubicacion 
WHERE sku LIKE '%CT-5%' OR product_id = '76ad64dc-7e8f-4759-4e54-08dd1ac8414f';
```

Si hay filas aquí pero la UI dice "No hay stock registrado", el problema está en cómo se filtra o muestra la información en la consulta (por ejemplo, SKU o product_id).

### Paso 5: Revisar ProductoADM

```sql
SELECT id, item_id, sku, nombre 
FROM productos_adm 
WHERE sku LIKE '%CT-5%' OR item_id = '76ad64dc-7e8f-4759-4e54-08dd1ac8414f';
```

Confirmar que el `sku` y `item_id` son coherentes con lo que se envía en el ajuste.

---

## 4. Resumen

| Hipótesis | Qué revisar |
|-----------|-------------|
| **Payload sin tipo='fisica'** (más probable) | **Payload de la petición** en Network: verificar si `asignaciones` incluye `tipo: 'fisica'` con `ubicacion: "TIENDA"` |
| TIENDA no existe o está inactiva | Tabla `ubicaciones_fisicas` |
| Diferencia de mayúsculas/minúsculas en SKU | Campos `sku` en `productos_adm` y `stock_por_ubicacion` |
| Producto no en cache | Registro en `productos_adm` |
| Respuesta real del backend | Ya confirmada: `total_movimientos: 0` → no se crearon movimientos |
| Stock sí guardado | Registros en `stock_por_ubicacion` para ese producto |

**Estado del diagnóstico:** El payload es correcto. La causa raíz fue **inconsistencia de SKU**:
- `StockUbicacion` para TIENDA tenía `sku='CT5'` (sin guion)
- `ProductoADM` tiene `sku='CT-5'` (con guion)
- La consulta `filter_by(sku=producto_db.sku)` no encontraba la fila con `sku='CT5'`

**Corrección aplicada:** La consulta ahora usa `product_id` (item_id) en lugar de `sku`, evitando fallos por variaciones del SKU.

---

## 5. Causas probables en el backend (con payload correcto)

Con el payload correcto, el backend puede devolver `total_movimientos: 0` si:

| Causa | Qué ocurre |
|-------|------------|
| **"TIENDA" no existe o está inactiva** | La validación debería devolver 400. Si se recibe 200, TIENDA probablemente existe. |
| **"TIENDA" con distinta grafía en BD** | Si en `ubicaciones_fisicas` el `codigo` está como "Tienda" o "tienda" y el motor es case-sensitive, la búsqueda `codigo="TIENDA"` podría fallar en la consulta de procesamiento. |
| **StockUbicacion ya tenía 9** | Si ya existía fila (product_id, TIENDA, 9), `diferencia=0` y no se crea movimiento. Pero el registro existiría y la consulta debería mostrarlo. Contradice "sin ubicación física" salvo bug en la consulta (por ej. `sku` distinto). |
| **Problema de sesión/commit** | Menos probable; normalmente provocaría 500. |

**Siguiente paso (sin consola SQL):**

1. **Script Python** (Execute Python script en cPanel):
   ```
   scripts/diagnostico_ajuste_ct5_tienda.py
   ```
   El script consulta la BD y muestra si existe TIENDA y si hay stock para CT-5.

2. **Panel Admin en el navegador:**
   - Ir a **Admin** > **Ubicaciones Físicas**
   - Ver si "TIENDA" aparece en la lista. Si no está, hay que crearla.
   - El ajuste requiere que TIENDA exista con código exacto "TIENDA" y esté activa.
