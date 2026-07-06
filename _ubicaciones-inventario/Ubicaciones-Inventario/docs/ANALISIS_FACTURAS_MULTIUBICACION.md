# 🔍 ANÁLISIS: Facturas desde Múltiples Ubicaciones ADM

**Fecha:** 2026-01-19  
**Problema Identificado:** El sistema actual asume que todas las facturas vienen de "ADESA", pero ADM Cloud permite facturar desde múltiples ubicaciones.

---

## ❌ PROBLEMA ACTUAL

### Situación Detectada

En el código actual (`routes/despacho.py` línea 240), el sistema **hardcodea** la búsqueda de stock solo para "ADESA":

```python
# Línea 240 de routes/despacho.py
if location_upper == "ADESA":
    stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
    # ...
```

**Problemas:**
1. ❌ Si una factura fue facturada desde "Mirador Sur", el sistema busca stock en "ADESA"
2. ❌ No se extrae ni se muestra la ubicación de origen de la factura
3. ❌ El stock se descuenta de ubicaciones físicas WMS sin considerar la ubicación ADM de origen
4. ❌ Puede generar inconsistencias si el stock está en otra ubicación ADM

### Escenario Problemático

```
1. Cliente compra en "Mirador Sur" (ubicación ADM)
2. Factura se crea en ADM Cloud con LocationID = "Mirador Sur"
3. Usuario busca factura en WMS
4. Sistema busca stock en "ADESA" (incorrecto)
5. Sistema muestra ubicaciones físicas WMS sin considerar origen ADM
6. Usuario despacha desde ubicación física incorrecta
7. ❌ Stock se descuenta de ubicación física que no corresponde a "Mirador Sur"
```

---

## ✅ SOLUCIÓN PROPUESTA

### Extensión de la Estrategia de Transferencias

La estrategia propuesta para **Transferencias** puede extenderse para resolver este problema, aplicando los mismos principios:

1. **Identificar ubicación de origen de la factura**
2. **Mapear ubicación ADM a ubicaciones físicas WMS**
3. **Descontar stock de la ubicación correcta**

---

## 🏗️ CAMBIOS NECESARIOS

### 1. Extraer LocationID de Facturas

**En `routes/facturas.py` - Endpoint `/api/facturas/buscar`:**

Agregar extracción de ubicación de origen:

```python
# Después de obtener factura_adm
factura_data = factura_adm.get("data", {})

# Extraer ubicación de origen
location_id = factura_data.get("LocationID")
location_name = factura_data.get("LocationName") or "ADESA"  # Default a ADESA si no viene

# Incluir en respuesta
respuesta = {
    "success": True,
    "factura": {
        # ... campos existentes ...
        "location_id": location_id,
        "location_name": location_name,  # "ADESA", "Mirador Sur", "401 BIKE", etc.
        # ...
    }
}
```

### 2. Guardar LocationID en FacturaProcesada

**Modificar modelo `FacturaProcesada` (migración):**

```python
class FacturaProcesada(db.Model):
    # ... campos existentes ...
    
    # NUEVO: Ubicación ADM de origen
    location_id = db.Column(db.String(100), nullable=True)  # GUID ubicación ADM
    location_name = db.Column(db.String(200), nullable=True)  # "ADESA", "Mirador Sur", etc.
    
    # ... resto de campos ...
```

**Actualizar `routes/facturas.py` al crear `FacturaProcesada`:**

```python
factura = FacturaProcesada(
    # ... campos existentes ...
    location_id=location_id,
    location_name=location_name,
    # ...
)
```

### 3. Usar Ubicación Correcta en Despacho

**Modificar `routes/despacho.py` - Endpoint `/api/despacho/factura/<guid>/estado`:**

```python
# Obtener factura
factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()

# Obtener ubicación de origen de la factura
location_name_origen = factura.location_name or "ADESA"  # Default a ADESA
location_id_origen = factura.location_id

# Buscar stock en la ubicación CORRECTA (no hardcodeado a ADESA)
for stock_adm in stock_ubicaciones_adm:
    location_upper = stock_adm.location_name.upper() if stock_adm.location_name else ""
    
    # ✅ Buscar en la ubicación de origen de la factura
    if location_upper == location_name_origen.upper():
        stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
        if stock_cantidad > 0:
            stock_origen = stock_cantidad
            break
```

### 4. Mostrar Ubicación de Origen en UI

**En templates de facturas/despacho:**

Mostrar claramente desde qué ubicación ADM fue facturada:

```html
<div class="factura-info">
    <h3>Factura #{{ factura.docid }}</h3>
    <div class="ubicacion-origen">
        <strong>Facturada desde:</strong> {{ factura.location_name }}
    </div>
    <!-- ... resto de información ... -->
</div>
```

### 5. Validar Stock en Ubicación Correcta

**En `routes/despacho.py` - Endpoint `/api/despacho/registrar`:**

Antes de permitir el despacho, validar que el stock esté disponible en la ubicación ADM correcta:

```python
# Obtener factura
factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
location_name_origen = factura.location_name or "ADESA"

# Verificar stock en ubicación ADM de origen
producto_adm = ProductoADM.query.filter_by(sku=sku).first()
if producto_adm:
    stock_adm_origen = StockProductoADM.query.filter_by(
        producto_id=producto_adm.id,
        location_name=location_name_origen
    ).first()
    
    if not stock_adm_origen or float(stock_adm_origen.stock) < float(cantidad):
        return jsonify({
            "success": False,
            "error": f"Stock insuficiente en {location_name_origen} (ubicación de origen de la factura)"
        }), 400
```

