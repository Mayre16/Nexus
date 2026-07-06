# 📋 INFORME: IMPLEMENTACIÓN MULTI-UBICACIÓN POR SKU
## Split por Filas para Recepciones ADESA

**Fecha:** 23 de Enero, 2026  
**Sistema:** WMS - Módulo de Recepciones  
**Estado:** Análisis y Propuesta de Implementación

---

## 🎯 RESUMEN EJECUTIVO

### Objetivo

Implementar la capacidad de dividir un mismo SKU en múltiples ubicaciones físicas dentro de la misma recepción, permitiendo que un producto se recepcione en varias ubicaciones del almacén ADESA.

### Ejemplo Real

**SKU 123 → Cantidad recibida = 10**
- 5 unidades en `2P1D01N1`
- 5 unidades en `2P1D01N2`

**Resultado:** 2 movimientos RECEIPT, 2 actualizaciones de StockUbicacion, validación de que 5 + 5 = 10 ✅

### Viabilidad

✅ **VIABLE** - La estructura actual del backend ya soporta múltiples movimientos por recepción. Solo necesitamos:
1. Modificar el frontend para permitir múltiples filas por SKU
2. Agregar validación de sumatoria en backend
3. Mantener la lógica de NO-ADESA sin ubicación física

---

## ✅ COMPATIBILIDAD CON REGLAS DE ORO

### **Regla de Oro #1: Productos Desaparecidos**
- **Impacto:** ✅ **NINGUNO**
- **Razón:** Esta regla se aplica durante sincronización, no durante recepciones. El split por ubicaciones no afecta la detección de productos desaparecidos.

### **Regla de Oro #2: Consultas desde BD Local**
- **Impacto:** ✅ **NINGUNO**
- **Razón:** Las consultas siguen usando BD local. El split solo crea múltiples registros en `StockUbicacion` y `Movimiento`, que se consultan normalmente.

### **Regla de Oro #3: Discrepancias Críticas**
- **Impacto:** ✅ **NINGUNO** (mejora la precisión)
- **Razón:** El split permite un control más preciso del stock físico, lo que mejora la detección de discrepancias. Cada ubicación física se actualiza correctamente.

### **Regla de Oro #4: Separación ADESA vs NO-ADESA**
- **Impacto:** ✅ **COMPATIBLE**
- **Razón:** El split solo aplica para ADESA (donde se exige ubicación física). Para NO-ADESA, no se exige ubicación física y no se modifica `StockUbicacion`.

---

## 🔧 ANÁLISIS DE IMPLEMENTACIÓN

### **Estado Actual del Sistema**

**Backend (`routes/recepciones.py`):**
- ✅ Ya procesa múltiples `productos_ubicaciones` en un array
- ✅ Crea un `Movimiento` por cada entrada en el array
- ✅ Actualiza `StockUbicacion` por cada entrada
- ⚠️ **NO valida** que la suma por SKU no exceda la cantidad recibida

**Frontend (`templates/recepciones.html`):**
- ⚠️ Solo permite **1 ubicación por SKU**
- ⚠️ Estructura: `productosAsignados[sku] = {ubicacion, cantidad, item_id}`
- ⚠️ **NO permite** agregar múltiples filas para el mismo SKU

### **Cambios Necesarios**

1. **Frontend:** Cambiar estructura de datos para permitir múltiples asignaciones por SKU
2. **Frontend:** Agregar botón "Agregar otra ubicación" por producto
3. **Frontend:** Validar sumatoria en tiempo real
4. **Backend:** Validar sumatoria por SKU antes de procesar
5. **Backend:** Mantener lógica de NO-ADESA sin ubicación física

---

## 📝 IMPLEMENTACIÓN DETALLADA

### **1. Estructura de Datos (Frontend)**

#### **Estructura Actual:**
```javascript
productosAsignados = {
    'SKU123': {
        ubicacion: '2P1D01N1',
        cantidad: 10,
        item_id: 'xxx'
    }
}
```

