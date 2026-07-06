let transferenciaActual = null;
let modoEdicion = false;
// NUEVA ESTRUCTURA: {sku: {item_id, cantidad_total, asignaciones_origen: [{ubicacion, cantidad}], asignaciones_destino: [{ubicacion, cantidad}]}}
let productosAsignados = {};
let usuarioRol = null;
let estadoTransferenciaCache = {};  // { sku: { cantidad_asignada, cantidad_restante, completo, asignaciones_registradas } }
let stockPorSku = {};  // { sku: [{ ubicacion, cantidad }] } para mostrar en tarjeta

async function cargarStockPorSkus(skus) {
    if (!skus || skus.length === 0) return;
    try {
        const res = await fetch('/api/stock/por-skus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: skus })
        });
        const data = await res.json();
        if (data.success && data.data) stockPorSku = data.data;
    } catch (e) {
        console.error('Error al cargar stock por SKUs:', e);
    }
}

function skuToSafeId(sku) {
    return (sku || '').replace(/[/\\'"<>]/g, '_');
}
function escapeHtmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Verificar si viene con parámetro guid (desde historial)
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const guid = urlParams.get('guid');
    const editar = urlParams.get('editar');
    
    if (guid) {
        modoEdicion = editar === 'true';
        document.querySelector('.search-section').style.display = 'none';
        document.getElementById('empty-state').style.display = 'none';
        
        await cargarDetallesTransferencia(guid);
    }
});

