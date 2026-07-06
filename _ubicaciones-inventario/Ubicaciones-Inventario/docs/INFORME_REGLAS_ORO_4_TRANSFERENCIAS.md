# 📋 INFORME TÉCNICO: REGLA DE ORO #4 EN TRANSFERENCIAS
## Implementación de Lógica ADESA vs NO-ADESA

**Fecha:** 23 de Enero, 2026  
**Sistema:** WMS - Módulo de Transferencias  
**Estado:** Análisis y Propuesta de Implementación

---

## 🎯 RESUMEN EJECUTIVO

### Objetivo

Implementar la **Regla de Oro #4** en el módulo de Transferencias, aplicando la misma lógica que en Recepciones: **solo modificar `StockUbicacion` cuando ADESA está involucrado**.

### Viabilidad

✅ **VIABLE** - La implementación es factible y sigue el mismo patrón ya implementado en Recepciones. No rompe las reglas de oro existentes.

---

## ✅ COMPATIBILIDAD CON REGLAS DE ORO

### **Regla de Oro #1: Productos Desaparecidos**
- **Impacto:** ✅ **NINGUNO**
- **Razón:** Esta regla se aplica durante sincronización, no durante transferencias. Las transferencias NO-ADESA no afectan la detección de productos desaparecidos.

### **Regla de Oro #2: Consultas desde BD Local**
- **Impacto:** ✅ **NINGUNO**
- **Razón:** Las consultas siguen usando BD local. Las transferencias NO-ADESA solo crearán Movimientos para auditoría, pero no afectarán las consultas de stock físico.

### **Regla de Oro #3: Discrepancias Críticas**
- **Impacto:** ✅ **POSITIVO** (mejora la precisión)
- **Razón:** Al no modificar `StockUbicacion` para transferencias NO-ADESA, evitamos crear discrepancias falsas. Solo se detectarán discrepancias reales entre ERP y stock físico de ADESA.

### **Regla de Oro #4: Separación ADESA vs NO-ADESA**
- **Impacto:** ✅ **COMPATIBLE** (extensión de la regla)
- **Razón:** Esta es la misma regla aplicada a transferencias. Ya está implementada en Recepciones, ahora se extiende a Transferencias.

---

## 📊 ANÁLISIS DE CASOS DE USO

### **Caso 1: ADESA → ADESA (Transferencia Física Interna)**

**Estado Actual:** ✅ **FUNCIONA CORRECTAMENTE**

**Comportamiento:**
- ✅ Requiere ubicación física origen + destino
- ✅ Valida stock suficiente en origen
- ✅ Resta origen / Suma destino en `StockUbicacion`
- ✅ Crea movimientos tipo TRANSFER
- ✅ Marca como PROCESADA

**Cambios Necesarios:** ⚠️ **NINGUNO** - Mantener comportamiento actual

---

### **Caso 2: ADESA → NO-ADESA (Salida a Consignación/Externo)**

**Estado Actual:** ❌ **NO FUNCIONA CORRECTAMENTE**

**Problema Actual:**
- ❌ Exige ubicación física destino (no debería)
- ❌ Intenta sumar stock en destino NO-ADESA (no debería)
- ❌ Crea `StockUbicacion` para ubicación externa (incorrecto)

**Comportamiento Esperado:**
- ✅ Requiere ubicación física solo del ORIGEN
- ✅ Valida stock suficiente en origen
- ✅ Resta `StockUbicacion` origen
- ❌ NO suma `StockUbicacion` destino
- ✅ Crea Movimiento con `ubicacion_destino = LocationName ADM` (ej: "Consignación X")

**Cambios Necesarios:**
- ✅ Validar ubicación física solo si `origen_es_adesa == True`
- ✅ Modificar `StockUbicacion` solo si `origen_es_adesa == True`
- ✅ Usar `location_name_destino` como `ubicacion_destino` en Movimiento si `destino_es_adesa == False`

---

### **Caso 3: NO-ADESA → ADESA (Devolución desde Consignación)**

**Estado Actual:** ❌ **NO FUNCIONA CORRECTAMENTE**

**Problema Actual:**
- ❌ Exige ubicación física origen (no debería)
- ❌ Intenta validar stock en origen NO-ADESA (no existe)
- ❌ Intenta restar stock de origen NO-ADESA (no existe)

