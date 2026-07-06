# Resumen de Entendimiento del Proyecto WMS

## 🎯 Mi Entendimiento

### **Objetivo Principal**
Crear un sistema WMS (Warehouse Management System) que se integre con ADM Cloud para gestionar la **ubicación física** de productos dentro del almacén, facilitando el despacho y las transferencias internas.

### **Arquitectura de Datos**
- **ADM Cloud** = Fuente de verdad para:
  - Inventario total (cantidades generales)
  - Facturas y pedidos de venta
  - Productos (catálogo)
  - Stock por ubicación/sucursal (a nivel ADM)

- **WMS** = Fuente de verdad para:
  - Ubicaciones internas del almacén (ej: `P2-P1-AR-N1`, `P2-P1-AR-N2`)
  - Distribución de productos por ubicación interna
  - Movimientos internos (picking, transferencias)

### **Regla de Oro**
```
Stock Total ADM = Suma de Stock en todas las ubicaciones WMS
```

Si ADM dice "hay 50 unidades de producto X", el WMS debe tener esas 50 unidades distribuidas en ubicaciones internas (ej: 25 en `P2-P1-AR-N1` y 25 en `P2-P1-AR-N2`).

---

## ✅ Lo que Ya Funciona (Verificado con API)

### 1. **Conexión a ADM Cloud** ✅
- Autenticación Basic Auth funcionando
- Endpoints principales responden correctamente
- Paginación manejada (50 items por petición)

### 2. **Consulta de Facturas** ✅
- Listar facturas de contado (`CashInvoices`)
- Listar facturas a crédito (`CreditInvoices`)
- Listar pedidos (`SalesOrders`)
- Buscar factura por número (DocID) → obtener GUID
- Obtener factura completa por GUID
- **✅ OBTENER PRODUCTOS DE UNA FACTURA** (`data.Items` contiene: RowOrder, ItemSKU, ItemID, Name, Quantity, Price, Extended)

### 3. **Consulta de Productos** ✅
- Listar productos (`Items`)
- Buscar producto por SKU
- Obtener detalle de producto por ItemID

### 4. **Consulta de Stock** ✅
- Stock total (`/api/Stock`)
- Stock por ubicación/sucursal (`/api/Stock?LocationID={ID}`)
- Filtrar por SKU en aplicación

### 5. **Consulta de Ubicaciones** ✅
- Listar ubicaciones/sucursales (`/api/Locations`)
- Identificar ubicación específica (ej: "ADESA")

---

## 🚀 Flujo Principal del Sistema (Cómo Funciona)

### **Escenario 1: Despacho de Factura**

```
1. ADM Cloud genera factura #00002932 con 3 productos:
   - SKU "ABC123", cantidad 5
   - SKU "XYZ789", cantidad 10
   - SKU "DEF456", cantidad 2

2. Despachador abre WMS e ingresa: "00002932"

3. WMS consulta ADM Cloud:
   → Busca factura por DocID "00002932"
   → Obtiene GUID de la factura
   → Consulta factura completa: /api/CashInvoices/{GUID}
   → Extrae data.Items (los 3 productos)

4. WMS muestra en pantalla:
   ┌─────────────────────────────────┐
   │ Factura: 00002932               │
   │ Cliente: Bikestudio Fa Srl      │
   │                                  │
   │ Productos a despachar:          │
   │ 1. ABC123 - Cantidad: 5         │
   │ 2. XYZ789 - Cantidad: 10        │
   │ 3. DEF456 - Cantidad: 2         │
   └─────────────────────────────────┘

5. Para cada producto, despachador:
   a) Escanea ubicación: "P2-P1-AR-N1"
   b) Escanea SKU: "ABC123"
   c) Ingresa cantidad: 5
   
6. WMS valida:
   ✅ El SKU corresponde a la factura
   ✅ Hay al menos 5 unidades en ubicación P2-P1-AR-N1
   ✅ El producto no fue ya despachado

7. WMS registra:
   → Movimiento tipo PICK
   → Descuesta 5 unidades de P2-P1-AR-N1
   → Actualiza estado del despacho

8. Cuando todos los productos están completos:
   → Factura marcada como COMPLETA
   → WMS sincroniza con ADM (opcional, dependiendo de si ADM se actualiza automáticamente)
```

### **Escenario 2: Reconciliación de Stock**

```
1. WMS calcula stock total WMS:
   Producto ABC123:
   - P2-P1-AR-N1: 15 unidades
   - P2-P1-AR-N2: 10 unidades
   - P2-P1-AR-N3: 5 unidades
   Total WMS: 30 unidades

2. WMS consulta ADM Cloud:
   GET /api/Stock?LocationID={ADESA_ID}&...SKU=ABC123
   → Stock ADM: 30 unidades

3. WMS compara:
   ADM: 30
   WMS: 30
   Diferencia: 0 ✅ (todo cuadra)

Si hubiera diferencia:
   ADM: 30
   WMS: 28
   Diferencia: 2 ⚠️ (alerta: faltan 2 unidades)
```