#### **Estructura Nueva:**
```javascript
productosAsignados = {
    'SKU123': {
        item_id: 'xxx',
        cantidad_total: 10,  // Cantidad recibida del documento
        asignaciones: [      // Array de ubicaciones
            { ubicacion: '2P1D01N1', cantidad: 5 },
            { ubicacion: '2P1D01N2', cantidad: 5 }
        ]
    }
}
```

**Ventajas:**
- ✅ Permite múltiples ubicaciones por SKU
- ✅ Mantiene referencia a cantidad total recibida
- ✅ Fácil de validar sumatoria

---

### **2. Payload al Backend**

#### **Opción A: Estructura Agrupada (Recomendada)**
```json
{
    "recepcion_guid": "xxx",
    "recepcion_docid": "327",
    "es_adesa": true,
    "location_name": "ADESA",
    "productos": [
        {
            "sku": "SKU123",
            "item_id": "xxx",
            "cantidad_total": 10,
            "asignaciones": [
                { "ubicacion": "2P1D01N1", "cantidad": 5 },
                { "ubicacion": "2P1D01N2", "cantidad": 5 }
            ]
        }
    ]
}
```

**Ventajas:**
- ✅ Estructura clara y agrupada
- ✅ Fácil validación de sumatoria
- ✅ Separación clara entre ADESA y NO-ADESA

#### **Opción B: Estructura Plana (Alternativa)**
```json
{
    "recepcion_guid": "xxx",
    "recepcion_docid": "327",
    "es_adesa": true,
    "location_name": "ADESA",
    "productos_ubicaciones": [
        { "sku": "SKU123", "ubicacion": "2P1D01N1", "cantidad": 5, "item_id": "xxx" },
        { "sku": "SKU123", "ubicacion": "2P1D01N2", "cantidad": 5, "item_id": "xxx" }
    ]
}
```

**Ventajas:**
- ✅ Compatible con estructura actual
- ✅ Menos cambios en backend
- ⚠️ Requiere agrupar por SKU para validar sumatoria

**Recomendación:** ✅ **Opción A** - Más clara y fácil de validar

---

### **3. Backend: Validación de Sumatoria**

#### **Código Propuesto para `registrar_recepcion()`:**

