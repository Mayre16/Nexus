let productoActual = null;
let tipoBusqueda = 'sku';
let modoEdicion = false;
let ubicacionesADMDisponibles = [];
let contadorUbicacionesFisicas = 0;

// Cargar detalles completos de un ajuste
async function cargarDetallesAjuste(id) {
    try {
        const response = await fetch(`/api/detalles/ajuste/${id}`);
        const data = await response.json();
        
        if (data.success) {
            mostrarDetallesAjuste(data.ajuste);
        } else {
            mostrarMensaje('error', data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

// Mostrar detalles completos de ajuste (vista de auditoría)
function mostrarDetallesAjuste(ajuste) {
    const container = document.querySelector('.container');
    
    const searchSection = document.querySelector('.search-section');
    if (searchSection) {
        searchSection.style.display = 'none';
    }
    
    let detallesDiv = document.getElementById('ajuste-detalles');
    if (!detallesDiv) {
        detallesDiv = document.createElement('div');
        detallesDiv.id = 'ajuste-detalles';
        detallesDiv.className = 'card';
        detallesDiv.style.display = 'block';
        container.appendChild(detallesDiv);
    } else {
        detallesDiv.style.display = 'block';
    }
    
    let infoHtml = `
        <h2>Ajuste de Inventario - Auditoría</h2>
        <div style="margin-bottom: 20px;">
            <div><strong>Fecha:</strong> ${new Date(ajuste.fecha).toLocaleString('es-DO')}</div>
            <div><strong>Ubicación:</strong> ${ajuste.ubicacion}</div>
            ${ajuste.usuario ? `<div><strong>Procesado por:</strong> ${ajuste.usuario.nombre}</div>` : ''}
            ${ajuste.notas ? `<div><strong>Notas:</strong> ${ajuste.notas}</div>` : ''}
        </div>
        <h3>Productos Ajustados (${ajuste.total_productos})</h3>
        <div style="margin-top: 15px;">
    `;
    
    if (ajuste.productos && ajuste.productos.length > 0) {
        infoHtml += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
        infoHtml += '<thead><tr style="background: #f8f9fa;"><th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">SKU</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Cantidad</th></tr></thead>';
        infoHtml += '<tbody>';
        ajuste.productos.forEach(prod => {
            infoHtml += `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${prod.sku}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${prod.cantidad.toFixed(2)}</td>
            </tr>`;
        });
        infoHtml += '</tbody></table>';
    } else {
        infoHtml += '<p style="color: #999; text-align: center; padding: 20px;">No hay productos en este ajuste</p>';
    }
    
    infoHtml += '</div>';
    detallesDiv.innerHTML = infoHtml;
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

/** Escaneo con cámara (requiere HTTPS en producción; ver wms-barcode.js) */
function abrirEscanerBusquedaAjuste() {
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

async function buscarProducto() {
    const busqueda = document.getElementById('busqueda-input').value.trim();
    
    if (!busqueda) {
        mostrarMensaje('error', 'Ingresa un término de búsqueda');
        return;
    }

    try {
        const response = await fetch('/api/ajustes/buscar-producto', {
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
            productoActual = data.producto;
            mostrarProducto(
                data.producto, 
                data.stock_ubicaciones || [],
                data.stock_adm || null
            );
            mostrarMensaje('success', 'Producto encontrado');
        } else {
            mostrarMensaje('error', data.error || 'Producto no encontrado');
            ocultarProducto();
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    }
}

async function mostrarProducto(producto, stockUbicaciones, stockAdm) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('producto-info-container').style.display = 'block';

    const sku = (producto.SKU || producto.ItemSKU || '').toUpperCase();
    const nombre = producto.Name || 'Sin nombre';
    const productId = producto.ID || '';

    window.stockUbicacionesActual = stockUbicaciones || [];

    let stockAdmHtml = '';
    if (stockAdm && stockAdm.total !== undefined) {
        const stockTotal = parseFloat(stockAdm.total || 0).toFixed(2);
        const fechaActualizacion = stockAdm.fecha_actualizacion ? 
            new Date(stockAdm.fecha_actualizacion).toLocaleString('es-DO', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'No disponible';
        
        stockAdmHtml = `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #2196f3;">
                <h4 style="margin: 0 0 10px 0; color: #1976d2;">📦 Stock en Base de Datos (Cache ADM)</h4>
                <p style="margin: 5px 0; font-size: 16px;">
                    <strong>Cantidad Total:</strong> 
                    <span style="color: #1976d2; font-weight: bold; font-size: 18px;">${stockTotal}</span>
                </p>
                <p style="margin: 5px 0; font-size: 14px; color: #666;">
                    <strong>Última Actualización:</strong> ${fechaActualizacion}
                </p>
                ${stockAdm.ubicaciones && stockAdm.ubicaciones.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong style="font-size: 13px; color: #555;">Distribución por Ubicación ADM:</strong>
                        <ul style="margin: 5px 0; padding-left: 20px; font-size: 13px;">
                            ${stockAdm.ubicaciones.map(u => `
                                <li>${u.nombre}: <strong>${parseFloat(u.stock || 0).toFixed(2)}</strong></li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        stockAdmHtml = `
            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #856404;">
                    <strong>⚠️ Stock ADM:</strong> No hay información de stock en la base de datos cacheada.
                    <br><small>Sincroniza los productos desde el Panel de Administración para actualizar el stock.</small>
                </p>
            </div>
        `;
    }

    document.getElementById('producto-info').innerHTML = `
        <h4>${nombre}</h4>
        <p><strong>SKU:</strong> ${sku}</p>
        <p><strong>ID:</strong> ${productId}</p>
        ${stockAdmHtml}
    `;

    const stockList = document.getElementById('stock-ubicaciones-list');
    const stockUbicacionesConStock = stockUbicaciones.filter(s => parseFloat(s.cantidad) > 0);
    if (stockUbicacionesConStock.length > 0) {
        stockList.innerHTML = stockUbicacionesConStock.map(s => `
            <div class="ubicacion-item">
                <span>${s.ubicacion}</span>
                <span class="cantidad">${parseFloat(s.cantidad).toFixed(2)}</span>
            </div>
        `).join('');
    } else {
        stockList.innerHTML = '<p style="color: #999;">No hay stock registrado en ubicaciones físicas</p>';
    }
    
    await cargarUbicacionesADM();
}

async function cargarUbicacionesADM() {
    try {
        const response = await fetch('/api/ajustes/ubicaciones-adm');
        const data = await response.json();
        
        if (data.success) {
            ubicacionesADMDisponibles = data.ubicaciones || [];
            mostrarUbicacionesADM();
        } else {
            document.getElementById('ubicaciones-adm-list').innerHTML = 
                '<p style="color: #dc3545;">Error al cargar ubicaciones ADM</p>';
        }
    } catch (error) {
        document.getElementById('ubicaciones-adm-list').innerHTML = 
            '<p style="color: #dc3545;">Error de conexión al cargar ubicaciones</p>';
    }
}

let ubicacionesADMSeleccionadas = [];

function mostrarUbicacionesADM() {
    const selector = document.getElementById('selector-ubicacion-adm');
    
    if (ubicacionesADMDisponibles.length === 0) {
        selector.innerHTML = '<option value="">No hay ubicaciones ADM disponibles. Sincroniza los productos primero.</option>';
        return;
    }
    
    const ubicacionesDisponibles = ubicacionesADMDisponibles.filter(ubic => 
        !ubicacionesADMSeleccionadas.some(sel => sel.location_id === ubic.location_id)
    );
    
    selector.innerHTML = '<option value="">-- Selecciona una ubicación ADM --</option>';
    ubicacionesDisponibles.forEach(ubic => {
        const option = document.createElement('option');
        option.value = ubic.location_id;
        option.textContent = `${ubic.location_name} ${ubic.es_adesa ? '🏢' : ''}`;
        option.dataset.locationId = ubic.location_id;
        option.dataset.locationName = ubic.location_name;
        option.dataset.esAdesa = ubic.es_adesa ? 'true' : 'false';
        selector.appendChild(option);
    });
}

function agregarUbicacionADM() {
    const selector = document.getElementById('selector-ubicacion-adm');
    const selectedOption = selector.options[selector.selectedIndex];
    
    if (!selectedOption || !selectedOption.value) {
        return;
    }
    
    const locationId = selectedOption.dataset.locationId;
    const locationName = selectedOption.dataset.locationName;
    const esAdesa = selectedOption.dataset.esAdesa === 'true' || selectedOption.dataset.esAdesa === true;
    
    if (ubicacionesADMSeleccionadas.some(u => u.location_id === locationId)) {
        selector.value = '';
        return;
    }
    
    const nuevaUbicacion = {
        location_id: locationId,
        location_name: locationName,
        es_adesa: esAdesa,
        cantidad: 0
    };
    ubicacionesADMSeleccionadas.push(nuevaUbicacion);
    
    mostrarListaUbicacionesADM();
    
    if (esAdesa) {
        const containerFisicas = document.getElementById('ubicaciones-fisicas-container');
        containerFisicas.style.display = 'block';
        
        const listaFisicas = document.getElementById('ubicaciones-fisicas-list');
        if (listaFisicas.children.length === 0) {
            const stockUbicaciones = window.stockUbicacionesActual || [];
            
            if (stockUbicaciones.length > 0) {
                stockUbicaciones.forEach(stock => {
                    if (parseFloat(stock.cantidad || 0) > 0) {
                        agregarUbicacionFisicaConValores(stock.ubicacion, stock.cantidad);
                    }
                });
            }
            
            if (listaFisicas.children.length === 0) {
                agregarUbicacionFisica();
            }
        }
        
        setTimeout(() => validarAdesa(), 100);
    }
    
    selector.value = '';
    mostrarUbicacionesADM();
}

function mostrarListaUbicacionesADM() {
    const container = document.getElementById('ubicaciones-adm-seleccionadas');
    
    if (ubicacionesADMSeleccionadas.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = ubicacionesADMSeleccionadas.map((ubic, index) => `
        <div class="ubicacion-adm-seleccionada" 
             data-location-id="${ubic.location_id}"
             style="background: white; padding: 15px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
            <span style="flex: 1; font-weight: 600; color: #495057;">
                ✅ ${ubic.location_name} ${ubic.es_adesa ? '🏢' : ''}
            </span>
            <input type="number" 
                   class="cantidad-adm-input"
                   data-location-id="${ubic.location_id}"
                   step="0.01" 
                   min="0" 
                   placeholder="Cantidad"
                   value="${ubic.cantidad}"
                   onchange="actualizarCantidadADM('${ubic.location_id}', this.value)"
                   oninput="validarAdesa()"
                   style="width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            <button type="button" 
                    onclick="eliminarUbicacionADM('${ubic.location_id}')"
                    style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 14px;">
                🗑️
            </button>
        </div>
    `).join('');
    
    validarAdesa();
}

function actualizarCantidadADM(locationId, cantidad) {
    const ubicacion = ubicacionesADMSeleccionadas.find(u => u.location_id === locationId);
    if (ubicacion) {
        ubicacion.cantidad = parseFloat(cantidad) || 0;
    }
}

function eliminarUbicacionADM(locationId) {
    ubicacionesADMSeleccionadas = ubicacionesADMSeleccionadas.filter(u => u.location_id !== locationId);
    mostrarListaUbicacionesADM();
    mostrarUbicacionesADM();
    
    const hayAdesa = ubicacionesADMSeleccionadas.some(u => u.es_adesa);
    if (!hayAdesa) {
        document.getElementById('ubicaciones-fisicas-container').style.display = 'none';
        document.getElementById('ubicaciones-fisicas-list').innerHTML = '';
        contadorUbicacionesFisicas = 0;
        const errorDiv = document.getElementById('error-validacion-adesa');
        if (errorDiv) errorDiv.style.display = 'none';
    } else {
        setTimeout(() => validarAdesa(), 100);
    }
}

function validarAdesa() {
    const errorDiv = document.getElementById('error-validacion-adesa');
    const mensajeDiv = document.getElementById('mensaje-error-validacion');
    const btnSubmit = document.querySelector('#ajuste-form button[type="submit"]');
    
    const adesa = ubicacionesADMSeleccionadas.find(u => u.es_adesa);
    
    if (!adesa) {
        errorDiv.style.display = 'none';
        if (btnSubmit) btnSubmit.disabled = false;
        return;
    }
    
    const cantidadAdesa = parseFloat(adesa.cantidad) || 0;
    
    const ubicacionesFisicasInputs = document.querySelectorAll('.ubicacion-fisica-input');
    const cantidadesFisicasInputs = document.querySelectorAll('.cantidad-fisica-input');
    
    let sumaFisicas = 0;
    const ubicacionesFisicas = [];
    const ubicacionesAjustadas = [];
    
    for (let i = 0; i < ubicacionesFisicasInputs.length; i++) {
        const ubicacion = ubicacionesFisicasInputs[i].value.trim().toUpperCase();
        const cantidad = parseFloat(cantidadesFisicasInputs[i].value) || 0;
        
        if (ubicacion) {
            ubicacionesAjustadas.push(ubicacion);
            
            if (cantidad > 0) {
                sumaFisicas += cantidad;
                ubicacionesFisicas.push({ ubicacion, cantidad });
            }
        }
    }
    
    const stockUbicaciones = window.stockUbicacionesActual || [];
    const ubicacionesConStockNoAjustadas = stockUbicaciones.filter(s => {
        const ubicacion = s.ubicacion.toUpperCase();
        const tieneStock = parseFloat(s.cantidad || 0) > 0;
        return tieneStock && !ubicacionesAjustadas.includes(ubicacion);
    });
    
    if (Math.abs(sumaFisicas - cantidadAdesa) > 0.01) {
        let mensaje = `<strong>❌ La suma de ubicaciones físicas (${sumaFisicas.toFixed(2)}) no coincide con la cantidad de ADESA (${cantidadAdesa.toFixed(2)}).</strong> `;
        const diferencia = cantidadAdesa - sumaFisicas;
        mensaje += `Diferencia: <strong style="color: ${diferencia > 0 ? '#28a745' : '#dc3545'};">${diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)}</strong>. `;
        
        if (ubicacionesConStockNoAjustadas.length > 0) {
            mensaje += `<br><br><strong>⚠️ Ubicaciones físicas con existencia que NO estás ajustando:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
            ubicacionesConStockNoAjustadas.forEach(u => {
                mensaje += `<li><strong>${u.ubicacion}</strong> tiene <strong style="color: #dc3545;">${parseFloat(u.cantidad || 0).toFixed(2)}</strong> unidades</li>`;
            });
            mensaje += `</ul>`;
            mensaje += `<br><small>💡 <strong>Debes incluir estas ubicaciones en el ajuste.</strong> La suma de todas las ubicaciones físicas debe ser exactamente ${cantidadAdesa.toFixed(2)}.</small>`;
        } else {
            mensaje += `<br><small>💡 Verifica que la suma de todas las ubicaciones físicas sea exactamente ${cantidadAdesa.toFixed(2)}.</small>`;
        }
        
        mensajeDiv.innerHTML = mensaje;
        errorDiv.style.display = 'block';
        if (btnSubmit) btnSubmit.disabled = true;
    } else if (ubicacionesConStockNoAjustadas.length > 0) {
        let mensaje = `<strong>⚠️ No puedes completar el ajuste porque tienes ubicaciones físicas con existencia que NO estás ajustando:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
        ubicacionesConStockNoAjustadas.forEach(u => {
            mensaje += `<li><strong>${u.ubicacion}</strong> tiene <strong style="color: #dc3545;">${parseFloat(u.cantidad || 0).toFixed(2)}</strong> unidades</li>`;
        });
        mensaje += `</ul>`;
        mensaje += `<br><small>💡 <strong>Debes ajustar TODAS las ubicaciones físicas que tienen stock.</strong> La suma de todas las ubicaciones físicas debe coincidir exactamente con la cantidad de ADESA (${cantidadAdesa.toFixed(2)}).</small>`;
        mensaje += `<br><small>📝 <strong>Ejemplo:</strong> Si ADESA tiene ${cantidadAdesa.toFixed(2)} y ya existe ${ubicacionesConStockNoAjustadas[0].ubicacion} con ${parseFloat(ubicacionesConStockNoAjustadas[0].cantidad || 0).toFixed(2)}, debes incluir esa ubicación en el ajuste.</small>`;
        
        mensajeDiv.innerHTML = mensaje;
        errorDiv.style.display = 'block';
        if (btnSubmit) btnSubmit.disabled = true;
    } else {
        errorDiv.style.display = 'none';
        if (btnSubmit) btnSubmit.disabled = false;
    }
}

function agregarUbicacionFisica(ubicacion = '', cantidad = 0) {
    contadorUbicacionesFisicas++;
    const container = document.getElementById('ubicaciones-fisicas-list');
    
    const ubicacionDiv = document.createElement('div');
    ubicacionDiv.className = 'ubicacion-fisica-item';
    ubicacionDiv.id = `ubic-fisica-item-${contadorUbicacionesFisicas}`;
    ubicacionDiv.style.cssText = 'background: white; padding: 15px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #dee2e6;';
    
    ubicacionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #495057; font-size: 14px; flex: 1 1 auto; min-width: 0;">Ubicación Física ${contadorUbicacionesFisicas}</h4>
            <button type="button" onclick="eliminarUbicacionFisica(${contadorUbicacionesFisicas})" 
                    style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                🗑️ Eliminar
            </button>
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
            <label for="ubic-fisica-${contadorUbicacionesFisicas}" style="font-size: 13px;">Ubicación Física</label>
            <div class="wms-input-with-scan">
                <input type="text"
                       id="ubic-fisica-${contadorUbicacionesFisicas}"
                       class="wms-input ubicacion-fisica-input"
                       placeholder="Ej: 2P1D01N1 o 2-P1-AD-N1"
                       value="${ubicacion}"
                       oninput="validarAdesa()"
                       autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                       required>
                <button type="button" class="wms-btn wms-btn-secondary wms-btn-scan"
                        onclick="abrirEscanerUbicacion('ubic-fisica-${contadorUbicacionesFisicas}')"
                        title="Escanear ubicación">📷</button>
            </div>
            <small style="color: #666; font-size: 12px;">
                Formato: Piso-Pasillo-Anaquel-Nivel (ej: 2-P1-AD-N1)
            </small>
        </div>
        <div class="form-group">
            <label for="cant-fisica-${contadorUbicacionesFisicas}" style="font-size: 13px;">Cantidad</label>
            <input type="number" 
                   id="cant-fisica-${contadorUbicacionesFisicas}" 
                   class="cantidad-fisica-input"
                   step="0.01" 
                   min="0" 
                   placeholder="0.00"
                   value="${cantidad}"
                   oninput="validarAdesa()"
                   required>
        </div>
    `;
    
    container.appendChild(ubicacionDiv);
}

function agregarUbicacionFisicaConValores(ubicacion, cantidad) {
    agregarUbicacionFisica(ubicacion, cantidad);
}

function eliminarUbicacionFisica(id) {
    const ubicacion = document.getElementById(`ubic-fisica-item-${id}`);
    if (ubicacion) {
        ubicacion.remove();
    }
}

function ocultarProducto() {
    document.getElementById('producto-info-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

async function registrarAjuste(event) {
    event.preventDefault();
    
    if (!productoActual) {
        mostrarMensaje('error', 'Primero busca un producto');
        return;
    }

    const sku = (productoActual.SKU || productoActual.ItemSKU || '').toUpperCase();
    const productId = productoActual.ID || '';

    if (ubicacionesADMSeleccionadas.length === 0) {
        mostrarMensaje('error', 'Selecciona al menos una ubicación ADM');
        return;
    }

    for (const ubicADM of ubicacionesADMSeleccionadas) {
        if (ubicADM.cantidad === undefined || ubicADM.cantidad === null || ubicADM.cantidad < 0) {
            mostrarMensaje('error', `La cantidad para ${ubicADM.location_name} es inválida`);
            return;
        }
    }

    const adesa = ubicacionesADMSeleccionadas.find(u => u.es_adesa);
    if (adesa) {
        validarAdesa();
        const errorDiv = document.getElementById('error-validacion-adesa');
        if (errorDiv.style.display === 'block') {
            mostrarMensaje('error', 'Corrige los errores de validación antes de continuar');
            return;
        }
        
        const ubicacionesFisicasInputs = document.querySelectorAll('.ubicacion-fisica-input');
        const cantidadesFisicasInputs = document.querySelectorAll('.cantidad-fisica-input');
        
        if (ubicacionesFisicasInputs.length === 0) {
            mostrarMensaje('error', 'ADESA requiere al menos una ubicación física');
            return;
        }
        
        for (let i = 0; i < ubicacionesFisicasInputs.length; i++) {
            const ubicacion = ubicacionesFisicasInputs[i].value.trim().toUpperCase();
            const cantidad = parseFloat(cantidadesFisicasInputs[i].value);
            
            if (!ubicacion) {
                mostrarMensaje('error', `La ubicación física ${i + 1} está vacía`);
                return;
            }
            
            if (isNaN(cantidad) || cantidad < 0) {
                mostrarMensaje('error', `La cantidad de la ubicación física ${i + 1} es inválida`);
                return;
            }
        }
    }

    const asignaciones = [];
    
    for (const ubicADM of ubicacionesADMSeleccionadas) {
        if (!ubicADM.es_adesa) {
            asignaciones.push({
                ubicacion_adm: ubicADM.location_name,
                location_id: ubicADM.location_id,
                cantidad: ubicADM.cantidad,
                tipo: 'adm'
            });
        }
    }
    
    if (adesa) {
        const ubicacionesFisicasInputs = document.querySelectorAll('.ubicacion-fisica-input');
        const cantidadesFisicasInputs = document.querySelectorAll('.cantidad-fisica-input');
        
        for (let i = 0; i < ubicacionesFisicasInputs.length; i++) {
            asignaciones.push({
                ubicacion: ubicacionesFisicasInputs[i].value.trim().toUpperCase(),
                cantidad: parseFloat(cantidadesFisicasInputs[i].value),
                tipo: 'fisica',
                location_id: adesa.location_id
            });
        }
    }

    const ubicacionesFisicas = asignaciones.filter(a => a.tipo === 'fisica').map(a => a.ubicacion);
    const ubicacionesFisicasUnicas = new Set(ubicacionesFisicas);
    if (ubicacionesFisicasUnicas.size !== ubicacionesFisicas.length) {
        mostrarMensaje('error', 'No puedes asignar el mismo producto a la misma ubicación física dos veces');
        return;
    }

    const notas = document.getElementById('notas-input').value.trim();

    const btnSubmit = event.target.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Registrando...';

    try {
        const response = await fetch('/api/ajustes/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                productos: [{
                    sku: sku,
                    item_id: productId,
                    asignaciones: asignaciones
                }],
                notas: notas
            })
        });

        const data = await response.json();

        if (data.success) {
            if (data.total_movimientos > 0) {
                mostrarMensaje('success', `Ajuste registrado exitosamente. ${data.total_movimientos} movimiento(s) creado(s)`);
            } else {
                mostrarMensaje('error', `⚠️ No se crearon movimientos. ${data.message || 'Verifica que haya diferencia entre el stock actual y el ajuste deseado.'}`);
            }
            ubicacionesADMSeleccionadas = [];
            mostrarListaUbicacionesADM();
            mostrarUbicacionesADM();
            document.getElementById('ubicaciones-fisicas-container').style.display = 'none';
            document.getElementById('ubicaciones-fisicas-list').innerHTML = '';
            contadorUbicacionesFisicas = 0;
            document.getElementById('notas-input').value = '';
            const errorDiv = document.getElementById('error-validacion-adesa');
            if (errorDiv) errorDiv.style.display = 'none';
            const busquedaInput = document.getElementById('busqueda-input');
            if (busquedaInput && busquedaInput.value.trim()) {
                await buscarProducto();
            }
        } else {
            mostrarMensaje('error', data.error || 'Error al registrar ajuste');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Registrar Ajuste';
    }
}

// Función para cargar detalles de un ajuste (segunda definición para uso desde historial)
async function cargarDetallesAjusteDesdeHistorial(ajusteId) {
    try {
        const response = await fetch(`/api/detalles/ajuste/${encodeURIComponent(ajusteId)}`);
        const data = await response.json();
        
        if (!data.success) {
            mostrarMensaje('error', data.error || 'Error al cargar detalles del ajuste');
            return;
        }
        
        const ajuste = data.ajuste;
        
        if (ajuste.productos && ajuste.productos.length > 0) {
            const primerProducto = ajuste.productos[0];
            const sku = primerProducto.sku;
            
            document.getElementById('busqueda-input').value = sku;
            await buscarProducto();
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (ajuste.es_ubicacion_fisica) {
                const ubicacionesFisicas = ajuste.productos.map(p => ({
                    ubicacion: ajuste.ubicacion,
                    cantidad: p.cantidad_nueva || p.cantidad_ajustada
                }));
                
                const adesa = ubicacionesADMDisponibles.find(u => u.es_adesa);
                if (adesa) {
                    agregarUbicacionADM(adesa.location_id);
                    const adesaSeleccionada = ubicacionesADMSeleccionadas.find(u => u.es_adesa);
                    if (adesaSeleccionada) {
                        adesaSeleccionada.cantidad = ubicacionesFisicas.reduce((sum, u) => sum + (u.cantidad || 0), 0);
                    }
                    
                    ubicacionesFisicas.forEach(uf => {
                        agregarUbicacionFisica();
                        const inputs = document.querySelectorAll('.ubicacion-fisica-input');
                        const cantidades = document.querySelectorAll('.cantidad-fisica-input');
                        if (inputs.length > 0 && cantidades.length > 0) {
                            inputs[inputs.length - 1].value = uf.ubicacion;
                            cantidades[cantidades.length - 1].value = uf.cantidad || 0;
                        }
                    });
                }
            } else {
                const ubicacionADM = ubicacionesADMDisponibles.find(u => 
                    u.location_name === ajuste.ubicacion || u.location_id === ajuste.ubicacion
                );
                if (ubicacionADM) {
                    agregarUbicacionADM(ubicacionADM.location_id);
                    const ubicacionSeleccionada = ubicacionesADMSeleccionadas.find(u => 
                        u.location_id === ubicacionADM.location_id
                    );
                    if (ubicacionSeleccionada) {
                        ubicacionSeleccionada.cantidad = ajuste.productos.reduce((sum, p) => 
                            sum + (p.cantidad_nueva || p.cantidad_ajustada || 0), 0
                        );
                    }
                }
            }
            
            if (ajuste.notas) {
                document.getElementById('notas-input').value = ajuste.notas;
            }
            
            mostrarUbicacionesADM();
        }
    } catch (error) {
        console.error('Error al cargar detalles:', error);
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

// Verificar si viene con parámetro id (desde historial)
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const timestamp = urlParams.get('timestamp');
    const ubicacion = urlParams.get('ubicacion');
    const editar = urlParams.get('editar');
    
    if (id || (timestamp && ubicacion)) {
        modoEdicion = editar === 'true';
        const searchSection = document.querySelector('.search-section');
        if (searchSection) {
            searchSection.style.display = 'none';
        }
        document.getElementById('empty-state').style.display = 'none';
        
        const ajusteId = id || `${timestamp}_${ubicacion}`;
        await cargarDetallesAjusteDesdeHistorial(ajusteId);
    }
    
    const busquedaInput = document.getElementById('busqueda-input');
    if (busquedaInput) {
        busquedaInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                buscarProducto();
            }
        });
    }
    
    verificarAutenticacion();
});