async function cargarDetallesTransferencia(guid) {
    try {
        const response = await fetch(`/api/detalles/transferencia/${guid}`);
        const data = await response.json();
        
        if (data.success) {
            mostrarDetallesTransferencia(data.transferencia);
        } else {
            mostrarMensaje('error', data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

function mostrarDetallesTransferencia(transferencia) {
    transferenciaActual = transferencia;
    document.getElementById('transferencia-info').style.display = 'block';
    
    document.getElementById('transferencia-numero').textContent = 
        `Transferencia #${transferencia.transferencia_docid}`;
    document.getElementById('transferencia-fecha').textContent = 
        formatarFechaDocumento(transferencia.fecha_transferencia);
    
    const estadoDet = transferencia.estado_procesamiento || 'PENDIENTE';
    const estadoElDet = document.getElementById('transferencia-estado');
    if (estadoElDet) {
        estadoElDet.textContent = estadoDet.replace('_', ' ');
        estadoElDet.className = 'estado-badge estado-' + estadoDet.toLowerCase().replace('_', '-');
    }
    const btnRefrescarDet = document.getElementById('btn-refrescar-transferencia');
    if (btnRefrescarDet) btnRefrescarDet.style.display = 'inline-block';
    
    document.getElementById('transferencia-origen').textContent = 
        transferencia.location_name_origen || 'N/A';
    document.getElementById('transferencia-destino').textContent = 
        transferencia.location_name_destino || 'N/A';
    
    let infoUsuarios = '';
    if (transferencia.usuario_solicitante) {
        infoUsuarios += `Solicitado por: ${transferencia.usuario_solicitante.nombre}<br>`;
    }
    if (transferencia.usuario_procesador) {
        infoUsuarios += `Procesado por: ${transferencia.usuario_procesador.nombre}<br>`;
    }
    if (transferencia.fecha_procesamiento) {
        infoUsuarios += `Procesado: ${new Date(transferencia.fecha_procesamiento).toLocaleString('es-DO')}`;
    }
    
    const transferenciaDetails = document.querySelector('.transferencia-details');
    if (infoUsuarios) {
        let usuariosDiv = transferenciaDetails.querySelector('#usuarios-info');
        if (!usuariosDiv) {
            usuariosDiv = document.createElement('div');
            usuariosDiv.id = 'usuarios-info';
            usuariosDiv.innerHTML = `<strong>Auditoría:</strong><br>${infoUsuarios}`;
            transferenciaDetails.appendChild(usuariosDiv);
        } else {
            usuariosDiv.innerHTML = `<strong>Auditoría:</strong><br>${infoUsuarios}`;
        }
    }
    
    document.querySelector('.productos-section h2').textContent = 
        modoEdicion ? 'Productos Transferidos' : 'Productos Transferidos (Auditoría)';

    if (transferencia.transferencia_guid) {
        (async () => {
            const estadoData = await obtenerEstadoTransferencia(transferencia.transferencia_guid);
            estadoTransferenciaCache = {};
            if (estadoData && estadoData.productos) {
                estadoData.productos.forEach(p => {
                    estadoTransferenciaCache[(p.sku || '').toUpperCase()] = {
                        cantidad_asignada: p.cantidad_asignada,
                        cantidad_restante: p.cantidad_restante,
                        completo: p.completo,
                        asignaciones_registradas: p.asignaciones_registradas || []
                    };
                });
            }
            const badge = document.getElementById('transferencia-estado');
            if (badge && estadoData) {
                const est = estadoData.estado_transferencia || 'PENDIENTE';
                badge.textContent = est.replace('_', ' ');
                badge.className = 'estado-badge estado-' + est.toLowerCase().replace('_', '-');
            }
        })();
    }
    
    const btnRevertirDet = document.getElementById('btn-revertir-transferencia');
    if (btnRevertirDet) {
        const esAdmin = usuarioRol === 'administrador';
        btnRevertirDet.style.display = (esAdmin && transferencia.estado_procesamiento === 'PROCESADA') ? 'inline-block' : 'none';
    }
    
    const productos = transferencia.productos_originales || transferencia.productos || [];
    mostrarProductos(productos, transferencia);
}


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

function mostrarErrorConSolucion(error, advertencia, solucionSugerida) {
    const errorDiv = document.getElementById('message-error');
    const successDiv = document.getElementById('message-success');
    const solucionDiv = document.getElementById('message-solucion');
    
    successDiv.classList.remove('show');
    errorDiv.classList.remove('show');
    solucionDiv.classList.remove('show');
    
    let errorTexto = error;
    if (advertencia) {
        errorTexto += ' ' + advertencia;
    }
    errorDiv.textContent = errorTexto;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 8000);
    
    if (solucionSugerida) {
        const textoSolucion = solucionSugerida.replace(
            'Ajustes → Nuevo Ajuste',
            '<a href="/ajustes/nuevo">Ajustes → Nuevo Ajuste</a>'
        );
        solucionDiv.innerHTML = '<strong>💡 Cómo resolver:</strong> ' + textoSolucion;
        solucionDiv.classList.add('show');
        setTimeout(() => solucionDiv.classList.remove('show'), 15000);
    }
}

// Búsqueda de transferencia
document.getElementById('search-transferencia-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docid = document.getElementById('docid-input').value.trim();

    if (!docid) {
        mostrarMensaje('error', 'Ingresa un número de transferencia');
        return;
    }

    const btnSearch = document.getElementById('btn-search');
    btnSearch.disabled = true;
    
    mostrarMensaje('success', `Buscando transferencia #${docid}...`);
    btnSearch.textContent = 'Buscando...';

    try {
        const response = await fetch('/api/transferencias/buscar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ docid })
        });

        const data = await response.json();

        if (data.success) {
            transferenciaActual = data.transferencia;
            
            const usuarioActual = await obtenerUsuarioActual();
            if (data.transferencia.usuario_solicitante && 
                data.transferencia.usuario_solicitante.id !== usuarioActual.id &&
                data.transferencia.estado_procesamiento === 'PENDIENTE') {
                const confirmar = confirm(
                    `⚠️ Esta transferencia fue solicitada por ${data.transferencia.usuario_solicitante.nombre}.\n\n` +
                    `¿Deseas tomarla de todas formas?`
                );
                
                if (!confirmar) {
                    ocultarTransferencia();
                    return;
                }
                
                await actualizarUsuarioSolicitante(data.transferencia.guid, usuarioActual.id);
            }
            
            mostrarTransferencia(data.transferencia);
            mostrarMensaje('success', 'Transferencia encontrada');
        } else {
            mostrarMensaje('error', data.error || 'Transferencia no encontrada');
            ocultarTransferencia();
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    } finally {
        btnSearch.disabled = false;
        btnSearch.textContent = 'Buscar';
    }
});

async function obtenerEstadoTransferencia(guid) {
    try {
        const res = await fetch(`/api/transferencias/transferencia/${guid}/estado`);
        const data = await res.json();
        return data.success ? data : null;
    } catch (e) {
        console.error('Error al obtener estado transferencia:', e);
        return null;
    }
}

function mostrarTransferencia(transferencia) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('transferencia-info').style.display = 'block';

    document.getElementById('transferencia-numero').textContent = 
        `Transferencia #${transferencia.docid}`;
    document.getElementById('transferencia-fecha').textContent = 
        formatarFechaDocumento(transferencia.fecha);
    
    document.getElementById('transferencia-origen').textContent = transferencia.origen_nombre || 'N/A';
    document.getElementById('transferencia-destino').textContent = transferencia.destino_nombre || 'N/A';

    const estado = transferencia.estado_procesamiento || 'PENDIENTE';
    const estadoEl = document.getElementById('transferencia-estado');
    estadoEl.textContent = estado.replace('_', ' ');
    estadoEl.className = 'estado-badge estado-' + estado.toLowerCase().replace('_', '-');

    const btnRefrescar = document.getElementById('btn-refrescar-transferencia');
    if (btnRefrescar) btnRefrescar.style.display = 'inline-block';
    const btnRevertir = document.getElementById('btn-revertir-transferencia');
    if (btnRevertir) {
        const esAdmin = usuarioRol === 'administrador';
        btnRevertir.style.display = (esAdmin && transferencia.estado_procesamiento === 'PROCESADA') ? 'inline-block' : 'none';
    }
    
    (async () => {
        try {
            const estadoData = await obtenerEstadoTransferencia(transferencia.guid);
            estadoTransferenciaCache = {};
            if (estadoData && estadoData.productos) {
                estadoData.productos.forEach(p => {
                    estadoTransferenciaCache[(p.sku || '').toUpperCase()] = {
                        cantidad_asignada: p.cantidad_asignada,
                        cantidad_restante: p.cantidad_restante,
                        completo: p.completo,
                        asignaciones_registradas: p.asignaciones_registradas || []
                    };
                });
            }
            const skus = (transferencia.productos || []).map(p => (p.SKU || p.ItemSKU || '').toUpperCase()).filter(Boolean);
            await cargarStockPorSkus(skus);
        } catch (e) {
            console.warn('Error al cargar estado o stock (se muestran productos de todas formas):', e);
            estadoTransferenciaCache = {};
        }
        try {
            mostrarProductos(transferencia.productos || [], transferencia);
        } catch (err) {
            console.error('Error al pintar productos:', err);
        }
    })();
}

function ocultarTransferencia() {
    document.getElementById('transferencia-info').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

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

function mostrarProductos(productos, transferencia = null) {
    const list = Array.isArray(productos) ? productos : [];
    console.log('Transferencias: mostrarProductos llamado', { cantidad: list.length, docid: transferencia?.docid });
    const grid = document.getElementById('productos-grid');
    if (!grid) {
        console.error('Transferencias: no se encontró el elemento #productos-grid');
        return;
    }
    const yaRegistrada = transferencia && transferencia.estado_procesamiento === 'PROCESADA';
    if (list.length === 0) {
        grid.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No hay productos en esta transferencia</p>';
        return;
    }

    const productosOrdenados = [...list].sort((a, b) => {
        const skuA = (a.SKU || a.ItemSKU || '').toUpperCase();
        const skuB = (b.SKU || b.ItemSKU || '').toUpperCase();
        const completoA = estadoTransferenciaCache[skuA]?.completo ?? false;
        const completoB = estadoTransferenciaCache[skuB]?.completo ?? false;
        if (completoA === completoB) return 0;
        return completoA ? 1 : -1;
    });

    const btnRegistrar = document.getElementById('btn-registrar-transferencia-global');
    if (btnRegistrar) btnRegistrar.style.display = 'none';

    const origenEsAdesa = transferencia && transferencia.origen_es_adesa === true;
    const destinoEsAdesa = transferencia && transferencia.destino_es_adesa === true;

    grid.innerHTML = '';

    productosOrdenados.forEach((producto) => {
        const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
        const safeId = skuToSafeId(sku);
        const cantidad_total = parseFloat(producto.Quantity || 0);
        const itemId = producto.ItemID || '';
        const nombre = producto.Name || 'Sin nombre';
        const estadoProd = estadoTransferenciaCache[sku] || {};
        const cantidad_asignada_estado = estadoProd.cantidad_asignada ?? 0;
        const cantidad_restante_estado = estadoProd.cantidad_restante ?? cantidad_total;
        const estaCompleto = estadoProd.completo === true;
        
        if (!productosAsignados[sku]) {
            productosAsignados[sku] = {
                item_id: itemId,
                cantidad_total: cantidad_total,
                asignaciones_origen: [],
                asignaciones_destino: []
            };
        }
        
        if (origenEsAdesa && productosAsignados[sku].asignaciones_origen.length === 0) {
            productosAsignados[sku].asignaciones_origen.push({ ubicacion: '', cantidad: cantidad_restante_estado > 0 ? cantidad_restante_estado : cantidad_total });
        }
        
        if (destinoEsAdesa && productosAsignados[sku].asignaciones_destino.length === 0) {
            productosAsignados[sku].asignaciones_destino.push({ ubicacion: '', cantidad: cantidad_restante_estado > 0 ? cantidad_restante_estado : cantidad_total });
        }
        
        const suma_origen = calcularSumaAsignacionesOrigen(sku);
        const suma_destino = calcularSumaAsignacionesDestino(sku);
        let validacion_destino = validarSumatoriaDestino(sku);
        if (!destinoEsAdesa && origenEsAdesa) {
            if (suma_origen <= 0) validacion_destino = { valido: false, mensaje: 'Indica al menos una cantidad a registrar' };
            else if (suma_origen > cantidad_restante_estado) validacion_destino = { valido: false, mensaje: 'La suma excede lo restante' };
            else validacion_destino = { valido: true };
        }
        const tieneAdesa = origenEsAdesa || destinoEsAdesa;
        const lineaSoloLectura = yaRegistrada || estaCompleto;
        const ubicacionesWms = stockPorSku[sku] || [];
        const hayStockWms = ubicacionesWms.length > 0;
        const asignacionesRegistradas = estadoProd.asignaciones_registradas || [];
        
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card' + (estaCompleto ? ' completo' : '');
        productoCard.id = `producto-${safeId}`;
        productoCard.setAttribute('data-sku', sku);
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>${nombre}</h4>
                    <div class="sku">SKU: ${sku}</div>
                </div>
                <div class="cantidad-item">
                    <div class="label">Cantidad Transferida</div>
                    <div class="value">${cantidad_total.toFixed(2)}</div>
                </div>
            </div>
            <div class="asignacion-section">
                ${hayStockWms ? `
                    <div style="font-size: 12px; color: #0c5460; margin-bottom: 10px; padding: 8px; background: #e7f3f5; border-radius: 6px;">
                        <strong>Ubicaciones físicas (WMS):</strong><br>
                        ${ubicacionesWms.map(u => `${u.ubicacion} → ${parseFloat(u.cantidad).toFixed(2)}`).join(' &nbsp;|&nbsp; ')}
                    </div>
                ` : `
                    <div style="font-size: 12px; color: #856404; margin-bottom: 10px; padding: 8px; background: #fff3cd; border-radius: 6px;">
                        ⚠️ No hay stock disponible en ubicaciones físicas
                    </div>
                `}
                ${origenEsAdesa ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">
                        📍 Ubicación Física Origen (WMS):
                    </div>
                    <div id="asignaciones-origen-${safeId}"></div>
                    ${!lineaSoloLectura && cantidad_restante_estado > 0 ? `
                    <button type="button" class="btn-agregar-ubicacion" data-sku="${escapeHtmlAttr(sku)}" onclick="agregarUbicacionOrigenDesdeBtn(this)"
                            style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-bottom: 10px;">
                        + Agregar otra ubicación origen
                    </button>
                    ` : ''}
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
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600; margin-top: 15px;">
                        📍 Ubicación Física Destino (WMS):
                    </div>
                    <div id="asignaciones-destino-${safeId}"></div>
                    ${!lineaSoloLectura && cantidad_restante_estado > 0 ? `
                    <button type="button" class="btn-agregar-ubicacion" data-sku="${escapeHtmlAttr(sku)}" onclick="agregarUbicacionDestinoDesdeBtn(this)"
                            style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-bottom: 10px;">
                        + Agregar otra ubicación destino
                    </button>
                    ` : ''}
                ` : `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600; margin-top: 15px;">
                        📦 Ubicación Destino Externa (NO requiere ubicación física WMS)
                    </div>
                    <div style="background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 5px; padding: 10px;">
                        <div style="font-size: 12px; color: #004085;">
                            <strong>Ubicación ADM:</strong> ${transferencia.destino_nombre || 'N/A'}<br>
                            <em style="color: #6c757d;">Esta ubicación no tiene control físico en el WMS.</em>
                        </div>
                    </div>
                `}
                ${asignacionesRegistradas.length > 0 ? `
                    <div style="margin-top: 12px; margin-bottom: 10px; padding: 10px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #28a745;">
                        <div style="font-size: 12px; color: #2e7d32; font-weight: 600; margin-bottom: 5px;">📦 Asignaciones registradas (esta línea):</div>
                        <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #333;">
                            ${asignacionesRegistradas.map(a => `<li>${(a.origen || '').trim()} → ${(a.destino || '').trim()}: ${parseFloat(a.cantidad || 0).toFixed(2)}</li>`).join('')}
                        </ul>
                        ${!estaCompleto ? '<div style="font-size: 11px; color: #666; margin-top: 5px; font-style: italic;">+ Agregar más abajo</div>' : ''}
                    </div>
                ` : ''}
                ${tieneAdesa ? `
                    <div class="resumen-producto-transferencia" style="margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #17a2b8;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1 1 200px; min-width: 0;">
                                <strong>Asignado:</strong> <span id="suma-destino-${safeId}" style="font-weight: 600;">${cantidad_asignada_estado.toFixed(2)}</span> / ${cantidad_total.toFixed(2)}
                                <span id="restante-destino-${safeId}" style="margin-left: 10px; color: ${estaCompleto ? '#28a745' : (cantidad_restante_estado > 0 ? '#856404' : '#28a745')};">
                                    ${estaCompleto ? '✓ Completo' : `(Restante: ${cantidad_restante_estado.toFixed(2)})`}
                                </span>
                                ${cantidad_restante_estado > 0 && !estaCompleto ? ` <span style="font-size: 12px; color: #666;">— Faltan ${cantidad_restante_estado.toFixed(2)} por asignar</span>` : ''}
                            </div>
                            ${!estaCompleto && !yaRegistrada ? `
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; flex: 1 1 auto; min-width: min(100%, 200px);">
                                <button type="button" class="btn-registrar-linea" id="btn-registrar-${safeId}" data-sku="${escapeHtmlAttr(sku)}" onclick="registrarLineaDesdeBtn(this)">
                                    Registrar
                                </button>
                            </div>
                            ` : ''}
                        </div>
                        <div id="validacion-msg-${safeId}" style="margin-top: 6px; font-size: 12px;">
                            ${estaCompleto ? '<span style="color: #28a745; font-weight: 600;">✓ Completo</span>' : (!validacion_destino.valido ? `<span style="color: #dc3545;">⚠️ ${validacion_destino.mensaje}</span>` : '')}
                        </div>
                    </div>
                ` : ''}
                ${estaCompleto ? `
                    <div style="margin-top: 12px; padding: 12px; background: #d4edda; border-radius: 8px; border: 1px solid #28a745; text-align: center;">
                        <span style="font-size: 18px; color: #155724; font-weight: 600;">✓ Completo</span>
                    </div>
                ` : ''}
                ${yaRegistrada ? '<p style="color: #856404; font-size: 12px; margin-top: 5px; font-style: italic;">⚠️ Esta transferencia ya fue procesada. No se pueden hacer modificaciones.</p>' : ''}
            </div>
        `;
        
        grid.appendChild(productoCard);
        
        if (origenEsAdesa) {
            renderizarAsignacionesOrigen(sku, lineaSoloLectura);
        }
        if (destinoEsAdesa) {
            renderizarAsignacionesDestino(sku, lineaSoloLectura);
        }
    });
}

function registrarLineaDesdeBtn(btn) {
    const sku = btn.getAttribute('data-sku');
    if (sku) registrarLineaTransferencia(sku);
}
function agregarUbicacionOrigenDesdeBtn(btn) {
    const sku = btn.getAttribute('data-sku');
    if (sku) agregarUbicacionOrigen(sku);
}
function agregarUbicacionDestinoDesdeBtn(btn) {
    const sku = btn.getAttribute('data-sku');
    if (sku) agregarUbicacionDestino(sku);
}

async function obtenerUsuarioActual() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success) {
            return { id: data.usuario.id, nombre: data.usuario.nombre };
        }
    } catch (error) {
        console.error('Error al obtener usuario actual:', error);
    }
    return { id: null, nombre: 'Desconocido' };
}