```python
@recepciones_bp.route('/api/recepciones/registrar', methods=['POST'])
@require_auth
def registrar_recepcion():
    """Registra una recepción de productos asignando ubicaciones físicas (WMS)"""
    try:
        data = request.json or {}
        recepcion_guid = data.get('recepcion_guid')
        recepcion_docid = data.get('recepcion_docid', '')
        es_adesa = data.get('es_adesa', False)
        location_name = data.get('location_name', '')
        
        # NUEVA ESTRUCTURA: productos agrupados por SKU
        productos = data.get('productos', [])
        
        # Validaciones básicas
        if not recepcion_guid:
            return jsonify({
                "success": False,
                "error": "GUID de recepción es requerido"
            }), 400
        
        if not productos or len(productos) == 0:
            return jsonify({
                "success": False,
                "error": "Debe asignar al menos un producto"
            }), 400
        
        # Verificar si ya fue registrada
        recepcion_existente = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).first()
        
        if recepcion_existente:
            return jsonify({
                "success": False,
                "error": f"Esta recepción ya fue registrada anteriormente (DocID: {recepcion_docid})"
            }), 400
        
        # Obtener productos originales de la recepción para validar cantidades
        # (Necesitamos consultar ADM Cloud o tenerlos en el payload)
        productos_originales = {}  # {sku: cantidad_total}
        # TODO: Obtener desde recepcion_data o desde payload
        
        # VALIDACIÓN DE SUMATORIA POR SKU
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            cantidad_total = float(producto.get('cantidad_total', 0))
            asignaciones = producto.get('asignaciones', [])
            
            # Validar SKU
            es_valido, mensaje = validar_sku(sku)
            if not es_valido:
                return jsonify({
                    "success": False,
                    "error": f"SKU inválido: {mensaje}"
                }), 400
            
            # Validar que haya asignaciones
            if not asignaciones or len(asignaciones) == 0:
                return jsonify({
                    "success": False,
                    "error": f"El producto {sku} debe tener al menos una asignación de ubicación"
                }), 400
            
            # REGLA DE ORO #4: Validar ubicación física solo si es ADESA
            if es_adesa:
                # Calcular suma de asignaciones
                suma_asignaciones = sum(float(a.get('cantidad', 0)) for a in asignaciones)
                
                # Validar que la suma no exceda la cantidad total
                if suma_asignaciones > cantidad_total:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} tiene asignaciones que exceden la cantidad recibida. Total recibido: {cantidad_total}, Suma asignada: {suma_asignaciones}"
                    }), 400
                
                # Validar que todas las asignaciones tengan ubicación
                for asignacion in asignaciones:
                    ubicacion = asignacion.get('ubicacion', '').strip()
                    cantidad = asignacion.get('cantidad', 0)
                    
                    es_valido, mensaje = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Ubicación inválida para {sku}: {mensaje}"
                        }), 400
                    
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku} en {ubicacion}: {mensaje}"
                        }), 400
            else:
                # Para NO-ADESA: no validar ubicación física
                # Solo validar que haya al menos una asignación (aunque no tenga ubicación física)
                for asignacion in asignaciones:
                    cantidad = asignacion.get('cantidad', 0)
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku}: {mensaje}"
                        }), 400
        
        # Procesar asignaciones
        movimientos_creados = []
        
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            item_id = producto.get('item_id', '')
            asignaciones = producto.get('asignaciones', [])
            
            for asignacion in asignaciones:
                ubicacion = asignacion.get('ubicacion', '').strip()
                cantidad = float(asignacion.get('cantidad', 0))
                
                # REGLA DE ORO #4: Modificar StockUbicacion solo si es ADESA
                if es_adesa:
                    # Buscar o crear stock en ubicación
                    stock_ubic = StockUbicacion.query.filter_by(
                        sku=sku,
                        ubicacion=ubicacion
                    ).first()
                    
                    if stock_ubic:
                        stock_ubic.cantidad = float(stock_ubic.cantidad) + cantidad
                        stock_ubic.updated_at = datetime.utcnow()
                    else:
                        stock_ubic = StockUbicacion(
                            product_id=item_id or "",
                            sku=sku,
                            ubicacion=ubicacion,
                            cantidad=cantidad
                        )
                        db.session.add(stock_ubic)
                else:
                    # Para NO-ADESA: usar location_name de ADM como ubicación en Movimiento
                    ubicacion = location_name or "NO-ADESA"
                    # NO modificar StockUbicacion
                
                # Crear movimiento siempre (para auditoría)
                notas_movimiento = f"Recepción {recepcion_docid or 'DocID N/A'} (GUID: {recepcion_guid[:8]}...) desde ADM Cloud"
                if not es_adesa:
                    notas_movimiento += f" - Ubicación ADM: {location_name}"
                
                movimiento = Movimiento(
                    tipo="RECEIPT",
                    product_id=item_id or "",
                    sku=sku,
                    ubicacion_origen=None,
                    ubicacion_destino=ubicacion,
                    cantidad=cantidad,
                    factura_id=recepcion_docid or recepcion_guid,
                    factura_guid=recepcion_guid,
                    usuario_id=session.get('user_id'),
                    notas=notas_movimiento
                )
                db.session.add(movimiento)
                movimientos_creados.append(movimiento.to_dict())
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Recepción registrada exitosamente",
            "movimientos": movimientos_creados,
            "total_movimientos": len(movimientos_creados)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al registrar recepción: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al registrar recepción",
            "message": str(e)
        }), 500
```

**Resumen de Validaciones:**
- ✅ Validar que cada SKU tenga al menos una asignación
- ✅ Validar que la suma de asignaciones no exceda `cantidad_total`
- ✅ Validar ubicación física solo si `es_adesa == True`
- ✅ Modificar `StockUbicacion` solo si `es_adesa == True`
- ✅ Crear `Movimiento` siempre (para auditoría)