---

## 🔄 INTEGRACIÓN CON ESTRATEGIA DE TRANSFERENCIAS

### Principios Compartidos

1. **Mapeo de Ubicaciones ADM → WMS:**
   - Usar la misma tabla `MapeoUbicacionADM_WMS` propuesta para transferencias
   - Mapear ubicación ADM de factura a ubicaciones físicas WMS sugeridas

2. **Resolución de Nombres:**
   - Usar `SyncLocationStatus` para resolver nombres de ubicaciones ADM
   - Misma función `obtener_nombre_ubicacion_por_id()` usada en transferencias

3. **Validación de Stock:**
   - Verificar stock en ubicación ADM correcta antes de despachar
   - Mostrar stock disponible por ubicación ADM

### Flujo Integrado

```
1. Factura creada en ADM Cloud desde "Mirador Sur"
   → LocationID = "guid-mirador-sur"
   → LocationName = "Mirador Sur"

2. Usuario busca factura en WMS
   → Sistema extrae location_name = "Mirador Sur"
   → Guarda en FacturaProcesada.location_name

3. Usuario ve estado de despacho
   → Sistema busca stock en "Mirador Sur" (no en "ADESA")
   → Muestra stock disponible en ubicación ADM correcta
   → Muestra ubicaciones físicas WMS mapeadas a "Mirador Sur"

4. Usuario despacha
   → Sistema valida stock en "Mirador Sur" (ubicación ADM)
   → Descuenta de ubicación física WMS seleccionada
   → Crea Movimiento con referencia a ubicación ADM de origen
```

---

## 📋 PLAN DE IMPLEMENTACIÓN

### Fase 1: Extracción y Almacenamiento (1 día)

**Tareas:**
1. ✅ Agregar campos `location_id` y `location_name` a `FacturaProcesada` (migración)
2. ✅ Modificar `routes/facturas.py` para extraer y guardar ubicación de origen
3. ✅ Actualizar creación de `FacturaProcesada` para incluir ubicación

**Criterios de Éxito:**
- Facturas guardan ubicación de origen correctamente
- Ubicación se muestra en UI de facturas

### Fase 2: Uso en Despacho (1 día)

**Tareas:**
1. ✅ Modificar `routes/despacho.py` para usar ubicación de origen (no hardcodeado)
2. ✅ Buscar stock en ubicación ADM correcta
3. ✅ Validar stock antes de permitir despacho
4. ✅ Mostrar ubicación de origen en UI de despacho

**Criterios de Éxito:**
- Sistema busca stock en ubicación ADM correcta
- Validaciones previenen despachos desde ubicación incorrecta
- UI muestra claramente desde dónde fue facturada

### Fase 3: Mapeo y Sugerencias (Opcional - 1 día)

**Tareas:**
1. ✅ Usar tabla `MapeoUbicacionADM_WMS` (de estrategia de transferencias)
2. ✅ Sugerir ubicaciones físicas WMS basadas en ubicación ADM
3. ✅ Validar que ubicación física seleccionada corresponda a ubicación ADM

**Criterios de Éxito:**
- Sistema sugiere ubicaciones físicas correctas
- Validación previene errores de selección

---

## 🎯 RESPUESTA A LA PREGUNTA

### ¿La estrategia de Transferencias resuelve facturas multi-ubicación?

**Respuesta: Parcialmente, pero necesita extensión.**

**Lo que SÍ resuelve:**
- ✅ Principios de mapeo de ubicaciones ADM → WMS
- ✅ Resolución de nombres de ubicaciones
- ✅ Tabla de mapeo `MapeoUbicacionADM_WMS`
- ✅ Funciones helper para obtener nombres de ubicaciones

**Lo que NO resuelve directamente:**
- ❌ Extracción de `LocationID` de facturas (no está implementado)
- ❌ Almacenamiento de ubicación de origen en `FacturaProcesada`
- ❌ Uso de ubicación correcta en lógica de despacho (actualmente hardcodeado a "ADESA")

**Solución:**
- Extender la estrategia aplicando los mismos principios
- Agregar extracción y almacenamiento de ubicación de origen
- Modificar lógica de despacho para usar ubicación correcta

---

## ✅ RECOMENDACIÓN FINAL

**Implementar en paralelo con Transferencias:**

1. **Fase 1 de Transferencias** (MVP) - 2-3 días
2. **Fase 1 de Facturas Multi-ubicación** (Extracción) - 1 día
3. **Fase 2 de Facturas Multi-ubicación** (Uso en Despacho) - 1 día
4. **Fase 2 de Transferencias** (Mapeo) - 1-2 días
5. **Fase 3 Integrada** (Mapeo compartido) - 1 día

**Total estimado:** 6-8 días para ambos módulos completos.

---

## 📊 IMPACTO

### Antes (Problema)
- ❌ Facturas desde "Mirador Sur" buscan stock en "ADESA"
- ❌ Despachos pueden descontar de ubicación incorrecta
- ❌ Inconsistencias entre stock ADM y stock físico WMS

### Después (Solución)
- ✅ Facturas identifican correctamente ubicación de origen
- ✅ Sistema busca stock en ubicación ADM correcta
- ✅ Despachos validan stock en ubicación de origen
- ✅ Mapeo claro entre ubicaciones ADM y físicas WMS
- ✅ Trazabilidad completa de movimientos

---

**Documento preparado por:** Sistema de Análisis Técnico  
**Fecha:** 2026-01-19  
**Versión:** 1.0