---

## 📋 Lo que Necesito para Desarrollar

### **1. Confirmaciones Técnicas**

✅ **Ya confirmado**:
- API de ADM Cloud funciona
- Podemos obtener productos de facturas
- Podemos consultar stock por ubicación

❓ **Pendiente de confirmar** (opcional, no bloqueante):
- Endpoint `/api/Bins` (ubicaciones internas en ADM)
- Endpoint `/api/BinTransfers` (transferencias entre bins)
- Endpoint `/api/Dispatches` (despachos)
- Endpoint `/api/InventoryAdjustments` (ajustes)

### **2. Requisitos Funcionales**

✅ **Claramente definidos**:
- Buscar factura por número
- Mostrar productos de factura
- Escanear ubicación + producto
- Registrar movimientos
- Reconciliación ADM vs WMS

❓ **Por confirmar**:
- ¿Cómo se escanearán los códigos? (QR, código de barras, manual)
- ¿Se requiere impresión de etiquetas?
- ¿Frecuencia de sincronización con ADM? (tiempo real, cada hora, diario)
- ¿Cómo se manejarán los lotes/serializados?

### **3. Infraestructura**

✅ **Confirmado**:
- Desarrollo local: Python + Flask (ya funcionando)
- Producción: CPanel con Python App

✅ **Necesario**:
- Base de datos: SQLite (desarrollo) / MySQL (CPanel)
- Variables de entorno para credenciales ADM Cloud
- Configuración de CPanel (passenger_wsgi.py o similar)

---

## 🏗️ Plan de Desarrollo (Fases)

### **Fase 1: Estructura Base y Configuración** (Actual)
- ✅ Documentación de requisitos
- ⏳ Estructura de carpetas
- ⏳ Configuración Flask para CPanel
- ⏳ Modelos de base de datos
- ⏳ Cliente API ADM Cloud mejorado

### **Fase 2: Autenticación y Usuarios**
- Sistema de login
- Gestión de usuarios y roles
- Sesiones

### **Fase 3: Consulta de Facturas**
- Búsqueda de factura por DocID
- Visualización de productos de factura
- Cache local de facturas

### **Fase 4: Sistema de Picking (Despacho)**
- Interfaz de picking
- Escaneo de ubicación + producto
- Validaciones y registro de movimientos
- Actualización de stock por ubicación

### **Fase 5: Gestión de Stock Local**
- Tabla de stock por ubicación
- Funciones de consulta y actualización
- Búsqueda rápida de productos

### **Fase 6: Transferencias Internas**
- Transferir entre ubicaciones
- Validaciones de stock
- Registro de movimientos

### **Fase 7: Reconciliación**
- Vista de reconciliación ADM vs WMS
- Alertas de diferencias
- Sincronización automática

### **Fase 8: Dashboard y Alertas**
- Panel de control
- Facturas pendientes
- Alertas de stock y diferencias

---

## 🎨 Consideraciones de Diseño

### **Interfaz de Usuario**
- **Diseño**: Simple, claro, funcional
- **Responsive**: Funciona en móvil/tablet
- **Accesibilidad**: Botones grandes, colores contrastantes
- **Feedback**: Confirmaciones visuales inmediatas

### **Rendimiento**
- Cache de productos frecuentes
- Paginación en listados grandes
- Consultas optimizadas a BD
- Índices en base de datos

### **Seguridad**
- Credenciales en variables de entorno
- Contraseñas hasheadas (bcrypt)
- Validación de entrada
- Protección CSRF

---

## ✅ Confirmación Final

Entiendo que este es un proyecto **funcional y práctico** enfocado en:
1. **Facilitar el despacho** (despachador sabe qué sacar y dónde)
2. **Controlar ubicaciones** (saber dónde está cada producto)
3. **Mantener sincronización** con ADM Cloud (stock total)

El sistema debe ser:
- ✅ Rápido
- ✅ Fácil de usar
- ✅ Confiable
- ✅ Escalable (5000+ productos, multiusuario)

---

## 📝 Próximo Paso

**¿Confirmas que mi entendimiento es correcto?**

Si es así, procederé a:
1. Crear la estructura base del proyecto
2. Configurar Flask para funcionar en CPanel
3. Implementar los modelos de base de datos
4. Crear el cliente mejorado de ADM Cloud API
5. Desarrollar las primeras funcionalidades (login, búsqueda de facturas)