**Comportamiento Esperado:**
- ❌ NO requiere ubicación física ORIGEN
- ❌ NO validar stock en origen
- ✅ Requiere ubicación física DESTINO
- ✅ Suma `StockUbicacion` destino
- ✅ Crea Movimiento con `ubicacion_origen = LocationName ADM` y `ubicacion_destino = ubicacion_fisica`

**Cambios Necesarios:**
- ✅ NO validar ubicación física origen si `origen_es_adesa == False`
- ✅ NO validar stock en origen si `origen_es_adesa == False`
- ✅ Validar ubicación física destino solo si `destino_es_adesa == True`
- ✅ Modificar `StockUbicacion` solo si `destino_es_adesa == True`

---

### **Caso 4: NO-ADESA → NO-ADESA**

**Estado Actual:** ❌ **NO FUNCIONA CORRECTAMENTE**

**Problema Actual:**
- ❌ Exige ubicaciones físicas (no debería)
- ❌ Intenta modificar `StockUbicacion` (no debería)

**Comportamiento Esperado:**
- ❌ NO requiere ubicaciones físicas
- ❌ NO modifica `StockUbicacion`
- ✅ Solo crea Movimiento TRANSFER para auditoría
- ✅ Usa `location_name_origen` y `location_name_destino` en Movimiento

**Cambios Necesarios:**
- ✅ NO validar ubicaciones físicas si ambas son NO-ADESA
- ✅ NO modificar `StockUbicacion`
- ✅ Crear Movimiento solo para auditoría

---

## 🔧 ESTRATEGIA DE IMPLEMENTACIÓN

### **1. Backend: Modificar `buscar_transferencia()`**

**Cambio:** Agregar flags `origen_es_adesa` y `destino_es_adesa` en la respuesta.

```python
# En buscar_transferencia(), después de obtener nombres:
origen_es_adesa = origen_nombre and "ADESA" in origen_nombre.upper()
destino_es_adesa = destino_nombre and "ADESA" in destino_nombre.upper()

# Agregar en respuesta:
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

### **2. Backend: Modificar `registrar_transferencia()`**

**Cambio Principal:** Hacer condicional la validación de ubicaciones físicas y la actualización de `StockUbicacion`.

#### **Código Actual (Líneas 373-457):**

```python
# Siempre valida ambas ubicaciones
es_valido, mensaje = validar_ubicacion(ubicacion_origen)
es_valido, mensaje = validar_ubicacion(ubicacion_destino)

# Siempre valida stock en origen
stock_ubic_origen = StockUbicacion.query.filter_by(...)
if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < float(cantidad):
    return error("Stock insuficiente")

# Siempre resta origen y suma destino
stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - float(cantidad)
stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + float(cantidad)
```

#### **Código Propuesto:**

```python
# Obtener flags desde request (o calcular desde location_name)
origen_es_adesa = data.get('origen_es_adesa', False)
destino_es_adesa = data.get('destino_es_adesa', False)
location_name_origen = data.get('location_name_origen', origen_nombre)
location_name_destino = data.get('location_name_destino', destino_nombre)

# Si no vienen del frontend, calcular desde location_name
if not origen_es_adesa and location_name_origen:
    origen_es_adesa = "ADESA" in location_name_origen.upper()
if not destino_es_adesa and location_name_destino:
    destino_es_adesa = "ADESA" in location_name_destino.upper()

