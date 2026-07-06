# Investigación: Paginación y Facturas en ADM Cloud API

## 🔍 Problema de Paginación

### Resultado de las Pruebas

El API de ADM Cloud **limita a 50 productos por petición**, independientemente del parámetro `skip`.

**Evidencia:**
- `skip=0` → Devuelve 50 productos
- `skip=50` → Devuelve 50 productos (diferentes, la paginación funciona)
- `skip=100` → Devuelve 50 productos

**Conclusión:**
- El límite máximo es **50 productos por petición**
- La paginación funciona correctamente usando `skip`
- Para obtener todos los productos, necesitamos hacer múltiples peticiones

---

## ✅ Solución Implementada

### Función `obtener_todos_los_productos()`

```python
def obtener_todos_los_productos():
    """Obtiene TODOS los productos usando paginación
    ADM Cloud limita a 50 productos por petición
    """
    todos_productos = []
    skip = 0
    batch_size = 50  # Límite de ADM Cloud
    
    while True:
        result = make_api_request("items/", {"skip": skip})
        productos = result["data"]
        
        if not productos or len(productos) == 0:
            break
        
        todos_productos.extend(productos)
        
        # Si recibimos menos de 50, ya no hay más
        if len(productos) < batch_size:
            break
        
        skip += batch_size
```

**Cómo funciona:**
- Hace peticiones de 50 en 50
- Para 4000 productos: ~80 peticiones
- Combina todos los resultados

---

## 📋 Endpoints de Ventas/Facturas Disponibles

Según el API Explorer, ADM Cloud tiene estos endpoints relacionados con ventas:

1. **SalesOrders** - Órdenes de venta
2. **CashInvoices** - Facturas de contado
3. **CreditInvoices** - Facturas a crédito
4. **CustomerCreditNotes** - Notas de crédito
5. **CustomerDebitNotes** - Notas de débito

---

## 🔍 Qué Podemos Hacer con Facturas

### Información que probablemente incluyen:

1. **Información de la factura:**
   - Número de factura
   - Fecha
   - Cliente
   - Total
   - Estado

2. **Líneas de productos (detalles):**
   - Producto (SKU, nombre)
   - Cantidad
   - Precio unitario
   - Subtotal
   - Descuentos
   - Impuestos

### Endpoints a Probar:

- `/api/SalesOrders/` - Ver órdenes de venta
- `/api/CashInvoices/` - Ver facturas de contado
- `/api/CreditInvoices/` - Ver facturas a crédito

---

## 🎯 Próximos Pasos

1. **Probar endpoints de facturas** para ver estructura
2. **Verificar si incluyen líneas de productos**
3. **Agregar funcionalidad** para consultar facturas en la interfaz




