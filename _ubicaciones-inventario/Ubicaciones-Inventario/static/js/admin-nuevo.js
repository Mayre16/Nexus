// Variables globales
let ubicacionesData = [];

// Verificar autenticación al cargar
window.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacion();
    cargarUbicacionesFisicas();
});

async function verificarAutenticacion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.success) {
            window.location.href = '/login';
            return;
        }

        if (data.usuario.rol.toLowerCase() !== 'administrador') {
            mostrarMensaje('error', 'Acceso denegado. Se requiere rol de administrador.');
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
            return;
        }

        document.getElementById('user-info').textContent = 
            `${data.usuario.nombre} (${data.usuario.rol})`;
    } catch (error) {
        window.location.href = '/login';
    }
}

function mostrarSeccion(seccion) {
    // Ocultar todas las secciones
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));

    // Mostrar sección seleccionada
    document.getElementById(`seccion-${seccion}`).classList.add('active');
    event.target.classList.add('active');
}

// ============================================
// SECCIÓN: SINCRONIZACIÓN DE PRODUCTOS
// ============================================
async function cargarUbicaciones() {
    const container = document.getElementById('ubicaciones-container');
    container.innerHTML = '<div class="empty-state"><p>Cargando ubicaciones...</p></div>';

    try {
        const response = await fetch('/api/sincronizar/ubicaciones');
        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<div class="empty-state"><p style="color: #c62828;">Error: ${data.error || 'Error al cargar ubicaciones'}</p></div>`;
            return;
        }

        if (!data.ubicaciones || data.ubicaciones.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No se encontraron ubicaciones</p></div>';
            return;
        }

        container.innerHTML = data.ubicaciones.map(u => {
            const esAdesa = u.location_name.toUpperCase() === 'ADESA';
            const priorityClass = esAdesa ? 'priority' : '';
            
            const statusClass = `status-${u.status}`;
            const statusText = {
                'pending': '⏳ Pendiente',
                'running': '🔄 Sincronizando',
                'paused': '⏸️ Pausada',
                'done': '✅ Sincronizada',
                'error': '❌ Error'
            }[u.status] || u.status;

            const lastSync = u.last_sync_at ? new Date(u.last_sync_at).toLocaleString('es-DO') : 'Nunca';
            
            // Determinar botón según estado
            let buttonHTML = '';
            if (u.status === 'running') {
                buttonHTML = `
                    <button class="btn-sync syncing" disabled>
                        <span class="loading"></span> Sincronizando...
                    </button>
                `;
            } else if (u.status === 'paused' && u.total_items > 0) {
                buttonHTML = `
                    <button 
                        class="btn-sync" 
                        onclick="sincronizarLote('${u.location_id}', '${u.location_name}')"
                        id="btn-lote-${u.location_id}"
                    >
                        ▶️ Continuar Lote ${u.lote_actual + 1}
                    </button>
                `;
            } else if (u.total_items === 0) {
                buttonHTML = `
                    <button 
                        class="btn-sync" 
                        onclick="contarProductos('${u.location_id}', '${u.location_name}')"
                        id="btn-contar-${u.location_id}"
                    >
                        🔢 Contar Productos
                    </button>
                `;
            } else {
                buttonHTML = `
                    <button 
                        class="btn-sync" 
                        onclick="sincronizarUbicacion('${u.location_id}', '${u.location_name}')"
                        id="btn-sync-${u.location_id}"
                    >
                        🔄 Re-sincronizar
                    </button>
                `;
            }
            
            const itemsSync = u.items_synced || 0;
            const totalItems = u.total_items || 0;
            const progresoHTML = totalItems > 0 || itemsSync > 0 ? `
                <div class="detail-item">
                    <strong>Progreso:</strong> ${u.status === 'running' 
                        ? `${Number(itemsSync).toLocaleString()} items procesados (en progreso)` 
                        : `${Number(itemsSync).toLocaleString()} de ${Number(totalItems).toLocaleString()} productos`}
                    ${u.lote_actual > 0 ? ` <span style="color: #666; font-size: 12px;">(Lote ${u.lote_actual})</span>` : ''}
                </div>
            ` : '';

            return `
                <div class="ubicacion-item ${priorityClass}" id="ubicacion-${u.location_id}">
                    <div class="ubicacion-info">
                        <div class="ubicacion-numero">Ubicación ${u.numero}/${data.total}</div>
                        <div class="ubicacion-nombre">${u.location_name}</div>
                        <div class="ubicacion-details">
                            <div class="detail-item">
                                <strong>Estado:</strong> 
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                            <div class="detail-item">
                                <strong>Última sincronización:</strong> ${lastSync}
                            </div>
                            ${progresoHTML}
                        </div>
                        ${u.last_error ? `
                        <div class="error-message show">
                            <strong>Error:</strong> ${u.last_error}
                        </div>
                        ` : ''}
                    </div>
                    <div class="ubicacion-actions">
                        ${buttonHTML}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p style="color: #c62828;">Error de conexión: ${error.message}</p></div>`;
    }
}

async function contarProductos(locationId, locationName) {
    const btn = document.getElementById(`btn-contar-${locationId}`);
    if (!btn || btn.disabled) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Contando...';
    
    try {
        mostrarMensaje('success', `Contando productos de ${locationName}...`);
        
        const response = await fetch(`/api/sincronizar/ubicacion/${locationId}/contar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.auto_sync && data.completado) {
                mostrarMensaje('success', `✅ Conteo y sincronización completados: ${data.items_synced} productos en ${locationName}`);
            } else if (data.auto_sync && !data.completado) {
                mostrarMensaje('success', `Conteo completado y lote sincronizado: ${data.items_synced} de ${data.total_items} productos en ${locationName}`);
            } else {
                mostrarMensaje('success', `Conteo completado: ${data.total_items} productos encontrados en ${locationName}. Use 'Continuar Lote' para sincronizar.`);
            }
            setTimeout(() => cargarUbicaciones(), 1000);
        } else {
            mostrarMensaje('error', data.error || 'Error al contar productos');
            btn.disabled = false;
            btn.innerHTML = '🔢 Contar Productos';
        }
    } catch (error) {
        mostrarMensaje('error', 'Error al contar productos: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = '🔢 Contar Productos';
    }
}