for prod_ubic in productos_ubicaciones:
    sku = prod_ubic.get('sku', '').strip().upper()
    ubicacion_origen = prod_ubic.get('ubicacion_origen', '').strip()
    ubicacion_destino = prod_ubic.get('ubicacion_destino', '').strip()
    cantidad = prod_ubic.get('cantidad')
    item_id = prod_ubic.get('item_id')
    
    # Validar SKU y cantidad (siempre)
    es_valido, mensaje = validar_sku(sku)
    if not es_valido:
        return error(f"SKU inválido: {mensaje}")
    
    es_valido, mensaje = validar_cantidad(cantidad)
    if not es_valido:
        return error(f"Cantidad inválida: {mensaje}")
    
    # REGLA DE ORO #4: Validar ubicación física solo si es ADESA
    if origen_es_adesa:
        # Validar ubicación física origen
        es_valido, mensaje = validar_ubicacion(ubicacion_origen)
        if not es_valido:
            return error(f"Ubicación origen inválida: {mensaje}")
        
        # Validar stock suficiente en origen
        stock_ubic_origen = StockUbicacion.query.filter_by(
            sku=sku,
            ubicacion=ubicacion_origen
        ).first()
        
        if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < float(cantidad):
            return error(f"Stock insuficiente en ubicación origen {ubicacion_origen} para SKU {sku}")
        
        # Restar stock de origen
        stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - float(cantidad)
        stock_ubic_origen.updated_at = datetime.utcnow()
    else:
        # Para NO-ADESA origen: usar location_name como ubicacion_origen en Movimiento
        ubicacion_origen = location_name_origen or "NO-ADESA"
        # NO validar stock (no existe en WMS)
        # NO modificar StockUbicacion
    
    if destino_es_adesa:
        # Validar ubicación física destino
        es_valido, mensaje = validar_ubicacion(ubicacion_destino)
        if not es_valido:
            return error(f"Ubicación destino inválida: {mensaje}")
        
        # Sumar stock a destino
        stock_ubic_destino = StockUbicacion.query.filter_by(
            sku=sku,
            ubicacion=ubicacion_destino
        ).first()
        
        if stock_ubic_destino:
            stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + float(cantidad)
            stock_ubic_destino.updated_at = datetime.utcnow()
        else:
            stock_ubic_destino = StockUbicacion(
                product_id=item_id or "",
                sku=sku,
                ubicacion=ubicacion_destino,
                cantidad=float(cantidad)
            )
            db.session.add(stock_ubic_destino)
    else:
        # Para NO-ADESA destino: usar location_name como ubicacion_destino en Movimiento
        ubicacion_destino = location_name_destino or "NO-ADESA"
        # NO modificar StockUbicacion
    
    # Crear movimiento siempre (para auditoría)
    movimiento = Movimiento(
        tipo="TRANSFER",
        product_id=item_id or "",
        sku=sku,
        ubicacion_origen=ubicacion_origen,      # Física si ADESA, LocationName si NO-ADESA
        ubicacion_destino=ubicacion_destino,    # Física si ADESA, LocationName si NO-ADESA
        cantidad=float(cantidad),
        factura_id=transfer_data.get("DocID", ""),
        factura_guid=transferencia_guid,
        usuario_id=session.get('user_id'),
        notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}"
    )
    db.session.add(movimiento)
    movimientos_creados.append(movimiento.to_dict())