async function actualizarUsuarioSolicitante(transferencia_guid, usuario_id) {
    try {
        const response = await fetch('/api/transferencias/actualizar-solicitante', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transferencia_guid: transferencia_guid,
                usuario_id: usuario_id
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error al actualizar usuario solicitante:', error);
    }
}

function calcularSumaAsignacionesOrigen(sku) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones_origen) {
        return 0;
    }
    return productosAsignados[sku].asignaciones_origen.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

function calcularSumaAsignacionesDestino(sku) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones_destino) {
        return 0;
    }
    return productosAsignados[sku].asignaciones_destino.reduce((sum, a) => sum + parseFloat(a.cantidad || 0), 0);
}

function validarSumatoriaDestino(sku, maxCantidad) {
    const producto = productosAsignados[sku];
    if (!producto) return { valido: false, mensaje: 'Producto no encontrado' };
    
    const suma = calcularSumaAsignacionesDestino(sku);
    const estadoProd = estadoTransferenciaCache[sku] || {};
    const cantidad_restante = estadoProd.cantidad_restante !== undefined ? estadoProd.cantidad_restante : producto.cantidad_total;
    const limite = maxCantidad !== undefined ? maxCantidad : cantidad_restante;
    
    if (suma <= 0) {
        return { valido: false, mensaje: 'Indica al menos una cantidad a registrar' };
    }
    if (suma > limite) {
        return {
            valido: false,
            mensaje: `La suma (${suma.toFixed(2)}) excede lo restante (${limite.toFixed(2)})`
        };
    }
    return { valido: true, suma: suma, restante: limite - suma };
}

