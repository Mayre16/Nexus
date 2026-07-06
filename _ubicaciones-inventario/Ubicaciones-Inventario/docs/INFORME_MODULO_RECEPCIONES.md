# INFORME TÉCNICO: MÓDULO DE RECEPCIONES
## Análisis en Profundidad de Funcionamiento y Problemas Actuales

**Fecha:** 23 de Enero, 2026  
**Módulo:** Sistema de Recepciones (WMS)  
**Estado:** Análisis y Diagnóstico

---

## 1. RESUMEN EJECUTIVO

El módulo de recepciones permite registrar entradas de inventario desde ADM Cloud al sistema WMS, asignando productos a ubicaciones físicas del almacén. Actualmente enfrenta un problema donde ubicaciones válidas de ADM Cloud (como "P2-P1-AR-N1") no pueden ser utilizadas para recepcionar cuando no existe un mapeo preconfigurado en el sistema.

---

## 2. ARQUITECTURA DEL MÓDULO

### 2.1 Componentes Principales

#### Backend (Python/Flask)
- **`routes/recepciones.py`**: Endpoints principales del módulo
- **`api/adm_cloud.py`**: Cliente para comunicación con ADM Cloud API
- **`utils/helpers.py`**: Funciones auxiliares para procesamiento de datos
- **`database/models.py`**: Modelos de datos (Movimiento, StockUbicacion, MapeoUbicacionADM_WMS)

#### Frontend (HTML/JavaScript)
- **`templates/recepciones.html`**: Interfaz de usuario para búsqueda y registro de recepciones
- **`templates/recepciones_historial.html`**: Vista de historial de recepciones procesadas

### 2.2 Flujo de Datos

```
Usuario → Frontend → Backend → ADM Cloud API
                ↓
         Base de Datos WMS
                ↓
         Frontend (Mostrar Resultados)
```

---

## 3. FUNCIONAMIENTO DETALLADO

### 3.1 Proceso de Búsqueda de Recepción

#### Paso 1: Usuario Ingresa DocID
- El usuario ingresa el número de recepción (DocID) en el frontend
- Selecciona el tipo: "Recepción (Conduce/Ajuste)" o "Compra con Recepción (Proveedor)"

#### Paso 2: Búsqueda en ADM Cloud
**Endpoint:** `POST /api/recepciones/buscar`

**Proceso:**
1. El backend llama a `ADMCloudClient.buscar_recepcion_por_docid()` o `buscar_vendor_recepcion_por_docid()`
2. El cliente ADM Cloud:
   - Lista recepciones en lotes de 50
   - Busca el DocID en cada lote
   - Cuando encuentra el DocID, obtiene el detalle completo por GUID
   - **IMPORTANTE:** Preserva `LocationName` y `LocationID` del listado si el detalle completo no los tiene

#### Paso 3: Extracción de Datos
El backend extrae los siguientes campos de la respuesta de ADM Cloud:

**Campos del Documento:**
- `ID` → `recepcion_guid` (GUID único)
- `DocID` → `recepcion_docid` (Número de documento)
- `DocType` → `doc_type` (Tipo: RECEPTION o VEND_REC)
- `LocationID` → `location_id` (GUID de ubicación en ADM Cloud)
- `LocationName` → `location_name` (Nombre de ubicación: "ADESA", "P2-P1-AR-N1", etc.)
- `DocDate` → `fecha` (Fecha del documento)
- `TotalAmount` → `total` (Monto total)
- `ImpactStock` → `impact_stock` (Si impacta stock)
- `Void` → `void` (Si está anulada)

**Campos Específicos por Tipo:**

**Recepción Normal (RECEPTION):**
- `Reference` → `cliente` (Referencia/Cliente)

**Compra con Recepción (VEND_REC):**
- `RelationshipName` → `proveedor` (Nombre del proveedor)
- `Reference` → `referencia` (Número de factura)
- `FiscalID` → `fiscal_id` (RNC)
- `NCF` → `ncf` (Número de comprobante fiscal)
- `TaxAmount` → `tax_amount` (ITBIS)