---

### **4. Frontend: Interfaz de Usuario**

#### **A. Estructura de Datos en JavaScript**

```javascript
// Estructura nueva
let productosAsignados = {
    'SKU123': {
        item_id: 'xxx',
        cantidad_total: 10,
        asignaciones: [
            { ubicacion: '2P1D01N1', cantidad: 5 },
            { ubicacion: '2P1D01N2', cantidad: 5 }
        ]
    }
};

// Función para calcular suma de asignaciones
function calcularSumaAsignaciones(sku) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones) {
        return 0;
    }
    return productosAsignados[sku].asignaciones.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

// Función para validar sumatoria
function validarSumatoria(sku) {
    const producto = productosAsignados[sku];
    if (!producto) return { valido: false, mensaje: 'Producto no encontrado' };
    
    const suma = calcularSumaAsignaciones(sku);
    const cantidad_total = parseFloat(producto.cantidad_total || 0);
    
    if (suma > cantidad_total) {
        return {
            valido: false,
            mensaje: `La suma de asignaciones (${suma.toFixed(2)}) excede la cantidad recibida (${cantidad_total.toFixed(2)})`
        };
    }
    
    return { valido: true, suma: suma, restante: cantidad_total - suma };
}
```

#### **B. HTML para Múltiples Ubicaciones por SKU**

