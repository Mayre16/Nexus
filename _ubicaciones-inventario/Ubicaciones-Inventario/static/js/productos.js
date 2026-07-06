let tipoBusqueda = 'sku';

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

function seleccionarTipoBusqueda(tipo) {
    tipoBusqueda = tipo;
    document.querySelectorAll('.btn-search-type').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-type="${tipo}"]`).classList.add('active');
    document.getElementById('busqueda-input').placeholder = 
        tipo === 'sku' ? 'Ingresa SKU del producto' :
        tipo === 'nombre' ? 'Ingresa nombre del producto' :
        'Ingresa código de barras';
}

async function buscarProducto() {
    const busqueda = document.getElementById('busqueda-input').value.trim();
    
    if (!busqueda) {
        mostrarMensaje('error', 'Ingresa un término de búsqueda');
        return;
    }

    try {
        const response = await fetch('/api/productos/buscar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                busqueda: busqueda,
                tipo: tipoBusqueda
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarProducto(data);
            mostrarMensaje('success', 'Producto encontrado');
        } else {
            mostrarMensaje('error', data.error || 'Producto no encontrado');
            ocultarProducto();
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

function mostrarProducto(data) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('producto-container').style.display = 'block';

    const producto = data.producto;
    const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
    const nombre = producto.Name || 'Sin nombre';
    const productId = producto.ID || '';

    const codigoBarras = producto.Barcode || producto.BarcodeValue || null;
    let codigoBarrasHTML = '';
    if (codigoBarras) {
        codigoBarrasHTML = `<p><strong>Código de Barras:</strong> ${codigoBarras}</p>`;
    } else {
        codigoBarrasHTML = `<p><strong>Código de Barras:</strong> <span style="color: #999; font-style: italic;">No disponible</span></p>`;
    }
    
    const activo = producto.activo !== false;
    const badgeEstado = activo ? '' : '<span style="background: #f44336; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 10px;">INACTIVO EN ADM</span>';
    
    document.getElementById('producto-info').innerHTML = `
        <h3>${nombre}${badgeEstado}</h3>
        <p><strong>SKU:</strong> ${sku}</p>
        <p><strong>ID:</strong> ${productId}</p>
        ${codigoBarrasHTML}
    `;

    const ubicacionesAdmList = document.getElementById('ubicaciones-adm-list');
    
    const stockAdesa = parseFloat(data.stock_adesa || 0);
    let htmlContent = '';
    
    if (stockAdesa > 0) {
        const adesaUbicacion = data.ubicaciones_adm.find(u => u.nombre.toUpperCase() === "ADESA");
        const fechaAdesa = adesaUbicacion && adesaUbicacion.updated_at ? 
            new Date(adesaUbicacion.updated_at + (adesaUbicacion.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleString('es-DO', { 
                timeZone: 'America/Santo_Domingo',
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) : 'N/A';
        htmlContent += `
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4caf50;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                    <div style="flex: 1 1 auto; min-width: 0;">
                        <strong style="color: #2e7d32; font-size: 16px;">📦 En mano (ADESA):</strong>
                        <span style="color: #2e7d32; font-size: 24px; font-weight: 600; margin-left: 10px;">${stockAdesa.toFixed(2)}</span>
                        <div style="color: #666; font-size: 12px; margin-top: 5px;">Actualizado: ${fechaAdesa}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (data.ubicaciones_adm && data.ubicaciones_adm.length > 0) {
        htmlContent += data.ubicaciones_adm.map(u => {
            const stock = parseFloat(u.stock || 0);
            const esADESA = u.nombre.toUpperCase() === "ADESA";
            if (esADESA && stockAdesa > 0) {
                return '';
            }
            const nombreDisplay = esADESA ? "En mano (ADESA)" : u.nombre;
            const itemClass = esADESA ? 'ubicacion-item adesa-item' : 'ubicacion-item';
            
            const fecha = u.updated_at ? new Date(u.updated_at + (u.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleString('es-DO', { 
                timeZone: 'America/Santo_Domingo',
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) : 'N/A';
            return `
                <div class="${itemClass}">
                    <div>
                        <div class="ubicacion-codigo">${nombreDisplay}</div>
                        <div class="updated">Actualizado: ${fecha}</div>
                    </div>
                    <div class="cantidad">${stock.toFixed(2)}</div>
                </div>
            `;
        }).filter(html => html !== '').join('');
    }
    
    if (htmlContent) {
        ubicacionesAdmList.innerHTML = htmlContent;
    } else {
        ubicacionesAdmList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Este producto no tiene stock en ninguna ubicación ADM Cloud.</p>';
    }

    document.getElementById('stock-total-adm-valor').textContent = 
        parseFloat(data.stock_total_adm || 0).toFixed(2);

    const ubicacionesList = document.getElementById('ubicaciones-fisicas-list');
    if (data.ubicaciones_fisicas && data.ubicaciones_fisicas.length > 0) {
        ubicacionesList.innerHTML = data.ubicaciones_fisicas.map(u => {
            const fecha = u.updated_at ? new Date(u.updated_at + (u.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleString('es-DO', { 
                timeZone: 'America/Santo_Domingo',
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) : 'N/A';
            return `
                <div class="ubicacion-item">
                    <div>
                        <div class="ubicacion-codigo">${u.ubicacion}</div>
                        <div class="updated">Actualizado: ${fecha}</div>
                    </div>
                    <div class="cantidad">${parseFloat(u.cantidad).toFixed(2)}</div>
                </div>
            `;
        }).join('');
    } else {
        ubicacionesList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No hay stock registrado en ubicaciones físicas</p>';
    }

    document.getElementById('stock-total-valor').textContent = 
        parseFloat(data.stock_total_wms || 0).toFixed(2);
    
    if (data.discrepancias && data.discrepancias.length > 0) {
        mostrarDiscrepancias(data.discrepancias);
    }
}

function mostrarDiscrepancias(discrepancias) {
    let discrepanciasSection = document.getElementById('discrepancias-section');
    if (!discrepanciasSection) {
        discrepanciasSection = document.createElement('div');
        discrepanciasSection.id = 'discrepancias-section';
        discrepanciasSection.className = 'card';
        discrepanciasSection.style.marginTop = '20px';
        discrepanciasSection.innerHTML = '<h2 style="color: #c62828; margin-bottom: 15px;">⚠️ Discrepancias Críticas Detectadas</h2><div id="discrepancias-list"></div>';
        document.getElementById('producto-container').appendChild(discrepanciasSection);
    }
    
    const discrepanciasList = document.getElementById('discrepancias-list');
    discrepanciasList.innerHTML = discrepancias.map(d => {
        return `
            <div style="background: #ffebee; border-left: 4px solid #c62828; padding: 15px; border-radius: 5px; margin-bottom: 10px;">
                <div style="font-weight: 600; color: #c62828; margin-bottom: 8px;">
                    ⚠️ DISCREPANCIA CRÍTICA - Pendiente Revisión
                </div>
                <div style="color: #555; font-size: 14px; margin: 5px 0;">
                    <strong>Ubicación ADM:</strong> ${d.location_name || 'N/A'}
                </div>
                <div style="color: #555; font-size: 14px; margin: 5px 0;">
                    <strong>Stock ERP (ADM):</strong> <span style="color: #c62828; font-weight: 600;">${d.stock_erp.toFixed(2)}</span>
                </div>
                <div style="color: #555; font-size: 14px; margin: 5px 0;">
                    <strong>Stock Físico (WMS):</strong> <span style="color: #2e7d32; font-weight: 600;">${d.stock_fisico_wms.toFixed(2)}</span>
                </div>
                ${d.ubicacion_fisica ? `
                <div style="color: #555; font-size: 14px; margin: 5px 0;">
                    <strong>Ubicación Física:</strong> ${d.ubicacion_fisica}
                </div>
                ` : ''}
                ${d.fecha_deteccion ? `
                <div style="color: #999; font-size: 12px; margin-top: 8px;">
                    Detectada: ${new Date(d.fecha_deteccion).toLocaleString('es-DO')}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function ocultarProducto() {
    document.getElementById('producto-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

// Permitir búsqueda con Enter
document.getElementById('busqueda-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        buscarProducto();
    }
});

/** Escaneo con cámara (requiere HTTPS en producción; ver wms-barcode.js) */
function abrirEscanerBusquedaProducto() {
    if (typeof WmsBarcode === 'undefined' || !WmsBarcode.open) {
        mostrarMensaje('error', 'El escáner no está disponible. Recarga la página.');
        return;
    }
    WmsBarcode.open({
        inputId: 'busqueda-input',
        title: 'Escanear código',
        intro: 'Tras leer el código se buscará automáticamente como código de barras.',
        onResult: function () {
            seleccionarTipoBusqueda('codigo_barras');
            buscarProducto();
        }
    });
}

verificarAutenticacion();
