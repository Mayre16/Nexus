# Requisitos de Desarrollo - Sistema WMS (Warehouse Management System)

## 📋 Resumen Ejecutivo

**Objetivo**: Desarrollar un sistema WMS (Warehouse Management System) que se integre con ADM Cloud para gestionar la ubicación física de productos en el almacén, optimizando los procesos de despacho y transferencias internas.

**Fase Actual**: Levantamiento de información y desarrollo inicial (MVP)

**Plataforma de Despliegue**: CPanel (producción) + Local (pruebas)

---

## ✅ Condiciones de Éxito del Sistema

El sistema se considera exitoso si:

1. ✅ **Despachador puede abrir una factura** y el WMS le indica **qué productos sacar**
2. ✅ **Escanear ubicación + producto** desde el teléfono/móvil
3. ✅ **Evita errores** (factura repetida, factura incompleta, productos no encontrados)
4. ✅ **Stock WMS siempre cuadra con stock ADM ADESA** (reconciliación automática)
5. ✅ **Permite transferencias internas** hacia sucursal/consignación
6. ✅ **Rápido con 5000+ productos** y multiusuario concurrente

---

## 🔌 Pasos de API Ya Verificados (ADM Cloud)

### ✅ Conexión y Autenticación
- **Endpoint**: `GET /api/Items`
- **Autenticación**: Basic Auth (email:password)
- **Parámetros**: `appid`, `company`, `role`
- **Estado**: ✅ Funcional

### ✅ Consulta de Facturas
- **Endpoints**: 
  - `GET /api/CashInvoices` (Facturas de contado)
  - `GET /api/CreditInvoices` (Facturas a crédito)
  - `GET /api/SalesOrders` (Pedidos)
- **Funcionalidades confirmadas**:
  - Listar facturas/pedidos ✅
  - Obtener factura específica por ID (GUID) ✅
  - Buscar factura por DocID (número) ✅
  - **Obtener líneas de productos de una factura** (`data.Items`) ✅
- **Estado**: ✅ Funcional

### ✅ Consulta de Productos
- **Endpoint**: `GET /api/Items/{ItemID}`
- **Funcionalidades confirmadas**:
  - Obtener información completa del producto ✅
  - Buscar por SKU ✅
  - Paginación (50 productos por petición) ✅
- **Estado**: ✅ Funcional

### ✅ Consulta de Stock
- **Endpoints**:
  - `GET /api/Stock` (Stock total)
  - `GET /api/Stock?LocationID={ID}` (Stock por ubicación)
- **Funcionalidades confirmadas**:
  - Consultar stock total ✅
  - Consultar stock por ubicación específica ✅
  - Filtrar por SKU en aplicación ✅
- **Estado**: ✅ Funcional

### ✅ Consulta de Ubicaciones
- **Endpoint**: `GET /api/Locations`
- **Funcionalidades confirmadas**:
  - Listar todas las ubicaciones/sucursales ✅
  - Identificar ubicación "ADESA" por nombre ✅
- **Estado**: ✅ Funcional

### 🔍 Endpoints Adicionales Identificados (No probados aún)
- `GET /api/Bins` - Ubicaciones internas (bins/racks)
- `GET /api/BinTransfers` - Transferencias entre bins
- `GET /api/LocationTransfers` - Transferencias entre sucursales
- `GET /api/Dispatches` - Despachos
- `GET /api/InventoryAdjustments` - Ajustes de inventario
- `GET /api/Receptions` - Recepciones de compra

---

## 🎯 Funcionalidades del Sistema WMS (MVP)

### 1. **Gestión de Usuarios y Autenticación**
- Login con usuario y contraseña
- Roles: Despachador, Almacenista, Administrador
- Sesiones persistentes

### 2. **Consulta de Facturas desde ADM Cloud**
- Buscar factura por número (DocID): `00002932`
- Ver información de factura: cliente, fecha, total, estado
- **Mostrar productos de la factura**: SKU, nombre, cantidad, precio
- Listar facturas pendientes de despacho
- Filtrar por: fecha, cliente, estado de despacho

### 3. **Sistema de Picking (Despacho)**
- **Pantalla principal**: Despachador ingresa número de factura
- **Lista de productos**: WMS muestra qué productos sacar (desde `data.Items` de la factura)
- **Escaneo de productos**:
  - Escanear ubicación (ej: `P2-P1-AR-N1`)
  - Escanear producto (SKU)
  - Validar que el producto corresponde a la factura
  - Validar que hay stock suficiente en esa ubicación
  - Registrar movimiento de salida
- **Estado del despacho**: Por producto, por factura (Completo/Parcial/Pendiente)
- **Validaciones**:
  - Evitar despacho duplicado
  - Validar que todas las cantidades estén completas
  - Alertar si hay diferencias de stock