```javascript
function mostrarProductos(productos, recepcion, yaRegistrada) {
    const esAdesa = recepcion && recepcion.es_adesa === true;
    const requiereUbicacionFisica = esAdesa;
    
    productos.forEach((producto, index) => {
        const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
        const cantidad_total = parseFloat(producto.Quantity || 0);
        const itemId = producto.ItemID || '';
        const nombre = producto.Name || 'Sin nombre';
        
        // Inicializar estructura si no existe
        if (!productosAsignados[sku]) {
            productosAsignados[sku] = {
                item_id: itemId,
                cantidad_total: cantidad_total,
                asignaciones: []
            };
        }
        
        // Si es ADESA y no tiene asignaciones, crear una vacía
        if (requiereUbicacionFisica && productosAsignados[sku].asignaciones.length === 0) {
            productosAsignados[sku].asignaciones.push({ ubicacion: '', cantidad: cantidad_total });
        }
        
        // Si NO es ADESA, crear una asignación sin ubicación física
        if (!requiereUbicacionFisica && productosAsignados[sku].asignaciones.length === 0) {
            productosAsignados[sku].asignaciones.push({ ubicacion: '', cantidad: cantidad_total });
        }
        
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card';
        productoCard.id = `producto-${sku}`;
        
        // Calcular suma actual
        const suma_actual = calcularSumaAsignaciones(sku);
        const restante = cantidad_total - suma_actual;
        const validacion = validarSumatoria(sku);
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>${nombre}</h4>
                    <div class="sku">SKU: ${sku}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Cantidad Recibida</div>
                    <div class="value">${cantidad_total.toFixed(2)}</div>
                </div>
            </div>
            <div class="asignacion-section">
                ${requiereUbicacionFisica ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📍 Asignar Ubicaciones Físicas (WMS):
                    </div>
                    <div id="asignaciones-${sku}">
                        <!-- Las asignaciones se renderizan aquí -->
                    </div>
                    <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Total asignado:</strong> <span id="suma-${sku}" style="font-weight: 600;">${suma_actual.toFixed(2)}</span> / ${cantidad_total.toFixed(2)}
                                <span id="restante-${sku}" style="margin-left: 10px; color: ${restante > 0 ? '#856404' : '#28a745'};">
                                    (Restante: ${restante.toFixed(2)})
                                </span>
                            </div>
                            ${restante > 0 ? `
                                <button class="btn-agregar-ubicacion" 
                                        onclick="agregarUbicacion('${sku}')"
                                        ${yaRegistrada ? 'disabled' : ''}
                                        style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                                    + Agregar otra ubicación
                                </button>
                            ` : ''}
                        </div>
                        ${!validacion.valido ? `
                            <div style="margin-top: 5px; color: #dc3545; font-size: 12px;">
                                ⚠️ ${validacion.mensaje}
                            </div>
                        ` : ''}
                    </div>
                ` : `
                    <!-- Para NO-ADESA: mostrar información sin exigir ubicación física -->
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📦 Recepción Externa (NO requiere ubicación física WMS)
                    </div>
                    <div style="background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 5px; padding: 10px; margin-bottom: 10px;">
                        <div style="font-size: 12px; color: #004085;">
                            <strong>Ubicación ADM:</strong> ${recepcion.location_name || 'N/A'}<br>
                            <strong>Cantidad:</strong> ${cantidad_total.toFixed(2)}<br>
                            <em style="color: #6c757d;">Esta recepción se registrará como auditoría sin modificar stock físico del WMS.</em>
                        </div>
                    </div>
                `}
            </div>
        `;
        
        grid.appendChild(productoCard);
        
        // Renderizar asignaciones
        if (requiereUbicacionFisica) {
            renderizarAsignaciones(sku, yaRegistrada);
        }
    });
}

function renderizarAsignaciones(sku, yaRegistrada) {
    const producto = productosAsignados[sku];
    if (!producto) return;
    
    const container = document.getElementById(`asignaciones-${sku}`);
    if (!container) return;
    
    container.innerHTML = '';
    
    producto.asignaciones.forEach((asignacion, index) => {
        const asignacionDiv = document.createElement('div');
        asignacionDiv.className = 'asignacion-fila';
        asignacionDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
        
        asignacionDiv.innerHTML = `
            <input type="text" 
                   class="input-ubicacion" 
                   placeholder="Ubicación (ej: 2P1D01N1)" 
                   value="${asignacion.ubicacion}"
                   onchange="actualizarAsignacion('${sku}', ${index}, 'ubicacion', this.value)"
                   ${yaRegistrada ? 'disabled' : ''}
                   style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            <input type="number" 
                   class="input-cantidad" 
                   placeholder="Cantidad" 
                   step="0.01" 
                   min="0.01" 
                   value="${asignacion.cantidad.toFixed(2)}"
                   onchange="actualizarAsignacion('${sku}', ${index}, 'cantidad', this.value)"
                   ${yaRegistrada ? 'disabled' : ''}
                   style="width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            ${!yaRegistrada && producto.asignaciones.length > 1 ? `
                <button onclick="eliminarAsignacion('${sku}', ${index})" 
                        style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">
                    ✕
                </button>
            ` : ''}
        `;
        
        container.appendChild(asignacionDiv);
    });
    
    // Actualizar suma y validación
    actualizarSumaAsignaciones(sku);
}

function actualizarAsignacion(sku, index, campo, valor) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones[index]) {
        return;
    }
    
    if (campo === 'ubicacion') {
        productosAsignados[sku].asignaciones[index].ubicacion = valor.trim().toUpperCase();
    } else if (campo === 'cantidad') {
        productosAsignados[sku].asignaciones[index].cantidad = parseFloat(valor) || 0;
        actualizarSumaAsignaciones(sku);
    }
}

function agregarUbicacion(sku) {
    if (!productosAsignados[sku]) return;
    
    const producto = productosAsignados[sku];
    const suma_actual = calcularSumaAsignaciones(sku);
    const restante = producto.cantidad_total - suma_actual;
    
    if (restante <= 0) {
        alert('No hay cantidad restante para asignar');
        return;
    }
    
    // Agregar nueva asignación con cantidad restante
    producto.asignaciones.push({
        ubicacion: '',
        cantidad: restante
    });
    
    renderizarAsignaciones(sku, false);
}

function eliminarAsignacion(sku, index) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones[index]) return;
    
    productosAsignados[sku].asignaciones.splice(index, 1);
    renderizarAsignaciones(sku, false);
}

