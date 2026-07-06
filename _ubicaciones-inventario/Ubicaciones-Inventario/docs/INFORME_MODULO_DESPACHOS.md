# INFORME TÉCNICO: MÓDULO DE DESPACHOS WMS

## 📋 ÍNDICE
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Módulo](#arquitectura-del-módulo)
3. [Vistas y Interfaces](#vistas-y-interfaces)
4. [Lógica de Negocio](#lógica-de-negocio)
5. [Flujos de Proceso](#flujos-de-proceso)
6. [Modelos de Datos](#modelos-de-datos)
7. [Endpoints API](#endpoints-api)
8. [Características Especiales](#características-especiales)

---

## 1. RESUMEN EJECUTIVO

El módulo de **Despachos** es un sistema completo para gestionar el proceso de picking (preparación de pedidos) de facturas y despachos/conduces que provienen de ADM Cloud. Permite:

- ✅ Buscar documentos (facturas contado, crédito, despachos/conduces) desde ADM Cloud
- ✅ Registrar movimientos de picking por producto y ubicación física
- ✅ Controlar estados de despacho (PENDIENTE, EN_PROCESO, COMPLETO)
- ✅ Gestionar conflictos entre usuarios (prevención de trabajo duplicado)
- ✅ Visualizar historial completo con auditoría
- ✅ Recargar automáticamente documentos PENDIENTE desde ADM Cloud
- ✅ Soporte multi-ubicación (ADESA, Mirador Sur, etc.)

---

## 2. ARQUITECTURA DEL MÓDULO

### 2.1 Estructura de Archivos

```
routes/
├── despacho.py          # Lógica de registro de picks y estado
├── despachos.py         # Búsqueda de despachos/conduces desde ADM
├── facturas.py          # Búsqueda de facturas (CASH/CREDIT) desde ADM
├── detalles.py          # Vista de auditoría completa
└── historiales.py       # Historial de despachos procesados

templates/
├── despacho.html        # Vista principal de registro
└── despachos_historial.html  # Vista de historial

utils/
└── helpers.py           # Funciones auxiliares (calcular cantidades, etc.)

database/
└── models.py            # FacturaProcesada, Movimiento, etc.
```

### 2.2 Blueprints y Rutas

- **`despacho_bp`**: Registro de picks y consulta de estado
- **`despachos_bp`**: Búsqueda de despachos/conduces desde ADM
- **`facturas_bp`**: Búsqueda de facturas desde ADM
- **`detalles_bp`**: Detalles completos con auditoría
- **`historiales_bp`**: Listado de historial con filtros

---

## 3. VISTAS Y INTERFACES

### 3.1 Vista Principal: Registro de Despacho (`/despacho`)

**Template**: `templates/despacho.html`

#### Secciones de la Vista:

**A. Sección de Búsqueda** (solo visible cuando no hay documento cargado)
- **Campos**:
  - Tipo de Documento (dropdown): Factura Contado, Factura Crédito, Despacho/Conduce
  - Número de Documento (DocID): Input de texto
  - Botón "Buscar"
- **Funcionalidad**: 
  - Al buscar, consulta ADM Cloud según el tipo seleccionado
  - Si encuentra el documento, lo guarda/actualiza en `FacturaProcesada`
  - Asigna `usuario_solicitante` al usuario actual
  - Muestra alerta si otro usuario ya lo tiene solicitado

**B. Información del Documento** (visible cuando hay documento cargado)
- **Campos mostrados**:
  - Número de documento (DocID)
  - Cliente
  - Fecha
  - Total
  - **Ubicación ADM** (origen del documento)
  - Estado (PENDIENTE, EN_PROCESO, COMPLETO)
  - **Auditoría** (si viene desde historial):
    - Solicitado por
    - Procesado por
    - Fecha de inicio
    - Fecha de completado

**C. Lista de Productos a Despachar**
- **Por cada producto muestra**:
  - Nombre del producto
  - SKU
  - Cantidad Solicitada (desde ADM)
  - Cantidad Despachada (suma de movimientos PICK)
  - Cantidad Pendiente (calculada)
  - Stock en ADM (ubicación de origen)
  - Ubicaciones físicas disponibles (WMS) con stock
  - Inputs de registro (ubicación física + cantidad)
  - Botón "Registrar"

**D. Modo Vista/Edición**
- **Vista Normal**: Muestra inputs para registrar picks
- **Vista Detalle** (desde historial sin `editar=true`): Solo lectura, muestra movimientos históricos
- **Vista Edición** (desde historial con `editar=true`): Permite continuar registrando

### 3.2 Vista de Historial (`/despachos`)

**Template**: `templates/despachos_historial.html`

#### Características:

**A. Filtros Disponibles**:
- Fecha desde / hasta
- Ubicación ADM
- Tipo de documento (CASH, CREDIT, DISPATCH)
- Estado (PENDIENTE, EN_PROCESO, COMPLETO)
- Cliente
- Usuario
- Búsqueda general (DocID o cliente)

**B. Tabla de Resultados**:
- Columnas:
  - Número de documento
  - Fecha
  - Tipo
  - Cliente
  - Ubicación ADM
  - Estado
  - Cantidad de productos
  - Total
  - Usuario (quien procesó)
  - **Solicitado por** (quien lo buscó inicialmente)
  - Acciones (Ver Detalle, Editar)

**C. Funcionalidades**:
- Paginación (10 registros por página)
- Botón "Nuevo Despacho" → redirige a `/despacho`
- Botón "Ver Detalle" → `/despacho?guid={guid}` (solo lectura)
- Botón "Editar" → `/despacho?guid={guid}&editar=true` (permite editar)

---

## 4. LÓGICA DE NEGOCIO

### 4.1 Búsqueda de Documentos

#### 4.1.1 Facturas (CASH/CREDIT)
**Endpoint**: `POST /api/facturas/buscar`

**Proceso**:
1. Valida DocID
2. Busca en ADM Cloud usando `ADMCloudClient.buscar_factura_por_docid()`
3. Extrae productos usando `obtener_productos_factura()`
4. Extrae ubicación de origen (`LocationID`, `LocationName`)
5. Si no existe en BD, crea `FacturaProcesada` con:
   - `estado_despacho = 'PENDIENTE'`
   - `usuario_solicitante = usuario_actual`
   - `location_id` y `location_name` (ubicación ADM de origen)
6. Si existe, actualiza datos y asigna `usuario_solicitante` si no tiene
7. Retorna datos del documento

#### 4.1.2 Despachos/Conduces
**Endpoint**: `POST /api/despachos/buscar`

**Proceso**:
1. Similar a facturas, pero usa `ADMCloudClient.buscar_dispatch_por_docid()`
2. Extrae productos usando `obtener_productos_dispatch()`
3. Tipo fijo: `tipo_factura = "DISPATCH"`
4. Mismo proceso de guardado/actualización

### 4.2 Registro de Picks (Despachos)

**Endpoint**: `POST /api/despacho/registrar`

**Validaciones**:
1. ✅ GUID de documento válido
2. ✅ SKU válido
3. ✅ Ubicación física válida
4. ✅ Cantidad válida (> 0)
5. ✅ Producto existe en la factura
6. ✅ Cantidad no excede pendiente
7. ✅ Stock suficiente en ubicación física

**Proceso de Registro**:
1. Obtiene `FacturaProcesada` por GUID
2. Verifica que el producto está en `productos_json`
3. Calcula cantidad pendiente usando `calcular_cantidad_pendiente()`
4. Verifica stock en `StockUbicacion` (ubicación física WMS)
5. Crea `Movimiento` tipo "PICK":
   - `tipo = "PICK"`
   - `ubicacion_origen = ubicacion_fisica`
   - `ubicacion_destino = None`
   - `factura_guid = factura_guid`
   - `usuario_id = usuario_actual`
6. Decrementa stock en `StockUbicacion`
7. Actualiza estado de factura:
   - Si `estado_despacho == 'PENDIENTE'` → `'EN_PROCESO'`
   - Asigna `usuario_despachador` y `fecha_inicio`
8. Verifica si está completo:
   - Suma todas las cantidades despachadas
   - Si `total_despachado >= total_solicitado` → `estado_despacho = 'COMPLETO'`
   - Asigna `completed_at`
9. Commit a BD
10. Retorna éxito con cantidad pendiente actualizada

### 4.3 Consulta de Estado

**Endpoint**: `GET /api/despacho/factura/<factura_guid>/estado`

**Proceso**:
1. Obtiene `FacturaProcesada`
2. Para cada producto en `productos_json`:
   - Extrae SKU (normaliza: `SKU` o `ItemSKU`)
   - Calcula `cantidad_solicitada` (desde JSON)
   - Calcula `cantidad_despachada` usando `calcular_cantidad_despachada()`
   - Calcula `cantidad_pendiente` usando `calcular_cantidad_pendiente()`
   - Busca producto en `ProductoADM` (cache local):
     - Búsqueda exacta por SKU
     - Si no encuentra, búsqueda case-insensitive (ILIKE)
     - Si no encuentra, normaliza (quita guiones, espacios, puntos)
   - Obtiene stock ADM desde `StockProductoADM`:
     - **Filtra por ubicación de origen de la factura** (no hardcodeado a ADESA)
     - Usa `factura.location_name` para buscar stock correcto
   - Obtiene ubicaciones físicas disponibles desde `StockUbicacion`:
     - Solo ubicaciones con stock > 0
3. Retorna estado completo con todos los productos

### 4.4 Vista de Detalles (Auditoría)

**Endpoint**: `GET /api/detalles/despacho/<factura_guid>`

**Proceso Especial - Recarga Automática**:
1. Si `estado_despacho == 'PENDIENTE'`:
   - Consulta ADM Cloud nuevamente
   - Actualiza `FacturaProcesada` con datos frescos
   - Actualiza `productos_json`, `location_id`, `location_name`
   - Asigna `usuario_solicitante` si no tiene
   - **Esto permite que documentos consultados hace tiempo se actualicen automáticamente**

**Proceso Normal**:
1. Obtiene `FacturaProcesada`
2. Obtiene todos los `Movimiento` tipo "PICK" relacionados
3. Agrupa movimientos por SKU
4. Para cada SKU:
   - Obtiene nombre del producto desde `productos_json`
   - Suma cantidades despachadas
   - Lista todos los movimientos individuales con:
     - Ubicación origen
     - Cantidad
     - Fecha/hora
     - Usuario que lo registró
5. Si no hay movimientos pero hay productos en JSON:
   - Construye lista desde `productos_json` con cantidad despachada = 0
   - **Esto permite ver productos pendientes en registros PENDIENTE**
6. Retorna información completa de auditoría:
   - Datos del documento
   - Usuarios (solicitante y despachador)
   - Fechas (inicio, completado)
   - Productos con movimientos detallados

### 4.5 Historial de Despachos

**Endpoint**: `GET /api/historial/despachos`

**Filtros Aplicables**:
- Fecha desde/hasta
- Ubicación ADM (`location_name`)
- Tipo de documento (`tipo_factura`)
- Estado (`estado_despacho`)
- Cliente
- Usuario despachador
- Búsqueda general (DocID o cliente)

**Proceso**:
1. Construye query sobre `FacturaProcesada`
2. Aplica filtros
3. Pagina resultados (10 por página)
4. Para cada registro:
   - Cuenta productos desde `productos_json`
   - Obtiene usuarios (despachador y solicitante)
5. Retorna lista paginada

---

## 5. FLUJOS DE PROCESO

### 5.1 Flujo: Nuevo Despacho

```
Usuario → Clic "Nuevo Despacho"
    ↓
Vista: /despacho (sin parámetros)
    ↓
Usuario ingresa DocID y tipo
    ↓
Frontend → POST /api/facturas/buscar o /api/despachos/buscar
    ↓
Backend consulta ADM Cloud
    ↓
Si encuentra:
    - Crea/actualiza FacturaProcesada
    - estado_despacho = 'PENDIENTE'
    - usuario_solicitante = usuario_actual
    - Guarda location_id y location_name
    ↓
Frontend muestra información del documento
    ↓
Frontend → GET /api/despacho/factura/{guid}/estado
    ↓
Backend calcula cantidades y stock
    ↓
Frontend muestra productos con:
    - Cantidades (solicitada, despachada, pendiente)
    - Stock ADM (ubicación origen)
    - Ubicaciones físicas disponibles
    - Inputs para registrar
```

### 5.2 Flujo: Registrar Pick

```
Usuario ingresa ubicación física y cantidad
    ↓
Usuario clic "Registrar"
    ↓
Frontend → POST /api/despacho/registrar
    ↓
Backend valida:
    - SKU en factura
    - Cantidad <= pendiente
    - Stock suficiente en ubicación
    ↓
Si válido:
    - Crea Movimiento tipo "PICK"
    - Decrementa StockUbicacion
    - Actualiza estado factura:
      * PENDIENTE → EN_PROCESO
      * Asigna usuario_despachador
    - Verifica si completo
    ↓
Frontend recarga estado de productos
    ↓
Frontend actualiza UI con nuevas cantidades
```

### 5.3 Flujo: Ver Detalle desde Historial

```
Usuario → Historial → Clic "Ver Detalle"
    ↓
Redirección: /despacho?guid={guid}
    ↓
Frontend detecta parámetro guid
    ↓
Oculta sección de búsqueda
    ↓
Frontend → GET /api/detalles/despacho/{guid}
    ↓
Backend:
    - Si estado == 'PENDIENTE': Recarga desde ADM Cloud
    - Obtiene movimientos PICK
    - Agrupa por SKU
    - Si no hay movimientos: Construye desde productos_json
    ↓
Frontend muestra:
    - Información completa del documento
    - Auditoría (usuarios, fechas)
    - Productos con movimientos detallados
    - Solo lectura (inputs ocultos)
```

### 5.4 Flujo: Editar desde Historial

```
Usuario → Historial → Clic "Editar"
    ↓
Redirección: /despacho?guid={guid}&editar=true
    ↓
Mismo proceso que "Ver Detalle"
    ↓
Pero: Frontend muestra inputs de registro
    ↓
Usuario puede continuar registrando picks
```

### 5.5 Flujo: Prevención de Conflictos

```
Usuario A busca documento → usuario_solicitante = Usuario A
    ↓
Usuario B intenta buscar mismo documento
    ↓
Frontend detecta:
    - usuario_solicitante != Usuario B
    - estado_despacho == 'PENDIENTE'
    ↓
Muestra alerta: "Este documento fue solicitado por Usuario A"
    ↓
Si Usuario B confirma:
    - Frontend → POST /api/facturas/actualizar-solicitante
    - Backend actualiza usuario_solicitante = Usuario B
    ↓
Usuario B puede trabajar el documento
```

---

## 6. MODELOS DE DATOS

### 6.1 FacturaProcesada

**Tabla**: `facturas_procesadas`

**Campos Clave**:
- `factura_docid`: DocID del documento (ej: "00002932")
- `factura_guid`: GUID único de ADM Cloud
- `tipo_factura`: "CASH", "CREDIT", "DISPATCH"
- `estado_despacho`: "PENDIENTE", "EN_PROCESO", "COMPLETO", "CANCELADO"
- `usuario_solicitante`: Usuario que buscó el documento inicialmente
- `usuario_despachador`: Usuario que procesó el despacho
- `location_id`: GUID de ubicación ADM de origen
- `location_name`: Nombre de ubicación ADM (ej: "ADESA", "Mirador Sur")
- `productos_json`: JSON con productos del documento
- `fecha_inicio`: Fecha cuando cambió a EN_PROCESO
- `completed_at`: Fecha cuando se completó

**Estados**:
- **PENDIENTE**: Documento buscado pero sin picks registrados
- **EN_PROCESO**: Al menos un pick registrado, pero no completo
- **COMPLETO**: Todos los productos despachados
- **CANCELADO**: Despacho cancelado (no usado actualmente)

### 6.2 Movimiento

**Tabla**: `movimientos`

**Para Despachos**:
- `tipo = "PICK"`
- `ubicacion_origen`: Ubicación física WMS de donde se sacó
- `ubicacion_destino = None` (no aplica para picks)
- `factura_guid`: GUID de la factura/despacho
- `cantidad`: Cantidad despachada
- `usuario_id`: Usuario que registró el pick
- `timestamp`: Fecha/hora del registro

### 6.3 StockUbicacion

**Tabla**: `stock_por_ubicacion`

**Para Despachos**:
- Se decrementa cuando se registra un pick
- Se consulta para mostrar ubicaciones disponibles
- Se valida antes de permitir registrar pick

---

## 7. ENDPOINTS API

### 7.1 Búsqueda de Documentos

#### `POST /api/facturas/buscar`
- **Input**: `{ docid, tipo }`
- **Output**: Datos de factura con productos y ubicación
- **Lógica**: Consulta ADM Cloud, guarda/actualiza en BD

#### `POST /api/despachos/buscar`
- **Input**: `{ docid, location_id? }`
- **Output**: Datos de despacho/conduce con productos
- **Lógica**: Similar a facturas, pero para tipo DISPATCH

### 7.2 Registro de Picks

#### `POST /api/despacho/registrar`
- **Input**: `{ factura_guid, sku, ubicacion, cantidad }`
- **Output**: Confirmación y cantidad pendiente actualizada
- **Lógica**: Valida, crea movimiento, actualiza stock y estado

### 7.3 Consulta de Estado

#### `GET /api/despacho/factura/<factura_guid>/estado`
- **Output**: Estado completo con cantidades y stock por producto
- **Lógica**: Calcula cantidades despachadas, pendientes, y stock disponible

### 7.4 Detalles y Auditoría

#### `GET /api/detalles/despacho/<factura_guid>`
- **Output**: Información completa con movimientos detallados
- **Lógica Especial**: Si PENDIENTE, recarga desde ADM Cloud automáticamente

### 7.5 Historial

#### `GET /api/historial/despachos`
- **Query Params**: Filtros (fecha, ubicación, tipo, estado, cliente, usuario, search)
- **Output**: Lista paginada de despachos con información resumida

---

## 8. CARACTERÍSTICAS ESPECIALES

### 8.1 Recarga Automática para PENDIENTE

**Problema Resuelto**: Documentos consultados hace tiempo pueden tener datos desactualizados.

**Solución**: Cuando se accede a detalles de un documento PENDIENTE, el sistema:
1. Detecta que `estado_despacho == 'PENDIENTE'`
2. Consulta ADM Cloud nuevamente
3. Actualiza `FacturaProcesada` con datos frescos
4. Luego muestra los detalles actualizados

**Beneficio**: Garantiza que siempre se trabaja con la información más reciente de ADM Cloud.

### 8.2 Soporte Multi-Ubicación

**Problema Resuelto**: Facturas pueden venir de diferentes ubicaciones ADM (no solo ADESA).

**Solución**:
1. Al buscar documento, extrae `LocationID` y `LocationName` de ADM Cloud
2. Guarda en `FacturaProcesada.location_id` y `location_name`
3. Al consultar stock ADM, filtra por la ubicación de origen de la factura
4. Muestra la ubicación ADM en la interfaz

**Beneficio**: El sistema entiende correctamente desde qué ubicación ADM proviene cada documento.

### 8.3 Prevención de Conflictos

**Problema Resuelto**: Dos usuarios trabajando el mismo documento simultáneamente.

**Solución**:
1. Al buscar documento, se asigna `usuario_solicitante`
2. Si otro usuario intenta abrirlo, se muestra alerta
3. Usuario puede "tomar" el documento actualizando `usuario_solicitante`
4. Se muestra "Solicitado por" en el historial

**Beneficio**: Evita trabajo duplicado y permite rastrear quién está trabajando qué.

### 8.4 Cálculo de Cantidades

**Funciones Helper** (`utils/helpers.py`):

- **`calcular_cantidad_despachada(factura_guid, sku)`**:
  - Suma todos los movimientos PICK para ese SKU y factura
  - Retorna total despachado

- **`calcular_cantidad_pendiente(factura_guid, sku, cantidad_solicitada)`**:
  - Calcula: `cantidad_solicitada - cantidad_despachada`
  - Retorna máximo 0 (no puede ser negativo)

**Uso**: Se usa en validaciones y para mostrar estado en tiempo real.

### 8.5 Búsqueda Inteligente de Productos

**Problema**: SKUs pueden tener variaciones (guiones, espacios, mayúsculas/minúsculas).

**Solución** (en `/api/despacho/factura/<guid>/estado`):
1. Búsqueda exacta por SKU
2. Si no encuentra, búsqueda case-insensitive (ILIKE)
3. Si no encuentra, normaliza SKU (quita guiones, espacios, puntos) y compara
4. Esto permite encontrar productos aunque el SKU tenga pequeñas variaciones

### 8.6 Manejo de Estados

**Transiciones de Estado**:
- **PENDIENTE** → **EN_PROCESO**: Al registrar el primer pick
- **EN_PROCESO** → **COMPLETO**: Cuando `total_despachado >= total_solicitado`

**Campos Actualizados**:
- `fecha_inicio`: Cuando pasa a EN_PROCESO
- `usuario_despachador`: Cuando pasa a EN_PROCESO
- `completed_at`: Cuando pasa a COMPLETO

---

## 9. INTEGRACIÓN CON ADM CLOUD

### 9.1 Endpoints ADM Utilizados

- **Facturas Contado**: `GET /api/CashInvoices/{guid}`
- **Facturas Crédito**: `GET /api/CreditInvoices/{guid}`
- **Despachos/Conduces**: `GET /api/Dispatchs/{guid}`

### 9.2 Datos Extraídos de ADM

- Información del documento (DocID, fecha, cliente, total)
- Productos (Items) con SKU, nombre, cantidad
- **Ubicación de origen** (LocationID, LocationName)
- GUID único del documento

### 9.3 Cache Local

- `FacturaProcesada`: Cache de documentos consultados
- `ProductoADM`: Cache de productos para búsquedas rápidas
- `StockProductoADM`: Cache de stock por ubicación ADM

---

## 10. CONSIDERACIONES TÉCNICAS

### 10.1 Idempotencia

- Los picks se pueden registrar múltiples veces para el mismo producto
- La validación de cantidad pendiente previene exceder lo solicitado
- Cada pick crea un `Movimiento` independiente (auditoría completa)

### 10.2 Integridad de Datos

- Transacciones atómicas: Si falla cualquier paso, se hace rollback
- Validaciones antes de modificar stock
- Verificación de existencia de productos en factura

### 10.3 Rendimiento

- Cache local de productos y stock ADM
- Búsquedas indexadas por SKU y GUID
- Paginación en historial (10 registros por página)

### 10.4 Seguridad

- Autenticación requerida en todos los endpoints (`@require_auth`)
- Validación de datos de entrada
- Prevención de SQL injection (usando SQLAlchemy ORM)

---

## 11. RESUMEN DE FLUJOS COMPLETOS

### Flujo Completo: Despacho de Factura

```
1. Usuario busca factura → ADM Cloud
2. Sistema guarda en FacturaProcesada (PENDIENTE)
3. Usuario ve productos con cantidades y stock
4. Usuario registra picks uno por uno:
   - Selecciona ubicación física
   - Ingresa cantidad
   - Sistema valida y registra
   - Stock se decrementa
   - Estado cambia a EN_PROCESO
5. Cuando todos los productos están completos:
   - Estado cambia a COMPLETO
   - Se registra fecha de completado
6. Usuario puede ver historial con auditoría completa
```

### Flujo Completo: Ver Detalle desde Historial

```
1. Usuario ve historial de despachos
2. Clic "Ver Detalle" en un registro
3. Sistema detecta parámetro guid en URL
4. Si estado es PENDIENTE:
   - Recarga desde ADM Cloud
   - Actualiza datos en BD
5. Obtiene movimientos PICK relacionados
6. Agrupa por SKU y muestra:
   - Productos originales
   - Cantidades despachadas
   - Movimientos individuales con detalles
   - Información de auditoría (usuarios, fechas)
7. Vista solo lectura (sin inputs de registro)
```

---

## 12. PUNTOS CLAVE DEL SISTEMA

✅ **Multi-ubicación**: Soporta facturas desde cualquier ubicación ADM
✅ **Recarga automática**: Documentos PENDIENTE se actualizan desde ADM
✅ **Prevención de conflictos**: Sistema de solicitud de documentos
✅ **Auditoría completa**: Rastreo de todos los movimientos y usuarios
✅ **Validaciones robustas**: Previene errores y duplicaciones
✅ **Interfaz intuitiva**: Separación clara entre registro e historial
✅ **Estados claros**: PENDIENTE → EN_PROCESO → COMPLETO

---

**Fin del Informe**