### 4. **Gestión de Stock por Ubicación (Base de Datos Local)**
- **Tabla**: `stock_por_ubicacion`
  - `product_id` (ItemID de ADM)
  - `sku` (SKU del producto)
  - `ubicacion` (código de ubicación: `P2-P1-AR-N1`)
  - `cantidad` (cantidad en esa ubicación)
  - `updated_at` (última actualización)
- **Sincronización con ADM Cloud**:
  - Stock total ADM = Suma de stock en todas las ubicaciones del WMS
  - Reconciliación periódica
  - Alertas de diferencias

### 5. **Sistema de Movimientos**
- **Tabla**: `movimientos`
  - `tipo`: RECEIPT (entrada), PICK (despacho), TRANSFER (transferencia), ADJUSTMENT (ajuste)
  - `product_id`, `sku`
  - `ubicacion_origen`, `ubicacion_destino`
  - `cantidad`
  - `factura_id` (si aplica)
  - `usuario_id`
  - `timestamp`
  - `notas`
- **Historial completo** de todos los movimientos

### 6. **Transferencias Internas**
- Transferir productos entre ubicaciones
- Transferir productos a sucursales (LocationTransfers en ADM)
- Validar stock antes de transferir
- Registrar movimiento

### 7. **Asignación de Ubicaciones (Recepción)**
- **Funcionalidad futura**: Cuando llegue mercancía nueva, asignar ubicación
- **Tabla**: `pendientes_ubicacion`
  - `product_id`, `sku`, `cantidad`
  - `referencia_compra` (PurchaseOrder)
  - `status`: PENDIENTE, ASIGNADA

### 8. **Reconciliación ADM Cloud vs WMS**
- **Vista de reconciliación**:
  - Stock total ADM (desde `/api/Stock?LocationID=ADESA`)
  - Stock total WMS (suma de todas las ubicaciones)
  - Diferencia (ADM - WMS)
  - Productos con diferencias
- **Alertas automáticas** cuando hay diferencias significativas

### 9. **Búsqueda Rápida de Productos**
- Buscar por SKU
- Ver ubicación actual del producto
- Ver cantidad disponible
- Ver histórico de movimientos

### 10. **Dashboard y Alertas**
- Facturas pendientes de despacho
- Productos sin ubicación asignada
- Diferencias de stock (ADM vs WMS)
- Alertas de stock bajo

---

## 🏗️ Arquitectura Técnica

### **Stack Tecnológico**
- **Backend**: Python + Flask
- **Base de Datos**: SQLite (desarrollo) / MySQL (producción CPanel)
- **Frontend**: HTML, CSS, JavaScript (Vanilla o jQuery ligero)
- **APIs**: ADM Cloud REST API
- **Despliegue**: CPanel con Python App (cPanel Python Selector)

### **Estructura de Carpetas**
```
wms/
├── app.py                 # Aplicación Flask principal
├── config.py             # Configuración (desarrollo/producción)
├── requirements.txt      # Dependencias Python
├── database/
│   ├── models.py         # Modelos SQLAlchemy
│   ├── database.py       # Configuración de BD
│   └── migrations/       # Migraciones de BD
├── api/
│   ├── adm_cloud.py      # Cliente API ADM Cloud
│   └── endpoints.py      # Endpoints internos
├── routes/
│   ├── auth.py           # Autenticación
│   ├── despacho.py       # Módulo de despacho
│   ├── transferencias.py # Transferencias
│   └── dashboard.py      # Dashboard
├── templates/
│   ├── base.html         # Template base
│   ├── login.html
│   ├── despacho.html
│   ├── factura.html
│   └── ...
├── static/
│   ├── css/
│   ├── js/
│   └── images/
└── utils/
    ├── validaciones.py
    └── helpers.py
```

### **Base de Datos (Esquema Inicial)**
```sql
-- Usuarios
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    rol VARCHAR(50), -- 'despachador', 'almacenista', 'administrador'
    activo BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock por Ubicación
CREATE TABLE stock_por_ubicacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id VARCHAR(100), -- ItemID de ADM Cloud
    sku VARCHAR(100),
    ubicacion VARCHAR(50), -- Ej: 'P2-P1-AR-N1'
    cantidad DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, ubicacion)
);

-- Movimientos
CREATE TABLE movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo VARCHAR(20), -- 'RECEIPT', 'PICK', 'TRANSFER', 'ADJUSTMENT'
    product_id VARCHAR(100),
    sku VARCHAR(100),
    ubicacion_origen VARCHAR(50),
    ubicacion_destino VARCHAR(50),
    cantidad DECIMAL(10,2),
    factura_id VARCHAR(100), -- DocID o GUID de ADM
    usuario_id INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notas TEXT,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);

-- Facturas Procesadas (cache local)
CREATE TABLE facturas_procesadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_docid VARCHAR(50),
    factura_guid VARCHAR(100) UNIQUE,
    tipo_factura VARCHAR(20), -- 'CASH', 'CREDIT', 'ORDER'
    cliente VARCHAR(200),
    fecha TIMESTAMP,
    total DECIMAL(10,2),
    estado_despacho VARCHAR(20), -- 'PENDIENTE', 'EN_PROCESO', 'COMPLETO'
    usuario_despachador INTEGER,
    completed_at TIMESTAMP,
    FOREIGN KEY(usuario_despachador) REFERENCES usuarios(id)
);

-- Índices para rendimiento
CREATE INDEX idx_stock_sku ON stock_por_ubicacion(sku);
CREATE INDEX idx_stock_ubicacion ON stock_por_ubicacion(ubicacion);
CREATE INDEX idx_movimientos_factura ON movimientos(factura_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(timestamp);
```