**Campos de Items (Productos):**
- `ItemID` → ID del producto en ADM Cloud
- `ItemSKU` / `SKU` → Código SKU
- `Name` → Nombre del producto
- `Quantity` → Cantidad recibida
- `PendingCompletedQuantity` → Cantidad pendiente
- `Price` / `Cost` → Precio/Costo unitario
- `Extended` / `ExtendedCost` → Precio/Costo extendido
- `UOMName` → Unidad de medida

### 3.2 Lógica de Ubicaciones

#### Detección de Tipo de Ubicación

El sistema implementa la siguiente lógica:

```python
# 1. Detectar si es ADESA
es_adesa = location_name and "ADESA" in location_name.upper()

# 2. Para ubicaciones NO-ADESA, buscar mapeo
if not es_adesa and location_id_resp:
    mapeos = MapeoUbicacionADM_WMS.query.filter_by(
        location_id_adm=location_id_resp,
        activo=True
    ).all()
    
    if mapeos:
        tiene_mapeo = True
        ubicaciones_fisicas_mapeadas = [mapeo.ubicacion_fisica_wms for mapeo in mapeos]
        if len(ubicaciones_fisicas_mapeadas) == 1:
            ubicacion_fisica_mapeada = ubicaciones_fisicas_mapeadas[0]
```

#### Comportamiento por Escenario

| Escenario | `es_adesa` | `tiene_mapeo` | Comportamiento |
|-----------|------------|---------------|----------------|
| **ADESA** | `True` | N/A | ✅ Usuario puede elegir CUALQUIER ubicación física WMS libremente |
| **NO-ADESA con mapeo único** | `False` | `True` (1 mapeo) | ✅ Sistema usa automáticamente la ubicación física mapeada (input bloqueado) |
| **NO-ADESA con múltiples mapeos** | `False` | `True` (N mapeos) | ⚠️ Sistema muestra lista de ubicaciones mapeadas (comportamiento futuro) |
| **NO-ADESA sin mapeo** | `False` | `False` | ❌ **BLOQUEA TODO** - Muestra error y no permite recepcionar |

### 3.3 Proceso de Registro de Recepción

#### Endpoint: `POST /api/recepciones/registrar`

**Validaciones:**
1. Verifica que `recepcion_guid` esté presente
2. Verifica que haya al menos un producto con ubicación asignada
3. Verifica que la recepción no haya sido registrada previamente (evita duplicados)

**Proceso por Producto:**
1. Valida SKU, ubicación y cantidad
2. Busca o crea registro en `StockUbicacion`:
   - Si existe: incrementa la cantidad
   - Si no existe: crea nuevo registro
3. Crea movimiento de tipo `RECEIPT`:
   - `tipo`: "RECEIPT"
   - `sku`: SKU del producto
   - `ubicacion_destino`: Ubicación física WMS asignada
   - `cantidad`: Cantidad recepcionada
   - `factura_id`: DocID de la recepción (para búsqueda posterior)
   - `factura_guid`: GUID de la recepción
   - `usuario_id`: ID del usuario que registra
   - `notas`: Nota descriptiva con DocID y GUID

**Transacción:**
- Todos los movimientos se crean en una sola transacción
- Si hay error, se hace rollback completo

### 3.4 Funcionalidades Adicionales

#### Refrescar Recepción
**Endpoint:** `POST /api/recepciones/<guid>/refrescar`

- Permite actualizar datos desde ADM Cloud
- Solo disponible para registros PENDIENTES o para administradores
- Actualiza todos los campos del documento

#### Revertir Recepción
**Endpoint:** `POST /api/recepciones/<guid>/revertir`
**Permisos:** Solo administradores

- Elimina todos los movimientos de tipo RECEIPT
- Revierte el stock (decrementa cantidades)
- No permite stock negativo (ajusta a 0 si es necesario)

---

## 4. PROBLEMA ACTUAL IDENTIFICADO

### 4.1 Descripción del Problema

**Situación:**
Cuando se busca una recepción cuyo `LocationName` en ADM Cloud es una ubicación NO-ADESA y que NO tiene mapeo configurado en `MapeoUbicacionADM_WMS`, el sistema:

1. ✅ **SÍ muestra** la ubicación correctamente en "Ubicación ADM:" (ej: "P2-P1-AR-N1")
2. ❌ **BLOQUEA** todos los inputs de asignación de ubicación
3. ❌ **MUESTRA ERROR** indicando que la ubicación no tiene mapeo configurado
4. ❌ **NO PERMITE** recepcionar los productos

**Ejemplo Real:**
- Conduce #327
- `LocationName` en ADM Cloud: "P2-P1-AR-N1"
- `LocationID`: "cbf352cd-2fda-4cb0-da97-08de4d22d171"
- Estado: NO es ADESA, NO tiene mapeo en BD
- Resultado: Sistema bloquea la recepción completamente

### 4.2 Análisis del Problema

#### Suposición Actual del Sistema

El sistema asume que:
- `LocationName` de ADM Cloud siempre representa una **ubicación lógica/almacén** (ej: "ADESA", "Mirador Sur")
- Estas ubicaciones lógicas deben mapearse a **ubicaciones físicas WMS** (ej: "2P1D01N1", "P2-P1-AR-N1")
- Si no hay mapeo, no se puede determinar dónde recepcionar físicamente

#### Realidad del Problema

En el caso de "P2-P1-AR-N1":
- Es una ubicación válida en ADM Cloud
- Es una ubicación que puede ser usada directamente como ubicación física WMS
- No requiere mapeo porque **YA ES** una ubicación física
- El sistema debería permitir recepcionar directamente en esa ubicación

### 4.3 Impacto del Problema

**Funcional:**
- Recepciones válidas no pueden ser procesadas
- Usuarios no pueden completar su trabajo
- Requiere intervención de administrador para crear mapeos

**Operacional:**
- Retrasos en el procesamiento de recepciones
- Necesidad de crear mapeos innecesarios
- Confusión sobre qué ubicaciones requieren mapeo y cuáles no

---

## 5. LÓGICA PROPUESTA PARA SOLUCIÓN

### 5.1 Nuevo Comportamiento Sugerido

| Escenario | Comportamiento Actual | Comportamiento Propuesto |
|-----------|----------------------|--------------------------|
| **ADESA** | ✅ Permite elegir ubicación física WMS libremente | ✅ Sin cambios |
| **NO-ADESA con mapeo único** | ✅ Usa ubicación física mapeada automáticamente | ✅ Sin cambios |
| **NO-ADESA sin mapeo** | ❌ BLOQUEA TODO | ✅ **Permite usar `LocationName` de ADM Cloud directamente como ubicación física WMS** |

### 5.2 Implementación Propuesta

#### Opción 1: Detección Automática
El sistema podría detectar si `LocationName` es una ubicación física WMS válida:
- Si tiene formato de ubicación física (ej: "P2-P1-AR-N1", "2P1D01N1")
- Usarla directamente sin requerir mapeo

**Ventajas:**
- Automático, no requiere configuración
- Funciona para ubicaciones que ya son físicas

**Desventajas:**
- Requiere lógica de detección (puede ser compleja)
- Puede haber falsos positivos/negativos

#### Opción 2: Permitir Siempre (Recomendada)
Cuando NO es ADESA y NO tiene mapeo:
- Permitir que el usuario ingrese manualmente la ubicación física
- Pre-llenar el campo con `LocationName` de ADM Cloud como sugerencia
- Permitir recepcionar usando esa ubicación directamente

**Ventajas:**
- Simple de implementar
- Flexible para el usuario
- No requiere detección automática

**Desventajas:**
- Usuario debe ingresar manualmente (aunque pre-llenado)

#### Opción 3: Híbrida
Combinar ambas:
- Si `LocationName` parece ser ubicación física → usarla automáticamente
- Si no → permitir ingreso manual con pre-llenado

### 5.3 Cambios Necesarios en el Código

#### Backend (`routes/recepciones.py`)
```python
# Cuando NO es ADESA y NO tiene mapeo:
# En lugar de bloquear, permitir recepcionar
# Pre-llenar ubicacion_fisica_sugerida con location_name
```

#### Frontend (`templates/recepciones.html`)
```javascript
// Cuando tiene_mapeo = false y es_adesa = false:
// - NO bloquear inputs
// - Pre-llenar campo de ubicación con recepcion.location_name
// - Permitir edición manual
// - Mostrar mensaje informativo (no error)
```