function actualizarAsignacionOrigen(sku, index, campo, valor) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones_origen[index]) {
        return;
    }
    
    if (campo === 'ubicacion') {
        productosAsignados[sku].asignaciones_origen[index].ubicacion = valor.trim().toUpperCase();
    } else if (campo === 'cantidad') {
        productosAsignados[sku].asignaciones_origen[index].cantidad = parseFloat(valor) || 0;
    }
    actualizarResumenProducto(sku);
}

function actualizarAsignacionDestino(sku, index, campo, valor) {
    if (!productosAsignados[sku] || !productosAsignados[sku].asignaciones_destino[index]) {
        return;
    }
    
    if (campo === 'ubicacion') {
        productosAsignados[sku].asignaciones_destino[index].ubicacion = valor.trim().toUpperCase();
    } else if (campo === 'cantidad') {
        productosAsignados[sku].asignaciones_destino[index].cantidad = parseFloat(valor) || 0;
        actualizarSumaAsignacionesDestino(sku);
    }
}

function agregarUbicacionDestino(sku) {
    if (!productosAsignados[sku]) return;
    const producto = productosAsignados[sku];
    const suma_actual = calcularSumaAsignacionesDestino(sku);
    const estadoProd = estadoTransferenciaCache[sku] || {};
    const restante_max = estadoProd.cantidad_restante !== undefined ? estadoProd.cantidad_restante : producto.cantidad_total;
    const restante = restante_max - suma_actual;
    if (restante <= 0) {
        mostrarMensaje('error', 'No hay cantidad restante para asignar. Faltan ' + restante_max.toFixed(2) + ' por asignar.');
        return;
    }
    producto.asignaciones_destino.push({ ubicacion: '', cantidad: restante });
    renderizarAsignacionesDestino(sku, false);
}

