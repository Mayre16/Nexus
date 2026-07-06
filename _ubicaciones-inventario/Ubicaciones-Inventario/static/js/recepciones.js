let recepcionActual = null;
let productosAsignados = {};
let modoEdicion = false;
let usuarioRol = null;
let recepcionYaRegistrada = false;
let estadoRecepcionCache = {};  // Cache de estado por SKU para agregarUbicacion

// ID seguro para DOM (SKUs con /, etc. rompen querySelector)
function skuToSafeId(sku) {
    return (sku || '').replace(/[/\\'"<>]/g, '_');
}

function escapeSkuForJs(sku) {
    return String(sku).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Función helper para convertir fecha UTC a hora local
// Las fechas vienen en UTC desde el servidor, JavaScript las convierte automáticamente a la zona horaria del navegador
function formatearFechaLocal(fechaISO) {
    if (!fechaISO) return null;
    try {
        // Si la fecha viene sin 'Z' ni offset, asumimos que es UTC y agregamos 'Z'
        let fechaStr = String(fechaISO).trim();
        // Si no tiene 'Z', '+', ni '-' después del año, agregar 'Z' para indicar UTC
        if (!fechaStr.includes('Z') && !fechaStr.includes('+') && !fechaStr.match(/-\d{2}:\d{2}$/)) {
            // Si termina solo con números o tiene formato ISO sin zona horaria, agregar 'Z'
            if (fechaStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)) {
                fechaStr = fechaStr + 'Z';
            }
        }
        // Crear fecha - JavaScript automáticamente la convierte a la zona horaria local del navegador
        return new Date(fechaStr);
    } catch (e) {
        console.error('Error al formatear fecha:', e, fechaISO);
        // Fallback: intentar parsear directamente
        return new Date(fechaISO);
    }
}

// Obtener rol del usuario
async function obtenerRolUsuario() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success && data.usuario) {
            usuarioRol = data.usuario.rol ? data.usuario.rol.toLowerCase() : null;
        }
    } catch (error) {
        console.error('Error al obtener rol del usuario:', error);
    }
}

// Verificar si viene con parámetro guid (desde historial)
window.addEventListener('DOMContentLoaded', async () => {
    // Obtener rol del usuario
    await obtenerRolUsuario();
    
    const urlParams = new URLSearchParams(window.location.search);
    const guid = urlParams.get('guid');
    const editar = urlParams.get('editar');
    
    if (guid) {
        modoEdicion = editar === 'true';
        // Ocultar sección de búsqueda
        document.querySelector('.search-section').style.display = 'none';
        document.getElementById('empty-state').style.display = 'none';
        
        // Cargar detalles de la recepción
        await cargarDetallesRecepcion(guid);
    }
});

