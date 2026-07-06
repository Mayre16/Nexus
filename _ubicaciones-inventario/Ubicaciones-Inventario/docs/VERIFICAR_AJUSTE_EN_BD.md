# VERIFICAR AJUSTE EN BASE DE DATOS

## Consulta SQL para verificar si se creó el movimiento

### 1. Ver movimientos de ajuste recientes

```sql
SELECT 
    id,
    tipo,
    sku,
    ubicacion_origen,
    ubicacion_destino,
    cantidad,
    timestamp,
    notas,
    usuario_id
FROM movimientos
WHERE tipo = 'ADJUSTMENT'
  AND sku = 'VP1'
  AND (ubicacion_origen LIKE '%MIRADOR SUR%' OR ubicacion_destino LIKE '%MIRADOR SUR%')
ORDER BY timestamp DESC
LIMIT 10;
```

### 2. Ver movimientos de ajuste del último día

```sql
SELECT 
    id,
    tipo,
    sku,
    ubicacion_origen,
    ubicacion_destino,
    cantidad,
    timestamp,
    notas
FROM movimientos
WHERE tipo = 'ADJUSTMENT'
  AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY timestamp DESC;
```

### 3. Verificar stock actual en cache ADM

```sql
SELECT 
    sp.id,
    p.sku,
    p.nombre,
    sp.location_name,
    sp.location_id,
    sp.stock,
    sp.updated_at
FROM stock_productos_adm sp
JOIN productos_adm p ON sp.producto_id = p.id
WHERE p.sku = 'VP1'
  AND sp.location_name = 'MIRADOR SUR';
```

### 4. Ver todos los movimientos de ajuste para VP1

```sql
SELECT 
    m.id,
    m.tipo,
    m.sku,
    m.ubicacion_origen,
    m.ubicacion_destino,
    m.cantidad,
    m.timestamp,
    m.notas,
    u.nombre as usuario
FROM movimientos m
LEFT JOIN usuarios u ON m.usuario_id = u.id
WHERE m.tipo = 'ADJUSTMENT'
  AND m.sku = 'VP1'
ORDER BY m.timestamp DESC;
```

---

## Qué buscar

### Si el ajuste se creó correctamente:
- Deberías ver un registro con:
  - `tipo = 'ADJUSTMENT'`
  - `sku = 'VP1'`
  - `ubicacion_origen = 'MIRADOR SUR'` (o similar)
  - `ubicacion_destino = NULL` (porque diferencia < 0)
  - `cantidad = 44` (o el valor que tenía antes)
  - `timestamp` reciente (fecha/hora del ajuste)

### Si el ajuste NO se creó:
- No habrá registro nuevo con `tipo = 'ADJUSTMENT'` y `ubicacion_origen = 'MIRADOR SUR'`
- Esto significa que:
  - O no se encontró el stock (`stock_adm_actual = 0`)
  - O la diferencia fue 0 (`diferencia = 0`)
  - O hubo un error que no se reportó

---

## Ejecutar en cPanel

1. Ve a **phpMyAdmin** o **MySQL Databases**
2. Selecciona la base de datos de tu WMS
3. Ve a la pestaña **SQL**
4. Ejecuta las consultas anteriores
5. **Copia y pega aquí los resultados**

Esto nos dirá exactamente qué está pasando en la base de datos.








