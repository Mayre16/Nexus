# 📘 INFORME COMPLETO DEL SISTEMA WMS
## Warehouse Management System - Gestión de Inventario Físico

**Versión del Sistema:** 1.0  
**Fecha del Informe:** 2026-01-22  
**Estado:** Producción

---

## 📋 ÍNDICE

1. [Introducción y Visión General](#introducción-y-visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Modelos de Datos](#modelos-de-datos)
4. [Módulos y Funcionalidades](#módulos-y-funcionalidades)
5. [Reglas de Oro del Sistema](#reglas-de-oro-del-sistema)
6. [Flujos Lógicos Completos](#flujos-lógicos-completos)
7. [Integración con ADM Cloud](#integración-con-adm-cloud)
8. [Sistema de Autenticación y Roles](#sistema-de-autenticación-y-roles)
9. [Casos de Uso](#casos-de-uso)
10. [Decisiones de Diseño](#decisiones-de-diseño)
11. [Manejo de Errores y Logging](#manejo-de-errores-y-logging)

---

## 🎯 INTRODUCCIÓN Y VISIÓN GENERAL

### ¿Qué es el WMS?

El **Warehouse Management System (WMS)** es un sistema de gestión de almacenes diseñado para complementar el ERP **ADM Cloud**. Su función principal es:

1. **Control de micro-ubicaciones físicas** dentro del almacén principal (ADESA)
2. **Trazabilidad completa** de movimientos de inventario
3. **Detección automática de discrepancias** entre stock ERP y stock físico
4. **Optimización de procesos de despacho** mediante picking guiado

### Problema que Resuelve

**ADM Cloud** maneja inventario a nivel macro (ubicaciones grandes como "ADESA", "Mirador Sur", etc.), pero **NO puede** manejar micro-ubicaciones físicas como:
- Pasillo 2, Lado 1, Estante 01, Nivel 1 → `2P1D01N1`
- Pasillo 3, Lado 2, Estante 05, Nivel 2 → `3P2D05N2`

**El WMS resuelve esto:**
- ✅ Registra stock físico en ubicaciones micro (pasillo/estante/nivel)
- ✅ Permite picking desde múltiples ubicaciones físicas
- ✅ Mantiene sincronización con ADM Cloud (stock macro)
- ✅ Detecta inconsistencias automáticamente

### Objetivos del Sistema

1. **Consultar productos rápidamente** (sin depender de ADM Cloud en tiempo real)
2. **Ver stock ERP por ubicación** (ADESA, Mirador Sur, etc.)
3. **Ver ubicación física interna** en el almacén (micro-ubicaciones)
4. **Despachar con trazabilidad** (evitar inventarios fantasmas)
5. **Detectar inconsistencias** y obligar revisión cuando algo no cuadra

---

## 🏗️ ARQUITECTURA DEL SISTEMA

### Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADM Cloud (ERP)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   /api/Items │  │  /api/Stock  │  │ /api/Locations│        │
│  │   (Catálogo) │  │  (Stock)     │  │ (Ubicaciones)│        │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │/api/Receptions│ │/api/CashInvoices│/api/Transfers│         │
│  │ (Recepciones) │ │  (Facturas)   │ │(Transferencias)│        │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ REST API (HTTPS)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              ADMCloudClient (api/adm_cloud.py)                  │
│  - Autenticación Basic Auth                                    │
│  - Manejo de paginación                                        │
│  - Normalización de respuestas                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         Aplicación Flask WMS (app_wms.py)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Blueprints (Módulos):                                   │  │
│  │  - auth: Autenticación y autorización                    │  │
│  │  - productos: Consulta de productos                      │  │
│  │  - recepciones: Gestión de recepciones                  │  │
│  │  - despacho/despachos: Proceso de despacho              │  │
│  │  - transferencias: Transferencias entre ubicaciones     │  │
│  │  - ajustes: Ajustes de inventario                       │  │
│  │  - sincronizar: Sincronización con ADM Cloud            │  │
│  │  - stock: Consultas de stock                            │  │
│  │  - ubicaciones_fisicas: Gestión de ubicaciones          │  │
│  │  - historiales: Historiales de movimientos               │  │
│  │  - detalles: Detalles de documentos                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         Base de Datos Local (SQLite/MySQL)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tablas Principales:                                     │  │
│  │  - usuarios: Usuarios del sistema                       │  │
│  │  - productos_adm: Catálogo de productos (cache)          │  │
│  │  - stock_productos_adm: Stock ERP por ubicación (cache)  │  │
│  │  - stock_por_ubicacion: Stock físico WMS                 │  │
│  │  - movimientos: Historial de movimientos                 │  │
│  │  - facturas_procesadas: Control de despachos             │  │
│  │  - transferencias_procesadas: Control de transferencias  │  │
│  │  - discrepancias: Discrepancias detectadas              │  │
│  │  - ubicaciones_fisicas: Micro-ubicaciones del almacén   │  │
│  │  - sync_locations_status: Estado de sincronización       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Interfaz Web (Templates HTML + JavaScript)         │
│  - Dashboard principal                                          │
│  - Consulta de productos                                        │
│  - Recepciones                                                  │
│  - Despachos                                                    │
│  - Transferencias                                               │
│  - Ajustes                                                      │
│  - Panel de administración                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Tecnologías Utilizadas

- **Backend:** Python 3.x + Flask
- **Base de Datos:** SQLite (desarrollo) / MySQL (producción)
- **ORM:** SQLAlchemy
- **Frontend:** HTML5 + JavaScript (Vanilla) + Bootstrap
- **API Externa:** ADM Cloud REST API
- **Autenticación:** Session-based + Basic Auth para ADM Cloud

### Separación de Capas

1. **Capa de Presentación:** Templates HTML + JavaScript
2. **Capa de Aplicación:** Blueprints Flask (rutas)
3. **Capa de Negocio:** Lógica de negocio en rutas y helpers
4. **Capa de Datos:** SQLAlchemy ORM + Modelos
5. **Capa de Integración:** ADMCloudClient (API externa)

---

## 💾 MODELOS DE DATOS

### Modelo: Usuario

**Tabla:** `usuarios`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único del usuario |
| `nombre` | String(100) | Nombre completo |
| `email` | String(100) | Email (único) |
| `password_hash` | String(255) | Hash de contraseña (bcrypt) |
| `rol` | String(50) | Rol: `despachador`, `almacenista`, `administrador` |
| `activo` | Boolean | Si el usuario está activo |
| `created_at` | DateTime | Fecha de creación |

**Relaciones:**
- `movimientos`: Movimientos realizados por el usuario
- `facturas_procesadas`: Facturas despachadas por el usuario
- `facturas_solicitadas`: Facturas solicitadas por el usuario

---

### Modelo: ProductoADM

**Tabla:** `productos_adm`

**Propósito:** Cache local del catálogo de productos desde ADM Cloud.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único local |
| `item_id` | String(100) | GUID único de ADM Cloud (único) |
| `nombre` | String(500) | Nombre del producto |
| `sku` | String(100) | SKU del producto (indexado) |
| `codigo_barras` | String(100) | Código de barras (indexado) |
| `activo` | Boolean | Si el producto está activo |
| `updated_at` | DateTime | Última actualización |
| `synced_at` | DateTime | Última sincronización desde ADM |

**Relaciones:**
- `stock_ubicaciones`: Stock ERP por ubicación (StockProductoADM)
- `discrepancias`: Discrepancias detectadas para este producto

**Índices:**
- `item_id` (único)
- `sku` (para búsquedas rápidas)
- `codigo_barras` (para búsquedas por código de barras)

---

### Modelo: StockProductoADM

**Tabla:** `stock_productos_adm`

**Propósito:** Cache local del stock ERP por ubicación ADM.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `producto_id` | Integer (FK) | ID del producto (ProductoADM) |
| `location_id` | String(100) | GUID de ubicación ADM |
| `location_name` | String(200) | Nombre de ubicación (ej: "ADESA") |
| `stock` | Numeric(10,2) | Cantidad en stock (solo > 0) |
| `updated_at` | DateTime | Última actualización |

**Restricciones:**
- `(producto_id, location_id)` único (un producto solo puede tener una entrada por ubicación ADM)

**Regla importante:** Solo se guardan registros con `stock > 0`. Si un producto no aparece en `/api/Stock`, significa que su stock es 0.

---

### Modelo: StockUbicacion

**Tabla:** `stock_por_ubicacion`

**Propósito:** Stock físico del WMS en micro-ubicaciones.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `product_id` | String(100) | ItemID de ADM Cloud |
| `sku` | String(100) | SKU del producto (indexado) |
| `ubicacion` | String(50) | Ubicación física (ej: "2P1D01N1") (indexado) |
| `cantidad` | Numeric(10,2) | Cantidad física en esta ubicación |
| `updated_at` | DateTime | Última actualización |

**Restricciones:**
- `(product_id, ubicacion)` único (un producto solo puede tener una entrada por ubicación física)

**Diferencia clave:** Esta tabla maneja **stock físico** en ubicaciones micro, mientras que `StockProductoADM` maneja **stock ERP** en ubicaciones macro.

---

### Modelo: Movimiento

**Tabla:** `movimientos`

**Propósito:** Historial completo de todos los movimientos de inventario.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `tipo` | String(20) | Tipo: `RECEIPT`, `PICK`, `TRANSFER`, `ADJUSTMENT` |
| `product_id` | String(100) | ItemID de ADM Cloud |
| `sku` | String(100) | SKU del producto (indexado) |
| `ubicacion_origen` | String(200) | Ubicación origen (puede ser ADM o física) |
| `ubicacion_destino` | String(200) | Ubicación destino (puede ser ADM o física) |
| `cantidad` | Numeric(10,2) | Cantidad movida |
| `factura_id` | String(100) | DocID o GUID de documento ADM |
| `factura_guid` | String(100) | GUID completo de documento ADM (indexado) |
| `usuario_id` | Integer (FK) | Usuario que realizó el movimiento |
| `timestamp` | DateTime | Fecha y hora del movimiento (indexado) |
| `notas` | Text | Notas adicionales |

**Tipos de Movimiento:**
- `RECEIPT`: Recepción de productos (entrada)
- `PICK`: Picking/despacho (salida)
- `TRANSFER`: Transferencia entre ubicaciones
- `ADJUSTMENT`: Ajuste de inventario

---

### Modelo: FacturaProcesada

**Tabla:** `facturas_procesadas`

**Propósito:** Control de facturas y despachos procesados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `factura_docid` | String(50) | DocID de ADM (ej: "00002932") (indexado) |
| `factura_guid` | String(100) | GUID único de ADM (único, indexado) |
| `tipo_factura` | String(20) | Tipo: `CASH`, `CREDIT`, `ORDER`, `DISPATCH` |
| `cliente` | String(200) | Nombre del cliente |
| `fecha` | DateTime | Fecha de la factura |
| `total` | Numeric(10,2) | Total de la factura |
| `estado_despacho` | String(20) | Estado: `PENDIENTE`, `EN_PROCESO`, `COMPLETO`, `CANCELADO` |
| `usuario_despachador` | Integer (FK) | Usuario que está despachando |
| `usuario_solicitante` | Integer (FK) | Usuario que buscó/solicitó el documento |
| `fecha_inicio` | DateTime | Fecha de inicio de despacho |
| `completed_at` | DateTime | Fecha de completado |
| `productos_json` | Text | JSON con productos de la factura (cache) |
| `location_id` | String(100) | GUID de ubicación ADM origen (indexado) |
| `location_name` | String(200) | Nombre de ubicación ADM origen |

**Estados de Despacho:**
- `PENDIENTE`: Factura encontrada pero no iniciada
- `EN_PROCESO`: Despacho en curso
- `COMPLETO`: Todos los productos despachados
- `CANCELADO`: Despacho cancelado

---

### Modelo: TransferenciaProcesada

**Tabla:** `transferencias_procesadas`

**Propósito:** Control de transferencias entre ubicaciones procesadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `transferencia_docid` | String(50) | DocID de ADM (indexado) |
| `transferencia_guid` | String(100) | GUID único de ADM (único, indexado) |
| `location_id_origen` | String(100) | GUID ubicación origen |
| `location_name_origen` | String(200) | Nombre ubicación origen |
| `location_id_destino` | String(100) | GUID ubicación destino |
| `location_name_destino` | String(200) | Nombre ubicación destino |
| `fecha_transferencia` | DateTime | Fecha de transferencia en ADM |
| `estado_procesamiento` | String(20) | Estado: `PENDIENTE`, `PROCESADA`, `ERROR` |
| `ubicacion_fisica_origen` | String(50) | Ubicación física WMS origen (si aplica) |
| `ubicacion_fisica_destino` | String(50) | Ubicación física WMS destino (si aplica) |
| `usuario_procesador` | Integer (FK) | Usuario que procesó |
| `usuario_solicitante` | Integer (FK) | Usuario que buscó/solicitó |
| `fecha_procesamiento` | DateTime | Fecha de procesamiento |
| `productos_json` | Text | JSON con productos transferidos (cache) |

---

### Modelo: Discrepancia

**Tabla:** `discrepancias`

**Propósito:** Registro de discrepancias críticas entre stock ERP y stock físico.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `producto_id` | Integer (FK) | ID del producto (indexado) |
| `sku` | String(100) | SKU del producto (indexado) |
| `location_id` | String(100) | GUID de ubicación ADM (indexado) |
| `location_name` | String(200) | Nombre de ubicación ADM |
| `ubicacion_fisica` | String(50) | Ubicación física WMS |
| `stock_erp` | Numeric(10,2) | Stock en ADM Cloud (ERP cache) |
| `stock_fisico_wms` | Numeric(10,2) | Stock físico en WMS |
| `tipo` | String(20) | Tipo: `critica` |
| `estado` | String(20) | Estado: `pendiente`, `revisado`, `resuelto` (indexado) |
| `fecha_deteccion` | DateTime | Fecha de detección (indexado) |
| `fecha_revision` | DateTime | Fecha de revisión |
| `fecha_resolucion` | DateTime | Fecha de resolución |
| `notas` | Text | Notas del administrador |
| `resuelto_por` | Integer (FK) | Usuario que resolvió |

**Criterio de Discrepancia Crítica:**
- Solo se crean cuando: `stock_erp = 0` y `stock_fisico_wms > 0`

---

### Modelo: UbicacionFisica

**Tabla:** `ubicaciones_fisicas`

**Propósito:** Catálogo de micro-ubicaciones físicas del almacén.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `codigo` | String(50) | Código único (ej: "2P1D01N1") (único, indexado) |
| `nombre` | String(200) | Nombre descriptivo |
| `descripcion` | Text | Descripción opcional |
| `activa` | Boolean | Si está activa |
| `tipo` | String(50) | Tipo opcional (ej: "PASILLO", "ESTANTE") |
| `created_at` | DateTime | Fecha de creación |
| `updated_at` | DateTime | Última actualización |

---

### Modelo: SyncLocationStatus

**Tabla:** `sync_locations_status`

**Propósito:** Estado de sincronización por ubicación (checkpoints).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer (PK) | ID único |
| `location_id` | String(100) | GUID de ubicación ADM (único, indexado) |
| `location_name` | String(200) | Nombre de ubicación |
| `status` | String(20) | Estado: `pending`, `running`, `done`, `error`, `paused` (indexado) |
| `last_sync_at` | DateTime | Última sincronización exitosa |
| `last_error` | Text | Último error si status = 'error' |
| `items_synced` | Integer | Cantidad de items sincronizados |
| `total_items` | Integer | Total de items encontrados en ADM |
| `skip_actual` | Integer | Skip actual (desde dónde continuar) |
| `lote_actual` | Integer | Lote actual (1, 2, 3...) |
| `created_at` | DateTime | Fecha de creación |
| `updated_at` | DateTime | Última actualización |

**Estados:**
- `pending`: No sincronizada
- `running`: Sincronizando actualmente
- `paused`: Pausada (para ubicaciones grandes, se sincroniza por lotes)
- `done`: Completada
- `error`: Error durante sincronización

---

## 🔧 MÓDULOS Y FUNCIONALIDADES

### 1. Módulo de Autenticación (`routes/auth.py`)

**Funcionalidad:** Gestión de usuarios y sesiones.

**Endpoints:**
- `POST /api/auth/login`: Iniciar sesión
- `POST /api/auth/logout`: Cerrar sesión
- `GET /api/auth/me`: Obtener usuario actual

**Roles:**
- `despachador`: Puede despachar y consultar
- `almacenista`: Puede recepcionar, transferir y ajustar
- `administrador`: Acceso completo, incluyendo sincronización

**Decoradores:**
- `@require_auth`: Requiere autenticación
- `@require_admin`: Requiere rol administrador

---

### 2. Módulo de Consulta de Productos (`routes/productos.py`)

**Funcionalidad:** Búsqueda rápida de productos desde BD local.

**Endpoints:**
- `GET /productos`: Página de consulta
- `POST /api/productos/buscar`: Buscar producto por SKU, nombre o código de barras

**Búsquedas Soportadas:**
- Por SKU (exacto, con normalización de guiones/espacios)
- Por código de barras (exacto, con normalización)
- Por nombre (parcial, case-insensitive)

**Información Devuelta:**
- Datos del producto (SKU, nombre, código de barras)
- Stock ERP por ubicación ADM (solo > 0)
- Stock físico WMS por ubicación física
- Discrepancias críticas detectadas

**REGLA DE ORO #2:** Toda consulta es desde BD local, NO hace llamadas a ADM Cloud en tiempo real.

---

### 3. Módulo de Recepciones (`routes/recepciones.py`)

**Funcionalidad:** Gestión de recepciones de productos (entradas).

**Endpoints:**
- `POST /api/recepciones/buscar`: Buscar recepción por DocID
- `POST /api/recepciones/registrar`: Registrar recepción con asignación de ubicaciones
- `POST /api/recepciones/<guid>/revertir`: Revertir recepción (solo admin)
- `POST /api/recepciones/<guid>/refrescar`: Refrescar datos desde ADM Cloud

**Tipos de Recepciones:**
- `RECEPTION`: Recepción normal
- `VEND_REC`: Compra con recepción integrada

**Flujo:**
1. Buscar recepción en ADM Cloud por DocID
2. Extraer productos y ubicación destino
3. Si es ADESA: asignar ubicaciones físicas (micro-ubicaciones)
4. Si es NO-ADESA: solo registrar movimiento (no modifica stock físico)
5. Crear movimientos tipo `RECEIPT`
6. Actualizar `StockUbicacion` (solo si es ADESA)

**REGLA DE ORO #4:** Solo modifica `StockUbicacion` cuando la ubicación es ADESA.

---

### 4. Módulo de Despachos (`routes/despacho.py` y `routes/despachos.py`)

**Funcionalidad:** Proceso de picking/despacho de facturas y conduces.

**Endpoints:**
- `POST /api/despachos/buscar`: Buscar despacho/conduce por DocID
- `POST /api/despacho/registrar`: Registrar picking de producto
- `GET /api/despacho/factura/<guid>/estado`: Obtener estado de despacho

**Tipos de Documentos:**
- `CASH`: Factura al contado
- `CREDIT`: Factura a crédito
- `DISPATCH`: Conduce de despacho

**Flujo:**
1. Buscar factura/despacho en ADM Cloud
2. Mostrar productos pendientes de despachar
3. Para cada producto:
   - Mostrar ubicaciones físicas disponibles
   - Registrar picking desde ubicación física
   - Actualizar `StockUbicacion` (restar cantidad)
   - Crear movimiento tipo `PICK`
4. Actualizar estado de factura: `PENDIENTE` → `EN_PROCESO` → `COMPLETO`

**Validaciones:**
- Verificar stock suficiente en ubicación física
- Verificar cantidad pendiente vs cantidad solicitada
- No permitir despachar más de lo pendiente

---

### 5. Módulo de Transferencias (`routes/transferencias.py`)

**Funcionalidad:** Gestión de transferencias entre ubicaciones ADM.

**Endpoints:**
- `POST /api/transferencias/buscar`: Buscar transferencia por DocID
- `POST /api/transferencias/registrar`: Registrar transferencia con asignaciones
- `POST /api/transferencias/actualizar-solicitante`: Actualizar usuario solicitante

**Flujo:**
1. Buscar transferencia en ADM Cloud
2. Identificar origen y destino (pueden ser ADESA o NO-ADESA)
3. Para cada producto:
   - Si origen es ADESA: asignar ubicación física origen
   - Si destino es ADESA: asignar ubicación física destino
   - Validar stock suficiente en origen (si es ADESA)
   - Actualizar `StockUbicacion`:
     - Restar de origen (si es ADESA)
     - Sumar a destino (si es ADESA)
   - Crear movimiento tipo `TRANSFER`
4. Actualizar estado: `PENDIENTE` → `PROCESADA`

**REGLA DE ORO #4:** Solo modifica `StockUbicacion` cuando ADESA está involucrado (origen o destino).

---

### 6. Módulo de Ajustes (`routes/ajustes.py`)

**Funcionalidad:** Ajustes de inventario (inventario inicial, correcciones).

**Endpoints:**
- `GET /ajustes`: Página de ajustes
- `GET /api/ajustes/ubicacion`: Listar ubicaciones físicas
- `POST /api/ajustes/registrar`: Registrar ajuste
- `POST /api/ajustes/buscar-producto`: Buscar producto para ajuste

**Flujo:**
1. Buscar producto por SKU
2. Seleccionar ubicación física
3. Establecer cantidad (puede ser inventario inicial o corrección)
4. Actualizar o crear `StockUbicacion`
5. Crear movimiento tipo `ADJUSTMENT` con diferencia

**Uso:**
- Inventario inicial
- Correcciones de stock físico
- Ajustes por pérdidas o daños

---

### 7. Módulo de Sincronización (`routes/sincronizar.py`)

**Funcionalidad:** Sincronización de productos y stock desde ADM Cloud.

**Endpoints:**
- `POST /api/sincronizar/catalogo`: Sincronizar catálogo (nombre, SKU, código de barras)
- `GET /api/sincronizar/ubicaciones`: Listar ubicaciones con estado de sync
- `POST /api/sincronizar/ubicacion/<id>/contar`: Contar productos de ubicación
- `POST /api/sincronizar/ubicacion/<id>/lote`: Sincronizar lote de 1000 productos
- `POST /api/sincronizar/ubicacion/<id>`: Sincronizar ubicación completa
- `GET /api/sincronizar/progreso`: Obtener progreso de sincronización
- `GET /api/sincronizar/estado`: Estado de última sincronización

**Separación de Responsabilidades:**
- **Sincronización de Catálogo:** Actualiza nombre, SKU, código de barras
- **Sincronización de Stock:** Actualiza stock ERP por ubicación

**Sincronización por Lotes:**
- Para ubicaciones grandes (>1000 productos), se sincroniza por lotes de 1000
- Estado se guarda en `SyncLocationStatus`
- Permite pausar y reanudar

**REGLA DE ORO #1:** Detecta productos desaparecidos (stock ERP = 0).
**REGLA DE ORO #3:** Crea discrepancias críticas cuando detecta inconsistencias.

---

### 8. Módulo de Ubicaciones Físicas (`routes/ubicaciones_fisicas.py`)

**Funcionalidad:** Gestión de micro-ubicaciones físicas del almacén.

**Endpoints:**
- `GET /api/ubicaciones-fisicas`: Listar ubicaciones
- `POST /api/ubicaciones-fisicas`: Crear ubicación
- `PUT /api/ubicaciones-fisicas/<id>`: Actualizar ubicación
- `DELETE /api/ubicaciones-fisicas/<id>`: Eliminar ubicación (solo si no tiene stock)

**Restricciones:**
- Solo administradores pueden gestionar ubicaciones
- No se puede eliminar ubicación con stock > 0

---

### 9. Módulo de Historiales (`routes/historiales.py`)

**Funcionalidad:** Consulta de historiales de movimientos.

**Endpoints:**
- `GET /api/historiales/recepciones`: Historial de recepciones
- `GET /api/historiales/despachos`: Historial de despachos
- `GET /api/historiales/transferencias`: Historial de transferencias
- `GET /api/historiales/ajustes`: Historial de ajustes

**Filtros:**
- Por fecha
- Por usuario
- Por SKU
- Por tipo de movimiento

---

### 10. Módulo de Detalles (`routes/detalles.py`)

**Funcionalidad:** Ver detalles completos de documentos.

**Endpoints:**
- `GET /api/detalles/factura/<guid>`: Detalles de factura
- `GET /api/detalles/transferencia/<guid>`: Detalles de transferencia

---

## 🥇 REGLAS DE ORO DEL SISTEMA

### REGLA DE ORO #1: Stock 0 en ADM NO viene como 0

**Enunciado:**
ADM Cloud **NO devuelve stock 0** en `/api/Stock`.

**Implicación:**
➡️ **Si el SKU existe en `/api/Items` pero NO aparece en `/api/Stock?LocationID=...`, entonces para esa ubicación el stock ERP es 0.**

**Aplicación:**
- Al sincronizar ubicación, solo se guardan registros que vienen en `/api/Stock` (stock > 0)
- Si un producto existía en BD con stock ERP > 0 y después de sincronizar **ya NO viene en `/api/Stock`**, significa que el stock ERP ahora es 0
- **Se actualiza `StockProductoADM.stock = 0`** (capa ERP/cache)
- **NO se toca `StockUbicacion.cantidad`** (stock físico debe quedar igual)
- Si hay stock físico > 0 y ADM dice 0, se marca como DISCREPANCIA (Regla #3)

**Ubicación en código:**
- `routes/sincronizar.py` - Líneas 1032-1053

---

### REGLA DE ORO #2: La consulta del usuario siempre debe ser desde BD local

**Enunciado:**
La pantalla "Consulta de Productos" debe responder **rápido y sin depender de ADM en vivo**.

**Implicación:**
➡️ **Toda consulta debe leer la base de datos del WMS.**

**Aplicación:**
- La página "Consulta de Productos" SOLO consulta la BD local
- **NO hace llamadas a ADM Cloud en tiempo real**
- ADM se consulta solo mediante:
  - Sincronización manual (admin)
  - Cron programado
  - Procesos controlados

**Excepciones:**
- ❌ NO hay excepciones. Si se necesita información de ADM, se debe sincronizar primero.

**Ubicación en código:**
- `routes/productos.py` - Implementada en todas las búsquedas

---

### REGLA DE ORO #3: Discrepancias NO se pisan, se registran y se alertan

**Enunciado:**
Si ADM "baja" un producto (ej: stock ERP pasa de 20 a 0), pero en WMS físico todavía existe cantidad registrada o ubicación física conocida, entonces:

**Implicación:**
✅ **NO se borra evidencia ni se sobrescribe la realidad física en silencio.**  
✅ **Se guarda el nuevo valor de ADM como snapshot (0).**  
✅ **Se mantiene el stock físico del WMS tal cual estaba.**  
✅ **Se marca como DISCREPANCIA / NO CONCILIADO.**  
✅ **Se genera alerta obligatoria para administradores.**

**Criterio de Discrepancia Crítica:**
- Solo se disparan discrepancias en eventos críticos:
  - ✅ **ADM stock = 0** pero **stock físico WMS > 0** → **DISCREPANCIA CRÍTICA**

**Acciones:**
1. Guardar stock ERP = 0 en `StockProductoADM`
2. **NO tocar stock físico** en `StockUbicacion`
3. Crear registro en tabla de discrepancias
4. Marcar producto/ubicación como "DISCREPANCIA CRÍTICA"
5. Mostrar alerta en panel admin
6. Mostrar aviso en consulta de productos

**Ubicación en código:**
- `routes/sincronizar.py` - Líneas 1055-1094
- `routes/productos.py` - Líneas 170-200

---

### REGLA DE ORO #4: Solo modificar StockUbicacion cuando ADESA está involucrado

**Enunciado:**
El stock físico (`StockUbicacion`) solo se modifica cuando la ubicación ADM es **ADESA** o cuando se trata de ajustes directos.

**Implicación:**
➡️ **Para ubicaciones NO-ADESA, solo se registran movimientos para auditoría, pero NO se modifica stock físico.**

**Aplicación:**
- **Recepciones:**
  - Si `location_name` contiene "ADESA": asignar ubicaciones físicas y modificar `StockUbicacion`
  - Si NO es ADESA: solo crear movimiento, NO modificar `StockUbicacion`
  
- **Transferencias:**
  - Si origen es ADESA: restar de `StockUbicacion` origen
  - Si destino es ADESA: sumar a `StockUbicacion` destino
  - Si NO es ADESA: solo crear movimiento para auditoría

- **Despachos:**
  - Siempre modifica `StockUbicacion` (despachos siempre son desde ADESA)

- **Ajustes:**
  - Siempre modifica `StockUbicacion` (ajustes son directos)

**Razón:**
- ADESA es el almacén principal con control físico detallado
- Otras ubicaciones (sucursales, consignaciones) no requieren control físico micro

**Ubicación en código:**
- `routes/recepciones.py` - Líneas 430-453
- `routes/transferencias.py` - Líneas 530-612

---

## 🔄 FLUJOS LÓGICOS COMPLETOS

### Flujo 1: Recepción de Productos

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario busca recepción por DocID                       │
│    - POST /api/recepciones/buscar                          │
│    - Busca en ADM Cloud: /api/Receptions o /api/VendorReceptions│
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Sistema extrae datos de recepción                       │
│    - GUID, DocID, productos, ubicación destino             │
│    - Detecta si es ADESA o NO-ADESA                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Usuario asigna ubicaciones físicas (si es ADESA)        │
│    - Para cada producto: dividir cantidad en ubicaciones   │
│    - Ejemplo: 10 unidades → 5 en "2P1D01N1" + 5 en "2P1D01N2"│
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Sistema registra recepción                              │
│    - Si es ADESA:                                           │
│      → Actualiza StockUbicacion (suma cantidad)            │
│      → Crea movimientos tipo RECEIPT                        │
│    - Si NO es ADESA:                                        │
│      → Solo crea movimientos (no modifica StockUbicacion)   │
└─────────────────────────────────────────────────────────────┘
```

---

### Flujo 2: Despacho de Factura

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario busca factura por DocID                         │
│    - POST /api/facturas/buscar o /api/despachos/buscar     │
│    - Busca en ADM Cloud según tipo                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Sistema muestra productos pendientes                    │
│    - GET /api/despacho/factura/<guid>/estado               │
│    - Calcula cantidad pendiente por producto               │
│    - Muestra ubicaciones físicas disponibles                │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Usuario registra picking                                │
│    - POST /api/despacho/registrar                          │
│    - Especifica: SKU, ubicación física, cantidad           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Sistema valida y procesa                                │
│    - Verifica stock suficiente en ubicación                │
│    - Verifica cantidad pendiente                           │
│    - Actualiza StockUbicacion (resta cantidad)             │
│    - Crea movimiento tipo PICK                              │
│    - Actualiza estado de factura                           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Si todos los productos despachados                      │
│    - Estado cambia a COMPLETO                              │
│    - Se registra fecha de completado                        │
└─────────────────────────────────────────────────────────────┘
```

---

### Flujo 3: Transferencia entre Ubicaciones

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario busca transferencia por DocID                   │
│    - POST /api/transferencias/buscar                       │
│    - Busca en ADM Cloud: /api/LocationTransfers            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Sistema identifica origen y destino                     │
│    - Detecta si origen es ADESA                            │
│    - Detecta si destino es ADESA                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Usuario asigna ubicaciones físicas                      │
│    - Si origen es ADESA: asignar ubicación física origen    │
│    - Si destino es ADESA: asignar ubicación física destino  │
│    - Puede dividir cantidad en múltiples ubicaciones        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Sistema valida y procesa                                │
│    - Si origen es ADESA:                                   │
│      → Valida stock suficiente                             │
│      → Resta de StockUbicacion origen                      │
│    - Si destino es ADESA:                                  │
│      → Suma a StockUbicacion destino                       │
│    - Crea movimientos tipo TRANSFER                         │
│    - Actualiza estado: PENDIENTE → PROCESADA                │
└─────────────────────────────────────────────────────────────┘
```

---

### Flujo 4: Sincronización de Stock

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Administrador inicia sincronización                     │
│    - POST /api/sincronizar/ubicacion/<location_id>/contar  │
│    - Cuenta productos con stock > 0                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Si > 1000 productos: sincronizar por lotes               │
│    - POST /api/sincronizar/ubicacion/<id>/lote             │
│    - Procesa lotes de 1000 productos                       │
│    - Estado: running → paused → done                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Para cada lote:                                          │
│    - Obtiene stock desde /api/Stock (paginación 50)         │
│    - Solo procesa items con stock > 0                       │
│    - Actualiza StockProductoADM                             │
│    - Mantiene lista: item_ids_en_sync                       │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. REGLA DE ORO #1: Detectar productos desaparecidos       │
│    - Compara stock en BD vs item_ids_en_sync                │
│    - Si producto NO está en sync:                          │
│      → stock ERP = 0                                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. REGLA DE ORO #3: Detectar discrepancias                │
│    - Para cada producto con stock ERP = 0:                 │
│      → Verifica stock físico WMS                           │
│      → Si stock_fisico > 0:                                │
│        → Crea Discrepancia crítica                         │
└─────────────────────────────────────────────────────────────┘
```

---

### Flujo 5: Consulta de Producto

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario busca producto                                  │
│    - POST /api/productos/buscar                            │
│    - Por SKU, nombre o código de barras                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. REGLA DE ORO #2: Consulta desde BD local                │
│    - Busca en ProductoADM (catálogo)                        │
│    - NO hace llamadas a ADM Cloud                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Sistema obtiene stock ERP                                │
│    - Consulta StockProductoADM                             │
│    - Solo muestra ubicaciones con stock > 0                 │
│    - Calcula total por ubicación                            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Sistema obtiene stock físico WMS                        │
│    - Consulta StockUbicacion                                │
│    - Muestra ubicaciones físicas con cantidad               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. REGLA DE ORO #3: Detectar discrepancias                │
│    - Si stock_fisico > 0 y stock_erp = 0:                  │
│      → Muestra discrepancia crítica                        │
│      → Alerta visual para revisión                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔌 INTEGRACIÓN CON ADM CLOUD

### Cliente API (`api/adm_cloud.py`)

**Clase:** `ADMCloudClient`

**Autenticación:**
- Basic Auth con email y password
- Headers automáticos en cada petición

**Parámetros Comunes:**
- `appid`: ID de integración
- `company`: ID de empresa
- `role`: Rol del usuario
- `OnlyActive`: "false" para incluir inactivos

**Endpoints Utilizados:**

1. **`/api/Items/`** - Catálogo de productos
   - Paginación: `skip`, `take` (máximo 50)
   - Usado en: sincronización de catálogo

2. **`/api/Stock`** - Stock por ubicación
   - Parámetros: `LocationID`, `skip`, `take` (máximo 50)
   - Usado en: sincronización de stock

3. **`/api/Locations/`** - Ubicaciones
   - Paginación: `skip`, `take`
   - Usado en: listado de ubicaciones

4. **`/api/Receptions/`** - Recepciones
   - Búsqueda por DocID
   - Usado en: módulo de recepciones

5. **`/api/VendorReceptions/`** - Compras con recepción
   - Búsqueda por DocID
   - Usado en: módulo de recepciones

6. **`/api/CashInvoices/`** - Facturas al contado
   - Búsqueda por DocID
   - Usado en: módulo de despachos

7. **`/api/CreditInvoices/`** - Facturas a crédito
   - Búsqueda por DocID
   - Usado en: módulo de despachos

8. **`/api/Dispatchs/`** - Conduces de despacho
   - Búsqueda por DocID
   - Usado en: módulo de despachos

9. **`/api/LocationTransfers/`** - Transferencias
   - Búsqueda por DocID
   - Usado en: módulo de transferencias

**Manejo de Errores:**
- Timeout: 30 segundos
- Reintentos: No (se maneja en capa superior)
- Logging: Todos los errores se registran

---

## 👥 SISTEMA DE AUTENTICACIÓN Y ROLES

### Autenticación

**Método:** Session-based authentication

**Flujo:**
1. Usuario envía email y password
2. Sistema valida credenciales
3. Si válido: crea sesión Flask
4. Sesión contiene: `user_id`, `user_email`, `user_rol`, `user_nombre`

**Seguridad:**
- Contraseñas hasheadas con bcrypt
- Sesiones expiran al cerrar navegador
- Decoradores `@require_auth` en todas las rutas protegidas

### Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **despachador** | - Consultar productos<br>- Despachar facturas/conduces<br>- Ver historiales de despachos |
| **almacenista** | - Todo lo de despachador<br>- Recepcionar productos<br>- Procesar transferencias<br>- Registrar ajustes<br>- Ver todos los historiales |
| **administrador** | - Todo lo de almacenista<br>- Sincronizar productos y stock<br>- Gestionar ubicaciones físicas<br>- Revertir recepciones<br>- Ver panel de administración |

**Decoradores:**
- `@require_auth`: Requiere autenticación (todos los roles)
- `@require_admin`: Requiere rol administrador

---

## 📊 CASOS DE USO

### Caso de Uso 1: Recepción de Compra en ADESA

**Actor:** Almacenista

**Flujo:**
1. Almacenista busca recepción por DocID: "00000350"
2. Sistema muestra productos recibidos y detecta que es ADESA
3. Almacenista asigna ubicaciones físicas:
   - Producto "VP1": 10 unidades → 5 en "2P1D01N1" + 5 en "2P1D01N2"
   - Producto "VP2": 20 unidades → 20 en "3P1D05N1"
4. Sistema registra:
   - Actualiza `StockUbicacion` (suma cantidades)
   - Crea movimientos tipo `RECEIPT`
5. Productos ahora disponibles para despacho

---

### Caso de Uso 2: Despacho de Factura desde Múltiples Ubicaciones

**Actor:** Despachador

**Flujo:**
1. Despachador busca factura: "00002932"
2. Sistema muestra productos pendientes:
   - Producto "VP1": pendiente 15 unidades
   - Ubicaciones disponibles:
     - "2P1D01N1": 5 unidades
     - "2P1D01N2": 5 unidades
     - "3P1D05N1": 10 unidades
3. Despachador registra pickings:
   - 5 unidades desde "2P1D01N1"
   - 5 unidades desde "2P1D01N2"
   - 5 unidades desde "3P1D05N1"
4. Sistema:
   - Resta de `StockUbicacion`
   - Crea movimientos tipo `PICK`
   - Actualiza estado de factura
5. Factura completada

---

### Caso de Uso 3: Transferencia ADESA → Mirador Sur

**Actor:** Almacenista

**Flujo:**
1. Almacenista busca transferencia: "00000231"
2. Sistema identifica:
   - Origen: ADESA (requiere ubicación física)
   - Destino: Mirador Sur (NO-ADESA, no requiere ubicación física)
3. Almacenista asigna:
   - Origen físico: "2P1D01N1" (10 unidades)
   - Destino: NO requiere ubicación física
4. Sistema:
   - Resta 10 de `StockUbicacion` en "2P1D01N1"
   - NO modifica stock físico destino (es NO-ADESA)
   - Crea movimiento tipo `TRANSFER`
5. Transferencia procesada

---

### Caso de Uso 4: Detección de Discrepancia

**Actor:** Sistema (automático)

**Flujo:**
1. Administrador sincroniza stock de ADESA
2. Sistema detecta:
   - Producto "VP1" tenía stock ERP = 20
   - Después de sync, NO viene en `/api/Stock`
   - Stock ERP ahora = 0
3. Sistema verifica stock físico:
   - `StockUbicacion` muestra: 15 unidades en "2P1D01N1"
4. Sistema crea discrepancia:
   - `Discrepancia` con tipo "critica"
   - `stock_erp = 0`, `stock_fisico_wms = 15`
   - Estado: "pendiente"
5. Administrador ve alerta en panel
6. Administrador investiga y resuelve

---

### Caso de Uso 5: Consulta Rápida de Producto

**Actor:** Cualquier usuario autenticado

**Flujo:**
1. Usuario busca producto: SKU "VP1"
2. Sistema consulta BD local (NO llama ADM Cloud):
   - `ProductoADM`: encuentra producto
   - `StockProductoADM`: stock ERP por ubicación
   - `StockUbicacion`: stock físico por ubicación física
3. Sistema muestra:
   - Datos del producto
   - Stock ERP: ADESA=50, Mirador Sur=10
   - Stock físico: "2P1D01N1"=20, "3P1D05N1"=30
   - Discrepancias (si hay)
4. Respuesta instantánea (< 100ms)

---

## 🎨 DECISIONES DE DISEÑO

### 1. Separación de Catálogo y Stock

**Decisión:** Sincronizar catálogo y stock por separado.

**Razón:**
- El catálogo cambia poco, el stock cambia constantemente
- Evita timeout en ubicaciones grandes
- Permite control granular

**Implementación:**
- Endpoint separado para cada tipo de sincronización
- Estado independiente para cada proceso

---

### 2. Cache Local de ADM Cloud

**Decisión:** Mantener cache local de productos y stock.

**Razón:**
- Consultas rápidas sin depender de ADM Cloud
- Funciona aunque ADM Cloud esté caído
- Reduce carga en servidor ADM Cloud

**Implementación:**
- Tablas `ProductoADM` y `StockProductoADM`
- Sincronización periódica manual o programada

---

### 3. Solo Modificar Stock Físico para ADESA

**Decisión:** Solo modificar `StockUbicacion` cuando ADESA está involucrado.

**Razón:**
- ADESA es el almacén principal con control físico detallado
- Otras ubicaciones no requieren control micro
- Simplifica lógica y evita errores

**Implementación:**
- Detección de "ADESA" en `location_name`
- Lógica condicional en recepciones y transferencias

---

### 4. Sincronización por Lotes

**Decisión:** Para ubicaciones grandes, sincronizar por lotes de 1000 productos.

**Razón:**
- Evita timeout en ubicaciones con muchos productos
- Permite pausar y reanudar
- Progreso visible para el usuario

**Implementación:**
- Estado guardado en `SyncLocationStatus`
- Endpoints separados para contar y sincronizar lotes

---

### 5. Detección Automática de Discrepancias

**Decisión:** Detectar y registrar discrepancias automáticamente.

**Razón:**
- Previene pérdidas de inventario
- Detecta inconsistencias temprano
- Facilita auditoría

**Implementación:**
- Durante sincronización (automático)
- Durante consulta de producto (visualización)
- Tabla `Discrepancia` para seguimiento

---

### 6. Movimientos para Auditoría

**Decisión:** Registrar TODOS los movimientos, incluso para NO-ADESA.

**Razón:**
- Trazabilidad completa
- Auditoría de todos los movimientos
- Historial completo

**Implementación:**
- Tabla `Movimiento` con todos los tipos
- Movimientos se crean siempre, aunque no modifiquen stock físico

---

## ⚠️ MANEJO DE ERRORES Y LOGGING

### Manejo de Errores

**Estrategia:**
- Try-catch en todas las rutas
- Rollback de transacciones en caso de error
- Respuestas JSON consistentes con `success: false`
- Logging de todos los errores

**Estructura de Respuesta de Error:**
```json
{
  "success": false,
  "error": "Descripción del error",
  "message": "Mensaje detallado",
  "traceback": ["línea 1", "línea 2", ...]  // Solo en desarrollo
}
```

### Logging

**Niveles:**
- `DEBUG`: Información detallada para desarrollo
- `INFO`: Eventos importantes del sistema
- `WARNING`: Advertencias (discrepancias, etc.)
- `ERROR`: Errores que requieren atención

**Ubicación de Logs:**
- `stderr.log`: Errores y warnings
- `stdout.log`: Información general

**Eventos Loggeados:**
- Sincronizaciones iniciadas/completadas
- Productos desaparecidos detectados
- Discrepancias críticas creadas
- Errores de API de ADM Cloud
- Movimientos registrados

---

## 📈 MÉTRICAS Y MONITOREO

### Métricas Clave

1. **Tiempo de respuesta de consultas:**
   - Objetivo: < 100ms
   - Medición: Tiempo desde request hasta respuesta

2. **Discrepancias pendientes:**
   - Objetivo: 0
   - Medición: Cantidad de discrepancias con estado "pendiente"

3. **Última sincronización:**
   - Objetivo: < 24 horas
   - Medición: `last_sync_at` en `SyncLocationStatus`

4. **Productos sincronizados:**
   - Medición: `items_synced` en `SyncLocationStatus`

---

## 🔮 MEJORAS FUTURAS SUGERIDAS

1. **Notas de Crédito Cliente:**
   - Implementar manejo de devoluciones de clientes
   - Endpoint: `/api/ReturnReceptions`

2. **Sincronización Bidireccional:**
   - Enviar movimientos de vuelta a ADM Cloud
   - Mantener consistencia automática

3. **Resolución Automática de Discrepancias:**
   - Flujo de revisión y resolución
   - Notificaciones automáticas

4. **Dashboard de Métricas:**
   - Visualización de discrepancias
   - Gráficos de movimientos
   - Alertas proactivas

5. **API REST Pública:**
   - Endpoints para integraciones externas
   - Autenticación por tokens

---

## 📝 CONCLUSIÓN

El sistema WMS es una solución completa para la gestión de inventario físico que complementa el ERP ADM Cloud. Sus características principales son:

✅ **Control de micro-ubicaciones** dentro del almacén principal  
✅ **Trazabilidad completa** de todos los movimientos  
✅ **Detección automática** de discrepancias  
✅ **Consultas rápidas** desde cache local  
✅ **Sincronización eficiente** con ADM Cloud  
✅ **Reglas de oro** que garantizan integridad de datos  

El sistema está diseñado para ser robusto, eficiente y fácil de mantener, con separación clara de responsabilidades y reglas de negocio bien definidas.

---

**Fin del Informe**

**Versión:** 1.0  
**Fecha:** 2026-01-22  
**Autor:** Sistema de Documentación Automática