function eliminarAsignacionDestino(sku, index) {
    if (productosAsignados[sku] && productosAsignados[sku].asignaciones_destino) {
        productosAsignados[sku].asignaciones_destino.splice(index, 1);
        renderizarAsignacionesDestino(sku, false);
    }
}

function escapeSkuForJs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderizarAsignacionesOrigen(sku, yaRegistrada) {
    const safeId = skuToSafeId(sku);
    const container = document.getElementById('asignaciones-origen-' + safeId);
    if (!container) return;
    
    const producto = productosAsignados[sku];
    if (!producto || !producto.asignaciones_origen) return;
    
    container.innerHTML = '';
    const skuEsc = escapeSkuForJs(sku);
    
    producto.asignaciones_origen.forEach((asignacion, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '10px';
        row.style.marginBottom = '10px';
        row.style.alignItems = 'center';
        const ubicacionInputId = `ubicacion-origen-${safeId}-${index}`;
        row.innerHTML = `
            <div class="wms-input-with-scan" style="flex:1;min-width:0;">
                <input type="text" id="${ubicacionInputId}" class="wms-input" placeholder="Ubicación origen (ej: 2P1D01N1)" value="${(asignacion.ubicacion || '').replace(/"/g, '&quot;')}"
                       onchange="actualizarAsignacionOrigen('${skuEsc}', ${index}, 'ubicacion', this.value)"
                       ${yaRegistrada ? 'disabled' : ''}
                       style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                <button type="button" class="wms-btn wms-btn-secondary wms-btn-scan" onclick="abrirEscanerUbicacion('${ubicacionInputId}')" title="Escanear ubicación">📷</button>
            </div>
            <input type="number" placeholder="Cantidad" value="${asignacion.cantidad}" step="0.01" min="0"
                   onchange="actualizarAsignacionOrigen('${skuEsc}', ${index}, 'cantidad', this.value)"
                   ${yaRegistrada ? 'disabled' : ''}
                   style="width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
        `;
        container.appendChild(row);
    });
    actualizarResumenProducto(sku);
}