---

## 🔄 Flujos Principales

### **Flujo 1: Despacho de Factura**
1. Despachador ingresa número de factura (DocID): `00002932`
2. WMS consulta ADM Cloud: `/api/CashInvoices?skip=0&...`
3. Filtra por DocID para obtener GUID
4. Consulta factura completa: `/api/CashInvoices/{GUID}`
5. Extrae `data.Items` (productos de la factura)
6. **Pantalla de picking**: Muestra lista de productos con cantidades
7. Para cada producto:
   - Despachador escanea ubicación: `P2-P1-AR-N1`
   - Despachador escanea SKU del producto
   - WMS valida:
     - El SKU corresponde a la factura
     - Hay stock suficiente en esa ubicación
     - El producto no fue ya despachado (evitar duplicados)
   - WMS registra movimiento tipo PICK
   - WMS descuenta stock de esa ubicación
8. Cuando todas las cantidades están completas, marca factura como COMPLETA

### **Flujo 2: Sincronización de Stock**
1. WMS calcula stock total WMS = Suma de todas las ubicaciones
2. WMS consulta ADM Cloud: `/api/Stock?LocationID={ADESA_ID}`
3. Compara:
   - Stock ADM = `X`
   - Stock WMS = `Y`
   - Diferencia = `X - Y`
4. Si diferencia > umbral, genera alerta
5. Muestra vista de reconciliación

### **Flujo 3: Transferencia Interna**
1. Usuario selecciona producto y ubicación origen
2. Usuario ingresa ubicación destino
3. Usuario ingresa cantidad
4. WMS valida stock disponible
5. WMS registra movimiento tipo TRANSFER
6. WMS actualiza stock:
   - Resta de ubicación origen
   - Suma a ubicación destino

---

## 📱 Consideraciones para Móvil/Tablet

- Diseño responsive (funciona en móvil)
- Escaneo de códigos QR/códigos de barras (ubicación y SKU)
- Interfaz táctil optimizada
- Botones grandes y claros
- Feedback visual inmediato (sonidos, colores)

---

## ⚙️ Configuración para CPanel

### **Requisitos CPanel**
- Python 3.8+ disponible en CPanel
- MySQL/MariaDB disponible
- Acceso a `requirements.txt` para instalar dependencias
- Posible uso de `passenger_wsgi.py` o configuración Python App

### **Archivos Necesarios para CPanel**
- `.htaccess` (redirección a aplicación Python)
- `passenger_wsgi.py` o configuración equivalente
- Variables de entorno para credenciales ADM Cloud
- Configuración de base de datos (MySQL)

---

## 📊 Métricas de Rendimiento Esperadas

- **Consulta de factura**: < 2 segundos
- **Búsqueda de producto por SKU**: < 1 segundo
- **Carga inicial (5000 productos)**: < 30 segundos (con cache)
- **Escaneo y registro de movimiento**: < 500ms
- **Múltiples usuarios concurrentes**: 5-10 usuarios simultáneos

---

## 🔐 Seguridad

- Credenciales ADM Cloud almacenadas de forma segura (variables de entorno)
- Contraseñas de usuarios hasheadas (bcrypt)
- Sesiones seguras (cookies HTTPOnly)
- Validación de entrada en todos los formularios
- Protección CSRF en formularios

---

## 📝 Próximos Pasos (Post-MVP)

1. Sistema de recepción de compras (asignar ubicaciones)
2. Integración con códigos QR
3. Reportes avanzados
4. Notificaciones push
5. API REST propia para integraciones externas
6. App móvil nativa (opcional)

---

## ❓ Preguntas Pendientes

1. ¿Cómo se manejarán los lotes/serializados? (Endpoint `/api/Serials`)
2. ¿Se necesitará integración con impresoras de etiquetas?
3. ¿Cómo se manejarán las devoluciones?
4. ¿Se requiere historial de ubicaciones anteriores?
5. ¿Frecuencia de sincronización con ADM Cloud? (Tiempo real, cada hora, diario)



