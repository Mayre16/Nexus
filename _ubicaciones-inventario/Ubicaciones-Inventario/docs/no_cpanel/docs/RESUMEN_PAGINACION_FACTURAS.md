# Resumen: Paginación y Facturas

## ✅ Confirmación sobre Paginación

**ADM Cloud limita a 50 productos por petición**

Evidencia de las pruebas:
- `skip=0` → Devuelve 50 productos
- `skip=50` → Devuelve 50 productos (diferentes)
- `skip=100` → Devuelve 50 productos

**Conclusión:**
- El límite es **50 productos máximo por petición**
- La paginación funciona correctamente con `skip`
- Para obtener todos los productos, necesitamos hacer múltiples peticiones de 50 en 50

**Solución implementada:**
- Función `obtener_todos_los_productos()` ajustada a `batch_size = 50`
- Hace múltiples peticiones hasta obtener todos
- Para 4000 productos = ~80 peticiones

---

## 📋 Facturas/Ventas Disponibles

### Endpoints que Funcionan:

1. **SalesOrders** (`/api/SalesOrders/`)
   - Órdenes de venta
   - Status: ✅ Funciona (200 OK)
   - Límite: 50 por petición (igual que Items)

2. **CashInvoices** (`/api/CashInvoices/`)
   - Facturas de contado
   - Status: ✅ Funciona (200 OK)
   - Límite: 50 por petición

3. **CreditInvoices** (`/api/CreditInvoices/`)
   - Facturas a crédito
   - Status: ✅ Funciona (200 OK)
   - Límite: 50 por petición

### Estructura de las Facturas:

Los objetos de factura incluyen:
- **ID**: Identificador único
- **DocID**: Número de documento (ej: "00002925")
- **NCF**: Número de comprobante fiscal
- **RelationshipName**: Nombre del cliente
- **TotalAmount**: Total de la factura
- **TaxAmount**: Impuestos
- **DocDate**: Fecha de la factura
- **LocationID/LocationName**: Ubicación

**⚠️ NOTA:** No veo campos de "Lines" o "Items" en el objeto principal de la factura.

### Para Ver los Productos de una Factura:

Probablemente se necesite:
1. Obtener el ID de la factura
2. Hacer una petición adicional a `/api/CashInvoices/{ID}` para obtener los detalles
3. O usar un endpoint separado para las líneas

---

## 🔍 Próximos Pasos Sugeridos

1. **Probar endpoint de detalles:**
   - `/api/CashInvoices/{ID}` (reemplazar {ID} con un ID real)
   - Ver si devuelve las líneas de productos

2. **Revisar documentación del API Explorer:**
   - Ver si hay endpoints específicos para líneas de factura
   - Buscar endpoints como "InvoiceLines" o similares

3. **Agregar funcionalidad a la interfaz:**
   - Listar facturas
   - Ver detalles de una factura específica
   - Mostrar productos de una factura