function actualizarResumenProducto(sku) {
    const safeId = skuToSafeId(sku);
    const producto = productosAsignados[sku];
    if (!producto) return;
    const estadoProd = estadoTransferenciaCache[sku] || {};
    const cantidadAsignadaEstado = estadoProd.cantidad_asignada ?? 0;
    const cantidadRestanteEstado = estadoProd.cantidad_restante !== undefined ? estadoProd.cantidad_restante : producto.cantidad_total;
    const sumaElement = document.getElementById('suma-destino-' + safeId);
    const restanteElement = document.getElementById('restante-destino-' + safeId);
    const validacionEl = document.getElementById('validacion-msg-' + safeId);
    if (sumaElement) sumaElement.textContent = cantidadAsignadaEstado.toFixed(2);
    if (restanteElement) {
        restanteElement.textContent = cantidadRestanteEstado >= 0 ? `(Restante: ${cantidadRestanteEstado.toFixed(2)})` : '(Restante: 0)';
        restanteElement.style.color = cantidadRestanteEstado > 0 ? '#856404' : '#28a745';
    }
    let validacion = validarSumatoriaDestino(sku);
    const destinoEsAdesa = transferenciaActual && transferenciaActual.destino_es_adesa === true;
    const origenEsAdesa = transferenciaActual && transferenciaActual.origen_es_adesa === true;
    if (!destinoEsAdesa && origenEsAdesa) {
        const rest = cantidadRestanteEstado;
        const sumaO = calcularSumaAsignacionesOrigen(sku);
        if (sumaO <= 0) validacion = { valido: false, mensaje: 'Indica al menos una cantidad a registrar' };
        else if (sumaO > rest) validacion = { valido: false, mensaje: 'La suma excede lo restante' };
        else validacion = { valido: true };
    }
    const estaCompleto = (estadoProd.cantidad_restante !== undefined && estadoProd.cantidad_restante <= 0) || estadoProd.completo === true;
    if (validacionEl) {
        if (estaCompleto)
            validacionEl.innerHTML = '<span style="color: #28a745; font-weight: 600;">✓ Completo</span>';
        else if (!validacion.valido)
            validacionEl.innerHTML = `<span style="color: #dc3545;">⚠️ ${validacion.mensaje}</span>`;
        else
            validacionEl.innerHTML = '';
    }
}

function agregarUbicacionOrigen(sku) {
    if (!productosAsignados[sku]) return;
    const producto = productosAsignados[sku];
    const suma_actual = calcularSumaAsignacionesOrigen(sku);
    const estadoProd = estadoTransferenciaCache[sku] || {};
    const restante_max = estadoProd.cantidad_restante !== undefined ? estadoProd.cantidad_restante : producto.cantidad_total;
    const restante = restante_max - suma_actual;
    if (restante <= 0) {
        mostrarMensaje('error', 'No hay cantidad restante para asignar. Faltan ' + restante_max.toFixed(2) + ' por asignar.');
        return;
    }
    producto.asignaciones_origen.push({ ubicacion: '', cantidad: restante });
    renderizarAsignacionesOrigen(sku, false);
}

function renderizarAsignacionesDestino(sku, yaRegistrada) {
    const safeId = skuToSafeId(sku);
    const container = document.getElementById('asignaciones-destino-' + safeId);
    if (!container) return;
    
    const producto = productosAsignados[sku];
    if (!producto || !producto.asignaciones_destino) return;
    
    container.innerHTML = '';
    const skuEsc = escapeSkuForJs(sku);
    
    producto.asignaciones_destino.forEach((asignacion, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '10px';
        row.style.marginBottom = '10px';
        row.style.alignItems = 'center';
        const ubicacionInputId = `ubicacion-dest-${safeId}-${index}`;
        row.innerHTML = `
            <div class="wms-input-with-scan" style="flex:1;min-width:0;">
                <input type="text" id="${ubicacionInputId}" class="wms-input" placeholder="Ubicación destino (ej: 2P1D01N2)" value="${(asignacion.ubicacion || '').replace(/"/g, '&quot;')}"
                       onchange="actualizarAsignacionDestino('${skuEsc}', ${index}, 'ubicacion', this.value)"
                       ${yaRegistrada ? 'disabled' : ''}
                       style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                <button type="button" class="wms-btn wms-btn-secondary wms-btn-scan" onclick="abrirEscanerUbicacion('${ubicacionInputId}')" title="Escanear ubicación">📷</button>
            </div>
            <input type="number" placeholder="Cantidad" value="${asignacion.cantidad}" step="0.01" min="0"
                   onchange="actualizarAsignacionDestino('${skuEsc}', ${index}, 'cantidad', this.value)"
                   ${yaRegistrada ? 'disabled' : ''}
                   style="width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            ${!yaRegistrada && producto.asignaciones_destino.length > 1 ? `
                <button type="button" onclick="eliminarAsignacionDestino('${skuEsc}', ${index})"
                        style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">✕</button>
            ` : ''}
        `;
        container.appendChild(row);
    });
    actualizarResumenProducto(sku);
}