---

## 6. ESTRUCTURA DE DATOS

### 6.1 Tabla: `MapeoUbicacionADM_WMS`

**Propósito:** Mapear ubicaciones de ADM Cloud a ubicaciones físicas WMS

**Campos:**
- `id`: ID único
- `location_id_adm`: GUID de ubicación en ADM Cloud
- `location_name_adm`: Nombre de ubicación en ADM Cloud (ej: "ADESA", "Mirador Sur")
- `ubicacion_fisica_wms`: Código de ubicación física WMS (ej: "2P1D01N1", "P2-P1-AR-N1")
- `activo`: Si el mapeo está activo

**Relación:**
- Una ubicación ADM puede mapear a múltiples ubicaciones físicas WMS
- Pero no puede haber duplicados exactos (location_id_adm + ubicacion_fisica_wms)

### 6.2 Tabla: `Movimiento`

**Propósito:** Registrar todos los movimientos de inventario

**Campos Relevantes para Recepciones:**
- `tipo`: "RECEIPT" para recepciones
- `sku`: SKU del producto
- `ubicacion_destino`: Ubicación física WMS donde se recepcionó
- `cantidad`: Cantidad recepcionada
- `factura_id`: DocID de la recepción (para búsqueda)
- `factura_guid`: GUID de la recepción
- `usuario_id`: Usuario que registró
- `timestamp`: Fecha/hora del registro

### 6.3 Tabla: `StockUbicacion`

**Propósito:** Mantener stock actual por SKU y ubicación física

**Campos:**
- `sku`: SKU del producto
- `ubicacion`: Ubicación física WMS
- `cantidad`: Stock actual
- `updated_at`: Última actualización

---

## 7. FLUJO COMPLETO DE RECEPCIÓN (ACTUAL)

### 7.1 Flujo Normal (ADESA o con Mapeo)

```
1. Usuario busca recepción por DocID
   ↓
2. Sistema consulta ADM Cloud
   ↓
3. Sistema extrae datos (productos, ubicación, etc.)
   ↓
4. Sistema detecta tipo de ubicación:
   - Si es ADESA → Permite selección libre
   - Si NO es ADESA y tiene mapeo → Usa ubicación mapeada
   ↓
5. Usuario asigna productos a ubicaciones físicas
   ↓
6. Usuario hace clic en "Registrar"
   ↓
7. Sistema valida y crea movimientos
   ↓
8. Sistema actualiza stock
   ↓
9. Sistema muestra confirmación
```

### 7.2 Flujo Problemático (NO-ADESA sin Mapeo)

```
1. Usuario busca recepción por DocID
   ↓
2. Sistema consulta ADM Cloud
   ↓
3. Sistema extrae datos
   - LocationName: "P2-P1-AR-N1" ✅
   ↓
4. Sistema detecta:
   - es_adesa = False
   - tiene_mapeo = False
   ↓
5. Sistema BLOQUEA inputs ❌
   ↓
6. Sistema muestra error ❌
   ↓
7. Usuario NO puede recepcionar ❌
```

---

## 8. CASOS DE USO

### 8.1 Caso 1: Recepción en ADESA
**Input:** DocID de recepción con LocationName = "ADESA"  
**Proceso:** Sistema permite elegir cualquier ubicación física WMS  
**Resultado:** ✅ Funciona correctamente

### 8.2 Caso 2: Recepción en Mirador Sur (con mapeo)
**Input:** DocID de recepción con LocationName = "Mirador Sur"  
**Proceso:** Sistema busca mapeo, encuentra "Mirador Sur" → "B-03-04"  
**Resultado:** ✅ Usa "B-03-04" automáticamente

### 8.3 Caso 3: Recepción en P2-P1-AR-N1 (sin mapeo) - PROBLEMA ACTUAL
**Input:** DocID de recepción con LocationName = "P2-P1-AR-N1"  
**Proceso:** Sistema busca mapeo, NO encuentra  
**Resultado:** ❌ BLOQUEA recepción (PROBLEMA)

