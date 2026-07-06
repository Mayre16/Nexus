let ajusteActual = null;
let usuarioRol = null;

async function verificarAutenticacion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.success) {
            window.location.href = '/login';
            return;
        }

        usuarioRol = data.usuario.rol;
        document.getElementById('user-info').textContent = 
            `${data.usuario.nombre} (${data.usuario.rol})`;
        
        if (usuarioRol === 'administrador') {
            const container = document.getElementById('btn-revertir-container');
            if (container && ajusteActual) {
                container.style.display = 'block';
            }
        }
    } catch (error) {
        window.location.href = '/login';
    }
}

async function cargarDetallesAjuste(ajusteId) {
    try {
        const response = await fetch(`/api/detalles/ajuste/${encodeURIComponent(ajusteId)}`);
        const data = await response.json();
        
        if (!data.success) {
            mostrarMensaje('error', data.error || 'Error al cargar detalles del ajuste');
            return;
        }
        
        ajusteActual = data.ajuste;
        mostrarDetallesAjuste(data.ajuste);
    } catch (error) {
        console.error('Error al cargar detalles:', error);
        mostrarMensaje('error', 'Error de conexión al cargar detalles');
    }
}

function mostrarDetallesAjuste(ajuste) {
    document.getElementById('ajuste-info').style.display = 'block';
    
    const fecha = new Date(ajuste.fecha);
    document.getElementById('ajuste-numero').textContent = 
        `Ajuste - ${fecha.toLocaleDateString('es-DO')}`;
    document.getElementById('ajuste-fecha').textContent = 
        fecha.toLocaleString('es-DO');
    
    const icono = ajuste.es_ubicacion_fisica ? '📍' : '🏢';
    document.getElementById('ajuste-ubicacion').textContent = 
        `${icono} ${ajuste.ubicacion || 'N/A'}`;
    
    const tipoBadge = document.getElementById('ajuste-tipo-badge');
    if (ajuste.es_ubicacion_fisica) {
        tipoBadge.innerHTML = '<span class="tipo-badge fisico">📍 Físico</span>';
    } else {
        tipoBadge.innerHTML = '<span class="tipo-badge adm">🏢 ADM</span>';
    }
    
    if (ajuste.usuario) {
        document.getElementById('ajuste-usuario').textContent = ajuste.usuario.nombre;
    }
    
    document.getElementById('ajuste-total-productos').textContent = ajuste.total_productos || 0;
    document.getElementById('ajuste-total-movimientos').textContent = ajuste.total_movimientos || 0;
    
    mostrarProductosAjuste(ajuste.productos);
    
    if (usuarioRol === 'administrador') {
        document.getElementById('btn-revertir-container').style.display = 'block';
    }
}

function mostrarProductosAjuste(productos) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    
    if (!productos || productos.length === 0) {
        grid.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No hay productos ajustados</p>';
        return;
    }
    
    productos.forEach((prod) => {
        const productoCard = document.createElement('div');
        productoCard.className = 'producto-card';
        
        const diferencia = prod.diferencia || (prod.cantidad_nueva - (prod.cantidad_anterior || 0));
        const diferenciaClass = diferencia > 0 ? 'positivo' : diferencia < 0 ? 'negativo' : '';
        const diferenciaSigno = diferencia > 0 ? '+' : '';
        
        let movimientosHtml = '';
        if (prod.movimientos && prod.movimientos.length > 0) {
            movimientosHtml = '<div class="movimientos-list"><strong>Movimientos:</strong><ul>';
            prod.movimientos.forEach(mov => {
                const fechaMov = new Date(mov.fecha);
                const ubicacionDestino = mov.ubicacion_destino || 'N/A';
                const ubicacionOrigen = mov.ubicacion_origen || '';
                const direccion = ubicacionOrigen ? `de ${ubicacionOrigen} a ${ubicacionDestino}` : `a ${ubicacionDestino}`;
                movimientosHtml += `<li>${mov.cantidad.toFixed(2)} unidades ${direccion} - ${mov.usuario} (${fechaMov.toLocaleString('es-DO')})</li>`;
            });
            movimientosHtml += '</ul></div>';
        }
        
        productoCard.innerHTML = `
            <div class="producto-header">
                <div class="producto-info">
                    <h4>SKU: ${prod.sku}</h4>
                    <div style="color: #666; font-size: 14px; margin-top: 5px;">${prod.nombre || 'Sin nombre'}</div>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    ${prod.cantidad_anterior !== null ? `
                    <div class="cantidad-item">
                        <div class="label">Cantidad Anterior</div>
                        <div class="value">${prod.cantidad_anterior.toFixed(2)}</div>
                    </div>
                    ` : ''}
                    ${prod.cantidad_nueva !== null ? `
                    <div class="cantidad-item">
                        <div class="label">Cantidad Nueva</div>
                        <div class="value">${prod.cantidad_nueva.toFixed(2)}</div>
                    </div>
                    ` : ''}
                    <div class="cantidad-item">
                        <div class="label">Diferencia</div>
                        <div class="value ${diferenciaClass}">${diferenciaSigno}${diferencia.toFixed(2)}</div>
                    </div>
                </div>
            </div>
            ${movimientosHtml}
        `;
        grid.appendChild(productoCard);
    });
}

async function revertirAjuste() {
    if (!ajusteActual || !ajusteActual.id) {
        mostrarMensaje('error', 'No hay ajuste cargado');
        return;
    }

    if (!confirm('⚠️ ADVERTENCIA: Esta acción eliminará todos los movimientos de este ajuste y revertirá los cambios de stock. Esta acción NO se puede deshacer.\n\n¿Estás seguro de que deseas revertir este ajuste?')) {
        return;
    }

    if (!confirm('Esta es tu última oportunidad. ¿Confirmas que deseas revertir este ajuste?')) {
        return;
    }

    try {
        mostrarMensaje('info', 'Revirtiendo ajuste...');
        const response = await fetch(`/api/ajustes/${encodeURIComponent(ajusteActual.id)}/revertir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', `✅ ${data.message || 'Ajuste revertido exitosamente'}`);
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            mostrarMensaje('error', data.error || 'Error al revertir ajuste');
        }
    } catch (error) {
        console.error('Error al revertir:', error);
        mostrarMensaje('error', 'Error de conexión al revertir ajuste');
    }
}

// Inicializar
window.addEventListener('DOMContentLoaded', async () => {
    await verificarAutenticacion();
    
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const editar = urlParams.get('editar');
    
    if (id) {
        await cargarDetallesAjuste(id);
    } else {
        mostrarMensaje('error', 'ID de ajuste no proporcionado');
    }
});
