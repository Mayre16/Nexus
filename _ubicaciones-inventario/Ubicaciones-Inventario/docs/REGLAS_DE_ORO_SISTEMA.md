# REGLAS DE ORO DEL SISTEMA WMS
## Reglas de Negocio Fundamentales Configuradas

**Fecha:** 23 de Enero, 2026  
**Sistema:** WMS - Gestión de Inventario  
**Estado:** Activas en Producción

---

## RESUMEN EJECUTIVO

Las "Reglas de Oro" son reglas de negocio fundamentales que garantizan la integridad y consistencia de los datos entre el sistema ERP (ADM Cloud) y el sistema WMS físico. Estas reglas se ejecutan automáticamente durante los procesos de sincronización y gestión de inventario.

---

## REGLA DE ORO #1: DETECCIÓN Y ACTUALIZACIÓN DE PRODUCTOS DESAPARECIDOS

### Descripción

**Cuando un producto tenía stock > 0 en ADM Cloud pero ya no aparece en la respuesta de `/api/Stock`, el stock ERP debe actualizarse a 0.**

### Ubicación en el Código

**Archivo:** `routes/sincronizar.py`  
**Líneas:** 1032-1053

### Proceso

```
1. Durante sincronización de ubicación:
   - Sistema mantiene lista: item_ids_en_sync (productos que vienen en sync actual)
   ↓
2. Al finalizar sincronización:
   - Consulta productos con stock > 0 en BD local para esta ubicación
   - Compara: ¿item_id está en item_ids_en_sync?
   ↓
3. Si item_id NO está en item_ids_en_sync:
   → Producto desapareció de ADM Cloud
   → Stock ERP ahora es 0
   ↓
4. Acción:
   - Actualizar StockProductoADM.stock = 0.0
   - Registrar en logs
```

### Código Implementado

```python
# REGLA DE ORO #1: Detectar productos que desaparecieron de /api/Stock
# Si un producto tenía stock > 0 pero ya no viene en /api/Stock, stock ERP ahora es 0

# Buscar productos que tienen stock > 0 en BD pero NO están en item_ids_en_sync
stock_existentes = StockProductoADM.query.join(ProductoADM).filter(
    StockProductoADM.location_id == location_id,
    StockProductoADM.stock > 0
).all()

for stock_existente in stock_existentes:
    item_id_existente = stock_existente.producto.item_id
    if item_id_existente not in item_ids_en_sync:
        # REGLA DE ORO #1: Actualizar stock ERP a 0 (capa ERP/cache)
        stock_existente.stock = 0.0
        stock_existente.updated_at = datetime.utcnow()
        logger.info(f"Producto desaparecido detectado: SKU={sku}, stock anterior={stock_anterior}, ahora ERP=0")
```

### Casos de Uso

**Caso 1: Venta Completa**
- Producto "PA-001" tenía stock = 5 en ADESA
- Se vende todo el stock en ADM Cloud
- Stock en ADM Cloud ahora = 0
- Durante sincronización: "PA-001" NO viene en `/api/Stock`
- **Resultado:** Sistema actualiza `StockProductoADM.stock = 0` ✅

**Caso 2: Transferencia de Stock**
- Producto "PB-002" tenía stock = 10 en "Mirador Sur"
- Se transfiere todo a otra ubicación en ADM Cloud
- Stock en "Mirador Sur" ahora = 0
- Durante sincronización: "PB-002" NO viene en `/api/Stock` para "Mirador Sur"
- **Resultado:** Sistema actualiza `StockProductoADM.stock = 0` para "Mirador Sur" ✅

### Importancia

