# 📋 PLAN TÉCNICO: REGLA DE ORO #4 EN TRANSFERENCIAS
## Confirmación de Viabilidad y Consideraciones Críticas

**Fecha:** 23 de Enero, 2026  
**Sistema:** WMS - Módulo de Transferencias  
**Estado:** Plan Técnico Final

---

## ✅ CONFIRMACIÓN DE VIABILIDAD

### **Respuesta: ✅ VIABLE Y SEGURA**

La implementación es **viable y segura** porque:

1. ✅ **Sigue patrón probado** - Misma lógica que Recepciones (Regla de Oro #4)
2. ✅ **No rompe reglas de oro** - Mejora precisión y evita discrepancias falsas
3. ✅ **Implementación localizada** - Cambios solo en módulo de transferencias
4. ✅ **Retrocompatible** - Mantiene funcionamiento actual para ADESA → ADESA
5. ✅ **Soporta multi-ubicación** - Permite dividir SKU en múltiples ubicaciones físicas destino (NO-ADESA → ADESA)

### **✅ CONFIRMACIÓN: Multi-ubicación por SKU en NO-ADESA → ADESA**

**Requisito confirmado:** En transferencias **NO-ADESA → ADESA**, el sistema debe soportar que un mismo SKU pueda distribuirse en múltiples ubicaciones físicas del WMS, igual que en Recepciones (split por filas).

**Ejemplo:**
- SKU123, Qty 10 desde "Consignación X" → ADESA
- Asignación 1: 4 unidades en 2P1D01N1
- Asignación 2: 6 unidades en 2P1D01N2
- **Resultado:** 2 movimientos TRANSFER, 2 actualizaciones de StockUbicacion (solo destino ADESA)

**Implementación:**
- ✅ Estructura de datos similar a Recepciones: `productos` con `asignaciones_destino[]`
- ✅ Validación de suma: `suma_asignaciones <= cantidad_total`
- ✅ Un Movimiento TRANSFER por cada asignación destino
- ✅ Actualización de StockUbicacion por cada ubicación destino
- ✅ UI con botón "Agregar otra ubicación" y validación en tiempo real

### **Compatibilidad con Reglas de Oro:**

| Regla | Impacto | Estado |
|-------|---------|--------|
| **#1: Productos Desaparecidos** | ✅ Ninguno | No afecta sincronización |
| **#2: Consultas desde BD Local** | ✅ Ninguno | Consultas siguen usando BD local |
| **#3: Discrepancias Críticas** | ✅ Positivo | Evita discrepancias falsas por NO-ADESA |
| **#4: ADESA vs NO-ADESA** | ✅ Compatible | Extensión de la regla a transferencias |

---

## 🔍 ANÁLISIS DE 3 PUNTOS CRÍTICOS

### **PUNTO 1: Truncamiento de LocationName en Movimiento**

#### **Problema Identificado:**

```python
# Modelo actual
class Movimiento:
    ubicacion_origen = db.Column(db.String(50), nullable=True)  # ❌ Solo 50 caracteres
    ubicacion_destino = db.Column(db.String(50), nullable=True)  # ❌ Solo 50 caracteres
    notas = db.Column(db.Text, nullable=True)  # ✅ Text ilimitado
```

**Riesgo:**
- LocationName de ADM puede ser >50 caracteres (ej: "Consignación 401 Bike - Zona Norte")
- Se truncaría información importante
- Pérdida de trazabilidad completa

#### **Solución Propuesta: Opción A (Recomendada) - Ampliar Campos + Notas**

**Ventajas:**
- ✅ Mantiene compatibilidad con código existente
- ✅ Permite almacenar LocationName completo
- ✅ No requiere migración de datos existentes

**Implementación:**

```python
# 1. Ampliar campos en modelo Movimiento
class Movimiento:
    ubicacion_origen = db.Column(db.String(200), nullable=True)  # ✅ Ampliado a 200
    ubicacion_destino = db.Column(db.String(200), nullable=True)  # ✅ Ampliado a 200
    notas = db.Column(db.Text, nullable=True)  # Para LocationName completo si >200
```

**Lógica en `registrar_transferencia()`:**

```python
# Para ubicaciones NO-ADESA, guardar LocationName completo
if not origen_es_adesa:
    ubicacion_origen_mov = location_name_origen[:200]  # Truncar a 200 si necesario
    # Guardar completo en notas si se truncó
    notas_adicionales = []
    if len(location_name_origen) > 200:
        notas_adicionales.append(f"Origen completo: {location_name_origen}")
else:
    ubicacion_origen_mov = ubicacion_origen  # Ubicación física WMS (siempre <50)

if not destino_es_adesa:
    ubicacion_destino_mov = location_name_destino[:200]  # Truncar a 200 si necesario
    if len(location_name_destino) > 200:
        notas_adicionales.append(f"Destino completo: {location_name_destino}")
else:
    ubicacion_destino_mov = ubicacion_destino  # Ubicación física WMS (siempre <50)

# Crear movimiento
movimiento = Movimiento(
    tipo="TRANSFER",
    ...
    ubicacion_origen=ubicacion_origen_mov,
    ubicacion_destino=ubicacion_destino_mov,
    notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
          (" ".join(notas_adicionales) if notas_adicionales else "")
)
```

#### **Solución Propuesta: Opción B - Solo Notas (Alternativa)**

**Si no queremos modificar el modelo:**

```python
# Guardar LocationName completo en notas
notas = f"Transferencia desde {origen_nombre} hacia {destino_nombre}. "
if not origen_es_adesa:
    notas += f"Origen ADM: {location_name_origen}. "
if not destino_es_adesa:
    notas += f"Destino ADM: {location_name_destino}. "

movimiento = Movimiento(
    ...
    ubicacion_origen=ubicacion_origen[:50] if origen_es_adesa else "NO-ADESA",
    ubicacion_destino=ubicacion_destino[:50] if destino_es_adesa else "NO-ADESA",
    notas=notas
)
```

**Recomendación:** ✅ **Opción A** (ampliar campos) - Más limpia y mantiene información estructurada.

---

### **PUNTO 2: Backend Recalcula Flags (Seguridad)**

#### **Problema Identificado:**

**Riesgo de Seguridad:**
- Frontend podría enviar flags incorrectos (`origen_es_adesa=false` cuando es ADESA)
- Usuario malicioso podría modificar stock físico incorrectamente
- Violación de reglas de negocio

#### **Solución: Backend SIEMPRE Recalcula**

**Implementación en `registrar_transferencia()`:**

```python
@transferencias_bp.route('/api/transferencias/registrar', methods=['POST'])
@require_auth
def registrar_transferencia():
    try:
        data = request.json or {}
        transferencia_guid = data.get('transferencia_guid')
        
        # Obtener datos de ADM Cloud (fuente de verdad)
        adm_client = get_adm_client()
        transfer_adm = adm_client.obtener_location_transfer_por_guid(transferencia_guid)
        
        if not transfer_adm or not transfer_adm.get("success"):
            return jsonify({
                "success": False,
                "error": "No se pudo obtener la transferencia desde ADM Cloud"
            }), 404
        
        transfer_data = transfer_adm.get("data", {})
        location_id_origen = transfer_data.get("LocationID")
        location_id_destino = transfer_data.get("ReceptionLocationID")
        
        # Obtener nombres de ubicaciones
        origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
        destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)
        
        # Si no se encuentra en cache, usar los nombres del JSON
        if origen_nombre.startswith(location_id_origen[:8] if location_id_origen else ""):
            origen_nombre = transfer_data.get("LocationName", origen_nombre)
        if destino_nombre.startswith(location_id_destino[:8] if location_id_destino else ""):
            destino_nombre = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName", destino_nombre)
        
        # ✅ SEGURIDAD: Backend SIEMPRE recalcula flags (ignora flags del frontend)
        origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
        destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)
        
        # Log para auditoría
        logger.info(f"Transferencia {transferencia_guid}: origen_es_adesa={origen_es_adesa}, destino_es_adesa={destino_es_adesa} (recalculado desde ADM Cloud)")
        
        # Continuar con lógica condicional usando flags recalculados
        ...
```

**Función Helper para Detección Robusta:**

```python
def es_ubicacion_adesa(location_id: str, location_name: str) -> bool:
    """
    Determina si una ubicación es ADESA usando whitelist de LocationID y fallback a LocationName
    
    Args:
        location_id: GUID de la ubicación ADM
        location_name: Nombre de la ubicación ADM
    
    Returns:
        True si es ADESA, False si no
    """
    from config import get_config
    config = get_config()
    
    # PRIORIDAD 1: Verificar whitelist de LocationID (más confiable)
    if location_id:
        adesa_location_ids = get_adesa_location_ids()  # Función que obtiene whitelist
        if location_id in adesa_location_ids:
            return True
    
    # PRIORIDAD 2: Verificar LocationName (fallback)
    if location_name:
        location_name_upper = location_name.upper()
        # Buscar "ADESA" en el nombre
        if "ADESA" in location_name_upper:
            return True
    
    return False
```

**Recomendación:** ✅ **Backend SIEMPRE recalcula** - Ignorar flags del frontend completamente.

---

### **PUNTO 3: Detección Robusta por LocationID Whitelist**

#### **Problema Identificado:**

**Limitaciones de Detección por String:**
- ❌ LocationName puede cambiar: "ADESA Principal" → "ADESA - Sucursal Central"
- ❌ Falsos positivos: "ADESA Consignación" (NO es ADESA física)
- ❌ Falsos negativos: "Almacén Principal" (puede ser ADESA con otro nombre)
- ❌ No es mantenible: Requiere actualizar código si cambia nombre

#### **Solución Propuesta: Whitelist de LocationID**

**Ventajas:**
- ✅ Más confiable (LocationID es único e inmutable)
- ✅ Mantenible (configuración, no código)
- ✅ Evita falsos positivos/negativos
- ✅ Fallback a LocationName si LocationID no está en whitelist

**Implementación:**

#### **Opción A: Configuración en `config.py` (Recomendada para pocas ubicaciones)**

```python
# config.py
class Config:
    ...
    # Whitelist de LocationID ADESA (GUIDs de ubicaciones ADESA físicas)
    ADESA_LOCATION_IDS = [
        "guid-ubicacion-adesa-1",
        "guid-ubicacion-adesa-2",
        # Agregar más según necesidad
    ]
    
    # Fallback: Si LocationID no está en whitelist, usar detección por nombre
    ADESA_LOCATION_NAME_KEYWORDS = ["ADESA"]  # Palabras clave para detectar ADESA por nombre
```

**Función Helper:**

```python
# utils/helpers.py o routes/transferencias.py
def es_ubicacion_adesa(location_id: str, location_name: str) -> bool:
    """
    Determina si una ubicación es ADESA usando whitelist de LocationID y fallback a LocationName
    
    Args:
        location_id: GUID de la ubicación ADM
        location_name: Nombre de la ubicación ADM
    
    Returns:
        True si es ADESA, False si no
    """
    from config import get_config
    config = get_config()
    
    # PRIORIDAD 1: Verificar whitelist de LocationID (más confiable)
    if location_id:
        adesa_location_ids = getattr(config, 'ADESA_LOCATION_IDS', [])
        if location_id in adesa_location_ids:
            logger.debug(f"LocationID {location_id} encontrado en whitelist ADESA")
            return True
    
    # PRIORIDAD 2: Verificar LocationName (fallback)
    if location_name:
        location_name_upper = location_name.upper()
        keywords = getattr(config, 'ADESA_LOCATION_NAME_KEYWORDS', ['ADESA'])
        for keyword in keywords:
            if keyword.upper() in location_name_upper:
                logger.debug(f"LocationName '{location_name}' contiene '{keyword}' (fallback)")
                return True
    
    return False

def get_adesa_location_ids():
    """Obtiene la lista de LocationID ADESA desde configuración"""
    from config import get_config
    config = get_config()
    return getattr(config, 'ADESA_LOCATION_IDS', [])
```

#### **Opción B: Tabla de Base de Datos (Recomendada para muchas ubicaciones)**

**Ventajas:**
- ✅ Más escalable
- ✅ Permite gestión desde UI (futuro)
- ✅ No requiere reiniciar servidor para cambios

**Modelo Propuesto:**

```python
# database/models.py
class UbicacionADM(db.Model):
    """Configuración de ubicaciones ADM (ADESA vs NO-ADESA)"""
    __tablename__ = 'ubicaciones_adm'
    
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.String(100), unique=True, nullable=False, index=True)  # GUID ADM
    location_name = db.Column(db.String(200), nullable=False)  # Nombre ADM
    es_adesa = db.Column(db.Boolean, default=False, nullable=False, index=True)  # True si es ADESA física
    activo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<UbicacionADM {self.location_name} - ADESA: {self.es_adesa}>'
```

**Función Helper con BD:**

```python
def es_ubicacion_adesa(location_id: str, location_name: str) -> bool:
    """
    Determina si una ubicación es ADESA consultando BD y fallback a LocationName
    """
    from database.models import UbicacionADM
    
    # PRIORIDAD 1: Consultar BD (más confiable)
    if location_id:
        ubicacion_adm = UbicacionADM.query.filter_by(
            location_id=location_id,
            activo=True
        ).first()
        
        if ubicacion_adm:
            logger.debug(f"LocationID {location_id} encontrado en BD: es_adesa={ubicacion_adm.es_adesa}")
            return ubicacion_adm.es_adesa
    
    # PRIORIDAD 2: Fallback a LocationName
    if location_name:
        location_name_upper = location_name.upper()
        if "ADESA" in location_name_upper:
            logger.debug(f"LocationName '{location_name}' contiene 'ADESA' (fallback)")
            return True
    
    return False
```

**Recomendación:** ✅ **Opción A (config.py)** para inicio, **Opción B (BD)** si crece la cantidad de ubicaciones.

---

## 📋 PLAN TÉCNICO DE IMPLEMENTACIÓN

### **FASE 1: Preparación (Backend - Helpers)**

#### **1.1. Crear Función Helper de Detección ADESA**

**Archivo:** `utils/helpers.py` o `routes/transferencias.py`

```python
def es_ubicacion_adesa(location_id: str, location_name: str) -> bool:
    """
    Determina si una ubicación es ADESA usando whitelist de LocationID y fallback a LocationName
    
    PRIORIDAD 1: LocationID whitelist (más confiable)
    PRIORIDAD 2: LocationName contiene "ADESA" (fallback)
    
    Args:
        location_id: GUID de la ubicación ADM
        location_name: Nombre de la ubicación ADM
    
    Returns:
        True si es ADESA, False si no
    """
    from config import get_config
    config = get_config()
    
    # PRIORIDAD 1: Verificar whitelist de LocationID
    if location_id:
        adesa_location_ids = getattr(config, 'ADESA_LOCATION_IDS', [])
        if location_id in adesa_location_ids:
            return True
    
    # PRIORIDAD 2: Verificar LocationName (fallback)
    if location_name:
        location_name_upper = location_name.upper()
        keywords = getattr(config, 'ADESA_LOCATION_NAME_KEYWORDS', ['ADESA'])
        for keyword in keywords:
            if keyword.upper() in location_name_upper:
                return True
    
    return False
```

#### **1.2. Agregar Whitelist en Config**

**Archivo:** `config.py`

```python
class Config:
    ...
    # Whitelist de LocationID ADESA (GUIDs de ubicaciones ADESA físicas)
    # Obtener estos GUIDs desde ADM Cloud o SyncLocationStatus
    ADESA_LOCATION_IDS = [
        # Ejemplo: "guid-ubicacion-adesa-principal",
        # Agregar más según necesidad
    ]
    
    # Fallback: Palabras clave para detectar ADESA por nombre
    ADESA_LOCATION_NAME_KEYWORDS = ["ADESA"]
```

#### **1.3. Ampliar Campos en Modelo Movimiento**

**Archivo:** `database/models.py`

```python
class Movimiento(db.Model):
    ...
    ubicacion_origen = db.Column(db.String(200), nullable=True)  # ✅ Ampliado de 50 a 200
    ubicacion_destino = db.Column(db.String(200), nullable=True)  # ✅ Ampliado de 50 a 200
    notas = db.Column(db.Text, nullable=True)  # Para LocationName completo si >200
```

**Migración SQL (si aplica):**

```sql
-- Para MySQL/MariaDB
ALTER TABLE movimientos 
    MODIFY COLUMN ubicacion_origen VARCHAR(200) NULL,
    MODIFY COLUMN ubicacion_destino VARCHAR(200) NULL;

-- Para SQLite (requiere recrear tabla o usar ALTER TABLE si soportado)
```

---

### **FASE 2: Backend - Búsqueda**

#### **2.1. Modificar `buscar_transferencia()`**

**Archivo:** `routes/transferencias.py`

**Cambios:**
1. Agregar llamada a `es_ubicacion_adesa()` para origen y destino
2. Agregar flags en respuesta
3. Log para auditoría

```python
@transferencias_bp.route('/api/transferencias/buscar', methods=['POST'])
@require_auth
def buscar_transferencia():
    ...
    # Después de obtener origen_nombre y destino_nombre (línea ~181)
    
    # ✅ REGLA DE ORO #4: Detectar si ubicaciones son ADESA (recalcular siempre)
    origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
    destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)
    
    logger.info(f"Transferencia {transfer_guid}: origen_es_adesa={origen_es_adesa} (LocationID={location_id_origen}, Name={origen_nombre}), destino_es_adesa={destino_es_adesa} (LocationID={location_id_destino}, Name={destino_nombre})")
    
    # Agregar en respuesta (línea ~252)
    respuesta = {
        "success": True,
        "transferencia": {
            ...
            "origen_es_adesa": origen_es_adesa,
            "destino_es_adesa": destino_es_adesa,
            ...
        }
    }
```

---

### **FASE 3: Backend - Registro**

#### **3.1. Modificar `registrar_transferencia()`**

**Archivo:** `routes/transferencias.py`

**Cambios Principales:**

1. **Recalcular flags desde ADM Cloud (ignorar frontend):**
```python
# ✅ SEGURIDAD: Backend SIEMPRE recalcula flags (ignora flags del frontend)
origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)

logger.info(f"Transferencia {transferencia_guid}: origen_es_adesa={origen_es_adesa}, destino_es_adesa={destino_es_adesa} (recalculado desde ADM Cloud)")
```

2. **Soporte para estructura con asignaciones múltiples (similar a Recepciones):**
```python
# NUEVA ESTRUCTURA: productos con asignaciones múltiples para destino ADESA
productos = data.get('productos', [])
# COMPATIBILIDAD: mantener soporte para estructura antigua
productos_ubicaciones = data.get('productos_ubicaciones', [])

# Si viene estructura nueva, usar esa. Si no, convertir estructura antigua
if productos and len(productos) > 0:
    usar_estructura_nueva = True
elif productos_ubicaciones and len(productos_ubicaciones) > 0:
    # Estructura antigua: convertir a nueva
    usar_estructura_nueva = False
    productos_dict = {}
    for prod_ubic in productos_ubicaciones:
        sku = prod_ubic.get('sku', '').strip().upper()
        if sku not in productos_dict:
            productos_dict[sku] = {
                'sku': sku,
                'item_id': prod_ubic.get('item_id', ''),
                'cantidad_total': 0,
                'asignaciones_destino': []  # Para destino ADESA
            }
        cantidad = float(prod_ubic.get('cantidad', 0))
        productos_dict[sku]['cantidad_total'] += cantidad
        productos_dict[sku]['asignaciones_destino'].append({
            'ubicacion': prod_ubic.get('ubicacion_destino', '').strip(),
            'cantidad': cantidad
        })
    productos = list(productos_dict.values())
```

3. **Lógica condicional para validaciones y procesamiento:**
```python
# Procesar cada producto con asignaciones múltiples
for producto in productos:
    sku = producto.get('sku', '').strip().upper()
    cantidad_total = float(producto.get('cantidad_total', 0))
    item_id = producto.get('item_id', '')
    
    # Para destino ADESA: asignaciones múltiples
    asignaciones_destino = producto.get('asignaciones_destino', [])
    # Para origen ADESA: asignación única (o múltiple si se requiere en el futuro)
    asignaciones_origen = producto.get('asignaciones_origen', [])
    
    # Validar SKU
    es_valido, mensaje = validar_sku(sku)
    if not es_valido:
        return error(f"SKU inválido: {mensaje}")
    
    # ✅ REGLA DE ORO #4: Validar origen según tipo
    if origen_es_adesa:
        # Origen ADESA: validar ubicación física y stock
        if not asignaciones_origen or len(asignaciones_origen) == 0:
            return error(f"El producto {sku} necesita asignación de ubicación física origen")
        
        # Validar suma de asignaciones origen
        suma_origen = sum(float(a.get('cantidad', 0)) for a in asignaciones_origen)
        if suma_origen > cantidad_total:
            return error(f"El producto {sku} tiene asignaciones origen que exceden la cantidad total")
        
        # Procesar cada asignación origen
        for asignacion_origen in asignaciones_origen:
            ubicacion_origen = asignacion_origen.get('ubicacion', '').strip()
            cantidad_origen = float(asignacion_origen.get('cantidad', 0))
            
            es_valido, mensaje = validar_ubicacion(ubicacion_origen)
            if not es_valido:
                return error(f"Ubicación origen inválida para {sku}: {mensaje}")
            
            # Validar stock suficiente en origen
            stock_ubic_origen = StockUbicacion.query.filter_by(
                sku=sku,
                ubicacion=ubicacion_origen
            ).first()
            
            if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < cantidad_origen:
                return error(f"Stock insuficiente en ubicación origen {ubicacion_origen} para SKU {sku}")
            
            # Restar stock de origen
            stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - cantidad_origen
            stock_ubic_origen.updated_at = datetime.utcnow()
    else:
        # Origen NO-ADESA: no validar stock, usar location_name
        ubicacion_origen_mov = origen_nombre[:200]
    
    # ✅ REGLA DE ORO #4: Validar destino según tipo
    if destino_es_adesa:
        # Destino ADESA: validar asignaciones múltiples
        if not asignaciones_destino or len(asignaciones_destino) == 0:
            return error(f"El producto {sku} necesita al menos una asignación de ubicación física destino")
        
        # Validar suma de asignaciones destino
        suma_destino = sum(float(a.get('cantidad', 0)) for a in asignaciones_destino)
        if suma_destino > cantidad_total:
            return error(f"El producto {sku} tiene asignaciones destino que exceden la cantidad total. Total: {cantidad_total}, Suma: {suma_destino}")
        
        # Procesar cada asignación destino (puede ser múltiple)
        for asignacion_destino in asignaciones_destino:
            ubicacion_destino = asignacion_destino.get('ubicacion', '').strip()
            cantidad_destino = float(asignacion_destino.get('cantidad', 0))
            
            es_valido, mensaje = validar_ubicacion(ubicacion_destino)
            if not es_valido:
                return error(f"Ubicación destino inválida para {sku}: {mensaje}")
            
            es_valido, mensaje = validar_cantidad(cantidad_destino)
            if not es_valido:
                return error(f"Cantidad inválida para {sku} en {ubicacion_destino}: {mensaje}")
            
            # Sumar stock a destino
            stock_ubic_destino = StockUbicacion.query.filter_by(
                sku=sku,
                ubicacion=ubicacion_destino
            ).first()
            
            if stock_ubic_destino:
                stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + cantidad_destino
                stock_ubic_destino.updated_at = datetime.utcnow()
            else:
                stock_ubic_destino = StockUbicacion(
                    product_id=item_id or "",
                    sku=sku,
                    ubicacion=ubicacion_destino,
                    cantidad=cantidad_destino
                )
                db.session.add(stock_ubic_destino)
            
            # Determinar ubicación origen para este movimiento
            if origen_es_adesa:
                # Si origen es ADESA, usar la asignación origen correspondiente
                # (simplificado: usar primera asignación origen si hay múltiples)
                ubicacion_origen_mov = asignaciones_origen[0].get('ubicacion', '').strip() if asignaciones_origen else ubicacion_origen_mov
            else:
                ubicacion_origen_mov = origen_nombre[:200]
            
            # Guardar LocationName completo en notas si se truncó
            notas_adicionales = []
            if not origen_es_adesa and len(origen_nombre) > 200:
                notas_adicionales.append(f"Origen ADM completo: {origen_nombre}")
            if not destino_es_adesa and len(destino_nombre) > 200:
                notas_adicionales.append(f"Destino ADM completo: {destino_nombre}")
            
            # Crear movimiento por cada asignación destino
            movimiento = Movimiento(
                tipo="TRANSFER",
                product_id=item_id or "",
                sku=sku,
                ubicacion_origen=ubicacion_origen_mov,
                ubicacion_destino=ubicacion_destino,
                cantidad=cantidad_destino,
                factura_id=transfer_data.get("DocID", ""),
                factura_guid=transferencia_guid,
                usuario_id=session.get('user_id'),
                notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
                      (" ".join(notas_adicionales) if notas_adicionales else "")
            )
            db.session.add(movimiento)
            movimientos_creados.append(movimiento.to_dict())
    else:
        # Destino NO-ADESA: no modificar StockUbicacion, crear movimiento único
        ubicacion_destino_mov = destino_nombre[:200]
        
        # Guardar LocationName completo en notas si se truncó
        notas_adicionales = []
        if not origen_es_adesa and len(origen_nombre) > 200:
            notas_adicionales.append(f"Origen ADM completo: {origen_nombre}")
        if not destino_es_adesa and len(destino_nombre) > 200:
            notas_adicionales.append(f"Destino ADM completo: {destino_nombre}")
        
        # Crear movimiento único
        movimiento = Movimiento(
            tipo="TRANSFER",
            product_id=item_id or "",
            sku=sku,
            ubicacion_origen=ubicacion_origen_mov if not origen_es_adesa else asignaciones_origen[0].get('ubicacion', ''),
            ubicacion_destino=ubicacion_destino_mov,
            cantidad=cantidad_total,
            factura_id=transfer_data.get("DocID", ""),
            factura_guid=transferencia_guid,
            usuario_id=session.get('user_id'),
            notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
                  (" ".join(notas_adicionales) if notas_adicionales else "")
        )
        db.session.add(movimiento)
        movimientos_creados.append(movimiento.to_dict())
```

---

### **FASE 4: Frontend**

#### **4.1. Modificar `mostrarProductos()`**

**Archivo:** `templates/transferencias.html`

**Mostrar campos condicionalmente según flags del backend** (similar a Recepciones).

**Para NO-ADESA → ADESA:**
- Mostrar sección de asignaciones múltiples para destino
- Permitir agregar múltiples ubicaciones físicas destino
- Validar suma de asignaciones = cantidad total
- Mostrar "Total asignado" y "Restante"

**Código similar a Recepciones:**
```javascript
// Estructura de datos
let productosAsignados = {}; // {sku: {item_id, cantidad_total, asignaciones_destino: [{ubicacion, cantidad}]}}

// Si destino_es_adesa, mostrar UI de asignaciones múltiples
if (destino_es_adesa) {
    // Renderizar asignaciones destino con botón "Agregar otra ubicación"
    renderizarAsignacionesDestino(sku, yaRegistrada);
}
```

#### **4.2. Agregar Funciones Helper (similar a Recepciones)**

```javascript
function calcularSumaAsignacionesDestino(sku) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones_destino) {
        return 0;
    }
    return productosAsignados[sku].asignaciones_destino.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

function validarSumatoriaDestino(sku) {
    const cantidad_total = productosAsignados[sku].cantidad_total;
    const suma = calcularSumaAsignacionesDestino(sku);
    
    if (suma > cantidad_total) {
        return { valido: false, mensaje: `La suma de asignaciones (${suma}) excede la cantidad total (${cantidad_total})` };
    }
    if (suma < cantidad_total) {
        return { valido: false, mensaje: `Faltan ${(cantidad_total - suma).toFixed(2)} unidades por asignar` };
    }
    return { valido: true, mensaje: '' };
}

function agregarUbicacionDestino(sku) {
    if (!productosAsignados[sku]) {
        productosAsignados[sku] = { item_id: '', cantidad_total: 0, asignaciones_destino: [] };
    }
    productosAsignados[sku].asignaciones_destino.push({ ubicacion: '', cantidad: 0 });
    renderizarAsignacionesDestino(sku, false);
}

function eliminarAsignacionDestino(sku, index) {
    if (productosAsignados[sku] && productosAsignados[sku].asignaciones_destino) {
        productosAsignados[sku].asignaciones_destino.splice(index, 1);
        renderizarAsignacionesDestino(sku, false);
    }
}

function renderizarAsignacionesDestino(sku, yaRegistrada) {
    // Similar a renderizarAsignaciones() en recepciones.html
    // Mostrar filas de ubicación/cantidad con botón eliminar
}
```

#### **4.3. Modificar Función de Registro**

**Enviar payload con estructura de asignaciones múltiples:**

```javascript
async function registrarTransferencia() {
    const origenEsAdesa = transferenciaActual && transferenciaActual.origen_es_adesa === true;
    const destinoEsAdesa = transferenciaActual && transferenciaActual.destino_es_adesa === true;
    
    // Preparar productos con asignaciones
    const productos = [];
    for (const sku in productosAsignados) {
        const asignacion = productosAsignados[sku];
        const producto = transferenciaActual.productos.find(p => 
            (p.SKU || p.ItemSKU || '').toUpperCase() === sku
        );
        
        productos.push({
            sku: sku,
            item_id: asignacion.item_id,
            cantidad_total: parseFloat(producto?.Quantity || 0),
            asignaciones_destino: destinoEsAdesa ? asignacion.asignaciones_destino : [],
            asignaciones_origen: origenEsAdesa ? asignacion.asignaciones_origen : []
        });
    }
    
    // Enviar al backend
    const response = await fetch('/api/transferencias/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            transferencia_guid: transferenciaActual.guid,
            transferencia_docid: transferenciaActual.docid,
            location_name_origen: transferenciaActual.origen_nombre,
            location_name_destino: transferenciaActual.destino_nombre,
            productos: productos  // Nueva estructura con asignaciones
        })
    });
}
```

---

### **FASE 5: Función de Reversión (Solo Administradores)**

#### **5.1. Crear Endpoint `revertir_transferencia()`**

**Archivo:** `routes/transferencias.py`

**Similar a `revertir_recepcion()`, pero adaptado para transferencias:**

```python
@transferencias_bp.route('/api/transferencias/<transferencia_guid>/revertir', methods=['POST'])
@require_admin
def revertir_transferencia(transferencia_guid):
    """Reverte una transferencia procesada (solo administradores) - Elimina movimientos y revierte stock"""
    try:
        # Obtener todos los movimientos de esta transferencia
        movimientos = Movimiento.query.filter_by(
            tipo='TRANSFER',
            factura_guid=transferencia_guid
        ).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "No se encontraron movimientos para esta transferencia"
            }), 404
        
        # Obtener transferencia para determinar origen y destino ADESA
        transferencia = TransferenciaProcesada.query.filter_by(
            transferencia_guid=transferencia_guid
        ).first()
        
        if not transferencia:
            return jsonify({
                "success": False,
                "error": "Transferencia no encontrada"
            }), 404
        
        # Determinar si origen y destino eran ADESA
        origen_es_adesa = es_ubicacion_adesa(
            transferencia.location_id_origen,
            transferencia.location_name_origen
        )
        destino_es_adesa = es_ubicacion_adesa(
            transferencia.location_id_destino,
            transferencia.location_name_destino
        )
        
        # Revertir stock y eliminar movimientos
        stock_revertido_origen = 0
        stock_revertido_destino = 0
        
        for movimiento in movimientos:
            # REGLA DE ORO #4: Revertir stock origen SOLO si era ADESA
            if origen_es_adesa and movimiento.ubicacion_origen:
                # Revertir stock origen (SUMAR - porque se había restado)
                stock_ubic_origen = StockUbicacion.query.filter_by(
                    sku=movimiento.sku,
                    ubicacion=movimiento.ubicacion_origen
                ).first()
                
                if stock_ubic_origen:
                    stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) + float(movimiento.cantidad)
                    stock_ubic_origen.updated_at = datetime.utcnow()
                    stock_revertido_origen += 1
            
            # REGLA DE ORO #4: Revertir stock destino SOLO si era ADESA
            if destino_es_adesa and movimiento.ubicacion_destino:
                # Revertir stock destino (RESTAR - porque se había sumado)
                stock_ubic_destino = StockUbicacion.query.filter_by(
                    sku=movimiento.sku,
                    ubicacion=movimiento.ubicacion_destino
                ).first()
                
                if stock_ubic_destino:
                    nueva_cantidad = float(stock_ubic_destino.cantidad) - float(movimiento.cantidad)
                    if nueva_cantidad < 0:
                        nueva_cantidad = 0  # No permitir stock negativo
                    stock_ubic_destino.cantidad = nueva_cantidad
                    stock_ubic_destino.updated_at = datetime.utcnow()
                    stock_revertido_destino += 1
            
            # Eliminar movimiento siempre
            db.session.delete(movimiento)
        
        # Actualizar estado de transferencia a PENDIENTE
        transferencia.estado_procesamiento = 'PENDIENTE'
        transferencia.fecha_procesamiento = None
        transferencia.usuario_procesador = None
        
        db.session.commit()
        
        mensaje = f"Transferencia revertida exitosamente. Se eliminaron {len(movimientos)} movimiento(s)."
        if origen_es_adesa:
            mensaje += f" Se revirtió el stock en {stock_revertido_origen} ubicación(es) origen."
        if destino_es_adesa:
            mensaje += f" Se revirtió el stock en {stock_revertido_destino} ubicación(es) destino."
        if not origen_es_adesa and not destino_es_adesa:
            mensaje += " No se modificó stock físico (transferencia NO-ADESA → NO-ADESA)."
        
        return jsonify({
            "success": True,
            "message": mensaje,
            "movimientos_eliminados": len(movimientos),
            "stock_revertido_origen": stock_revertido_origen if origen_es_adesa else 0,
            "stock_revertido_destino": stock_revertido_destino if destino_es_adesa else 0
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al revertir transferencia: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al revertir transferencia",
            "message": str(e)
        }), 500
```

**Características:**
- ✅ Requiere `@require_admin` (solo administradores)
- ✅ Obtiene todos los movimientos tipo TRANSFER
- ✅ Determina si origen y destino eran ADESA desde `TransferenciaProcesada`
- ✅ Revierte stock origen (SUMA) solo si `origen_es_adesa == True`
- ✅ Revierte stock destino (RESTA) solo si `destino_es_adesa == True`
- ✅ Elimina todos los movimientos
- ✅ Actualiza `TransferenciaProcesada` a `PENDIENTE`
- ✅ Respeta Regla de Oro #4 (solo modifica stock si ADESA)

---

### **FASE 6: Frontend - Botón de Reversión**

#### **6.1. Agregar Botón en `transferencias.html`**

**Similar a recepciones, mostrar botón solo para administradores cuando estado = PROCESADA:**

```javascript
// Verificar rol del usuario
async function obtenerRolUsuario() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success && data.usuario) {
            return data.usuario.rol ? data.usuario.rol.toLowerCase() : null;
        }
    } catch (error) {
        console.error('Error al obtener rol del usuario:', error);
    }
    return null;
}

// Función para revertir transferencia
async function revertirTransferencia(transferencia_guid) {
    const confirmar = confirm(
        '⚠️ ¿Estás seguro de que deseas revertir esta transferencia?\n\n' +
        'Esta acción:\n' +
        '- Eliminará todos los movimientos de esta transferencia\n' +
        '- Revertirá el stock físico (si aplica)\n' +
        '- Marcará la transferencia como PENDIENTE\n\n' +
        'Esta acción NO se puede deshacer.'
    );
    
    if (!confirmar) {
        return;
    }
    
    try {
        const response = await fetch(`/api/transferencias/${transferencia_guid}/revertir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensaje('success', data.message);
            // Recargar detalles de la transferencia
            await cargarDetallesTransferencia(transferencia_guid);
        } else {
            mostrarMensaje('error', data.error || 'Error al revertir transferencia');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al revertir transferencia');
    }
}