### 8.4 Caso 4: Recepción en P2-P1-AR-N1 (sin mapeo) - SOLUCIÓN PROPUESTA
**Input:** DocID de recepción con LocationName = "P2-P1-AR-N1"  
**Proceso:** Sistema busca mapeo, NO encuentra  
**Resultado:** ✅ Permite usar "P2-P1-AR-N1" directamente como ubicación física

---

## 9. CONSIDERACIONES TÉCNICAS

### 9.1 Validación de Ubicaciones

El sistema actual valida ubicaciones físicas con:
- Formato: letras, números, guiones, puntos, barras
- Longitud: máximo 50 caracteres
- No puede estar vacía

**Pregunta:** ¿"P2-P1-AR-N1" cumple con estas validaciones?
**Respuesta:** ✅ Sí, cumple perfectamente

### 9.2 Consistencia de Datos

**Preocupación:** Si se permite recepcionar directamente en ubicaciones de ADM Cloud sin mapeo, ¿cómo se mantiene la consistencia?

**Análisis:**
- El sistema ya guarda la ubicación física en `Movimiento.ubicacion_destino`
- El sistema ya guarda el DocID en `Movimiento.factura_id`
- No hay problema de consistencia, solo se está usando la ubicación de ADM Cloud directamente

### 9.3 Impacto en Reportes y Consultas

**Pregunta:** ¿Afecta esto a reportes o consultas existentes?

**Análisis:**
- Los reportes consultan `Movimiento.ubicacion_destino` (ubicación física)
- No hay diferencia si la ubicación viene de mapeo o de ADM Cloud directamente
- No hay impacto negativo

---

## 10. RECOMENDACIONES

### 10.1 Solución Inmediata (Recomendada)

**Implementar Opción 2:** Permitir recepcionar en ubicaciones de ADM Cloud directamente cuando no hay mapeo

**Cambios:**
1. Backend: No bloquear cuando `tiene_mapeo = False`
2. Frontend: Pre-llenar campo de ubicación con `location_name`
3. Frontend: Cambiar mensaje de error a mensaje informativo
4. Frontend: Permitir edición manual del campo

**Beneficios:**
- Resuelve el problema inmediatamente
- No requiere cambios en base de datos
- Mantiene flexibilidad para el usuario

### 10.2 Mejoras Futuras

1. **Detección Automática:** Implementar lógica para detectar si `LocationName` es ubicación física
2. **Sugerencias:** Mostrar lista de ubicaciones físicas WMS válidas cuando el usuario empiece a escribir
3. **Validación Mejorada:** Verificar que la ubicación física existe en `UbicacionFisica` antes de permitir recepcionar
4. **Auditoría:** Registrar cuando se usa ubicación de ADM Cloud directamente vs. mapeo

---

## 11. CONCLUSIÓN

El módulo de recepciones funciona correctamente para casos donde:
- La recepción es en ADESA (permite selección libre)
- La recepción es en ubicación NO-ADESA con mapeo configurado

**El problema actual** es que bloquea recepciones válidas cuando la ubicación de ADM Cloud no tiene mapeo, incluso cuando esa ubicación puede ser usada directamente como ubicación física WMS.

**La solución propuesta** es permitir que el sistema use la ubicación de ADM Cloud directamente cuando no hay mapeo, pre-llenando el campo y permitiendo recepcionar normalmente.

Esta solución mantiene la flexibilidad del sistema mientras resuelve el problema operacional inmediato.

---

## 12. ANEXOS

### 12.1 Endpoints del Módulo

- `POST /api/recepciones/buscar` - Buscar recepción por DocID
- `POST /api/recepciones/registrar` - Registrar recepción con ubicaciones
- `POST /api/recepciones/<guid>/refrescar` - Refrescar datos desde ADM Cloud
- `POST /api/recepciones/<guid>/revertir` - Revertir recepción (solo admin)

### 12.2 Archivos Clave

- `routes/recepciones.py` - Lógica principal del backend
- `api/adm_cloud.py` - Cliente ADM Cloud
- `templates/recepciones.html` - Interfaz de usuario
- `database/models.py` - Modelos de datos

### 12.3 Dependencias

- Flask (Framework web)
- SQLAlchemy (ORM)
- Requests (HTTP client para ADM Cloud API)

---

**Fin del Informe**