// Cargar detalles completos de una recepción (o retomar si editar=true)
async function cargarDetallesRecepcion(guid) {
    try {
        if (modoEdicion) {
            // Intentar cargar desde RecepcionProcesada para retomar (persistencia)
            const resPorGuid = await fetch(`/api/recepciones/por-guid/${guid}`);
            const dataPorGuid = await resPorGuid.json();
            if (dataPorGuid.success && dataPorGuid.recepcion) {
                recepcionActual = dataPorGuid.recepcion;
                mostrarRecepcion(dataPorGuid.recepcion);
                return;
            }
        }
        const response = await fetch(`/api/detalles/recepcion/${guid}`);
        const data = await response.json();
        if (data.success) {
            mostrarDetallesRecepcion(data.recepcion);
        } else {
            mostrarMensaje('error', data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

// Mostrar detalles completos de recepción (vista de auditoría)
function mostrarDetallesRecepcion(recepcion) {
    document.getElementById('recepcion-info').style.display = 'block';
    
    // Información básica
    const fechaLocalDetalle = formatearFechaLocal(recepcion.fecha);
    document.getElementById('recepcion-numero').textContent = 
        `Recepción - ${fechaLocalDetalle ? fechaLocalDetalle.toLocaleDateString('es-DO') : 'N/A'}`;
    document.getElementById('recepcion-fecha').textContent = 
        fechaLocalDetalle ? fechaLocalDetalle.toLocaleString('es-DO') : 'N/A';
    
    // Usuario
    if (recepcion.usuario) {
        let usuariosDiv = document.querySelector('.recepcion-details').querySelector('#usuarios-info');
        if (!usuariosDiv) {
            usuariosDiv = document.createElement('div');
            usuariosDiv.id = 'usuarios-info';
            usuariosDiv.innerHTML = `<strong>Procesado por:</strong> ${recepcion.usuario.nombre}`;
            document.querySelector('.recepcion-details').appendChild(usuariosDiv);
        } else {
            usuariosDiv.innerHTML = `<strong>Procesado por:</strong> ${recepcion.usuario.nombre}`;
        }
    }
    
    // Cambiar título
    document.querySelector('.productos-section h2').textContent = 
        modoEdicion ? 'Productos Recibidos' : 'Productos Recibidos (Auditoría)';
    
    // Mostrar productos con detalles de movimientos
    mostrarProductosRecepcionConMovimientos(recepcion.productos);
    
    // Si no es modo edición, ocultar inputs de registro
    if (!modoEdicion) {
        document.getElementById('btn-registrar-todo').style.display = 'none';
        document.querySelectorAll('.asignacion-inputs').forEach(el => {
            el.style.display = 'none';
        });
    }
}

// Mostrar productos con detalles de movimientos
function mostrarProductosRecepcionConMovimientos(productos) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    
    if (productos.length === 0) {
        grid.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: var(--space-5);">No hay productos recibidos</p>';
        return;
    }
    
    productos.forEach((prod) => {
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card';
        
        let movimientosHtml = '';
        if (prod.movimientos && prod.movimientos.length > 0) {
            movimientosHtml = '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--color-border);"><strong>Movimientos:</strong><ul style="margin-top: 10px; padding-left: 20px;">';
            prod.movimientos.forEach(mov => {
                const fechaMov = formatearFechaLocal(mov.fecha);
                movimientosHtml += `<li>${mov.cantidad} unidades a ${mov.ubicacion || 'N/A'} - ${mov.usuario} (${fechaMov ? fechaMov.toLocaleString('es-DO') : 'N/A'})</li>`;
            });
            movimientosHtml += '</ul></div>';
        }
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>SKU: ${prod.sku}</h4>
                </div>
                <div class="cantidad-item">
                    <div class="label">Cantidad Total</div>
                    <div class="value">${prod.cantidad_total.toFixed(2)}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Ubicación</div>
                    <div class="value">${prod.ubicacion}</div>
                </div>
            </div>
            ${movimientosHtml}
        `;
        grid.appendChild(productoCard);
    });
}

// Verificar autenticación
async function verificarAutenticacion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.success) {
            window.location.href = '/login';
            return;
        }

        document.getElementById('user-info').textContent = 
            `${data.usuario.nombre} (${data.usuario.rol})`;
    } catch (error) {
        window.location.href = '/login';
    }
}

// Búsqueda de recepción
document.getElementById('search-recepcion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docid = document.getElementById('docid-input').value.trim();
    const tipo = document.getElementById('tipo-recepcion').value;

    if (!docid) {
        mostrarMensaje('error', 'Ingresa un número de recepción');
        return;
    }

    const btnSearch = document.getElementById('btn-search');
    btnSearch.disabled = true;
    
    let tipoNombre = 'Recepción';
    if (tipo === 'VEND_REC') {
        tipoNombre = 'Compra con Recepción';
    } else if (tipo === 'CREDIT_NOTE') {
        tipoNombre = 'Nota de Crédito';
    }
    mostrarMensaje('success', `Buscando ${tipoNombre} #${docid}...`);
    btnSearch.textContent = 'Buscando...';

    try {
        const response = await fetch('/api/recepciones/buscar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ docid, tipo })
        });

        const data = await response.json();

        if (data.success) {
            recepcionActual = data.recepcion;
            productosAsignados = {};
            mostrarRecepcion(data.recepcion);
            let tipoNombre = 'Recepción';
            if (data.recepcion.tipo === 'VEND_REC') {
                tipoNombre = 'Compra con Recepción';
            } else if (data.recepcion.tipo === 'CREDIT_NOTE') {
                tipoNombre = 'Nota de Crédito';
            }
            mostrarMensaje('success', `${tipoNombre} encontrada`);
        } else {
            mostrarMensaje('error', data.error || 'Recepción no encontrada');
            ocultarRecepcion();
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    } finally {
        btnSearch.disabled = false;
        btnSearch.textContent = 'Buscar';
    }
});

function mostrarRecepcion(recepcion) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('recepcion-info').style.display = 'block';

    // Guardar estado de si ya fue registrada
    recepcionYaRegistrada = recepcion.ya_registrada || false;
    
    // Mostrar advertencia si ya fue registrada
    const advertenciaDiv = document.getElementById('advertencia-ya-registrada');
    const infoRegistroDiv = document.getElementById('info-registro-anterior');
    const botonesAdmin = document.getElementById('botones-accion-admin');
    const btnRefrescar = document.getElementById('btn-refrescar');
    const btnRevertir = document.getElementById('btn-revertir');
    
    if (recepcion.ya_registrada) {
        advertenciaDiv.style.display = 'block';
        let infoTexto = `Esta recepción ya fue procesada en el sistema.`;
        if (recepcion.usuario_solicitante) {
            infoTexto += ` Solicitado por: ${recepcion.usuario_solicitante.nombre}`;
        }
        if (recepcion.usuario_procesador) {
            infoTexto += ` | Completado por: ${recepcion.usuario_procesador.nombre}`;
        }
        if (recepcion.completed_at) {
            const fechaComp = formatearFechaLocal(recepcion.completed_at);
            infoTexto += ` | Fecha: ${fechaComp.toLocaleDateString('es-DO')} ${fechaComp.toLocaleTimeString('es-DO')}`;
        } else if (recepcion.fecha_registro) {
            const fechaReg = formatearFechaLocal(recepcion.fecha_registro);
            infoTexto += ` | Fecha: ${fechaReg.toLocaleDateString('es-DO')} ${fechaReg.toLocaleTimeString('es-DO')}`;
        }
        if (recepcion.usuario_registro && !recepcion.usuario_procesador) {
            infoTexto += ` | Usuario: ${recepcion.usuario_registro}`;
        }
        infoRegistroDiv.textContent = infoTexto;
    } else {
        advertenciaDiv.style.display = 'none';
    }
    
    // REGLA DE ORO #4: NO-ADESA no requiere mapeo, solo mostrar información
    const advertenciaSinMapeo = document.getElementById('advertencia-sin-mapeo');
    if (advertenciaSinMapeo) {
        advertenciaSinMapeo.style.display = 'none';
    }
    
    // Mostrar botones según rol y estado (consistente con Despacho)
    const esAdmin = usuarioRol === 'administrador';
    const tieneAvances = recepcion.ya_registrada || 
        (recepcion.estado_recepcion && recepcion.estado_recepcion !== 'PENDIENTE');
    
    if (esAdmin && tieneAvances) {
        botonesAdmin.style.display = 'flex';
        btnRevertir.style.display = 'inline-block';
        btnRefrescar.style.display = 'inline-block';
    } else if (esAdmin && !tieneAvances) {
        botonesAdmin.style.display = 'flex';
        btnRevertir.style.display = 'none';
        btnRefrescar.style.display = 'inline-block';
    } else if (!esAdmin) {
        botonesAdmin.style.display = 'none';
    }

    const esVendor = recepcion.tipo === 'VEND_REC' || recepcion.doc_type === 'VEND_REC';
    const esCreditNote = recepcion.tipo === 'CREDIT_NOTE' || recepcion.doc_type === 'CUST_CRE';
    
    let titulo = 'Recepción';
    if (esVendor) {
        titulo = 'Compra con Recepción';
    } else if (esCreditNote) {
        titulo = 'Nota de Crédito';
    }
    
    document.getElementById('recepcion-numero').textContent = 
        `${titulo} #${recepcion.docid}`;
    
    // Campos comunes
    document.getElementById('recepcion-fecha').textContent = 
        formatarFechaDocumento(recepcion.fecha);
    document.getElementById('recepcion-location').textContent = 
        recepcion.location_name || 'N/A';

    // Badge de estado (PENDIENTE/EN_PROCESO/COMPLETO) como en Despacho
    const estadoEl = document.getElementById('recepcion-estado');
    const estadoRec = recepcion.estado_recepcion || 'PENDIENTE';
    estadoEl.textContent = estadoRec.replace('_', ' ');
    estadoEl.className = 'estado-badge estado-' + estadoRec.toLowerCase().replace('_', '-');

    // Campos específicos según tipo de recepción
    if (esVendor) {
        document.getElementById('recepcion-proveedor-group').style.display = 'block';
        document.getElementById('recepcion-proveedor').textContent = recepcion.proveedor || recepcion.cliente || 'N/A';
        document.getElementById('recepcion-referencia-group').style.display = 'none';
    } else if (esCreditNote) {
        document.getElementById('recepcion-proveedor-group').style.display = 'block';
        document.getElementById('recepcion-proveedor').textContent = recepcion.cliente || 'N/A';
        document.getElementById('recepcion-referencia-group').style.display = recepcion.referencia ? 'block' : 'none';
        if (recepcion.referencia) {
            document.getElementById('recepcion-referencia').textContent = `Factura relacionada: ${recepcion.referencia}`;
        }
        if (recepcion.related_ncf) {
            const referenciaElement = document.getElementById('recepcion-referencia');
            if (referenciaElement) {
                referenciaElement.textContent = `Factura relacionada: ${recepcion.referencia} (NCF: ${recepcion.related_ncf})`;
            }
        }
    } else {
        document.getElementById('recepcion-proveedor-group').style.display = 'block';
        document.getElementById('recepcion-proveedor').textContent = recepcion.cliente || 'N/A';
        document.getElementById('recepcion-referencia-group').style.display = 'none';
    }

    const modoSoloLectura = recepcion.ya_registrada || (recepcion.estado_recepcion === 'COMPLETO');
    mostrarProductos(recepcion.productos || [], modoSoloLectura, recepcion);
}

async function obtenerEstadoRecepcion(recepcionGuid) {
    try {
        const response = await fetch(`/api/recepciones/recepcion/${recepcionGuid}/estado`);
        const data = await response.json();
        return data.success ? data : null;
    } catch (e) {
        console.error('Error al obtener estado recepción:', e);
        return null;
    }
}

function ocultarRecepcion() {
    document.getElementById('recepcion-info').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

async function mostrarProductos(productos, yaRegistrada = false, recepcion = null) {
    const grid = document.getElementById('productos-grid');
    const btnRegistrarTodo = document.getElementById('btn-registrar-todo');
    
    if (!productos || productos.length === 0) {
        grid.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: var(--space-5);">No hay productos en esta recepción</p>';
        btnRegistrarTodo.style.display = 'none';
        return;
    }

    grid.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Cargando productos...</div>';
    
    let estadoProductos = {};
    if (recepcion && recepcion.guid) {
        const estadoData = await obtenerEstadoRecepcion(recepcion.guid);
        if (estadoData && estadoData.productos) {
            estadoData.productos.forEach(p => {
                estadoProductos[p.sku.toUpperCase()] = {
                    asignado: p.cantidad_asignada,
                    restante: p.cantidad_restante,
                    completo: p.completo,
                    asignaciones_registradas: p.asignaciones_registradas || []
                };
            });
        }
    }

    productosAsignados = {};
    estadoRecepcionCache = {};

    const productosOrdenados = [...productos].sort((a, b) => {
        const skuA = (a.SKU || a.ItemSKU || '').toUpperCase();
        const skuB = (b.SKU || b.ItemSKU || '').toUpperCase();
        const completoA = estadoProductos[skuA]?.completo ?? false;
        const completoB = estadoProductos[skuB]?.completo ?? false;
        if (completoA === completoB) return 0;
        return completoA ? 1 : -1;
    });

    if (yaRegistrada) {
        btnRegistrarTodo.style.display = 'none';
    }

    const esAdesa = recepcion && recepcion.es_adesa === true;
    const tieneMapeo = recepcion && recepcion.tiene_mapeo === true;
    const ubicacionMapeada = recepcion && recepcion.ubicacion_fisica_mapeada;
    const ubicacionesMapeadas = recepcion && recepcion.ubicaciones_fisicas_mapeadas || [];
    
    const bloqueadoPorSinMapeo = false;

    grid.innerHTML = '';

    productosOrdenados.forEach((producto, index) => {
        const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
        const cantidad_total = parseFloat(producto.Quantity || 0);
        const itemId = producto.ItemID || '';
        const nombre = producto.Name || 'Sin nombre';
        
        const itemType = producto.ItemType || 'I';
        const requiereUbicacionPorTipo = producto.requiere_ubicacion !== undefined ? producto.requiere_ubicacion : (itemType === 'I');
        
        const requiereUbicacionFisica = esAdesa && requiereUbicacionPorTipo;
        const requiereAsignaciones = requiereUbicacionPorTipo;
        
        if (!productosAsignados[sku]) {
            productosAsignados[sku] = {
                item_id: itemId,
                cantidad_total: cantidad_total,
                asignaciones: []
            };
        }
        
        const estado = estadoProductos[sku] || { asignado: 0, restante: cantidad_total, completo: false, asignaciones_registradas: [] };
        const restante = estado.restante;
        const estaCompleto = estado.completo;
        
        if (requiereAsignaciones && productosAsignados[sku].asignaciones.length === 0) {
            const cantInicial = restante > 0 ? restante : cantidad_total;
            productosAsignados[sku].asignaciones.push({ ubicacion: '', cantidad: cantInicial });
        }
        
        const productoCard = document.createElement('div');
        productoCard.className = `producto-card ${estaCompleto ? 'completo' : ''}`;
        productoCard.id = `producto-${skuToSafeId(sku)}`;
        
        const asignacionesRegistradas = estado.asignaciones_registradas || [];
        const totalAsignado = estado.asignado;
        const suma_inputs = calcularSumaAsignaciones(sku);
        const validacion = (restante <= 0 || estaCompleto) ? 
            { valido: true, suma: suma_inputs, restante, completo: true } : 
            (suma_inputs <= restante && suma_inputs > 0 ? 
                { valido: true, suma: suma_inputs, restante, completo: false } : 
                { valido: suma_inputs === 0, mensaje: suma_inputs > restante ? `La suma (${suma_inputs.toFixed(2)}) excede el restante (${restante.toFixed(2)})` : 'Ingresa al menos una asignación', completo: false });
        
        let tipoBadge = '';
        let tipoNombre = 'Item';
        if (itemType === 'S') {
            tipoBadge = '<span style="background: #17a2b8; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">SERVICIO</span>';
            tipoNombre = 'Servicio';
        } else if (itemType === 'K') {
            tipoBadge = '<span style="background: #6f42c1; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">KIT</span>';
            tipoNombre = 'Kit';
        } else {
            tipoBadge = '<span style="background: var(--color-recepcion); color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">ITEM</span>';
        }
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <div class="producto-titulo-fila">
                        <h4 class="producto-nombre">${nombre}</h4>
                        ${tipoBadge}
                    </div>
                    <div class="sku">SKU: ${sku}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Cantidad Recibida</div>
                    <div class="value">${cantidad_total.toFixed(2)}</div>
                </div>
            </div>
            <div class="asignacion-section">
                ${requiereAsignaciones ? `
                    <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-3); font-weight: 600;">
                        ${esAdesa ? '📍 Asignar Ubicaciones Físicas (WMS):' : '📍 Asignar Ubicación (puede ser nombre de ubicación ADM):'}
                    </div>
                    <div id="asignaciones-${skuToSafeId(sku)}">
                    </div>
                    ${asignacionesRegistradas.length > 0 ? `
                    <div style="margin-bottom: var(--space-3); padding: var(--space-3); background: var(--color-success-bg); border-radius: var(--radius-sm); border-left: 4px solid var(--color-recepcion);">
                        <div style="font-size: var(--font-size-xs); color: var(--color-success-text); font-weight: 600; margin-bottom: var(--space-1);">📦 Asignaciones registradas:</div>
                        <ul style="margin: 0; padding-left: 18px; font-size: var(--font-size-xs); color: var(--color-text);">
                            ${asignacionesRegistradas.map(a => `<li>${a.ubicacion} → ${parseFloat(a.cantidad).toFixed(2)}</li>`).join('')}
                        </ul>
                        ${!estaCompleto ? '<div style="font-size: 11px; color: var(--color-text-secondary); margin-top: var(--space-1); font-style: italic;">+ Agregar más abajo</div>' : ''}
                    </div>
                    ` : ''}
                    <div style="margin-top: var(--space-3); padding: var(--space-3); background: var(--color-bg); border-radius: var(--radius-sm);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-3);">
                            <div style="flex: 1 1 200px; min-width: 0;">
                                <strong>Total asignado:</strong> <span id="suma-${skuToSafeId(sku)}" style="font-weight: 600;">${totalAsignado.toFixed(2)}</span> / ${cantidad_total.toFixed(2)}
                                <span id="restante-${skuToSafeId(sku)}" style="margin-left: var(--space-3); color: ${estaCompleto ? 'var(--color-recepcion)' : (restante <= 0 ? 'var(--color-recepcion)' : restante > 0 ? 'var(--color-warning-text)' : 'var(--color-danger)')};">
                                    ${estaCompleto ? '✓ Completo' : `(Restante: ${restante.toFixed(2)})`}
                                </span>
                            </div>
                            ${!yaRegistrada && !estaCompleto ? `
                                <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: flex-end; flex: 1 1 auto; min-width: min(100%, 280px);">
                                <button class="btn-agregar-ubicacion" 
                                        id="btn-agregar-ubicacion-${skuToSafeId(sku)}"
                                        onclick="agregarUbicacion('${sku}')"
                                        style="background: var(--color-transferencia); color: white; border: none; padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-xs); ${restante > 0 && validacion.valido ? '' : 'display: none;'}">
                                    + Agregar otra ubicación
                                </button>
                                <button class="btn-registrar-linea" 
                                        onclick="registrarLineaRecepcion('${sku}', '${itemId}', ${cantidad_total})"
                                        style="background: var(--color-recepcion); color: white; border: none; padding: 6px 16px; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-sm); font-weight: 600;">
                                    Registrar
                                </button>
                                </div>
                            ` : ''}
                        </div>
                        <div id="validacion-msg-${skuToSafeId(sku)}" style="margin-top: var(--space-1); font-size: var(--font-size-xs);">
                            ${estaCompleto ? '<span style="color: var(--color-recepcion); font-weight: 600;">✓ Completo</span>' : (!validacion.valido ? `<span style="color: var(--color-danger);">⚠️ ${validacion.mensaje}</span>` : '')}
                        </div>
                        ${!esAdesa && requiereUbicacionPorTipo ? `
                            <div style="margin-top: var(--space-2); font-size: 11px; color: var(--color-warning-text); font-style: italic;">
                                ℹ️ NO-ADESA: use el nombre de ubicación ADM (ej: ${(recepcionActual && recepcionActual.location_name) || 'Mirador Sur'}). Se guarda como auditoría; el inventario real sigue en ADM Cloud.
                            </div>
                        ` : ''}
                    </div>
                    ${yaRegistrada ? '<p style="color: var(--color-warning-text); font-size: var(--font-size-xs); margin-top: var(--space-1); font-style: italic;">⚠️ Esta recepción ya fue procesada. No se pueden hacer modificaciones.</p>' : ''}
                ` : `
                    ${!requiereUbicacionPorTipo ? `
                        <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-3); font-weight: 600;">
                            ${itemType === 'S' ? '🔧 Servicio' : '📦 Kit'} - NO requiere ubicación física
                        </div>
                        <div style="background: ${itemType === 'S' ? '#e7f3ff' : '#f3e5f5'}; border: 1px solid ${itemType === 'S' ? '#b3d9ff' : '#ce93d8'}; border-radius: var(--radius-sm); padding: var(--space-3); margin-bottom: var(--space-3);">
                            <div style="font-size: var(--font-size-xs); color: ${itemType === 'S' ? '#004085' : '#4a148c'};">
                                <strong>Tipo:</strong> ${tipoNombre}<br>
                                <strong>Cantidad:</strong> ${cantidad_total.toFixed(2)}<br>
                                <em style="color: var(--color-text-muted);">Este ${tipoNombre.toLowerCase()} se registrará sin asignar ubicación física ni modificar stock del WMS.</em>
                            </div>
                            ${!yaRegistrada && !estaCompleto ? `
                            <div style="margin-top: var(--space-3);">
                                <button class="btn-registrar-linea" onclick="registrarLineaRecepcion('${sku}', '${itemId}', ${cantidad_total}, true)"
                                        style="background: ${itemType === 'S' ? '#17a2b8' : '#6f42c1'}; color: white; border: none; padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;">
                                    Registrar ${tipoNombre}
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${yaRegistrada ? '<p style="color: var(--color-warning-text); font-size: var(--font-size-xs); margin-top: var(--space-1); font-style: italic;">⚠️ Esta recepción ya fue procesada. No se pueden hacer modificaciones.</p>' : ''}
                `}
            </div>
        `;
        
        grid.appendChild(productoCard);
        
        if (requiereAsignaciones) {
            renderizarAsignaciones(sku, yaRegistrada || estaCompleto);
        }
        estadoRecepcionCache[sku] = estado;
    });

    document.getElementById('btn-registrar-todo').style.display = 'none';
}

function calcularSumaAsignaciones(sku) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones) {
        return 0;
    }
    return productosAsignados[sku].asignaciones.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

function validarSumatoria(sku, maxSuma) {
    const producto = productosAsignados[sku];
    if (!producto) return { valido: false, mensaje: 'Producto no encontrado' };
    
    const suma = calcularSumaAsignaciones(sku);
    const limite = maxSuma !== undefined ? maxSuma : parseFloat(producto.cantidad_total || 0);
    
    if (suma > limite) {
        return {
            valido: false,
            mensaje: `La suma (${suma.toFixed(2)}) excede el restante (${limite.toFixed(2)})`
        };
    }
    
    return { valido: true, suma: suma, restante: limite - suma };
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
    const suma_inputs = calcularSumaAsignaciones(sku);
    const estado = estadoRecepcionCache[sku] || {};
    const restante = (estado.restante !== undefined ? estado.restante : producto.cantidad_total) - suma_inputs;
    
    if (restante <= 0) {
        alert('No hay cantidad restante para asignar');
        return;
    }
    
    producto.asignaciones.push({
        ubicacion: '',
        cantidad: restante
    });
    
    renderizarAsignaciones(sku, recepcionYaRegistrada || (estadoRecepcionCache[sku]?.completo));
}

function eliminarAsignacion(sku, index) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones[index]) return;
    
    productosAsignados[sku].asignaciones.splice(index, 1);
    renderizarAsignaciones(sku, recepcionYaRegistrada || (estadoRecepcionCache[sku]?.completo));
}

function actualizarSumaAsignaciones(sku) {
    const suma = calcularSumaAsignaciones(sku);
    const producto = productosAsignados[sku];
    const estado = estadoRecepcionCache[sku];
    const limite = estado?.restante !== undefined ? estado.restante : producto.cantidad_total;
    const restante = limite - suma;
    const validacion = validarSumatoria(sku, limite);
    
    const sumaElement = document.getElementById(`suma-${skuToSafeId(sku)}`);
    const restanteElement = document.getElementById(`restante-${skuToSafeId(sku)}`);
    
    if (sumaElement) {
        sumaElement.textContent = suma.toFixed(2);
    }
    
    const estaCompleto = estadoRecepcionCache[sku]?.completo === true;
    if (restanteElement) {
        restanteElement.textContent = estaCompleto ? '✓ Completo' : `(Restante: ${restante.toFixed(2)})`;
        restanteElement.style.color = estaCompleto ? '#28a745' : (restante <= 0 ? '#28a745' : (restante > 0 ? '#856404' : '#dc3545'));
    }
    
    const validacionMsg = document.getElementById(`validacion-msg-${skuToSafeId(sku)}`);
    if (validacionMsg) {
        validacionMsg.innerHTML = estaCompleto ? '<span style="color: #28a745; font-weight: 600;">✓ Completo</span>' :
            (!validacion.valido ? `<span style="color: #dc3545;">⚠️ ${validacion.mensaje}</span>` : '');
    }
    
    let btnAgregar = document.getElementById(`btn-agregar-ubicacion-${skuToSafeId(sku)}`);
    if (!btnAgregar) {
        try {
            const card = document.getElementById(`producto-${skuToSafeId(sku)}`);
            if (card) btnAgregar = card.querySelector('.btn-agregar-ubicacion');
        } catch (e) { /* SKU con / u otros caracteres rompe selector */ }
    }
    if (btnAgregar) {
        if (restante > 0 && validacion.valido) {
            btnAgregar.style.display = 'block';
        } else {
            btnAgregar.style.display = 'none';
        }
    }
}

function renderizarAsignaciones(sku, yaRegistrada) {
    const producto = productosAsignados[sku];
    if (!producto) return;
    
    const container = document.getElementById(`asignaciones-${skuToSafeId(sku)}`);
    if (!container) return;
    
    if (producto.asignaciones.length === 0 && producto.cantidad_total > 0) {
        const restante = estadoRecepcionCache[sku]?.restante ?? producto.cantidad_total;
        producto.asignaciones.push({ ubicacion: '', cantidad: restante > 0 ? restante : producto.cantidad_total });
    }
    
    container.innerHTML = '';
    
    const skuJs = escapeSkuForJs(sku);
    const sid = skuToSafeId(sku);
    producto.asignaciones.forEach((asignacion, index) => {
        const asignacionDiv = document.createElement('div');
        asignacionDiv.className = 'asignacion-fila';
        asignacionDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; align-items: center;';

        const ubicacionInputId = `ubicacion-rec-${sid}-${index}`;
        asignacionDiv.innerHTML = `
            <div class="wms-input-with-scan" style="flex:1;min-width:0;">
                <input type="text" 
                       id="${ubicacionInputId}"
                       class="wms-input input-ubicacion" 
                       placeholder="Ubicación (ej: 2P1D01N1)" 
                       value="${asignacion.ubicacion}"
                       onchange="actualizarAsignacion('${skuJs}', ${index}, 'ubicacion', this.value)"
                       ${yaRegistrada ? 'disabled' : ''}
                       style="flex: 1; padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);">
                <button type="button" class="wms-btn wms-btn-secondary wms-btn-scan" onclick="abrirEscanerUbicacion('${ubicacionInputId}')" title="Escanear ubicación">📷</button>
            </div>
            <input type="number" 
                   class="input-cantidad" 
                   placeholder="Cantidad" 
                   step="0.01" 
                   min="0.01" 
                   value="${(parseFloat(asignacion.cantidad) || parseFloat(producto.cantidad_total) || 0).toFixed(2)}"
                   onchange="actualizarAsignacion('${skuJs}', ${index}, 'cantidad', this.value)"
                   ${yaRegistrada ? 'disabled' : ''}
                   style="width: 120px; padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);">
            ${!yaRegistrada && producto.asignaciones.length > 1 ? `
                <button onclick="eliminarAsignacion('${skuJs}', ${index})" 
                        style="background: var(--color-danger); color: white; border: none; padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer;">
                    ✕
                </button>
            ` : ''}
        `;
        
        container.appendChild(asignacionDiv);
    });
    
    actualizarSumaAsignaciones(sku);
}

let registrandoLinea = false;
async function registrarLineaRecepcion(sku, itemId, cantidadTotal, esServicioKit = false) {
    if (registrandoLinea) return;
    if (!recepcionActual || !recepcionActual.guid) {
        mostrarMensaje('error', 'No hay recepción cargada');
        return;
    }
    const esAdesa = recepcionActual && recepcionActual.es_adesa === true;
    
    let asignaciones = [];
    if (!esServicioKit) {
        const prod = productosAsignados[sku];
        if (!prod || !prod.asignaciones) {
            mostrarMensaje('error', 'Agrega al menos una ubicación y cantidad');
            return;
        }
        asignaciones = prod.asignaciones
            .filter(a => a.ubicacion && parseFloat(a.cantidad) > 0)
            .map(a => ({ ubicacion: a.ubicacion.trim(), cantidad: parseFloat(a.cantidad) }));
        if (asignaciones.length === 0) {
            mostrarMensaje('error', 'Ingresa ubicación y cantidad válidos');
            return;
        }
        const suma = asignaciones.reduce((s, a) => s + a.cantidad, 0);
        const estadoData = await obtenerEstadoRecepcion(recepcionActual.guid);
        const estadoProd = estadoData?.productos?.find(p => p.sku.toUpperCase() === sku);
        const restante = estadoProd ? estadoProd.cantidad_restante : cantidadTotal;
        if (suma > restante) {
            mostrarMensaje('error', `La suma (${suma.toFixed(2)}) excede el restante (${restante.toFixed(2)})`);
            return;
        }
    }
    
    registrandoLinea = true;
    try {
        const response = await fetch('/api/recepciones/registrar-linea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recepcion_guid: recepcionActual.guid,
                sku: sku,
                asignaciones: asignaciones,
                producto: {
                    item_id: itemId,
                    cantidad_total: cantidadTotal,
                    ItemType: esServicioKit ? 'S' : 'I',
                    requiere_ubicacion: !esServicioKit
                }
            })
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Línea registrada exitosamente');
            if (productosAsignados[sku]) {
                productosAsignados[sku].asignaciones = [];
                if (!esServicioKit && data.cantidad_restante > 0) {
                    productosAsignados[sku].asignaciones.push({ ubicacion: '', cantidad: data.cantidad_restante });
                }
            }
            const estadoData = await obtenerEstadoRecepcion(recepcionActual.guid);
            const todosCompletos = estadoData?.productos?.every(p => p.completo) ?? false;
            recepcionActual.ya_registrada = todosCompletos;
            recepcionActual.estado_recepcion = estadoData?.estado_recepcion || recepcionActual.estado_recepcion;
            const modoSoloLectura = recepcionActual.ya_registrada || (recepcionActual.estado_recepcion === 'COMPLETO');
            await mostrarProductos(recepcionActual.productos || [], modoSoloLectura, recepcionActual);
            const estadoEl = document.getElementById('recepcion-estado');
            if (estadoEl) {
                const est = recepcionActual.estado_recepcion || 'PENDIENTE';
                estadoEl.textContent = est.replace('_', ' ');
                estadoEl.className = 'estado-badge estado-' + est.toLowerCase().replace('_', '-');
            }
            const tieneAvances = recepcionActual.ya_registrada || (recepcionActual.estado_recepcion && recepcionActual.estado_recepcion !== 'PENDIENTE');
            if (usuarioRol === 'administrador' && tieneAvances) {
                const botonesAdmin = document.getElementById('botones-accion-admin');
                const btnRevertir = document.getElementById('btn-revertir');
                const advertenciaDiv = document.getElementById('advertencia-ya-registrada');
                if (botonesAdmin) botonesAdmin.style.display = 'flex';
                if (btnRevertir) btnRevertir.style.display = 'inline-block';
                if (advertenciaDiv && recepcionActual.estado_recepcion === 'COMPLETO') {
                    advertenciaDiv.style.display = 'block';
                    const infoRegistroDiv = document.getElementById('info-registro-anterior');
                    if (infoRegistroDiv) {
                        infoRegistroDiv.textContent = 'Esta recepción ya fue procesada en el sistema.';
                    }
                }
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    } finally {
        registrandoLinea = false;
    }
}

async function registrarProducto(sku, itemId, cantidadMaxima) {
    const asignacion = productosAsignados[sku];
    
    let itemType = 'I';
    let requiereUbicacion = true;
    if (recepcionActual && recepcionActual.productos) {
        const productoOriginal = recepcionActual.productos.find(p => 
            (p.SKU || p.ItemSKU || '').toUpperCase() === sku
        );
        if (productoOriginal) {
            itemType = productoOriginal.ItemType || 'I';
            requiereUbicacion = productoOriginal.requiere_ubicacion !== undefined 
                ? productoOriginal.requiere_ubicacion 
                : (itemType === 'I');
        }
    }
    
    if (!requiereUbicacion) {
        if (!asignacion || !asignacion.cantidad_total || asignacion.cantidad_total <= 0) {
            mostrarMensaje('error', `Cantidad inválida para el ${itemType === 'S' ? 'servicio' : 'kit'} ${sku}`);
            return;
        }
    } else {
        if (!asignacion || !asignacion.ubicacion) {
            mostrarMensaje('error', `Ingresa una ubicación para el producto ${sku}`);
            const ubicacionInput = document.getElementById(`ubicacion-${skuToSafeId(sku)}`);
            if (ubicacionInput) ubicacionInput.focus();
            return;
        }

        if (!asignacion.cantidad || asignacion.cantidad <= 0) {
            mostrarMensaje('error', `Ingresa una cantidad válida para el producto ${sku}`);
            const cantidadInput = document.getElementById(`cantidad-${skuToSafeId(sku)}`);
            if (cantidadInput) cantidadInput.focus();
            return;
        }

        if (asignacion.cantidad > cantidadMaxima) {
            mostrarMensaje('error', `La cantidad no puede exceder ${cantidadMaxima.toFixed(2)}`);
            const cantidadInput = document.getElementById(`cantidad-${skuToSafeId(sku)}`);
            if (cantidadInput) cantidadInput.focus();
            return;
        }
    }

    try {
        const response = await fetch('/api/recepciones/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recepcion_guid: recepcionActual.guid,
                recepcion_docid: recepcionActual.docid,
                tipo_recepcion: recepcionActual.tipo || 'RECEPTION',
                es_adesa: esAdesa,
                location_name: recepcionActual.location_name,
                productos_ubicaciones: [{
                    sku: sku,
                    item_id: itemId,
                    cantidad_total: requiereUbicacion ? null : asignacion.cantidad_total,
                    asignaciones: requiereUbicacion ? [{
                        ubicacion: asignacion.ubicacion,
                        cantidad: asignacion.cantidad
                    }] : []
                }]
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', `Producto ${sku} asignado exitosamente a ${asignacion.ubicacion}`);
            
            const ubicacionEl = document.getElementById(`ubicacion-${skuToSafeId(sku)}`);
            const productoCard = ubicacionEl ? ubicacionEl.closest('.producto-card') : null;
            if (productoCard) {
                productoCard.style.background = '#f8fff9';
                productoCard.style.borderColor = '#28a745';
                const asignacionDiv = productoCard.querySelector('.asignacion-section');
                if (asignacionDiv) {
                    asignacionDiv.innerHTML = `
                        <div class="producto-asignado">
                            ✅ Asignado: ${asignacion.ubicacion} → ${asignacion.cantidad.toFixed(2)} unidades
                        </div>
                    `;
                }
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al asignar producto');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

async function registrarTodosProductos() {
    if (!recepcionActual || !recepcionActual.productos) {
        mostrarMensaje('error', 'No hay productos para registrar');
        return;
    }

    const esAdesa = recepcionActual && recepcionActual.es_adesa === true;
    const productosAEnviar = [];
    let hayErrores = false;

    if (recepcionActual && recepcionActual.productos) {
        recepcionActual.productos.forEach(prod => {
            const sku = (prod.SKU || prod.ItemSKU || '').toUpperCase();
            if (sku) {
                if (!productosAsignados[sku]) {
                    const itemType = prod.ItemType || 'I';
                    const requiereUbicacion = prod.requiere_ubicacion !== undefined 
                        ? prod.requiere_ubicacion 
                        : (itemType === 'I');
                    const cantidad_total = parseFloat(prod.Quantity || 0);
                    
                    productosAsignados[sku] = {
                        item_id: prod.ItemID || '',
                        cantidad_total: cantidad_total,
                        asignaciones: []
                    };
                    
                    if (requiereUbicacion) {
                        const ubicacionInicial = !esAdesa 
                            ? (recepcionActual.location_name || 'NO-ADESA')
                            : '';
                        productosAsignados[sku].asignaciones.push({ 
                            ubicacion: ubicacionInicial, 
                            cantidad: cantidad_total 
                        });
                    }
                } else {
                    const itemType = prod.ItemType || 'I';
                    const requiereUbicacion = prod.requiere_ubicacion !== undefined 
                        ? prod.requiere_ubicacion 
                        : (itemType === 'I');
                    
                    if (requiereUbicacion && (!productosAsignados[sku].asignaciones || productosAsignados[sku].asignaciones.length === 0)) {
                        const ubicacionInicial = !esAdesa 
                            ? (recepcionActual.location_name || 'NO-ADESA')
                            : '';
                        productosAsignados[sku].asignaciones.push({ 
                            ubicacion: ubicacionInicial, 
                            cantidad: productosAsignados[sku].cantidad_total 
                        });
                    }
                }
            }
        });
    }

    for (const sku in productosAsignados) {
        const producto = productosAsignados[sku];
        
        let itemType = 'I';
        let requiereUbicacion = true;
        if (recepcionActual && recepcionActual.productos) {
            const productoOriginal = recepcionActual.productos.find(p => 
                (p.SKU || p.ItemSKU || '').toUpperCase() === sku
            );
            if (productoOriginal) {
                itemType = productoOriginal.ItemType || 'I';
                requiereUbicacion = productoOriginal.requiere_ubicacion !== undefined 
                    ? productoOriginal.requiere_ubicacion 
                    : (itemType === 'I');
            }
        }
        
        if (requiereUbicacion) {
            const validacion = validarSumatoria(sku);
            
            if (!validacion.valido) {
                mostrarMensaje('error', `Error en ${sku}: ${validacion.mensaje}`);
                hayErrores = true;
                continue;
            }
            
            if (!producto.asignaciones || producto.asignaciones.length === 0) {
                const ubicacionFallback = !esAdesa 
                    ? (recepcionActual.location_name || 'NO-ADESA')
                    : '';
                
                if (!esAdesa) {
                    producto.asignaciones = [{
                        ubicacion: ubicacionFallback,
                        cantidad: producto.cantidad_total
                    }];
                } else {
                    mostrarMensaje('error', `El producto ${sku} debe tener al menos una asignación de ubicación física`);
                    hayErrores = true;
                    continue;
                }
            }
            
            for (const asignacion of producto.asignaciones) {
                const ubicacion = asignacion.ubicacion ? asignacion.ubicacion.trim() : '';
                if (!ubicacion) {
                    if (!esAdesa && recepcionActual.location_name) {
                        asignacion.ubicacion = recepcionActual.location_name;
                    } else if (!esAdesa) {
                        asignacion.ubicacion = 'NO-ADESA';
                    } else {
                        mostrarMensaje('error', `El producto ${sku} tiene asignaciones sin ubicación física`);
                        hayErrores = true;
                        break;
                    }
                }
            }
            
            if (!hayErrores) {
                productosAEnviar.push({
                    sku: sku,
                    item_id: producto.item_id,
                    cantidad_total: producto.cantidad_total,
                    ItemType: itemType,
                    requiere_ubicacion: requiereUbicacion,
                    asignaciones: producto.asignaciones.map(a => ({
                        ubicacion: a.ubicacion || (recepcionActual.location_name || 'NO-ADESA'),
                        cantidad: a.cantidad
                    }))
                });
            }
        } else {
            if (!producto.cantidad_total || producto.cantidad_total <= 0) {
                mostrarMensaje('error', `El ${itemType === 'S' ? 'servicio' : 'kit'} ${sku} debe tener una cantidad mayor a 0`);
                hayErrores = true;
                continue;
            }
            
            productosAEnviar.push({
                sku: sku,
                item_id: producto.item_id,
                cantidad_total: producto.cantidad_total,
                ItemType: itemType,
                requiere_ubicacion: requiereUbicacion,
                asignaciones: []
            });
        }
    }

    if (hayErrores) {
        return;
    }

    if (recepcionActual && recepcionActual.productos) {
        const skusEnviados = new Set(productosAEnviar.map(p => p.sku.toUpperCase()));
        recepcionActual.productos.forEach(prod => {
            const sku = (prod.SKU || prod.ItemSKU || '').toUpperCase();
            if (sku && !skusEnviados.has(sku)) {
                const itemType = prod.ItemType || 'I';
                const requiereUbicacion = prod.requiere_ubicacion !== undefined 
                    ? prod.requiere_ubicacion 
                    : (itemType === 'I');
                const cantidad_total = parseFloat(prod.Quantity || 0);
                
                if (requiereUbicacion) {
                    const ubicacionFallback = !esAdesa 
                        ? (recepcionActual.location_name || 'NO-ADESA')
                        : '';
                    
                    if (!esAdesa || ubicacionFallback) {
                        productosAEnviar.push({
                            sku: sku,
                            item_id: prod.ItemID || '',
                            cantidad_total: cantidad_total,
                            ItemType: itemType,
                            requiere_ubicacion: requiereUbicacion,
                            asignaciones: [{
                                ubicacion: ubicacionFallback || '',
                                cantidad: cantidad_total
                            }]
                        });
                    } else {
                        mostrarMensaje('error', `El producto ${sku} (Item físico) debe tener al menos una asignación de ubicación`);
                        hayErrores = true;
                    }
                } else {
                    productosAEnviar.push({
                        sku: sku,
                        item_id: prod.ItemID || '',
                        cantidad_total: cantidad_total,
                        ItemType: itemType,
                        requiere_ubicacion: requiereUbicacion,
                        asignaciones: []
                    });
                }
            }
        });
    }

    if (hayErrores) {
        return;
    }

    if (productosAEnviar.length === 0) {
        mostrarMensaje('error', 'No hay productos para registrar');
        return;
    }

    const btnRegistrarTodo = document.getElementById('btn-registrar-todo');
    btnRegistrarTodo.disabled = true;
    btnRegistrarTodo.textContent = 'Registrando...';

    const productosSinAsignaciones = productosAEnviar.filter(p => {
        const itemType = recepcionActual?.productos?.find(prod => 
            (prod.SKU || prod.ItemSKU || '').toUpperCase() === p.sku.toUpperCase()
        )?.ItemType || 'I';
        const requiereUbicacion = itemType === 'I';
        return requiereUbicacion && (!p.asignaciones || p.asignaciones.length === 0);
    });
    
    if (productosSinAsignaciones.length > 0) {
        const skus = productosSinAsignaciones.map(p => p.sku).join(', ');
        mostrarMensaje('error', `Los siguientes productos requieren asignaciones: ${skus}`);
        btnRegistrarTodo.disabled = false;
        btnRegistrarTodo.textContent = 'Registrar Todas las Asignaciones';
        return;
    }

    try {
        const payload = {
            recepcion_guid: recepcionActual.guid,
            recepcion_docid: recepcionActual.docid,
            tipo_recepcion: recepcionActual.tipo || 'RECEPTION',
            es_adesa: esAdesa,
            location_name: recepcionActual.location_name,
            productos: productosAEnviar
        };
        
        console.log('Enviando productos:', productosAEnviar.map(p => ({
            sku: p.sku,
            tiene_asignaciones: p.asignaciones?.length > 0,
            asignaciones: p.asignaciones
        })));
        
        const response = await fetch('/api/recepciones/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', `✅ Recepción registrada exitosamente. ${data.total_movimientos || productosAEnviar.length} movimiento(s) creado(s).`);
            
            setTimeout(() => {
                window.location.href = '/recepciones';
            }, 2000);
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar recepción');
            btnRegistrarTodo.disabled = false;
            btnRegistrarTodo.textContent = 'Registrar Todas las Asignaciones';
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
        btnRegistrarTodo.disabled = false;
        btnRegistrarTodo.textContent = 'Registrar Todas las Asignaciones';
    }
}

async function refrescarRecepcion() {
    if (!recepcionActual || !recepcionActual.guid) {
        mostrarMensaje('error', 'No hay recepción cargada');
        return;
    }

    if (!confirm('¿Deseas refrescar los datos de esta recepción desde ADM Cloud? Esto actualizará todos los campos con la información más reciente.')) {
        return;
    }

    try {
        mostrarMensaje('info', 'Refrescando datos desde ADM Cloud...');
        const response = await fetch(`/api/recepciones/${recepcionActual.guid}/refrescar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                docid: recepcionActual.docid,
                tipo: recepcionActual.tipo || 'RECEPTION'
            })
        });

        const data = await response.json();

        if (data.success) {
            recepcionActual = data.recepcion;
            recepcionActual.ya_registrada = false;
            recepcionYaRegistrada = false;
            productosAsignados = {};
            mostrarRecepcion(data.recepcion);
            mostrarMensaje('success', '✅ Datos refrescados exitosamente desde ADM Cloud');
        } else {
            mostrarMensaje('error', data.error || 'Error al refrescar recepción');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al refrescar');
    }
}

async function revertirRecepcion() {
    if (!recepcionActual || !recepcionActual.guid) {
        mostrarMensaje('error', 'No hay recepción cargada');
        return;
    }

    if (!confirm('⚠️ ADVERTENCIA: Esta acción eliminará todos los movimientos de esta recepción y revertirá el stock incrementado. Esta acción NO se puede deshacer.\n\n¿Estás seguro de que deseas revertir esta recepción?')) {
        return;
    }

    try {
        mostrarMensaje('info', 'Revirtiendo recepción...');
        const response = await fetch(`/api/recepciones/${recepcionActual.guid}/revertir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', `✅ ${data.message}`);
            recepcionActual.ya_registrada = false;
            recepcionYaRegistrada = false;
            productosAsignados = {};
            await recargarRecepcionTrasRevertir();
        } else {
            mostrarMensaje('error', data.error || 'Error al revertir recepción');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al revertir');
    }
}

async function recargarRecepcionTrasRevertir() {
    if (!recepcionActual || !recepcionActual.docid) return;
    try {
        const response = await fetch('/api/recepciones/buscar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                docid: recepcionActual.docid,
                tipo: recepcionActual.tipo || 'RECEPTION'
            })
        });
        const data = await response.json();
        if (data.success) {
            recepcionActual = data.recepcion;
            mostrarRecepcion(data.recepcion);
        } else {
            const resGuid = await fetch(`/api/recepciones/por-guid/${recepcionActual.guid}`);
            const dataGuid = await resGuid.json();
            if (dataGuid.success) {
                recepcionActual = dataGuid.recepcion;
                mostrarRecepcion(dataGuid.recepcion);
            }
        }
    } catch (e) {
        console.error('Error al recargar tras revertir:', e);
    }
}

// Inicializar
verificarAutenticacion();

// Permitir Enter en inputs
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        const inputs = Array.from(document.querySelectorAll('.asignacion-inputs input'));
        const currentIndex = inputs.indexOf(e.target);
        if (currentIndex < inputs.length - 1) {
            inputs[currentIndex + 1].focus();
        } else {
            const btn = e.target.closest('.asignacion-inputs').querySelector('.btn-registrar');
            if (btn) {
                btn.click();
            }
        }
    }
});