async function sincronizarLote(locationId, locationName) {
    const btn = document.getElementById(`btn-lote-${locationId}`);
    if (!btn || btn.disabled) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Sincronizando lote...';
    
    try {
        const response = await fetch(`/api/sincronizar/ubicacion/${locationId}/lote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.completado) {
                mostrarMensaje('success', `✅ Sincronización completada para ${locationName}: ${data.items_synced_total} productos`);
            } else {
                mostrarMensaje('success', `Lote ${data.lote_numero} completado: ${data.items_synced_lote} productos. Total: ${data.items_synced_total} de ${data.total_items}`);
            }
            setTimeout(() => cargarUbicaciones(), 1000);
        } else {
            mostrarMensaje('error', data.error || 'Error al sincronizar lote');
            btn.disabled = false;
            btn.innerHTML = `▶️ Continuar Lote`;
        }
    } catch (error) {
        mostrarMensaje('error', 'Error al sincronizar lote: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = `▶️ Continuar Lote`;
    }
}

async function sincronizarUbicacion(locationId, locationName) {
    const btn = document.getElementById(`btn-sync-${locationId}`);
    const item = document.getElementById(`ubicacion-${locationId}`);
    
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('syncing');
    btn.innerHTML = '<span class="loading"></span> Sincronizando...';

    const statusBadge = item.querySelector('.status-badge');
    if (statusBadge) {
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = '🔄 Sincronizando';
    }

    try {
        mostrarMensaje('success', `Iniciando sincronización de ${locationName}...`);

        const response = await fetch(`/api/sincronizar/ubicacion/${locationId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje('success', 
                `✅ ${locationName} sincronizada exitosamente: ${data.items_synced} items con stock > 0`
            );
            setTimeout(() => cargarUbicaciones(), 1000);
        } else {
            mostrarMensaje('error', `Error al sincronizar ${locationName}: ${data.error || data.message}`);
            
            if (statusBadge) {
                statusBadge.className = 'status-badge status-error';
                statusBadge.textContent = '❌ Error';
            }
            
            btn.disabled = false;
            btn.classList.remove('syncing');
            btn.innerHTML = '🔄 Re-sincronizar';
        }
    } catch (error) {
        mostrarMensaje('error', `Error de conexión al sincronizar ${locationName}`);
        
        if (statusBadge) {
            statusBadge.className = 'status-badge status-error';
            statusBadge.textContent = '❌ Error';
        }
        
        btn.disabled = false;
        btn.classList.remove('syncing');
        btn.innerHTML = '🔄 Re-sincronizar';
    }
}

async function sincronizarCatalogo() {
    const btn = document.getElementById('btn-sync-catalogo');
    const progressDiv = document.getElementById('catalogo-progress');
    const progressFill = document.getElementById('catalogo-progress-fill');
    const messageDiv = document.getElementById('catalogo-message');
    
    if (btn.disabled) return;
    
    btn.disabled = true;
    btn.textContent = '🔄 Sincronizando...';
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    messageDiv.textContent = 'Iniciando sincronización de catálogo...';
    
    try {
        mostrarMensaje('success', 'Iniciando sincronización de catálogo. Esto puede tardar varios minutos...');
        
        const response = await fetch('/api/sincronizar/catalogo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            progressFill.style.width = '100%';
            messageDiv.textContent = 'Sincronización completada';
            let msg = `Catálogo sincronizado: ${data.productos_actualizados} actualizados, ${data.productos_creados} creados. Total: ${data.total_procesados} productos.`;
            if (data.sku_normalizados > 0) {
                msg += ` ${data.sku_normalizados} SKU alineados en ubicaciones físicas.`;
            }
            mostrarMensaje('success', msg);
        } else {
            messageDiv.textContent = `Error: ${data.error || 'Error desconocido'}`;
            mostrarMensaje('error', data.error || 'Error al sincronizar catálogo');
        }
    } catch (error) {
        messageDiv.textContent = 'Error de conexión';
        mostrarMensaje('error', 'Error de conexión al sincronizar catálogo');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Sincronizar Catálogo';
    }
}

// ============================================
// SECCIÓN: UBICACIONES FÍSICAS WMS
// ============================================
async function cargarUbicacionesFisicas() {
    try {
        const response = await fetch('/api/ubicaciones-fisicas');
        const data = await response.json();

        if (!data.success) {
            mostrarMensaje('error', data.error || 'Error al cargar ubicaciones físicas');
            return;
        }

        ubicacionesData = data.ubicaciones;
        renderizarTablaUbicaciones();
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar ubicaciones físicas');
    }
}

function renderizarTablaUbicaciones() {
    const tbody = document.getElementById('ubicaciones-tbody');
    
    if (ubicacionesData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <p>No hay ubicaciones físicas creadas</p>
                        <button class="btn-primary" onclick="abrirModalCrear()" style="margin-top: 15px;">
                            ➕ Crear Primera Ubicación
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = ubicacionesData.map(u => `
        <tr>
            <td><strong>${u.codigo}</strong></td>
            <td>${u.nombre}</td>
            <td>${u.descripcion || '-'}</td>
            <td>${u.tipo || '-'}</td>
            <td>
                <span class="status-badge ${u.activa ? 'status-active' : 'status-inactive'}">
                    ${u.activa ? 'Activa' : 'Inactiva'}
                </span>
            </td>
            <td>
                <button class="btn-secondary" onclick="editarUbicacion(${u.id})" style="margin-right: 5px;">
                    ✏️ Editar
                </button>
                <button class="btn-danger" onclick="eliminarUbicacion(${u.id}, '${u.codigo}')">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

function abrirModalCrear() {
    document.getElementById('modal-titulo').textContent = 'Crear Ubicación Física';
    document.getElementById('form-ubicacion').reset();
    document.getElementById('ubicacion-id').value = '';
    document.getElementById('activa').checked = true;
    document.getElementById('modal-ubicacion').classList.add('active');
}

function editarUbicacion(id) {
    const ubicacion = ubicacionesData.find(u => u.id === id);
    if (!ubicacion) return;

    document.getElementById('modal-titulo').textContent = 'Editar Ubicación Física';
    document.getElementById('ubicacion-id').value = ubicacion.id;
    document.getElementById('codigo').value = ubicacion.codigo;
    document.getElementById('nombre').value = ubicacion.nombre;
    document.getElementById('descripcion').value = ubicacion.descripcion || '';
    document.getElementById('tipo').value = ubicacion.tipo || '';
    document.getElementById('activa').checked = ubicacion.activa;
    document.getElementById('modal-ubicacion').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modal-ubicacion').classList.remove('active');
}

async function guardarUbicacion(event) {
    event.preventDefault();

    const id = document.getElementById('ubicacion-id').value;
    const data = {
        codigo: document.getElementById('codigo').value.toUpperCase().trim(),
        nombre: document.getElementById('nombre').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        tipo: document.getElementById('tipo').value.trim(),
        activa: document.getElementById('activa').checked
    };

    try {
        let response;
        if (id) {
            // Actualizar
            response = await fetch(`/api/ubicaciones-fisicas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            // Crear
            response = await fetch('/api/ubicaciones-fisicas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        const result = await response.json();

        if (result.success) {
            mostrarMensaje('success', result.message);
            cerrarModal();
            cargarUbicacionesFisicas();
        } else {
            mostrarMensaje('error', result.error || 'Error al guardar ubicación');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al guardar ubicación');
    }
}

async function eliminarUbicacion(id, codigo) {
    if (!confirm(`¿Estás seguro de eliminar la ubicación "${codigo}"?\n\nNota: Solo se puede eliminar si no tiene productos con stock.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/ubicaciones-fisicas/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            mostrarMensaje('success', result.message);
            cargarUbicacionesFisicas();
        } else {
            mostrarMensaje('error', result.error || 'Error al eliminar ubicación');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al eliminar ubicación');
    }
}

// Cerrar modal al hacer clic fuera
document.getElementById('modal-ubicacion').addEventListener('click', (e) => {
    if (e.target.id === 'modal-ubicacion') {
        cerrarModal();
    }
});