// Mostrar botón solo si es admin y está PROCESADA
const usuarioRol = await obtenerRolUsuario();
const esAdmin = usuarioRol === 'administrador';

if (esAdmin && transferencia.estado_procesamiento === 'PROCESADA') {
    // Agregar botón "Revertir Transferencia"
    const btnRevertir = document.createElement('button');
    btnRevertir.textContent = 'Revertir Transferencia';
    btnRevertir.className = 'btn-revertir';
    btnRevertir.onclick = () => revertirTransferencia(transferencia.guid);
    // Agregar al DOM
}
```

---

### **FASE 7: Migración de Datos**

#### **7.1. Script de Migración de Campos Movimiento**

**Si es necesario ampliar campos:**

```python
# scripts/migrar_campos_movimiento.py
from database import db
from database.models import Movimiento

def migrar_campos_movimiento():
    """
    Migración: Ampliar campos ubicacion_origen y ubicacion_destino de 50 a 200 caracteres
    """
    # Para SQLite, esto puede requerir recrear la tabla
    # Para MySQL/MariaDB, usar ALTER TABLE
    
    # Verificar si ya está migrado
    # Si no, ejecutar ALTER TABLE o recrear tabla
    pass
```

#### **7.2. Script de Identificación de Transferencias NO-ADESA Existentes**

```python
# scripts/identificar_transferencias_no_adesa.py
from database.models import TransferenciaProcesada, Movimiento
from utils.helpers import es_ubicacion_adesa

