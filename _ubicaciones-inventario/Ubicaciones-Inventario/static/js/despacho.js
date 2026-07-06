let facturaActual = null;
let modoEdicion = false;
let productosPicks = {};  // { sku: { asignaciones: [{ubicacion, cantidad}], cantidad_solicitada } }
let estadoDespachoCache = {};  // Cache de estado por SKU (pendiente, picks_registrados)

function skuToSafeId(sku) {
    return (sku || '').replace(/[/\\'"<>]/g, '_');
}
function escapeSkuForJs(sku) {
    return String(sku).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Verificar si viene con parámetro guid (desde historial)
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const guid = urlParams.get('guid');
    const editar = urlParams.get('editar');
    
    if (guid) {
        modoEdicion = editar === 'true';
        // Ocultar sección de búsqueda
        document.querySelector('.search-section').style.display = 'none';
        document.getElementById('empty-state').style.display = 'none';
        
        // Cargar detalles del despacho
        await cargarDetallesDespacho(guid);
    }
});

// Cargar detalles completos de un despacho
async function cargarDetallesDespacho(guid) {
    try {
        const response = await fetch(`/api/detalles/despacho/${guid}`);
        const data = await response.json();
        
        if (data.success) {
            mostrarDetallesDespacho(data.despacho);
        } else {
            mostrarMensaje('error', data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

// Mostrar detalles completos de despacho (vista de auditoría)
function mostrarDetallesDespacho(despacho) {
    document.getElementById('factura-info').style.display = 'block';
    
    const botonesAccion = document.getElementById('botones-accion');
    const btnRevertir = document.getElementById('btn-revertir');
    const tieneMovimientos = despacho.estado_despacho && despacho.estado_despacho !== 'PENDIENTE';
    if (tieneMovimientos) {
        document.getElementById('advertencia-ya-registrada').style.display = 'block';
        document.getElementById('info-registro-anterior').textContent = 'Este despacho tiene avances registrados en el sistema.';
    } else {
        document.getElementById('advertencia-ya-registrada').style.display = 'none';
    }
    
    obtenerUsuarioActual().then(usuario => {
        const esAdmin = usuario && usuario.rol && usuario.rol.toLowerCase() === 'administrador';
        if (esAdmin) {
            botonesAccion.style.display = 'flex';
            btnRevertir.style.display = tieneMovimientos ? 'block' : 'none';
        } else {
            botonesAccion.style.display = 'none';
        }
    }).catch(() => { botonesAccion.style.display = 'none'; });
    facturaActual = { guid: despacho.factura_guid, docid: despacho.factura_docid, tipo: despacho.tipo_factura, tipo_factura: despacho.tipo_factura };
    
    // Información del documento
    const tipoNombres = {
        'CASH': 'Contado',
        'CREDIT': 'Crédito',
        'DISPATCH': 'Despacho/Conduce',
        'CashInvoice': 'Contado',
        'CreditInvoice': 'Crédito',
        'SalesOrder': 'Pedido'
    };
    const tipoFactura = tipoNombres[despacho.tipo_factura] || despacho.tipo_factura || 'Documento';
    
    document.getElementById('factura-numero').textContent = 
        `${tipoFactura} #${despacho.factura_docid}`;
    document.getElementById('factura-cliente').textContent = despacho.cliente || 'N/A';
    document.getElementById('factura-fecha').textContent = 
        formatarFechaDocumento(despacho.fecha);
    document.getElementById('factura-total').textContent = 
        `RD$ ${despacho.total.toFixed(2)}`;
    document.getElementById('factura-ubicacion').textContent = despacho.location_name || 'N/A';
    
    // Estado
    const estadoBadge = document.getElementById('factura-estado');
    estadoBadge.textContent = despacho.estado_despacho;
    estadoBadge.className = `estado-badge estado-${despacho.estado_despacho.toLowerCase().replace('_', '-')}`;
    
    // Información de usuarios
    let infoUsuarios = '';
    if (despacho.usuario_solicitante) {
        infoUsuarios += `Solicitado por: ${despacho.usuario_solicitante.nombre}<br>`;
    }
    if (despacho.usuario_despachador) {
        infoUsuarios += `Procesado por: ${despacho.usuario_despachador.nombre}<br>`;
    }
    if (despacho.fecha_inicio) {
        infoUsuarios += `Iniciado: ${new Date(despacho.fecha_inicio).toLocaleString('es-DO')}<br>`;
    }
    if (despacho.completed_at) {
        infoUsuarios += `Completado: ${new Date(despacho.completed_at).toLocaleString('es-DO')}`;
    }
    
    // Agregar información de usuarios al detalle
    const facturaDetails = document.querySelector('.factura-details');
    if (infoUsuarios) {
        let usuariosDiv = facturaDetails.querySelector('#usuarios-info');
        if (!usuariosDiv) {
            usuariosDiv = document.createElement('div');
            usuariosDiv.id = 'usuarios-info';
            usuariosDiv.innerHTML = `<strong>Auditoría:</strong><br>${infoUsuarios}`;
            facturaDetails.appendChild(usuariosDiv);
        } else {
            usuariosDiv.innerHTML = `<strong>Auditoría:</strong><br>${infoUsuarios}`;
        }
    }
    
    // Cambiar título según modo
    document.getElementById('productos-titulo').textContent = 
        modoEdicion ? 'Productos a Despachar' : 'Productos Despachados (Auditoría)';
    
    // Mostrar productos con detalles de movimientos
    mostrarProductosConMovimientos(despacho.productos_despachados, despacho.productos_originales);
    
    // Si no es modo edición, ocultar inputs de registro
    if (!modoEdicion) {
        const productosSection = document.querySelector('.productos-section');
        productosSection.querySelectorAll('input, button.btn-registrar').forEach(el => {
            el.style.display = 'none';
        });
    }
}

// Mostrar productos con detalles de movimientos
function mostrarProductosConMovimientos(productosDespachados, productosOriginales) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    
    if (productosDespachados.length === 0) {
        grid.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No hay productos despachados</p>';
        return;
    }
    
    productosDespachados.forEach((prod) => {
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card';
        
        let movimientosHtml = '';
        if (prod.movimientos && prod.movimientos.length > 0) {
            movimientosHtml = '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;"><strong>Movimientos:</strong><ul style="margin-top: 10px; padding-left: 20px;">';
            prod.movimientos.forEach(mov => {
                movimientosHtml += `<li>${mov.cantidad} unidades desde ${mov.ubicacion} - ${mov.usuario} (${new Date(mov.fecha).toLocaleString('es-DO')})</li>`;
            });
            movimientosHtml += '</ul></div>';
        }
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>${prod.nombre || 'Sin nombre'}</h4>
                    <div class="sku">SKU: ${prod.sku}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Solicitado</div>
                    <div class="value">${prod.cantidad_solicitada.toFixed(2)}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Despachado</div>
                    <div class="value" style="color: ${prod.cantidad_despachada >= prod.cantidad_solicitada ? '#28a745' : '#ffc107'}">${prod.cantidad_despachada.toFixed(2)}</div>
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

// Búsqueda de factura
document.getElementById('search-factura-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docid = document.getElementById('docid-input').value.trim();
    const tipo = document.getElementById('tipo-factura').value;

    if (!docid) {
        mostrarMensaje('error', 'Ingresa un número de factura');
        return;
    }

    const btnSearch = document.getElementById('btn-search');
    btnSearch.disabled = true;
    
    // Obtener nombre del tipo en español
    const tipoNombres = {
        'CASH': 'Contado',
        'CREDIT': 'Crédito',
        'DISPATCH': 'Despacho/Conduce'
    };
    const tipoNombre = tipoNombres[tipo] || tipo;
    
    // Determinar endpoint según el tipo
    const endpoint = tipo === 'DISPATCH' ? '/api/despachos/buscar' : '/api/facturas/buscar';
    const tipoDocumento = tipo === 'DISPATCH' ? 'Despacho' : 'Factura';
    
    // Mostrar mensaje de búsqueda
    const mensajeBusqueda = `Buscando: ${tipoDocumento} ${tipoNombre} #${docid}`;
    mostrarMensaje('success', mensajeBusqueda);
    btnSearch.textContent = 'Buscando...';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ docid, tipo })
        });

        // Verificar si la respuesta es OK
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Error HTTP ${response.status}` }));
            mostrarMensaje('error', errorData.error || errorData.message || `Error ${response.status}`);
            ocultarFactura();
            return;
        }

        const data = await response.json().catch(err => {
            console.error('Error al parsear JSON:', err);
            mostrarMensaje('error', 'Error al procesar la respuesta del servidor');
            ocultarFactura();
            return null;
        });

        if (!data) return; // Si hubo error al parsear, ya se mostró el mensaje

        if (data.success) {
            facturaActual = data.factura;  // Mantener nombre "factura" para compatibilidad
            
            // Verificar si hay conflicto (solicitado por otro usuario)
            const usuarioActual = await obtenerUsuarioActual();
            if (data.factura.usuario_solicitante && 
                data.factura.usuario_solicitante.id !== usuarioActual.id &&
                data.factura.estado_despacho === 'PENDIENTE') {
                // Mostrar alerta de conflicto
                const confirmar = confirm(
                    `⚠️ Este documento fue solicitado por ${data.factura.usuario_solicitante.nombre}.\n\n` +
                    `¿Deseas tomarlo de todas formas?`
                );
                
                if (!confirmar) {
                    ocultarFactura();
                    return;
                }
                
                // Si confirma, actualizar usuario_solicitante
                await actualizarUsuarioSolicitante(data.factura.guid, usuarioActual.id);
            }
            
            mostrarFactura(data.factura);
            mostrarMensaje('success', `${tipoDocumento} encontrada`);
        } else {
            mostrarMensaje('error', data.error || data.message || `${tipoDocumento} no encontrada`);
            ocultarFactura();
        }
    } catch (error) {
        console.error('Error en búsqueda:', error);
        mostrarMensaje('error', `Error de conexión: ${error.message || 'No se pudo conectar al servidor'}`);
        ocultarFactura();
    } finally {
        btnSearch.disabled = false;
        btnSearch.textContent = 'Buscar';
    }
});

function mostrarFactura(factura) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('factura-info').style.display = 'block';
    const productosTitulo = document.getElementById('productos-titulo');
    if (productosTitulo) {
        productosTitulo.textContent = 'Productos a Despachar';
    }

    // Mapear tipo de factura/despacho a español
    const tipoNombres = {
        'CASH': 'Contado',
        'CREDIT': 'Crédito',
        'DISPATCH': 'Despacho/Conduce',
        'CashInvoice': 'Contado',
        'CreditInvoice': 'Crédito',
        'SalesOrder': 'Pedido'
    };
    const tipoFactura = tipoNombres[factura.tipo_factura] || factura.tipo_factura || 'Documento';
    const tipoDocumento = factura.tipo_factura === 'DISPATCH' ? 'Despacho' : 'Factura';

    // Mostrar advertencia si ya fue registrado (tiene movimientos PICK)
    const advertenciaDiv = document.getElementById('advertencia-ya-registrada');
    const botonesAccion = document.getElementById('botones-accion');
    const btnRevertir = document.getElementById('btn-revertir');
    const tieneMovimientos = factura.ya_registrada || 
        (factura.estado_despacho && factura.estado_despacho !== 'PENDIENTE');
    
    if (tieneMovimientos) {
        advertenciaDiv.style.display = 'block';
        
        let infoTexto = 'Este despacho tiene avances registrados en el sistema.';
        if (factura.fecha_registro) {
            const fechaRegistro = new Date(factura.fecha_registro);
            infoTexto += ` Fecha de registro: ${fechaRegistro.toLocaleString('es-DO')}`;
        }
        if (factura.usuario_registro) {
            infoTexto += ` | Usuario: ${factura.usuario_registro}`;
        }
        document.getElementById('info-registro-anterior').textContent = infoTexto;
    } else {
        advertenciaDiv.style.display = 'none';
    }
    
    // Refrescar: siempre visible para admin. Revertir: solo si tiene movimientos.
    obtenerUsuarioActual().then(usuario => {
        const esAdmin = usuario && usuario.rol && usuario.rol.toLowerCase() === 'administrador';
        if (esAdmin) {
            botonesAccion.style.display = 'flex';
            btnRevertir.style.display = tieneMovimientos ? 'block' : 'none';
        } else {
            botonesAccion.style.display = 'none';
        }
    }).catch(() => {
        botonesAccion.style.display = 'none';
    });

    // Información de la factura/despacho
    document.getElementById('factura-numero').textContent = 
        `${tipoDocumento} ${tipoFactura} #${factura.docid}`;
    document.getElementById('factura-cliente').textContent = 
        factura.cliente || 'N/A';
    document.getElementById('factura-fecha').textContent = 
        formatarFechaDocumento(factura.fecha);
    document.getElementById('factura-total').textContent = 
        `RD$ ${parseFloat(factura.total || 0).toFixed(2)}`;
    
    // Ubicación
    const ubicacion = factura.location_name || factura.location_id || 'ADESA';
    document.getElementById('factura-ubicacion').textContent = ubicacion;
    
    const estadoBadge = document.getElementById('factura-estado');
    estadoBadge.textContent = factura.estado_despacho;
    estadoBadge.className = `estado-badge estado-${factura.estado_despacho}`;

    // Productos
    mostrarProductos(factura.productos || [], factura.guid);
    
    // Guardar factura actual para usar en botones
    facturaActual = factura;
}

function ocultarFactura() {
    document.getElementById('factura-info').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

async function mostrarProductos(productos, facturaGuid) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '<div class="loading">Cargando productos...</div>';

    if (!productos || productos.length === 0) {
        grid.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No hay productos en esta factura</p>';
        return;
    }

    // Obtener estado de despacho de la factura
    const estadoData = await obtenerEstadoFactura(facturaGuid);
    const estadoProductos = {};
    const esAdesa = estadoData?.es_adesa ?? true;
    const locationNameDoc = estadoData?.location_name || 'ADESA';
    
    if (estadoData && estadoData.productos) {
        estadoData.productos.forEach(p => {
            estadoProductos[p.sku.toUpperCase()] = {
                despachada: p.cantidad_despachada,
                pendiente: p.cantidad_pendiente,
                completo: p.completo,
                stock_adesa_adm: p.stock_adesa_adm || 0,
                ubicaciones: p.ubicaciones || [],
                picks_registrados: p.picks_registrados || []
            };
        });
    }

    productosPicks = {};
    estadoDespachoCache = {};

    // Reordenar: pendientes primero, completados al final
    const productosOrdenados = [...productos].sort((a, b) => {
        const skuA = (a.SKU || a.ItemSKU || '').toUpperCase();
        const skuB = (b.SKU || b.ItemSKU || '').toUpperCase();
        const completoA = estadoProductos[skuA]?.completo ?? false;
        const completoB = estadoProductos[skuB]?.completo ?? false;
        if (completoA === completoB) return 0;
        return completoA ? 1 : -1;
    });

    grid.innerHTML = '';

    // Mostrar productos con estado (ordenados: pendientes arriba, completados abajo)
    for (const producto of productosOrdenados) {
        const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
        const cantidadSolicitada = parseFloat(producto.Quantity || 0);
        
        // NUEVO: Obtener ItemType del producto
        const itemType = producto.ItemType || 'I';
        const requiereUbicacion = producto.requiere_ubicacion !== undefined 
            ? producto.requiere_ubicacion 
            : (itemType === 'I');
        
        // Obtener estado del producto
        const estado = estadoProductos[sku] || {
            despachada: 0,
            pendiente: cantidadSolicitada,
            completo: false,
            stock_adesa_adm: 0,
            ubicaciones: [],
            picks_registrados: []
        };
        
        const cantidadDespachada = estado.despachada;
        const cantidadPendiente = estado.pendiente;
        const estaCompleto = estado.completo;
        const stockAdesa = estado.stock_adesa_adm || 0;
        const ubicaciones = estado.ubicaciones || [];
        const picksRegistrados = estado.picks_registrados || [];
        
        // Determinar tipo de producto para mostrar badge
        let tipoBadge = '';
        let tipoNombre = 'Item';
        if (itemType === 'S') {
            tipoBadge = '<span style="background: #17a2b8; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">SERVICIO</span>';
            tipoNombre = 'Servicio';
        } else if (itemType === 'K') {
            tipoBadge = '<span style="background: #6f42c1; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">KIT</span>';
            tipoNombre = 'Kit';
        } else {
            tipoBadge = '<span style="background: #28a745; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px;">ITEM</span>';
        }

        // Inicializar productosPicks para Items
        if (requiereUbicacion) {
            if (esAdesa) {
                productosPicks[sku] = {
                    cantidad_solicitada: cantidadSolicitada,
                    asignaciones: [{ ubicacion: '', cantidad: cantidadPendiente }],
                    ubicaciones: ubicaciones
                };
            } else {
                productosPicks[sku] = {
                    cantidad_solicitada: cantidadSolicitada,
                    asignaciones: [{ ubicacion: locationNameDoc, cantidad: cantidadPendiente }],
                    ubicaciones: []
                };
            }
            estadoDespachoCache[sku] = estado;
        }

        // Crear bloque de ubicaciones según tipo
        let ubicacionesHTML = '';
        if (esAdesa) {
            // ADESA: mostrar micro-ubicaciones físicas WMS
            if (ubicaciones.length > 0 && requiereUbicacion) {
                ubicacionesHTML = `
                    <div class="ubicaciones-disponibles" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px; font-weight: 600;">
                            📍 Ubicaciones físicas (WMS) – clic para agregar:
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                            ${ubicaciones.map(u => `
                                <span style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;" 
                                      onclick="agregarUbicacionPickConValores('${sku}', '${facturaGuid}', '${u.ubicacion.replace(/'/g, "\\'")}', ${u.cantidad})">
                                    ${u.ubicacion} → ${u.cantidad.toFixed(2)}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                let mensajeUbicaciones = '';
                if (stockAdesa > 0) {
                    mensajeUbicaciones = `
                        <div class="wms-wms-warning">
                            <div class="wms-wms-warning__titulo">⚠️ Producto sin ubicación física asignada (WMS)</div>
                            <div class="wms-wms-warning__detalle">Hay stock disponible en ADM, pero falta asignar ubicación interna en el almacén</div>
                        </div>
                    `;
                } else {
                    mensajeUbicaciones = `
                        <div style="font-size: 12px; color: #f44336; font-weight: 600;">
                            ⚠️ No hay stock disponible en ubicaciones físicas
                        </div>
                    `;
                }
                ubicacionesHTML = `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 8px; font-weight: 600;">
                            📍 Ubicaciones físicas (WMS):
                        </div>
                        ${mensajeUbicaciones}
                    </div>
                `;
            }
        } else {
            // No-ADESA: mostrar stock disponible en la ubicación macro
            ubicacionesHTML = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px; font-weight: 600;">
                        🏬 Ubicación del documento: <span style="color: #1976d2;">${locationNameDoc}</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                        <span style="background: #e8f5e9; color: #2e7d32; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                            ${locationNameDoc} → ${stockAdesa.toFixed(2)} disponible (ADM)
                        </span>
                    </div>
                </div>
            `;
        }

        const productoCard = document.createElement('div');
        productoCard.className = `producto-card ${estaCompleto ? 'completo' : ''}`;
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <div class="producto-titulo-fila">
                        <h4 class="producto-nombre">${producto.Name || 'Sin nombre'}</h4>
                        ${tipoBadge}
                    </div>
                    <div class="sku">SKU: ${sku}</div>
                </div>
            </div>
            <div class="cantidades">
                <div class="cantidad-item">
                    <div class="label">Solicitado</div>
                    <div class="value">${cantidadSolicitada.toFixed(2)}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Despachado</div>
                    <div class="value despachado">${cantidadDespachada.toFixed(2)}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Pendiente</div>
                    <div class="value pendiente">${cantidadPendiente.toFixed(2)}</div>
                </div>
            </div>
            ${requiereUbicacion ? `
                <div class="despacho-en-mano">
                    <div class="despacho-en-mano__linea">
                        ✅ En mano (${locationNameDoc} – ADM): ${stockAdesa.toFixed(2)}
                    </div>
                </div>
                ${ubicacionesHTML}
                ${picksRegistrados.length > 0 ? `
                <div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #28a745;">
                    <div style="font-size: 12px; color: #2e7d32; font-weight: 600; margin-bottom: 5px;">📦 Picks registrados (esta línea):</div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #333;">
                        ${picksRegistrados.map(p => `<li>${p.ubicacion} → ${parseFloat(p.cantidad).toFixed(2)}</li>`).join('')}
                    </ul>
                    ${!estaCompleto ? '<div style="font-size: 11px; color: #666; margin-top: 5px; font-style: italic;">+ Agregar otra ubicación abajo para completar</div>' : ''}
                </div>
                ` : ''}
            ` : `
                <!-- Para S/K: NO mostrar stock ni ubicaciones -->
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                    <div style="background: ${itemType === 'S' ? '#e7f3ff' : '#f3e5f5'}; border: 1px solid ${itemType === 'S' ? '#b3d9ff' : '#ce93d8'}; border-radius: 5px; padding: 10px;">
                        <div style="font-size: 12px; color: ${itemType === 'S' ? '#004085' : '#4a148c'};">
                            <strong>Tipo:</strong> ${tipoNombre}<br>
                            <em style="color: #6c757d;">Este ${tipoNombre.toLowerCase()} NO requiere picking físico ni verificación de stock.</em>
                        </div>
                    </div>
                </div>
            `}
            ${!estaCompleto ? `
                ${requiereUbicacion ? (esAdesa ? `
                    <!-- ADESA: patrón expandido múltiples micro-ubicaciones -->
                    <div class="asignacion-section despacho-asignacion-section" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                        <div class="despacho-asignar-titulo">📍 Asignar ubicaciones:</div>
                        <div id="asignaciones-${sku}"></div>
                        <datalist id="ubicaciones-${sku}">
                            ${ubicaciones.map(u => `<option value="${u.ubicacion}">${u.ubicacion} (${u.cantidad} disponible)`).join('')}
                        </datalist>
                        <div class="despacho-resumen-pick">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                                <div style="flex: 1 1 200px; min-width: 0;">
                                    <strong>Total asignado:</strong> <span id="suma-${sku}" style="font-weight: 600;">0.00</span> / ${cantidadPendiente.toFixed(2)}
                                    <span id="restante-${sku}" style="margin-left: 10px; color: #856404;">(Pendiente: ${cantidadPendiente.toFixed(2)})</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; flex: 1 1 auto; min-width: min(100%, 280px);">
                                    <button class="btn-agregar-ubicacion" id="btn-agregar-ubicacion-${sku}" 
                                            onclick="agregarUbicacionPick('${sku}', '${facturaGuid}')"
                                            style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                                        + Agregar otra ubicación
                                    </button>
                                    <button class="btn-registrar" onclick="registrarLineaPick('${facturaGuid}', '${sku}', ${cantidadSolicitada})">
                                        Registrar
                                    </button>
                                </div>
                            </div>
                            <div id="validacion-msg-${sku}" style="margin-top: 5px; font-size: 12px;"></div>
                        </div>
                    </div>
                ` : `
                    <!-- No-ADESA: despacho directo desde ubicación macro -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                        <div style="padding: 12px; background: #f0f7ff; border: 1px solid #bbdefb; border-radius: 6px;">
                            <div style="font-size: 12px; color: #1565c0; font-weight: 600; margin-bottom: 8px;">
                                🏬 Despacho desde ${locationNameDoc}
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span style="font-size: 13px; color: #333;">Cantidad a despachar:</span>
                                <input type="number" id="cantidad-macro-${sku}" step="0.01" min="0.01" 
                                       max="${cantidadPendiente.toFixed(2)}" value="${cantidadPendiente.toFixed(2)}"
                                       style="width: 100px; padding: 6px 10px; border: 1px solid #90caf9; border-radius: 4px; font-size: 14px; font-weight: 600;">
                                <span style="font-size: 12px; color: #666;">de ${cantidadPendiente.toFixed(2)} pendiente</span>
                            </div>
                            <div style="margin-top: 10px; text-align: right;">
                                <button class="btn-registrar" onclick="registrarPickMacro('${facturaGuid}', '${sku}', ${cantidadSolicitada}, '${locationNameDoc}')">
                                    Registrar
                                </button>
                            </div>
                        </div>
                    </div>
                `) : `
                    <!-- Para S/K: botón directo sin escaneo -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                        <div style="text-align: center;">
                            <button class="btn-registrar" 
                                    style="background: ${itemType === 'S' ? '#17a2b8' : '#6f42c1'}; width: 100%;"
                                    onclick="registrarPick('${facturaGuid}', '${sku}', '${cantidadSolicitada}', true)">
                                Despachar ${tipoNombre} (Sin ubicación física)
                            </button>
                        </div>
                    </div>
                `}
            ` : `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                    <p style="color: #28a745; font-weight: 600; text-align: center;">✓ Completo</p>
                </div>
            `}
        `;
        grid.appendChild(productoCard);
        if (requiereUbicacion && !estaCompleto && esAdesa) {
            renderizarAsignacionesPicks(sku, false);
        }
    }
}

async function obtenerEstadoFactura(facturaGuid) {
    try {
        const response = await fetch(`/api/despacho/factura/${facturaGuid}/estado`);
        const data = await response.json();
        
        if (data.success) {
            return data;
        }
        return null;
    } catch (error) {
        console.error('Error al obtener estado:', error);
        return null;
    }
}

function calcularSumaAsignacionesPicks(sku) {
    if (!productosPicks[sku] || !productosPicks[sku].asignaciones) return 0;
    return productosPicks[sku].asignaciones.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

function validarSumatoriaPicks(sku, maxSuma) {
    const suma = calcularSumaAsignacionesPicks(sku);
    if (suma > maxSuma + 0.01) {
        return { valido: false, mensaje: `La suma (${suma.toFixed(2)}) excede lo pendiente (${maxSuma.toFixed(2)})` };
    }
    return { valido: true, suma, restante: maxSuma - suma };
}

function actualizarAsignacionPick(sku, index, campo, valor) {
    if (!productosPicks[sku] || !productosPicks[sku].asignaciones[index]) return;
    if (campo === 'ubicacion') {
        productosPicks[sku].asignaciones[index].ubicacion = valor.trim().toUpperCase();
    } else if (campo === 'cantidad') {
        productosPicks[sku].asignaciones[index].cantidad = parseFloat(valor) || 0;
        actualizarSumaAsignacionesPicks(sku);
    }
}

function agregarUbicacionPick(sku, facturaGuid) {
    if (!productosPicks[sku]) return;
    const pendiente = estadoDespachoCache[sku]?.pendiente ?? productosPicks[sku].cantidad_solicitada;
    const suma = calcularSumaAsignacionesPicks(sku);
    const restante = pendiente - suma;
    if (restante <= 0) return;
    productosPicks[sku].asignaciones.push({ ubicacion: '', cantidad: restante });
    renderizarAsignacionesPicks(sku, false);
}

function agregarUbicacionPickConValores(sku, facturaGuid, ubicacion, cantidad) {
    if (!productosPicks[sku]) return;
    productosPicks[sku].asignaciones.push({ ubicacion: ubicacion || '', cantidad: cantidad || 0 });
    renderizarAsignacionesPicks(sku, false);
}

function eliminarAsignacionPick(sku, index) {
    if (!productosPicks[sku] || !productosPicks[sku].asignaciones[index]) return;
    productosPicks[sku].asignaciones.splice(index, 1);
    renderizarAsignacionesPicks(sku, false);
}

function actualizarSumaAsignacionesPicks(sku) {
    const suma = calcularSumaAsignacionesPicks(sku);
    const producto = productosPicks[sku];
    const pendiente = estadoDespachoCache[sku]?.pendiente ?? producto?.cantidad_solicitada ?? 0;
    const restante = pendiente - suma;
    const validacion = validarSumatoriaPicks(sku, pendiente);
    const sumaEl = document.getElementById(`suma-${sku}`);
    const restanteEl = document.getElementById(`restante-${sku}`);
    const validacionMsg = document.getElementById(`validacion-msg-${sku}`);
    const btnAgregar = document.getElementById(`btn-agregar-ubicacion-${sku}`);
    if (sumaEl) sumaEl.textContent = suma.toFixed(2);
    if (restanteEl) {
        restanteEl.textContent = `(Pendiente: ${restante.toFixed(2)})`;
        restanteEl.style.color = restante <= 0 ? '#28a745' : (restante > 0 ? '#856404' : '#dc3545');
    }
    if (validacionMsg) {
        validacionMsg.innerHTML = !validacion.valido ? `<span style="color: #dc3545;">⚠️ ${validacion.mensaje}</span>` : '';
    }
    if (btnAgregar) btnAgregar.style.display = (restante > 0 && validacion.valido) ? 'block' : 'none';
}

function renderizarAsignacionesPicks(sku, yaRegistrada) {
    const producto = productosPicks[sku];
    if (!producto) return;
    const container = document.getElementById(`asignaciones-${sku}`);
    if (!container) return;
    container.innerHTML = '';
    const skuJs = escapeSkuForJs(sku);
    const safeSku = skuToSafeId(sku);
    producto.asignaciones.forEach((asignacion, index) => {
        const div = document.createElement('div');
        div.className = 'asignacion-fila';
        div.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; align-items: center;';
        const ubicacionInputId = `ubicacion-despacho-${safeSku}-${index}`;
        div.innerHTML = `
            <div class="wms-input-with-scan" style="flex:1;min-width:0;">
                <input type="text" id="${ubicacionInputId}" class="wms-input" placeholder="Ubicación (ej: 2P1D01N1)" value="${asignacion.ubicacion}"
                       list="ubicaciones-${sku}"
                       onchange="actualizarAsignacionPick('${skuJs}', ${index}, 'ubicacion', this.value)"
                       ${yaRegistrada ? 'disabled' : ''} style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                <button type="button" class="wms-btn wms-btn-secondary wms-btn-scan" onclick="abrirEscanerUbicacion('${ubicacionInputId}')" title="Escanear ubicación">📷</button>
            </div>
            <input type="number" placeholder="Cantidad" step="0.01" min="0.01" value="${(asignacion.cantidad || 0).toFixed(2)}"
                   onchange="actualizarAsignacionPick('${skuJs}', ${index}, 'cantidad', this.value)"
                   ${yaRegistrada ? 'disabled' : ''} style="width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            ${!yaRegistrada && producto.asignaciones.length > 1 ? `
                <button onclick="eliminarAsignacionPick('${skuJs}', ${index})" style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">✕</button>
            ` : ''}
        `;
        container.appendChild(div);
    });
    actualizarSumaAsignacionesPicks(sku);
}

async function registrarLineaPick(facturaGuid, sku, cantidadSolicitada) {
    const prod = productosPicks[sku];
    if (!prod || !prod.asignaciones) {
        mostrarMensaje('error', 'Agrega al menos una ubicación y cantidad');
        return;
    }
    // Leer valores actuales del DOM (onchange puede no haber disparado si el usuario no salió del input)
    const container = document.getElementById(`asignaciones-${sku}`);
    const asignacionesRaw = container ? container.querySelectorAll('.asignacion-fila') : [];
    let asignaciones = [];
    asignacionesRaw.forEach(row => {
        const inpUbicacion = row.querySelector('input[type="text"]');
        const inpCantidad = row.querySelector('input[type="number"]');
        const ubicacion = (inpUbicacion?.value || '').trim().toUpperCase();
        const cantidad = parseFloat(inpCantidad?.value);
        if (ubicacion && !isNaN(cantidad) && cantidad > 0) {
            asignaciones.push({ ubicacion, cantidad });
        }
    });
    // Fallback: si no hay filas en DOM (ej. error de render), usar datos de productosPicks
    if (asignaciones.length === 0 && prod.asignaciones) {
        asignaciones = prod.asignaciones
            .filter(a => a.ubicacion && parseFloat(a.cantidad) > 0)
            .map(a => ({ ubicacion: (a.ubicacion || '').trim(), cantidad: parseFloat(a.cantidad) }));
    }
    if (asignaciones.length === 0) {
        mostrarMensaje('error', 'Ingresa ubicación y cantidad válidos');
        return;
    }
    const suma = asignaciones.reduce((s, a) => s + a.cantidad, 0);
    const pendiente = estadoDespachoCache[sku]?.pendiente ?? cantidadSolicitada;
    if (suma > pendiente + 0.01) {
        mostrarMensaje('error', `La suma (${suma.toFixed(2)}) excede lo pendiente (${pendiente.toFixed(2)})`);
        return;
    }
    try {
        const response = await fetch('/api/despacho/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                factura_guid: facturaGuid,
                sku: sku,
                asignaciones: asignaciones
            })
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Pick(s) registrado(s) exitosamente');
            await mostrarProductos(facturaActual.productos, facturaGuid);
            requestAnimationFrame(() => {
                const firstPending = document.querySelector('#productos-grid .producto-card:not(.completo)');
                if (firstPending) firstPending.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            const endpointBuscar = (facturaActual.tipo || facturaActual.tipo_factura) === 'DISPATCH' ? '/api/despachos/buscar' : '/api/facturas/buscar';
            const facturaResponse = await fetch(endpointBuscar, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docid: facturaActual.docid, tipo: facturaActual.tipo || facturaActual.tipo_factura })
            });
            const facturaData = await facturaResponse.json();
            if (facturaData.success) {
                facturaActual = facturaData.factura;
                mostrarFactura(facturaData.factura);
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar pick');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

async function registrarPickMacro(facturaGuid, sku, cantidadSolicitada, locationName) {
    const cantidadInput = document.getElementById(`cantidad-macro-${sku}`);
    const cantidad = cantidadInput ? parseFloat(cantidadInput.value) : 0;

    if (!cantidad || cantidad <= 0) {
        mostrarMensaje('error', 'Ingresa una cantidad válida');
        if (cantidadInput) cantidadInput.focus();
        return;
    }

    const pendiente = estadoDespachoCache[sku]?.pendiente ?? cantidadSolicitada;
    if (cantidad > pendiente + 0.01) {
        mostrarMensaje('error', `La cantidad (${cantidad.toFixed(2)}) excede lo pendiente (${pendiente.toFixed(2)})`);
        return;
    }

    try {
        const response = await fetch('/api/despacho/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                factura_guid: facturaGuid,
                sku: sku,
                asignaciones: [{ ubicacion: locationName, cantidad: cantidad }]
            })
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Despacho registrado exitosamente');
            await mostrarProductos(facturaActual.productos, facturaGuid);
            requestAnimationFrame(() => {
                const firstPending = document.querySelector('#productos-grid .producto-card:not(.completo)');
                if (firstPending) firstPending.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            const endpointBuscar = (facturaActual.tipo || facturaActual.tipo_factura) === 'DISPATCH' ? '/api/despachos/buscar' : '/api/facturas/buscar';
            const facturaResponse = await fetch(endpointBuscar, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docid: facturaActual.docid, tipo: facturaActual.tipo || facturaActual.tipo_factura })
            });
            const facturaData = await facturaResponse.json();
            if (facturaData.success) {
                facturaActual = facturaData.factura;
                mostrarFactura(facturaData.factura);
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar despacho');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

async function registrarPick(facturaGuid, sku, cantidadSolicitada, esServicioKit = false) {
    let ubicacion = '';
    let cantidad = 0;
    
    if (esServicioKit) {
        // Para S/K: usar cantidad pendiente directamente, sin ubicación
        // Obtener cantidad pendiente del estado
        const estadoData = await obtenerEstadoFactura(facturaGuid);
        const estadoProductos = {};
        if (estadoData && estadoData.productos) {
            estadoData.productos.forEach(p => {
                estadoProductos[p.sku.toUpperCase()] = {
                    pendiente: p.cantidad_pendiente
                };
            });
        }
        const estado = estadoProductos[sku] || { pendiente: cantidadSolicitada };
        cantidad = estado.pendiente;
    } else {
        // Para Items: obtener de inputs
        const ubicacionInput = document.getElementById(`ubicacion-${sku}`);
        const cantidadInput = document.getElementById(`cantidad-${sku}`);

        ubicacion = ubicacionInput ? ubicacionInput.value.trim().toUpperCase() : '';
        cantidad = cantidadInput ? parseFloat(cantidadInput.value) : 0;

        if (!ubicacion) {
            mostrarMensaje('error', 'Ingresa una ubicación');
            if (ubicacionInput) ubicacionInput.focus();
            return;
        }
    }

    if (!cantidad || cantidad <= 0) {
        mostrarMensaje('error', 'Ingresa una cantidad válida');
        const inp = document.getElementById(`cantidad-${sku}`);
        if (inp) inp.focus();
        return;
    }

    try {
        const response = await fetch('/api/despacho/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                factura_guid: facturaGuid,
                sku: sku,
                ubicacion: esServicioKit ? null : ubicacion,  // S/K: null
                cantidad: cantidad
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', 'Pick registrado exitosamente');
            // Recargar productos con estado actualizado
            await mostrarProductos(facturaActual.productos, facturaGuid);
            // Scroll suave al siguiente producto pendiente
            requestAnimationFrame(() => {
                const firstPending = document.querySelector('#productos-grid .producto-card:not(.completo)');
                if (firstPending) {
                    firstPending.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            // Actualizar estado de factura (usar endpoint según tipo de documento)
            const endpointBuscar = (facturaActual.tipo || facturaActual.tipo_factura) === 'DISPATCH' 
                ? '/api/despachos/buscar' : '/api/facturas/buscar';
            const facturaResponse = await fetch(endpointBuscar, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    docid: facturaActual.docid,
                    tipo: facturaActual.tipo || facturaActual.tipo_factura
                })
            });
            const facturaData = await facturaResponse.json();
            if (facturaData.success) {
                facturaActual = facturaData.factura;
                mostrarFactura(facturaData.factura);
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar pick');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

let usuarioActualGlobal = null;

async function obtenerUsuarioActual() {
    if (usuarioActualGlobal) {
        return usuarioActualGlobal;
    }
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success) {
            usuarioActualGlobal = {
                id: data.usuario.id,
                nombre: data.usuario.nombre,
                rol: data.usuario.rol
            };
            return usuarioActualGlobal;
        }
    } catch (error) {
        console.error('Error al obtener usuario actual:', error);
    }
    return { id: null, nombre: 'Desconocido', rol: '' };
}

async function actualizarUsuarioSolicitante(factura_guid, usuario_id) {
    try {
        const response = await fetch('/api/facturas/actualizar-solicitante', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                factura_guid: factura_guid,
                usuario_id: usuario_id
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error al actualizar usuario solicitante:', error);
    }
}

// Event listeners para botones de acción
document.getElementById('btn-refrescar').addEventListener('click', async () => {
    if (!facturaActual || !facturaActual.guid) {
        mostrarMensaje('error', 'No hay despacho seleccionado');
        return;
    }
    
    const btnRefrescar = document.getElementById('btn-refrescar');
    btnRefrescar.disabled = true;
    btnRefrescar.textContent = 'Refrescando...';
    
    try {
        const response = await fetch(`/api/despacho/${facturaActual.guid}/refrescar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                docid: facturaActual.docid,
                tipo_factura: facturaActual.tipo_factura || facturaActual.tipo || ''
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensaje('success', 'Datos refrescados desde ADM Cloud');
            // Actualizar factura actual y mostrar
            facturaActual = { ...facturaActual, ...data.factura };
            mostrarFactura(facturaActual);
        } else {
            mostrarMensaje('error', data.error || 'Error al refrescar');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al refrescar');
    } finally {
        btnRefrescar.disabled = false;
        btnRefrescar.textContent = '🔄 Refrescar desde ADM';
    }
});

document.getElementById('btn-revertir').addEventListener('click', async () => {
    if (!facturaActual || !facturaActual.guid) {
        mostrarMensaje('error', 'No hay despacho seleccionado');
        return;
    }
    
    if (!confirm('¿Estás seguro de que deseas revertir este despacho? Esta acción eliminará todos los movimientos y revertirá el stock. Esta acción no se puede deshacer.')) {
        return;
    }
    
    const btnRevertir = document.getElementById('btn-revertir');
    btnRevertir.disabled = true;
    btnRevertir.textContent = 'Revirtiendo...';
    
    try {
        const response = await fetch(`/api/despacho/${facturaActual.guid}/revertir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensaje('success', data.message || 'Despacho revertido exitosamente');
            // Recargar la página después de 2 segundos
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            mostrarMensaje('error', data.error || 'Error al revertir');
            btnRevertir.disabled = false;
            btnRevertir.textContent = '▲ Revertir Despacho';
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al revertir');
        btnRevertir.disabled = false;
        btnRevertir.textContent = '▲ Revertir Despacho';
    }
});

// Inicializar
verificarAutenticacion();
obtenerUsuarioActual(); // Cargar usuario al inicio

// Permitir Enter en inputs de escaneo
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        const inputs = Array.from(document.querySelectorAll('.scan-inputs input'));
        const currentIndex = inputs.indexOf(e.target);
        if (currentIndex < inputs.length - 1) {
            inputs[currentIndex + 1].focus();
        }
    }
});