```

**Resumen de Cambios:**
- ✅ Validar ubicación física origen solo si `origen_es_adesa == True`
- ✅ Validar stock en origen solo si `origen_es_adesa == True`
- ✅ Restar `StockUbicacion` origen solo si `origen_es_adesa == True`
- ✅ Validar ubicación física destino solo si `destino_es_adesa == True`
- ✅ Sumar `StockUbicacion` destino solo si `destino_es_adesa == True`
- ✅ Crear `Movimiento` siempre (para auditoría)
- ✅ Usar `location_name` como ubicación en Movimiento si NO-ADESA

---

### **3. Frontend: Modificar `mostrarProductos()`**

**Cambio:** Mostrar campos de ubicación física condicionalmente según ADESA/NO-ADESA.

#### **Código Propuesto:**

```javascript
function mostrarProductos(productos, transferencia) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    
    const origenEsAdesa = transferencia && transferencia.origen_es_adesa === true;
    const destinoEsAdesa = transferencia && transferencia.destino_es_adesa === true;
    
    productos.forEach((producto) => {
        const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
        const cantidad = parseFloat(producto.Quantity || 0);
        const nombre = producto.Name || 'Sin nombre';
        const itemId = producto.ItemID || '';
        
        // Inicializar estructura de asignación
        if (!productosAsignados[sku]) {
            productosAsignados[sku] = {
                item_id: itemId,
                ubicacion_origen: '',
                ubicacion_destino: ''
            };
        }
        
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card';
        productoCard.id = `producto-${sku}`;
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>${nombre}</h4>
                    <div class="sku">SKU: ${sku}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Cantidad Transferida</div>
                    <div class="value">${cantidad.toFixed(2)}</div>
                </div>
            </div>
            <div class="asignacion-section">
                ${origenEsAdesa ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📍 Ubicación Física Origen (WMS):
                    </div>
                    <input type="text" 
                           id="ubicacion-origen-${sku}" 
                           placeholder="Ubicación origen (ej: 2P1D01N1)" 
                           value="${productosAsignados[sku].ubicacion_origen}"
                           onchange="actualizarAsignacion('${sku}', 'origen', this.value)"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;">
                ` : `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📦 Ubicación Origen Externa (NO requiere ubicación física WMS)
                    </div>
                    <div style="background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 5px; padding: 10px; margin-bottom: 10px;">
                        <div style="font-size: 12px; color: #004085;">
                            <strong>Ubicación ADM:</strong> ${transferencia.origen_nombre || 'N/A'}<br>
                            <em style="color: #6c757d;">Esta ubicación no tiene control físico en el WMS.</em>
                        </div>
                    </div>
                `}
                
                ${destinoEsAdesa ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📍 Ubicación Física Destino (WMS):
                    </div>
                    <input type="text" 
                           id="ubicacion-destino-${sku}" 
                           placeholder="Ubicación destino (ej: 2P1D01N2)" 
                           value="${productosAsignados[sku].ubicacion_destino}"
                           onchange="actualizarAsignacion('${sku}', 'destino', this.value)"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                ` : `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📦 Ubicación Destino Externa (NO requiere ubicación física WMS)
                    </div>
                    <div style="background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 5px; padding: 10px;">
                        <div style="font-size: 12px; color: #004085;">
                            <strong>Ubicación ADM:</strong> ${transferencia.destino_nombre || 'N/A'}<br>
                            <em style="color: #6c757d;">Esta ubicación no tiene control físico en el WMS.</em>
                        </div>
                    </div>
                `}
            </div>
        `;
        
        grid.appendChild(productoCard);
    });
}

function actualizarAsignacion(sku, tipo, valor) {
    if (!productosAsignados[sku]) {
        productosAsignados[sku] = { item_id: '', ubicacion_origen: '', ubicacion_destino: '' };
    }
    
    if (tipo === 'origen') {
        productosAsignados[sku].ubicacion_origen = valor.trim().toUpperCase();
    } else if (tipo === 'destino') {
        productosAsignados[sku].ubicacion_destino = valor.trim().toUpperCase();
    }
}
```

---

### **4. Frontend: Modificar Función de Registro**

**Cambio:** Enviar flags y validar condicionalmente.

```javascript
async function registrarTransferencia() {
    const origenEsAdesa = transferenciaActual && transferenciaActual.origen_es_adesa === true;
    const destinoEsAdesa = transferenciaActual && transferenciaActual.destino_es_adesa === true;
    
    // Validar asignaciones según ADESA/NO-ADESA
    for (const sku in productosAsignados) {
        const asignacion = productosAsignados[sku];
        
        if (origenEsAdesa && (!asignacion.ubicacion_origen || asignacion.ubicacion_origen.trim() === '')) {
            mostrarMensaje('error', `El producto ${sku} necesita una ubicación física de origen`);
            return;
        }
        
        if (destinoEsAdesa && (!asignacion.ubicacion_destino || asignacion.ubicacion_destino.trim() === '')) {
            mostrarMensaje('error', `El producto ${sku} necesita una ubicación física de destino`);
            return;
        }
    }
    
    // Preparar payload
    const productos_ubicaciones = [];
    for (const sku in productosAsignados) {
        const asignacion = productosAsignados[sku];
        productos_ubicaciones.push({
            sku: sku,
            item_id: asignacion.item_id,
            cantidad: parseFloat(transferenciaActual.productos.find(p => 
                (p.SKU || p.ItemSKU || '').toUpperCase() === sku
            )?.Quantity || 0),
            ubicacion_origen: origenEsAdesa ? asignacion.ubicacion_origen : '',
            ubicacion_destino: destinoEsAdesa ? asignacion.ubicacion_destino : ''
        });
    }
    
    // Enviar al backend
    const response = await fetch('/api/transferencias/registrar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            transferencia_guid: transferenciaActual.guid,
            transferencia_docid: transferenciaActual.docid,
            location_name_origen: transferenciaActual.origen_nombre,
            location_name_destino: transferenciaActual.destino_nombre,
            origen_es_adesa: origenEsAdesa,
            destino_es_adesa: destinoEsAdesa,
            productos_ubicaciones: productos_ubicaciones
        })
    });
    
    // ... resto del código
}
```

---

## 📝 CAMBIOS DETALLADOS POR ARCHIVO

### **1. `routes/transferencias.py`**

#### **A. Modificar `buscar_transferencia()` (Líneas 109-267)**

**Agregar después de línea 181:**
```python
# REGLA DE ORO #4: Detectar si ubicaciones son ADESA
origen_es_adesa = origen_nombre and "ADESA" in origen_nombre.upper()
destino_es_adesa = destino_nombre and "ADESA" in destino_nombre.upper()
```

**Agregar en respuesta (línea 252):**
```python
"origen_es_adesa": origen_es_adesa,
"destino_es_adesa": destino_es_adesa,
```

#### **B. Modificar `registrar_transferencia()` (Líneas 309-504)**

**Reemplazar líneas 373-457 con lógica condicional** (ver código propuesto arriba)

**Resumen:**
- ✅ Obtener flags `origen_es_adesa` y `destino_es_adesa` desde request
- ✅ Validar ubicación física origen solo si `origen_es_adesa == True`
- ✅ Validar stock en origen solo si `origen_es_adesa == True`
- ✅ Restar `StockUbicacion` origen solo si `origen_es_adesa == True`
- ✅ Validar ubicación física destino solo si `destino_es_adesa == True`
- ✅ Sumar `StockUbicacion` destino solo si `destino_es_adesa == True`
- ✅ Crear `Movimiento` siempre
- ✅ Usar `location_name` como ubicación en Movimiento si NO-ADESA

---

### **2. `templates/transferencias.html`**

#### **A. Modificar `mostrarProductos()` (Líneas 646-677)**

**Reemplazar completamente** con código propuesto que muestra campos condicionalmente.

#### **B. Agregar función `actualizarAsignacion()`**

```javascript
function actualizarAsignacion(sku, tipo, valor) {
    if (!productosAsignados[sku]) {
        productosAsignados[sku] = { item_id: '', ubicacion_origen: '', ubicacion_destino: '' };
    }
    
    if (tipo === 'origen') {
        productosAsignados[sku].ubicacion_origen = valor.trim().toUpperCase();
    } else if (tipo === 'destino') {
        productosAsignados[sku].ubicacion_destino = valor.trim().toUpperCase();
    }
}
```

#### **C. Modificar función de registro**

**Agregar validaciones condicionales y enviar flags al backend** (ver código propuesto arriba).

---

## ⚠️ RIESGOS Y MITIGACIONES

### **Riesgo 1: Transferencias NO-ADESA Registradas con Ubicación Física**

**Descripción:** Si una transferencia NO-ADESA se registra con ubicación física WMS, podría modificar incorrectamente el stock físico.

**Mitigación:**
- ✅ Validar en backend que si `origen_es_adesa == false`, NO se modifique `StockUbicacion` origen
- ✅ Validar en backend que si `destino_es_adesa == false`, NO se modifique `StockUbicacion` destino
- ✅ Usar `location_name` de ADM como ubicación en Movimiento para NO-ADESA
- ✅ Agregar logs para detectar intentos incorrectos

### **Riesgo 2: Validación de Stock en Origen NO-ADESA**

**Descripción:** Si se intenta validar stock en origen NO-ADESA, fallará porque no existe `StockUbicacion`.

**Mitigación:**
- ✅ NO validar stock si `origen_es_adesa == False`
- ✅ Agregar validación explícita antes de consultar `StockUbicacion`

### **Riesgo 3: Confusión en Usuarios sobre Ubicaciones NO-ADESA**

**Descripción:** Los usuarios podrían no entender por qué no se exige ubicación física para transferencias NO-ADESA.

**Mitigación:**
- ✅ Mostrar mensaje claro en el frontend explicando que es ubicación externa
- ✅ Agregar tooltip o ayuda contextual
- ✅ Documentar en manual de usuario

### **Riesgo 4: Migración de Datos Existentes**

**Descripción:** Si hay transferencias NO-ADESA ya registradas con ubicación física, podrían haber modificado incorrectamente `StockUbicacion`.

**Mitigación:**
- ✅ Crear script de migración para identificar transferencias NO-ADESA existentes
- ✅ Revertir stock físico de transferencias NO-ADESA que modificaron `StockUbicacion`
- ✅ Ejecutar en ambiente de pruebas primero

### **Riesgo 5: Compatibilidad con Código Existente**

**Descripción:** Cambios podrían romper código que asume que siempre hay ubicaciones físicas.

**Mitigación:**
- ✅ Mantener compatibilidad: si no vienen flags, calcular desde `location_name`
- ✅ Validar que todos los casos de uso funcionen
- ✅ Probar exhaustivamente antes de desplegar

---

## ✅ CHECKLIST DE PRUEBAS

### **Pruebas Funcionales**

#### **1. Transferencia ADESA → ADESA (Caso Actual)**
- [ ] Buscar transferencia con origen y destino ADESA
- [ ] Verificar que se muestran campos de ubicación física origen y destino
- [ ] Asignar ubicaciones físicas (ej: origen "2P1D01N1", destino "2P1D01N2")
- [ ] Registrar transferencia
- [ ] Verificar que se restó stock de origen
- [ ] Verificar que se sumó stock a destino
- [ ] Verificar que se creó Movimiento tipo TRANSFER
- [ ] Verificar que transferencia está marcada como PROCESADA

#### **2. Transferencia ADESA → NO-ADESA (Salida a Consignación)**
- [ ] Buscar transferencia con origen ADESA y destino NO-ADESA (ej: "Mirador Sur")
- [ ] Verificar que se muestra campo de ubicación física ORIGEN
- [ ] Verificar que NO se muestra campo de ubicación física DESTINO
- [ ] Verificar que se muestra mensaje informativo para destino externo
- [ ] Asignar ubicación física origen (ej: "2P1D01N1")
- [ ] Registrar transferencia
- [ ] Verificar que se restó stock de origen
- [ ] Verificar que NO se sumó stock a destino (no existe)
- [ ] Verificar que se creó Movimiento con `ubicacion_destino = location_name_destino`
- [ ] Verificar que transferencia está marcada como PROCESADA

#### **3. Transferencia NO-ADESA → ADESA (Devolución desde Consignación)**
- [ ] Buscar transferencia con origen NO-ADESA (ej: "Consignación X") y destino ADESA
- [ ] Verificar que NO se muestra campo de ubicación física ORIGEN
- [ ] Verificar que se muestra mensaje informativo para origen externo
- [ ] Verificar que se muestra campo de ubicación física DESTINO
- [ ] Asignar ubicación física destino (ej: "2P1D01N2")
- [ ] Registrar transferencia
- [ ] Verificar que NO se intentó validar stock en origen (no existe)
- [ ] Verificar que NO se restó stock de origen (no existe)
- [ ] Verificar que se sumó stock a destino
- [ ] Verificar que se creó Movimiento con `ubicacion_origen = location_name_origen`
- [ ] Verificar que transferencia está marcada como PROCESADA

#### **4. Transferencia NO-ADESA → NO-ADESA**
- [ ] Buscar transferencia con origen y destino NO-ADESA
- [ ] Verificar que NO se muestran campos de ubicación física
- [ ] Verificar que se muestran mensajes informativos para ambas ubicaciones
- [ ] Registrar transferencia
- [ ] Verificar que NO se modificó `StockUbicacion`
- [ ] Verificar que se creó Movimiento con `ubicacion_origen = location_name_origen` y `ubicacion_destino = location_name_destino`
- [ ] Verificar que transferencia está marcada como PROCESADA

#### **5. Validaciones**
- [ ] Intentar registrar transferencia ADESA → ADESA sin ubicación origen
- [ ] Verificar que se muestra error: "Ubicación origen requerida"
- [ ] Intentar registrar transferencia ADESA → ADESA sin ubicación destino
- [ ] Verificar que se muestra error: "Ubicación destino requerida"
- [ ] Intentar registrar transferencia ADESA → NO-ADESA sin ubicación origen
- [ ] Verificar que se muestra error: "Ubicación origen requerida"
- [ ] Intentar registrar transferencia NO-ADESA → ADESA sin ubicación destino
- [ ] Verificar que se muestra error: "Ubicación destino requerida"

#### **6. Validación de Stock**
- [ ] Intentar transferir más stock del disponible en origen ADESA
- [ ] Verificar que se muestra error: "Stock insuficiente"
- [ ] Verificar que NO se modificó stock
- [ ] Intentar transferir desde origen NO-ADESA (no debe validar stock)

### **Pruebas de Integridad**

#### **7. Compatibilidad con Reglas de Oro**
- [ ] Verificar que Regla #1 (productos desaparecidos) sigue funcionando
- [ ] Verificar que Regla #2 (consultas desde BD local) sigue funcionando
- [ ] Verificar que Regla #3 (discrepancias críticas) sigue funcionando
- [ ] Verificar que Regla #4 (ADESA vs NO-ADESA) funciona correctamente

#### **8. Sincronización**
- [ ] Sincronizar ubicación ADESA después de transferencia ADESA → ADESA
- [ ] Verificar que el stock se sincroniza correctamente
- [ ] Sincronizar ubicación NO-ADESA después de transferencia NO-ADESA → NO-ADESA
- [ ] Verificar que no hay discrepancias falsas

#### **9. Reportes y Consultas**
- [ ] Consultar producto después de transferencia ADESA → ADESA
- [ ] Verificar que el stock físico refleja la transferencia
- [ ] Consultar producto después de transferencia ADESA → NO-ADESA
- [ ] Verificar que el stock físico solo refleja la resta de origen
- [ ] Consultar producto después de transferencia NO-ADESA → ADESA
- [ ] Verificar que el stock físico solo refleja la suma a destino
- [ ] Verificar que los reportes de movimientos muestran correctamente todos los tipos

### **Pruebas de Rendimiento**

#### **10. Rendimiento**
- [ ] Registrar transferencia ADESA → ADESA con múltiples productos
- [ ] Verificar que el tiempo de respuesta es aceptable (< 2 segundos)
- [ ] Registrar transferencia NO-ADESA → NO-ADESA con múltiples productos
- [ ] Verificar que el tiempo de respuesta es aceptable (< 2 segundos)

### **Pruebas de Usabilidad**

#### **11. Interfaz de Usuario**
- [ ] Verificar que los mensajes para ubicaciones NO-ADESA son claros
- [ ] Verificar que los campos se muestran/ocultan correctamente
- [ ] Verificar que los botones están habilitados/deshabilitados correctamente
- [ ] Verificar que los mensajes de error son claros

---

## 📋 PLAN DE IMPLEMENTACIÓN

### **Fase 1: Backend - Búsqueda (Prioridad Alta)**
1. Modificar `buscar_transferencia()` para agregar flags `origen_es_adesa` y `destino_es_adesa`
2. Probar en ambiente de desarrollo

### **Fase 2: Backend - Registro (Prioridad Alta)**
1. Modificar `registrar_transferencia()` para lógica condicional
2. Agregar validaciones condicionales
3. Probar en ambiente de desarrollo

### **Fase 3: Frontend (Prioridad Alta)**
1. Modificar `mostrarProductos()` para mostrar campos condicionalmente
2. Agregar función `actualizarAsignacion()`
3. Modificar función de registro para validar y enviar flags
4. Probar en ambiente de desarrollo

### **Fase 4: Pruebas (Prioridad Media)**
1. Ejecutar checklist completo de pruebas
2. Probar casos edge
3. Validar compatibilidad con reglas de oro

### **Fase 5: Migración (Si aplica)**
1. Identificar transferencias NO-ADESA existentes que modificaron `StockUbicacion`
2. Crear script de migración para revertir stock físico incorrecto
3. Ejecutar en ambiente de pruebas
4. Ejecutar en producción (con backup)

### **Fase 6: Documentación (Prioridad Baja)**
1. Actualizar manual de usuario
2. Documentar la extensión de Regla de Oro #4 a transferencias
3. Agregar ejemplos de uso

---

## 🎯 CONCLUSIÓN

### **Viabilidad: ✅ ALTA**

La implementación de la **Regla de Oro #4 en Transferencias** es **viable y recomendada** porque:

1. ✅ **Sigue el mismo patrón de Recepciones** - Ya implementado y probado
2. ✅ **No rompe las reglas de oro existentes** - De hecho, mejora la precisión
3. ✅ **Mejora la lógica de negocio** - Separa correctamente el manejo de inventario físico vs. auditoría
4. ✅ **Implementación relativamente simple** - La lógica de detección ya existe, solo necesita ajustes
5. ✅ **Bajo riesgo** - Los cambios son localizados y no afectan otros módulos

### **Recomendación Final**

✅ **PROCEDER CON LA IMPLEMENTACIÓN** siguiendo el plan de fases propuesto, comenzando por el backend y luego el frontend, con pruebas exhaustivas antes de desplegar a producción.

---

## 📊 RESUMEN DE CAMBIOS

| Componente | Cambios Principales |
|------------|-------------------|
| `routes/transferencias.py` | Lógica condicional para validar/modificar stock según ADESA/NO-ADESA |
| `templates/transferencias.html` | UI dinámica que muestra campos según tipo de ubicación |
| Payload | Agregar flags `origen_es_adesa` y `destino_es_adesa` |

---

**Fin del Informe**