def identificar_transferencias_no_adesa():
    """
    Identifica transferencias NO-ADESA que modificaron incorrectamente StockUbicacion
    """
    transferencias = TransferenciaProcesada.query.all()
    
    for trans in transferencias:
        origen_es_adesa = es_ubicacion_adesa(trans.location_id_origen, trans.location_name_origen)
        destino_es_adesa = es_ubicacion_adesa(trans.location_id_destino, trans.location_name_destino)
        
        # Si NO-ADESA pero tiene ubicacion_fisica, puede haber modificado stock incorrectamente
        if not origen_es_adesa and trans.ubicacion_fisica_origen:
            print(f"⚠️ Transferencia {trans.transferencia_docid}: Origen NO-ADESA pero tiene ubicación física")
        
        if not destino_es_adesa and trans.ubicacion_fisica_destino:
            print(f"⚠️ Transferencia {trans.transferencia_docid}: Destino NO-ADESA pero tiene ubicación física")
```

---

## ✅ CHECKLIST DE VALIDACIÓN

### **Validación de 3 Puntos Críticos:**

#### **1. Truncamiento de LocationName**
- [ ] Campos `ubicacion_origen/destino` ampliados a 200 caracteres
- [ ] LocationName completo guardado en notas si >200 caracteres
- [ ] Probar con LocationName largo (>200 chars)
- [ ] Verificar que no se pierde información en auditoría

#### **2. Backend Recalcula Flags**
- [ ] Función `es_ubicacion_adesa()` implementada
- [ ] Backend recalcula flags desde ADM Cloud (ignora frontend)
- [ ] Logs de auditoría muestran flags recalculados
- [ ] Probar enviando flags incorrectos desde frontend (debe ignorarlos)

#### **3. Detección Robusta por LocationID**
- [ ] Whitelist de LocationID ADESA configurada en `config.py`
- [ ] Función `es_ubicacion_adesa()` usa whitelist primero, luego fallback a LocationName
- [ ] Probar con LocationID en whitelist
- [ ] Probar con LocationID no en whitelist pero LocationName contiene "ADESA"
- [ ] Probar con LocationID y LocationName que NO son ADESA

---

## 🎯 RESUMEN FINAL

### **Confirmación de Viabilidad: ✅ VIABLE Y SEGURA**

### **3 Puntos Críticos Resueltos:**

1. ✅ **Truncamiento:** Campos ampliados a 200 + LocationName completo en notas si >200
2. ✅ **Seguridad:** Backend SIEMPRE recalcula flags desde ADM Cloud (ignora frontend)
3. ✅ **Detección Robusta:** Whitelist de LocationID + fallback a LocationName

### **Funcionalidad Adicional Confirmada:**

✅ **Multi-ubicación por SKU en NO-ADESA → ADESA:**
- Permite dividir cantidad en múltiples ubicaciones físicas destino
- Valida que suma de asignaciones = cantidad total
- Genera múltiples movimientos TRANSFER (uno por asignación)
- Actualiza StockUbicacion para cada ubicación destino
- Similar a funcionalidad ya implementada en Recepciones

✅ **Reversión de Transferencias (Solo Administradores):**
- Endpoint `/api/transferencias/<guid>/revertir` con `@require_admin`
- Elimina todos los movimientos TRANSFER de la transferencia
- Revierte stock origen (SUMA) solo si `origen_es_adesa == True`
- Revierte stock destino (RESTA) solo si `destino_es_adesa == True`
- Actualiza `TransferenciaProcesada` a estado `PENDIENTE`
- Respeta Regla de Oro #4 (solo modifica stock si ADESA)
- Similar a funcionalidad ya implementada en Recepciones

### **Plan de Implementación:**

1. **Fase 1:** Helpers y configuración (whitelist, función de detección)
2. **Fase 2:** Backend búsqueda (agregar flags)
3. **Fase 3:** Backend registro (lógica condicional + recalcular flags + asignaciones múltiples)
4. **Fase 4:** Frontend (UI dinámica + soporte multi-ubicación)
5. **Fase 5:** Función de reversión (solo administradores)
6. **Fase 6:** Frontend - Botón de reversión
7. **Fase 7:** Migración (si aplica)

### **Compatibilidad con Reglas de Oro:**

✅ **Todas las reglas de oro se mantienen intactas** - La implementación mejora la precisión sin romper funcionalidad existente.

---

**Fin del Plan Técnico**