function actualizarSumaAsignacionesDestino(sku) {
    renderizarAsignacionesDestino(sku, false);
}

async function registrarLineaTransferencia(sku) {
    if (!transferenciaActual) return;
    const prod = productosAsignados[sku];
    if (!prod) return;
    const origenEsAdesa = transferenciaActual.origen_es_adesa === true;
    const destinoEsAdesa = transferenciaActual.destino_es_adesa === true;
    let asignaciones_origen = origenEsAdesa ? (prod.asignaciones_origen || []) : [];
    let asignaciones_destino = destinoEsAdesa ? (prod.asignaciones_destino || []) : [];
    let validacion;
    if (destinoEsAdesa) {
        validacion = validarSumatoriaDestino(sku);
    } else {
        const sumaOrigen = calcularSumaAsignacionesOrigen(sku);
        const estadoProd = estadoTransferenciaCache[sku] || {};
        const restante = estadoProd.cantidad_restante !== undefined ? estadoProd.cantidad_restante : prod.cantidad_total;
        if (sumaOrigen <= 0) {
            validacion = { valido: false, mensaje: 'Indica al menos una cantidad a registrar' };
        } else if (sumaOrigen > restante) {
            validacion = { valido: false, mensaje: 'La suma excede lo restante (' + restante.toFixed(2) + ')' };
        } else {
            validacion = { valido: true, suma: sumaOrigen };
        }
    }
    if (!destinoEsAdesa && validacion.valido && validacion.suma > 0) {
        asignaciones_destino = [{ ubicacion: (transferenciaActual.destino_nombre || '').substring(0, 200), cantidad: validacion.suma }];
    }
    if (!origenEsAdesa && validacion.valido && validacion.suma > 0) {
        asignaciones_origen = [{ ubicacion: (transferenciaActual.origen_nombre || '').substring(0, 200), cantidad: validacion.suma }];
    }
    if (!validacion.valido) {
        mostrarMensaje('error', validacion.mensaje);
        return;
    }
    if (origenEsAdesa) {
        for (const a of asignaciones_origen) {
            if (!a.ubicacion || a.ubicacion.trim() === '') {
                mostrarMensaje('error', `El producto ${sku} necesita ubicación de origen`);
                return;
            }
        }
    }
    if (destinoEsAdesa) {
        for (const a of asignaciones_destino) {
            if (!a.ubicacion || a.ubicacion.trim() === '') {
                mostrarMensaje('error', `El producto ${sku} necesita ubicación de destino`);
                return;
            }
        }
    }
    const btn = document.getElementById('btn-registrar-' + skuToSafeId(sku));
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/transferencias/registrar-linea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transferencia_guid: transferenciaActual.guid,
                sku: sku,
                asignaciones_origen: asignaciones_origen,
                asignaciones_destino: asignaciones_destino
            })
        });
        const data = await res.json();
        if (data.success) {
            mostrarMensaje('success', data.message || 'Línea registrada');
            transferenciaActual.estado_procesamiento = data.estado_transferencia;
            const estadoData = await obtenerEstadoTransferencia(transferenciaActual.guid);
            estadoTransferenciaCache = {};
            if (estadoData && estadoData.productos) {
                estadoData.productos.forEach(p => {
                    estadoTransferenciaCache[(p.sku || '').toUpperCase()] = {
                        cantidad_asignada: p.cantidad_asignada,
                        cantidad_restante: p.cantidad_restante,
                        completo: p.completo,
                        asignaciones_registradas: p.asignaciones_registradas || []
                    };
                });
            }
            const restante = data.cantidad_restante ?? 0;
            prod.asignaciones_origen = restante > 0 && origenEsAdesa ? [{ ubicacion: '', cantidad: restante }] : [];
            prod.asignaciones_destino = restante > 0 && destinoEsAdesa ? [{ ubicacion: '', cantidad: restante }] : [];
            const estadoEl = document.getElementById('transferencia-estado');
            if (estadoEl) {
                const est = data.estado_transferencia || 'PENDIENTE';
                estadoEl.textContent = est.replace('_', ' ');
                estadoEl.className = 'estado-badge estado-' + est.toLowerCase().replace('_', '-');
            }
            if (data.estado_transferencia === 'PROCESADA') {
                const rev = document.getElementById('btn-revertir-transferencia');
                if (rev && usuarioRol === 'administrador') rev.style.display = 'inline-block';
            }
            mostrarProductos(transferenciaActual.productos || [], transferenciaActual);
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar línea');
            if (btn) btn.disabled = false;
        }
    } catch (e) {
        mostrarMensaje('error', 'Error de conexión');
        if (btn) btn.disabled = false;
    }
}