✅ **Mantiene consistencia:** El stock ERP en BD local siempre refleja el stock real en ADM Cloud  
✅ **Detecta cambios:** Identifica cuando productos se agotan o se mueven  
✅ **Base para otras reglas:** Permite detectar discrepancias (Regla #3)

---

## REGLA DE ORO #2: CONSULTAS DESDE BASE DE DATOS LOCAL

### Descripción

**La pantalla "Consulta de Productos" debe responder rápido y sin depender de ADM Cloud en tiempo real. Toda consulta debe leer la base de datos del WMS.**

### Ubicación en el Código

**Archivo:** `routes/productos.py`  
**Documentación oficial:** `REGLAS_DE_ORO_WMS.md` (líneas 44-63)

### Proceso

```
1. Usuario busca producto:
   - Por SKU
   - Por Nombre
   - Por Código de barras
   ↓
2. Sistema consulta BD local:
   - ProductoADM (catálogo)
   - StockProductoADM (stock ERP)
   - StockUbicacion (stock físico WMS)
   ↓
3. NO hace llamadas a ADM Cloud:
   - Respuesta inmediata
   - Sin dependencia de red externa
   - Sin riesgo de timeout
```

### Código Implementado

**En `routes/productos.py`:**

```python
# Búsqueda por SKU (BD local)
producto_db = ProductoADM.query.filter_by(sku=sku).first()

# Búsqueda por código de barras (BD local)
producto_db = ProductoADM.query.filter_by(codigo_barras=codigo_barras).first()

# Búsqueda por nombre (BD local)
productos = ProductoADM.query.filter(
    ProductoADM.nombre.ilike(f'%{nombre}%')
).all()

# Stock ERP (BD local)
stock_adm = StockProductoADM.query.join(ProductoADM).filter(
    ProductoADM.id == producto_db.id,
    StockProductoADM.stock > 0
).all()

# Stock físico WMS (BD local)
stock_ubicaciones = StockUbicacion.query.filter_by(sku=producto_db.sku).all()
```

### Casos de Uso

**Caso 1: Búsqueda Rápida**
- Usuario busca SKU "VP1"
- Sistema consulta `ProductoADM` en BD local
- Respuesta inmediata (< 100ms)
- **Resultado:** Producto encontrado instantáneamente ✅

**Caso 2: Consulta de Stock**
- Usuario consulta stock de "VP1"
- Sistema consulta `StockProductoADM` y `StockUbicacion` en BD local
- Muestra stock ERP por ubicación y stock físico WMS
- **Resultado:** Información completa sin esperar ADM Cloud ✅

**Caso 3: Sin Conexión a ADM Cloud**
- ADM Cloud está temporalmente fuera de servicio
- Usuario puede seguir consultando productos
- Sistema funciona normalmente desde BD local
- **Resultado:** Sistema sigue operativo ✅

### Excepciones

**❌ NO hay excepciones.** Si se necesita información de ADM Cloud, se debe sincronizar primero mediante:
- Sincronización manual (admin)
- Cron programado
- Procesos controlados

### Importancia

✅ **Rendimiento:** Respuestas instantáneas sin esperar ADM Cloud  
✅ **Disponibilidad:** Sistema funciona aunque ADM Cloud esté caído  
✅ **Experiencia de usuario:** Búsquedas rápidas y fluidas  
✅ **Carga del servidor:** Reduce llamadas a ADM Cloud  
✅ **Consistencia:** Datos sincronizados previamente garantizan información actualizada

---

## REGLA DE ORO #3: DETECCIÓN DE DISCREPANCIAS CRÍTICAS

### Descripción

**Cuando un producto tiene stock ERP = 0 pero stock físico WMS > 0, se debe crear una discrepancia crítica para revisión.**

### Ubicación en el Código

**Archivo 1:** `routes/sincronizar.py`  
**Líneas:** 1055-1094

**Archivo 2:** `routes/productos.py`  
**Líneas:** 170-200

### Proceso

```
1. Después de aplicar Regla #1:
   - Producto tiene stock ERP = 0
   ↓
2. Verificar stock físico WMS:
   - Consultar StockUbicacion para este SKU
   - Sumar todas las cantidades físicas
   ↓
3. Si stock_fisico_wms > 0:
   → Hay discrepancia crítica
   → ADM Cloud dice 0, pero físicamente hay stock
   ↓
4. Acción:
   - Crear registro en tabla Discrepancia
   - tipo = "critica"
   - estado = "pendiente"
   - Para que administrador la revise
```

### Código Implementado

**En `routes/sincronizar.py` (durante sincronización):**

```python
# REGLA DE ORO #3: Verificar si hay stock físico del WMS (crear discrepancia crítica)
stock_fisico_wms = StockUbicacion.query.filter_by(sku=producto_existente.sku).all()
stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico_wms if float(s.cantidad) > 0)

# Solo crear discrepancia si ADM=0 y Físico>0 (evento crítico)
if stock_fisico_total > 0:
    # Verificar si ya existe discrepancia pendiente
    discrepancia_existente = Discrepancia.query.filter_by(
        producto_id=producto_existente.id,
        location_id=location_id,
        estado='pendiente'
    ).first()
    
    if not discrepancia_existente:
        # Crear discrepancia crítica
        discrepancia = Discrepancia(
            producto_id=producto_existente.id,
            sku=producto_existente.sku,
            location_id=location_id,
            location_name=location_name,
            ubicacion_fisica=ubicacion_fisica_str,
            stock_erp=0.0,
            stock_fisico_wms=stock_fisico_total,
            tipo='critica',
            estado='pendiente',
            fecha_deteccion=datetime.utcnow()
        )
        db.session.add(discrepancia)
```

**En `routes/productos.py` (durante consulta de producto):**

```python
# REGLA DE ORO #3: Detectar discrepancias críticas (ADM=0 pero Físico>0)
# Si hay stock físico pero stock ERP total es 0, verificar si hay discrepancia no registrada
if stock_total_wms > 0 and stock_total_adm == 0:
    # Verificar si ya hay discrepancia registrada
    if not any(d['stock_erp'] == 0 and d['stock_fisico_wms'] > 0 for d in discrepancias):
        # Crear discrepancia temporal para mostrar (no guardar, solo mostrar en consulta)
        discrepancias.append({
            "location_name": "General",
            "ubicacion_fisica": ubicaciones_fisicas_str,
            "stock_erp": 0.0,
            "stock_fisico_wms": stock_total_wms,
            "tipo": "critica",
            "fecha_deteccion": None
        })
```

### Casos de Uso

**Caso 1: Producto Recepcionado pero No Registrado en ADM**
- Producto "PC-003" se recepciona físicamente en WMS (stock físico = 5)
- Pero NO se registra la recepción en ADM Cloud
- Stock ERP = 0, Stock Físico = 5
- **Resultado:** Sistema crea `Discrepancia` crítica ✅

**Caso 2: Producto Vendido en ADM pero No Despachado Físicamente**
- Producto "PD-004" se vende en ADM Cloud (stock ERP = 0)
- Pero NO se despacha físicamente del WMS
- Stock ERP = 0, Stock Físico = 10
- **Resultado:** Sistema crea `Discrepancia` crítica ✅

**Caso 3: Error en Sincronización**
- Producto "PE-005" tiene stock = 3 en ADM Cloud
- Pero durante sync, no se detecta correctamente
- Stock ERP = 0 (incorrecto), Stock Físico = 3
- **Resultado:** Sistema crea `Discrepancia` crítica para revisión ✅

### Estructura de Discrepancia

**Tabla:** `Discrepancia`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `producto_id` | Integer (FK) | ID del producto |
| `sku` | String | SKU del producto |
| `location_id` | String | GUID de ubicación ADM |
| `location_name` | String | Nombre de ubicación ADM |
| `ubicacion_fisica` | String | Ubicación física WMS |
| `stock_erp` | Numeric | Stock en ADM Cloud (ERP cache) |
| `stock_fisico_wms` | Numeric | Stock físico en WMS |
| `tipo` | String | Tipo: "critica" |
| `estado` | String | Estado: "pendiente", "revisado", "resuelto" |
| `fecha_deteccion` | DateTime | Fecha de detección |
| `fecha_revision` | DateTime | Fecha de revisión (opcional) |
| `fecha_resolucion` | DateTime | Fecha de resolución (opcional) |
| `notas` | Text | Notas del administrador |
| `resuelto_por` | Integer (FK) | Usuario que resolvió |

### Importancia

✅ **Detecta inconsistencias:** Identifica cuando hay diferencias entre ERP y WMS físico  
✅ **Previene pérdidas:** Detecta productos físicos no registrados en ERP  
✅ **Auditoría:** Permite rastrear y resolver discrepancias  
✅ **Control de calidad:** Asegura que el inventario físico coincida con el sistema

---

## FLUJO COMPLETO DE APLICACIÓN DE REGLAS

### Durante Sincronización de Ubicación

```
┌─────────────────────────────────────────────────────────┐
│ 1. Sincronizar stock desde ADM Cloud                  │
│    - Obtener items con stock > 0 desde /api/Stock     │
│    - Mantener lista: item_ids_en_sync                 │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. REGLA DE ORO #1: Detectar productos desaparecidos  │
│    - Comparar stock en BD vs. item_ids_en_sync        │
│    - Si producto NO está en sync:                     │
│      → stock ERP = 0                                   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. REGLA DE ORO #3: Detectar discrepancias críticas   │
│    - Para cada producto con stock ERP = 0:            │
│      → Verificar stock físico WMS                      │
│      → Si stock_fisico > 0:                            │
│        → Crear Discrepancia crítica                    │
└─────────────────────────────────────────────────────────┘
```

### Durante Consulta de Producto

```
┌─────────────────────────────────────────────────────────┐
│ 1. Consultar stock ERP (StockProductoADM)              │
│    - Sumar stock de todas las ubicaciones ADM         │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Consultar stock físico WMS (StockUbicacion)        │
│    - Sumar stock de todas las ubicaciones físicas     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. REGLA DE ORO #3: Detectar discrepancias            │
│    - Si stock_fisico > 0 y stock_erp = 0:             │
│      → Mostrar discrepancia (temporal o guardada)     │
└─────────────────────────────────────────────────────────┘
```

---

## RELACIÓN ENTRE REGLAS

### Dependencia

```
REGLA #1 (Detectar desaparecidos)
         ↓
    [Aplica: stock ERP = 0]
         ↓
REGLA #3 (Detectar discrepancias)
         ↓
    [Verifica: stock físico WMS]
         ↓
    [Si físico > 0: Crea Discrepancia]
```

**La Regla #3 depende de la Regla #1:**
- La Regla #1 identifica productos con stock ERP = 0
- La Regla #3 verifica si esos productos tienen stock físico
- Si hay stock físico pero ERP = 0 → discrepancia crítica

---

## CASOS ESPECIALES

### Caso: Producto con Múltiples Ubicaciones Físicas

**Escenario:**
- Producto "PF-006" tiene stock ERP = 0
- Pero tiene stock físico en 3 ubicaciones:
  - "2P1D01N1": 2 unidades
  - "2P1D01N2": 3 unidades
  - "TIENDA": 1 unidad

**Aplicación de Regla #3:**
- Suma total físico: 2 + 3 + 1 = 6 unidades
- Crea UNA discrepancia con:
  - `stock_fisico_wms = 6`
  - `ubicacion_fisica = "2P1D01N1, 2P1D01N2, TIENDA"`

### Caso: Discrepancia Ya Existente

**Escenario:**
- Producto "PG-007" ya tiene discrepancia pendiente
- Durante nueva sincronización, se detecta nuevamente

**Comportamiento:**
- NO crea duplicado
- Actualiza discrepancia existente:
  - `stock_erp = 0.0`
  - `stock_fisico_wms = nuevo_total`
  - `fecha_deteccion = ahora`

---

## IMPACTO EN EL SISTEMA

### Beneficios

✅ **Integridad de Datos:** Mantiene consistencia entre ERP y WMS  
✅ **Detección Automática:** Identifica problemas sin intervención manual  
✅ **Auditoría:** Registra todas las discrepancias para revisión  
✅ **Prevención de Pérdidas:** Detecta productos físicos no contabilizados

### Métricas

**Regla #1:**
- Productos actualizados a stock ERP = 0 durante cada sincronización
- Logs: "Producto desaparecido detectado: SKU=..., stock anterior=..., ahora ERP=0"

**Regla #3:**
- Discrepancias críticas creadas durante cada sincronización
- Logs: "DISCREPANCIA CRÍTICA creada: SKU=..., ERP=0, Físico=..., Ubicaciones=..."

---

## CONFIGURACIÓN Y PARÁMETROS

### Parámetros Actuales

**Regla #1:**
- Se ejecuta: Durante sincronización de ubicación
- Frecuencia: Cada vez que se sincroniza una ubicación
- Scope: Por ubicación (location_id)

**Regla #3:**
- Se ejecuta: 
  - Durante sincronización de ubicación (automático)
  - Durante consulta de producto (visualización)
- Frecuencia: 
  - Automático: Cada sincronización
  - Visualización: Cada consulta de producto
- Scope: Por producto y ubicación

### Tablas Involucradas

- `StockProductoADM`: Stock ERP por ubicación ADM
- `StockUbicacion`: Stock físico WMS por ubicación física
- `Discrepancia`: Registro de discrepancias detectadas
- `ProductoADM`: Información del producto

---

## LOGS Y MONITOREO

### Logs Generados

**Regla #1:**
```
INFO: Producto desaparecido detectado: SKU=PA-001, stock anterior=5.0, ahora ERP=0
INFO: Productos desaparecidos: 3 productos actualizados a stock ERP=0
```

**Regla #3:**
```
WARNING: DISCREPANCIA CRÍTICA creada: SKU=PB-002, ERP=0, Físico=10.0, Ubicaciones=2P1D01N1, TIENDA
INFO: Discrepancia existente actualizada: SKU=PC-003
INFO: Productos desaparecidos: 3 productos actualizados a stock ERP=0, 2 discrepancias críticas creadas
```

### Monitoreo Recomendado

1. **Revisar logs periódicamente:**
   - Buscar "DISCREPANCIA CRÍTICA creada"
   - Verificar productos desaparecidos

2. **Revisar tabla Discrepancia:**
   - Consultar discrepancias pendientes
   - Resolver discrepancias críticas

3. **Alertas:**
   - Considerar notificaciones para discrepancias críticas
   - Dashboard de discrepancias pendientes

---

## MEJORAS FUTURAS SUGERIDAS

### Mejoras a Regla #2

**Posibles mejoras:**
- Cache inteligente con invalidación automática
- Indicadores de última sincronización en consultas
- Sincronización automática programada más frecuente

### Mejoras a Reglas Existentes

**Regla #1:**
- Notificación cuando se detectan muchos productos desaparecidos
- Historial de productos desaparecidos

**Regla #3:**
- Clasificación de discrepancias (crítica, menor, informativa)
- Auto-resolución de discrepancias menores
- Reportes de discrepancias por ubicación

---

## CONCLUSIÓN

Las Reglas de Oro garantizan la integridad y consistencia del inventario entre el sistema ERP (ADM Cloud) y el sistema WMS físico. Actualmente están implementadas:

✅ **REGLA DE ORO #1:** Detección y actualización de productos desaparecidos  
✅ **REGLA DE ORO #2:** Consultas desde base de datos local  
✅ **REGLA DE ORO #3:** Detección de discrepancias críticas

Estas reglas se ejecutan automáticamente durante los procesos de sincronización y consulta, asegurando que el sistema siempre refleje el estado real del inventario.

---

## ANEXOS

### Anexo A: Ubicaciones en el Código

**REGLA DE ORO #1:**
- `routes/sincronizar.py` - Líneas 1032-1053

**REGLA DE ORO #2:**
- `routes/productos.py` - Implementada en todas las búsquedas (líneas 43-221)
- Documentación oficial: `REGLAS_DE_ORO_WMS.md` - Líneas 44-63

**REGLA DE ORO #3:**
- `routes/sincronizar.py` - Líneas 1055-1094
- `routes/productos.py` - Líneas 170-200

### Anexo B: Tablas Relacionadas

- `stock_productos_adm` - Stock ERP por ubicación
- `stock_por_ubicacion` - Stock físico WMS
- `discrepancias` - Registro de discrepancias

---

**Fin del Documento**

