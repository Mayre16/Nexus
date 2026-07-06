# Solicitud de Información - API REST ADM Cloud

**Asunto:** Consulta sobre funcionalidades del API REST para obtener líneas de productos de facturas y pedidos

---

Estimado equipo de soporte de ADM Cloud:

Estamos desarrollando un sistema de gestión de almacenes (WMS - Warehouse Management System) que se integrará con ADM Cloud mediante su API REST para optimizar nuestros procesos de despacho.

## Objetivo del Proyecto

Nuestro objetivo es crear un sistema complementario que:

1. **Detecte ventas pendientes de despacho**: Monitorear facturas (CashInvoices/CreditInvoices) y pedidos (SalesOrders) que requieren despacho de productos.

2. **Muestre los productos a despachar**: Presentar al despachador una lista detallada de productos (SKU, descripción, cantidades) que deben ser preparados para cada venta.

3. **Gestione ubicaciones de almacén**: Registrar y consultar dónde se encuentran físicamente los productos en nuestro almacén, facilitando la búsqueda y el picking.

4. **Integración con ADM Cloud**: El sistema WMS utilizará ADM Cloud como fuente de verdad para las ventas y el inventario total, mientras que nuestro sistema gestionará la distribución física de productos por ubicaciones dentro del almacén.

## Situación Actual

Hemos logrado establecer conexión exitosa con el API REST de ADM Cloud y podemos:

- ✅ Listar y consultar productos (Items)
- ✅ Listar facturas de contado (CashInvoices)
- ✅ Listar facturas a crédito (CreditInvoices)
- ✅ Listar pedidos de venta (SalesOrders)
- ✅ Ver información del encabezado de facturas y pedidos (cliente, total, fecha, estado de despacho, etc.)

## Necesidad Específica

Sin embargo, para completar nuestro objetivo, necesitamos acceder a las **líneas de detalle de productos** que componen cada factura o pedido. Específicamente necesitamos:

- Los productos (Items) incluidos en cada factura/pedido
- Las cantidades de cada producto
- Códigos SKU o identificadores de productos
- Descripciones de productos
- Precios unitarios (opcional, para validación)

## Consultas

Por favor, ¿podrían confirmarnos si el API REST de ADM Cloud permite:

1. **Obtener las líneas de productos de facturas de contado (CashInvoices)**:
   - ¿Existe un endpoint que devuelva los productos incluidos en una factura específica?
   - ¿El endpoint `/api/CashInvoices/{ID}` incluye las líneas de productos en su respuesta?
   - ¿Existe algún endpoint adicional como `/api/CashInvoiceLines/` o similar?

2. **Obtener las líneas de productos de facturas a crédito (CreditInvoices)**:
   - ¿Las facturas a crédito tienen la misma estructura que las de contado?
   - ¿Qué endpoint utilizar para obtener sus líneas de productos?

3. **Obtener las líneas de productos de pedidos (SalesOrders)**:
   - ¿Podemos obtener los productos incluidos en un pedido de venta?
   - ¿Qué endpoint utilizar para este propósito?

4. **Documentación adicional**:
   - ¿Existe documentación específica sobre cómo obtener líneas de documentos?
   - ¿Hay ejemplos de código o casos de uso similares?

## Información Técnica

- **Integración ID (AppID)**: `cccdf964-1e69-46e7-5ed0-08de4e33921f`
- **Empresa**: `7b5f2222-123e-4dc7-a783-2979ea9e6cff`
- **Rol**: `Administradores`
- **API Base**: `https://api.admcloud.net/api/`

## Resultados Esperados

Si el API soporta estas funcionalidades, procederemos con la implementación de nuestro sistema WMS. Si no están disponibles, nos ayudaría conocer:

- ¿Están planificadas estas funcionalidades para futuras versiones del API?
- ¿Existe alguna alternativa o workaround recomendado?
- ¿Sería posible considerar estas funcionalidades como parte de una solicitud de mejora del API?

Agradecemos de antemano su apoyo y quedamos a la espera de su respuesta.

---

**Contacto:**
- Email: luis.useche@adesa.com.do
- Empresa: ADESA

---

**Nota:** Adjuntamos como referencia, imágenes de ejemplos de nuestros documentos (Pedido y Factura) para ilustrar el tipo de información que necesitamos obtener mediante el API.