async function refrescarTransferencia() {
    if (!transferenciaActual) return;
    const btn = document.getElementById('btn-refrescar-transferencia');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`/api/transferencias/transferencia/${transferenciaActual.guid}/refrescar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success && data.transferencia) {
            const t = data.transferencia;
            transferenciaActual = { ...transferenciaActual, ...t, productos: t.productos || transferenciaActual.productos };
            const estadoData = await obtenerEstadoTransferencia(transferenciaActual.guid);
            estadoTransferenciaCache = {};
            if (estadoData && estadoData.productos) {
                estadoData.productos.forEach(p => {
                    estadoTransferenciaCache[(p.sku || '').toUpperCase()] = {
                        cantidad_asignada: p.cantidad_asignada,
                        cantidad_restante: p.cantidad_restante,
                        completo: p.completo,
                        asignaciones_registradas: p.asignaciones_registradas || []
                    };
                });
            }
            mostrarProductos(transferenciaActual.productos || [], transferenciaActual);
            const estadoEl = document.getElementById('transferencia-estado');
            if (estadoEl) {
                const est = transferenciaActual.estado_procesamiento || 'PENDIENTE';
                estadoEl.textContent = est.replace('_', ' ');
                estadoEl.className = 'estado-badge estado-' + est.toLowerCase().replace('_', '-');
            }
            mostrarMensaje('success', 'Datos actualizados desde ADM');
        } else {
            mostrarMensaje('error', data.error || 'Error al refrescar');
        }
    } catch (e) {
        mostrarMensaje('error', 'Error de conexión');
    }
    if (btn) btn.disabled = false;
}

async function registrarTransferencia() {
    if (!transferenciaActual) {
        mostrarMensaje('error', 'No hay transferencia para registrar');
        return;
    }

    const origenEsAdesa = transferenciaActual && transferenciaActual.origen_es_adesa === true;
    const destinoEsAdesa = transferenciaActual && transferenciaActual.destino_es_adesa === true;

    for (const sku in productosAsignados) {
        const asignacion = productosAsignados[sku];
        
        if (origenEsAdesa) {
            if (!asignacion.asignaciones_origen || asignacion.asignaciones_origen.length === 0) {
                mostrarMensaje('error', `El producto ${sku} necesita una ubicación física de origen`);
                return;
            }
            for (const asig of asignacion.asignaciones_origen) {
                if (!asig.ubicacion || asig.ubicacion.trim() === '') {
                    mostrarMensaje('error', `El producto ${sku} necesita una ubicación física de origen`);
                    return;
                }
            }
        }
        
        if (destinoEsAdesa) {
            if (!asignacion.asignaciones_destino || asignacion.asignaciones_destino.length === 0) {
                mostrarMensaje('error', `El producto ${sku} necesita al menos una ubicación física de destino`);
                return;
            }
            for (const asig of asignacion.asignaciones_destino) {
                if (!asig.ubicacion || asig.ubicacion.trim() === '') {
                    mostrarMensaje('error', `El producto ${sku} necesita una ubicación física de destino`);
                    return;
                }
            }
            
            const validacion = validarSumatoriaDestino(sku);
            if (!validacion.valido) {
                mostrarMensaje('error', validacion.mensaje);
                return;
            }
        }
    }

    const productos = [];
    for (const sku in productosAsignados) {
        const asignacion = productosAsignados[sku];
        productos.push({
            sku: sku,
            item_id: asignacion.item_id,
            cantidad_total: asignacion.cantidad_total,
            asignaciones_origen: origenEsAdesa ? asignacion.asignaciones_origen : [],
            asignaciones_destino: destinoEsAdesa ? asignacion.asignaciones_destino : []
        });
    }

    try {
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
                productos: productos
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', data.message || 'Transferencia registrada exitosamente');
            await cargarDetallesTransferencia(transferenciaActual.guid);
        } else {
            if (data.solucion_sugerida) {
                mostrarErrorConSolucion(
                    data.error || 'Error al registrar transferencia',
                    data.advertencia || '',
                    data.solucion_sugerida
                );
                if (data.sku_afectado) {
                    const card = document.getElementById('producto-' + skuToSafeId(data.sku_afectado));
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        card.style.borderColor = '#dc3545';
                        card.style.boxShadow = '0 0 0 2px rgba(220, 53, 69, 0.5)';
                        setTimeout(() => {
                            card.style.borderColor = '';
                            card.style.boxShadow = '';
                        }, 5000);
                    }
                }
            } else {
                mostrarMensaje('error', data.error || data.advertencia || 'Error al registrar transferencia');
                if (data.sku_afectado) {
                    const card = document.getElementById('producto-' + skuToSafeId(data.sku_afectado));
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        card.style.borderColor = '#dc3545';
                        card.style.boxShadow = '0 0 0 2px rgba(220, 53, 69, 0.5)';
                        setTimeout(() => {
                            card.style.borderColor = '';
                            card.style.boxShadow = '';
                        }, 5000);
                    }
                }
            }
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al registrar transferencia');
    }
}

async function revertirTransferencia() {
    if (!transferenciaActual) {
        mostrarMensaje('error', 'No hay transferencia para revertir');
        return;
    }

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
        const response = await fetch(`/api/transferencias/${transferenciaActual.guid}/revertir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', data.message);
            await cargarDetallesTransferencia(transferenciaActual.guid);
        } else {
            mostrarMensaje('error', data.error || 'Error al revertir transferencia');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al revertir transferencia');
    }
}

// Inicializar
verificarAutenticacion();
obtenerRolUsuario();