function actualizarSumaAsignaciones(sku) {
    const suma = calcularSumaAsignaciones(sku);
    const producto = productosAsignados[sku];
    const cantidad_total = producto.cantidad_total;
    const restante = cantidad_total - suma;
    const validacion = validarSumatoria(sku);
    
    // Actualizar display
    const sumaElement = document.getElementById(`suma-${sku}`);
    const restanteElement = document.getElementById(`restante-${sku}`);
    
    if (sumaElement) {
        sumaElement.textContent = suma.toFixed(2);
    }
    
    if (restanteElement) {
        restanteElement.textContent = `(Restante: ${restante.toFixed(2)})`;
        restanteElement.style.color = restante > 0 ? '#856404' : (restante < 0 ? '#dc3545' : '#28a745');
    }
    
    // Mostrar/ocultar botón "Agregar otra ubicación"
    const btnAgregar = document.querySelector(`#producto-${sku} .btn-agregar-ubicacion`);
    if (btnAgregar) {
        if (restante > 0 && !validacion.valido === false) {
            btnAgregar.style.display = 'block';
        } else {
            btnAgregar.style.display = 'none';
        }
    }
}
```

#### **C. Función de Registro**

```javascript
async function registrarTodasAsignaciones() {
    const esAdesa = recepcionActual && recepcionActual.es_adesa === true;
    
    // Validar todas las asignaciones
    for (const sku in productosAsignados) {
        const producto = productosAsignados[sku];
        const validacion = validarSumatoria(sku);
        
        if (!validacion.valido) {
            alert(`Error en ${sku}: ${validacion.mensaje}`);
            return;
        }
        
        if (esAdesa) {
            // Validar que todas las asignaciones tengan ubicación
            for (const asignacion of producto.asignaciones) {
                if (!asignacion.ubicacion || asignacion.ubicacion.trim() === '') {
                    alert(`El producto ${sku} tiene asignaciones sin ubicación física`);
                    return;
                }
            }
        }
    }
    
    // Preparar payload
    const productos = [];
    for (const sku in productosAsignados) {
        const producto = productosAsignados[sku];
        productos.push({
            sku: sku,
            item_id: producto.item_id,
            cantidad_total: producto.cantidad_total,
            asignaciones: producto.asignaciones.map(a => ({
                ubicacion: a.ubicacion || (recepcionActual.location_name || 'NO-ADESA'),
                cantidad: a.cantidad
            }))
        });
    }
    
    // Enviar al backend
    const btnRegistrarTodo = document.getElementById('btn-registrar-todo');
    btnRegistrarTodo.disabled = true;
    btnRegistrarTodo.textContent = 'Registrando...';
    
    try {
        const response = await fetch('/api/recepciones/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recepcion_guid: recepcionActual.guid,
                recepcion_docid: recepcionActual.docid,
                es_adesa: esAdesa,
                location_name: recepcionActual.location_name,
                productos: productos
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensaje('success', `Recepción registrada exitosamente. ${data.total_movimientos} movimiento(s) creado(s).`);
            // Recargar página o actualizar UI
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar recepción');
            btnRegistrarTodo.disabled = false;
            btnRegistrarTodo.textContent = 'Registrar Todas las Asignaciones';
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al registrar recepción');
        btnRegistrarTodo.disabled = false;
        btnRegistrarTodo.textContent = 'Registrar Todas las Asignaciones';
    }
}
```

---

## 📊 REGISTRO EN BASE DE DATOS

### **Ejemplo: SKU 123 → 10 unidades en 2 ubicaciones**

**Input:**
- SKU: `SKU123`
- Cantidad total: `10`
- Asignaciones:
  - `2P1D01N1`: `5`
  - `2P1D01N2`: `5`

**Resultado en BD:**

#### **Tabla `movimientos` (2 registros):**
```sql
INSERT INTO movimientos (tipo, sku, ubicacion_destino, cantidad, factura_guid, ...) VALUES
('RECEIPT', 'SKU123', '2P1D01N1', 5.00, 'xxx-guid', ...),
('RECEIPT', 'SKU123', '2P1D01N2', 5.00, 'xxx-guid', ...);
```

#### **Tabla `stock_por_ubicacion` (2 registros actualizados/creados):**
```sql
-- Si ya existía stock en 2P1D01N1
UPDATE stock_por_ubicacion SET cantidad = cantidad + 5.00 WHERE sku = 'SKU123' AND ubicacion = '2P1D01N1';

-- Si ya existía stock en 2P1D01N2
UPDATE stock_por_ubicacion SET cantidad = cantidad + 5.00 WHERE sku = 'SKU123' AND ubicacion = '2P1D01N2';

-- Si no existía, se crea nuevo registro
INSERT INTO stock_por_ubicacion (sku, ubicacion, cantidad, ...) VALUES
('SKU123', '2P1D01N1', 5.00, ...),
('SKU123', '2P1D01N2', 5.00, ...);
```

**Ventajas:**
- ✅ Trazabilidad completa: cada ubicación tiene su propio movimiento
- ✅ Stock físico preciso: cada ubicación refleja su stock real
- ✅ Auditoría: se puede rastrear qué cantidad fue a cada ubicación

---

## ✅ CHECKLIST DE VALIDACIÓN

### **Validaciones Frontend:**
- [ ] Validar que la suma de asignaciones no exceda `cantidad_total`
- [ ] Validar que todas las asignaciones tengan ubicación física (solo ADESA)
- [ ] Validar que todas las asignaciones tengan cantidad > 0
- [ ] Mostrar suma actual y cantidad restante en tiempo real
- [ ] Permitir agregar/eliminar ubicaciones dinámicamente
- [ ] Deshabilitar campos si la recepción ya fue registrada

### **Validaciones Backend:**
- [ ] Validar que la suma de asignaciones no exceda `cantidad_total`
- [ ] Validar ubicación física solo si `es_adesa == True`
- [ ] Validar que todas las asignaciones tengan cantidad > 0
- [ ] Modificar `StockUbicacion` solo si `es_adesa == True`
- [ ] Crear `Movimiento` siempre (para auditoría)

### **Pruebas Funcionales:**
- [ ] Recepción ADESA con 1 ubicación por SKU
- [ ] Recepción ADESA con múltiples ubicaciones por SKU (split)
- [ ] Recepción ADESA con suma exacta (10 = 5 + 5)
- [ ] Recepción ADESA con suma menor (10 = 3 + 4, restante 3)
- [ ] Intentar recepción ADESA con suma mayor (10 = 6 + 5, debe fallar)
- [ ] Recepción NO-ADESA sin ubicación física
- [ ] Reversión de recepción ADESA con múltiples ubicaciones
- [ ] Reversión de recepción NO-ADESA

---

## 🎯 CONCLUSIÓN

### **Viabilidad: ✅ ALTA**

La implementación de **multi-ubicación por SKU (split por filas)** es **viable y recomendada** porque:

1. ✅ **No rompe las reglas de oro existentes** - De hecho, mejora la precisión
2. ✅ **Backend ya soporta múltiples movimientos** - Solo necesita validación de sumatoria
3. ✅ **Frontend requiere cambios manejables** - Cambio de estructura de datos y UI
4. ✅ **Mejora la trazabilidad** - Cada ubicación tiene su propio movimiento y stock
5. ✅ **Compatible con Regla de Oro #4** - Split solo aplica para ADESA

### **Recomendación Final**

✅ **PROCEDER CON LA IMPLEMENTACIÓN** siguiendo la estructura propuesta:
- Estructura agrupada en frontend (`asignaciones` array)
- Payload agrupado al backend (`productos` con `asignaciones`)
- Validación de sumatoria en frontend y backend
- UI dinámica con botón "Agregar otra ubicación"

---

**Fin del Informe**



