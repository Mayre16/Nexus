// Variables globales
let ubicacionesData = [];

// Verificar autenticación al cargar (primero, luego cargar datos en paralelo)
window.addEventListener('DOMContentLoaded', async () => {
    const ok = await verificarAutenticacion();
    if (ok) {
        cargarUbicacionesFisicas();
        cargarUltimaSincronizacionCatalogo();
        cargarConfigNotificaciones();
    }
});

// Limpiar intervalos al salir de la página
window.addEventListener('beforeunload', () => {
    Object.keys(pollingIntervals).forEach(locationId => {
        detenerPolling(locationId);
    });
});

function mostrarAvisoTemporal(mensaje) {
    const errorDiv = document.getElementById('message-error');
    if (!errorDiv) return;
    document.getElementById('message-success')?.classList.remove('show');
    errorDiv.textContent = mensaje;
    errorDiv.classList.add('show');
}

async function verificarAutenticacion(maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('/api/auth/me');
            let data;
            try {
                data = await response.json();
            } catch (parseErr) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return false;
                }
                mostrarAvisoTemporal('Error temporal, reintentando…');
                if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                continue;
            }
            if (response.status === 401 || data.error === 'unauthorized') {
                window.location.href = '/login';
                return false;
            }
            if (response.status === 503 || data.error === 'db_unavailable') {
                mostrarAvisoTemporal('Error temporal al conectar. Reintentando en 2 s…');
                if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            if (!data.success || !data.usuario) {
                if (attempt < maxRetries) {
                    mostrarAvisoTemporal('Error temporal, reintentando…');
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                mostrarAvisoTemporal('No se pudo verificar sesión. Recargue la página.');
                return false;
            }
            if (data.usuario.rol && data.usuario.rol.toLowerCase() !== 'administrador') {
                mostrarMensaje('error', 'Acceso denegado. Se requiere rol de administrador.');
                setTimeout(() => { window.location.href = '/'; }, 3000);
                return false;
            }
            document.getElementById('user-info').textContent =
                `${data.usuario.nombre} (${data.usuario.rol})`;
            document.getElementById('message-error')?.classList.remove('show');
            return true;
        } catch (err) {
            mostrarAvisoTemporal('Error de conexión. Reintentando…');
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
    mostrarAvisoTemporal('No se pudo conectar. Recargue la página o intente más tarde.');
    return false;
}

function mostrarSeccion(seccion, evt) {
    const e = evt || (typeof event !== 'undefined' ? event : null);
    // Ocultar todas las secciones
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));

    // Mostrar sección seleccionada
    document.getElementById(`seccion-${seccion}`).classList.add('active');
    if (e && e.target) e.target.classList.add('active');

    if (seccion === 'usuarios') cargarUsuarios();
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

        const ordenPrioridad = {
            'running': 1,
            'paused': 2,
            'error': 3,
            'partial': 4,
            'done': 5,
            'pending': 6
        };
        
        const ubicacionesOrdenadas = [...data.ubicaciones].sort((a, b) => {
            const prioridadA = ordenPrioridad[a.status] || 99;
            const prioridadB = ordenPrioridad[b.status] || 99;
            return prioridadA - prioridadB;
        });

        const ubicacionesSincronizando = ubicacionesOrdenadas.filter(u => u.status === 'running');
        ubicacionesSincronizando.forEach(u => {
            if (!pollingIntervals[u.location_id]) {
                iniciarPollingProgreso(u.location_id, u.location_name);
            }
        });

        container.innerHTML = ubicacionesOrdenadas.map((u, index) => {
            const esAdesa = u.location_name.toUpperCase() === 'ADESA';
            const priorityClass = esAdesa ? 'priority' : '';
            
            const statusClass = `status-${u.status}`;
            const statusText = {
                'pending': '⏳ Pendiente',
                'running': '🔄 Sincronizando',
                'paused': '⏸️ Pausada',
                'done': '✅ Sincronizada',
                'error': '❌ Error',
                'partial': '⏸️ Parcial'
            }[u.status] || u.status;

            const lastSync = u.last_sync_at ? new Date(u.last_sync_at + (u.last_sync_at.endsWith('Z') ? '' : 'Z')).toLocaleString('es-DO', {
                timeZone: 'America/Santo_Domingo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }) : 'Nunca';
            
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
            
            const porcentaje = u.total_items > 0 ? Math.min(100, Math.round((u.items_synced / u.total_items) * 100)) : 0;
            
            const mostrarProgreso = u.total_items > 0 || u.status === 'running';
            
            const progresoHTML = mostrarProgreso ? `
                <div class="detail-item" style="margin-top: 10px;">
                    <strong>Progreso</strong>
                    <span id="progreso-text-${u.location_id}">${u.total_items > 0 ? `${u.items_synced} de ${u.total_items} productos (${porcentaje}%)` : 'Iniciando sincronización...'}${u.lote_actual > 0 ? ` (Lote ${u.lote_actual})` : ''}</span>
                </div>
                <div class="progress-bar-container" id="progress-bar-container-${u.location_id}" style="margin-top: 8px; ${u.status === 'running' || u.status === 'done' ? '' : 'display: none;'}">
                    <div class="progress-bar" style="width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; position: relative;">
                        <div class="progress-bar-fill" id="progress-bar-fill-${u.location_id}" style="height: 100%; width: ${porcentaje}%; background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%); transition: width 0.5s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold;">
                            ${porcentaje > 0 ? `${porcentaje}%` : ''}
                        </div>
                    </div>
                </div>
            ` : '';

            return `
                <div class="ubicacion-item ${priorityClass}" id="ubicacion-${u.location_id}">
                    <div class="ubicacion-info">
                        <div class="ubicacion-numero">Ubicación ${index + 1} de ${ubicacionesOrdenadas.length}</div>
                        <div class="ubicacion-nombre">${u.location_name}</div>
                        <div class="ubicacion-details">
                            <div class="detail-item">
                                <strong>Estado</strong>
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                            <div class="detail-item">
                                <strong>Última sincronización</strong>
                                <span>${lastSync}</span>
                            </div>
                            ${progresoHTML}
                        </div>
                        ${u.last_error ? `
                        <div style="margin-top: 15px; padding: 12px; background: #ffebee; border-left: 4px solid #c62828; border-radius: 4px;">
                            <strong style="color: #c62828;">Error:</strong>
                            <span style="color: #c62828; font-size: 13px;">${u.last_error}</span>
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

// Variable global para almacenar intervalos de polling
const pollingIntervals = {};
// Variable global para almacenar timestamps de inicio de polling (para timeout)
const pollingStartTimes = {};

async function sincronizarUbicacion(locationId, locationName) {
    const btn = document.getElementById(`btn-sync-${locationId}`);
    const item = document.getElementById(`ubicacion-${locationId}`);
    
    if (!btn || btn.disabled) return;

    if (pollingIntervals[locationId]) {
        return;
    }

    btn.disabled = true;
    btn.classList.add('syncing');
    btn.innerHTML = '<span class="loading"></span> Sincronizando...';

    const statusBadge = item.querySelector('.status-badge');
    if (statusBadge) {
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = '🔄 Sincronizando';
    }

    let progressContainer = document.getElementById(`progress-bar-container-${locationId}`);
    if (!progressContainer) {
        const item = document.getElementById(`ubicacion-${locationId}`);
        if (item) {
            const ubicacionDetails = item.querySelector('.ubicacion-details');
            if (ubicacionDetails) {
                const progresoDiv = document.createElement('div');
                progresoDiv.className = 'detail-item';
                progresoDiv.style.marginTop = '10px';
                progresoDiv.innerHTML = `
                    <strong>Progreso</strong>
                    <span id="progreso-text-${locationId}">Iniciando sincronización...</span>
                `;
                ubicacionDetails.appendChild(progresoDiv);
                
                const container = document.createElement('div');
                container.id = `progress-bar-container-${locationId}`;
                container.className = 'progress-bar-container';
                container.style.cssText = 'margin-top: 8px;';
                container.innerHTML = `
                    <div class="progress-bar" style="width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; position: relative;">
                        <div class="progress-bar-fill" id="progress-bar-fill-${locationId}" style="height: 100%; width: 0%; background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%); transition: width 0.5s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold;">
                        </div>
                    </div>
                `;
                ubicacionDetails.appendChild(container);
                progressContainer = container;
            }
        }
    } else {
        progressContainer.style.display = 'block';
    }

    try {
        mostrarMensaje('success', `Iniciando sincronización de ${locationName}...`);

        fetch(`/api/sincronizar/ubicacion/${locationId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Error al iniciar sincronización:', data.error);
                mostrarMensaje('error', `Error al iniciar sincronización: ${data.error || 'Error desconocido'}`);
                btn.disabled = false;
                btn.classList.remove('syncing');
                btn.innerHTML = '🔄 Re-sincronizar';
                if (statusBadge) {
                    statusBadge.className = 'status-badge status-error';
                    statusBadge.textContent = '❌ Error';
                }
            } else {
                console.log(`Sincronización iniciada para ${locationName}`);
            }
        })
        .catch(error => {
            console.error('Error de conexión al iniciar sincronización:', error);
            mostrarMensaje('error', `Error de conexión al iniciar sincronización de ${locationName}`);
            btn.disabled = false;
            btn.classList.remove('syncing');
            btn.innerHTML = '🔄 Re-sincronizar';
            if (statusBadge) {
                statusBadge.className = 'status-badge status-error';
                statusBadge.textContent = '❌ Error';
            }
        });

        setTimeout(() => {
            iniciarPollingProgreso(locationId, locationName);
        }, 500);
    } catch (error) {
        mostrarMensaje('error', `Error al iniciar sincronización de ${locationName}`);
            
            if (statusBadge) {
                statusBadge.className = 'status-badge status-error';
                statusBadge.textContent = '❌ Error';
            }
            
            btn.disabled = false;
            btn.classList.remove('syncing');
            btn.innerHTML = '🔄 Re-sincronizar';
        
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }
}

async function iniciarPollingProgreso(locationId, locationName) {
    if (pollingIntervals[locationId]) {
        clearInterval(pollingIntervals[locationId]);
    }
    
    pollingStartTimes[locationId] = Date.now();

    const actualizarProgreso = async () => {
        try {
            const tiempoTranscurrido = (Date.now() - pollingStartTimes[locationId]) / 1000 / 60;
            if (tiempoTranscurrido > 30) {
                console.warn(`Polling timeout para ${locationName} después de 30 minutos`);
                detenerPolling(locationId);
                mostrarMensaje('error', `Timeout: La sincronización de ${locationName} lleva más de 30 minutos. Por favor, recarga la página.`);
                return;
            }

            const response = await fetch(`/api/sincronizar/ubicacion/${locationId}/estado`);
            const data = await response.json();

            if (!data.success) {
                console.error('Error al obtener estado:', data.error);
                return;
            }

            const { status, items_synced, total_items, last_error, last_sync_at } = data;
            
            const item = document.getElementById(`ubicacion-${locationId}`);
            if (!item) {
                detenerPolling(locationId);
                return;
            }

            const statusBadge = item.querySelector('.status-badge');
            if (statusBadge) {
                const statusClasses = {
                    'pending': 'status-pending',
                    'running': 'status-running',
                    'done': 'status-done',
                    'error': 'status-error',
                    'partial': 'status-partial'
                };
                const statusTexts = {
                    'pending': '⏳ Pendiente',
                    'running': '🔄 Sincronizando',
                    'done': '✅ Sincronizada',
                    'error': '❌ Error',
                    'partial': '⏸️ Parcial'
                };
                statusBadge.className = `status-badge ${statusClasses[status] || 'status-pending'}`;
                statusBadge.textContent = statusTexts[status] || status;
            }

            const progressContainer = document.getElementById(`progress-bar-container-${locationId}`);
            if ((status === 'running' || status === 'done') && progressContainer) {
                progressContainer.style.display = 'block';
            }

            if (status === 'running' || status === 'done') {
                const porcentaje = total_items > 0 ? Math.min(100, Math.round((items_synced / total_items) * 100)) : 0;
                
                const progresoText = document.getElementById(`progreso-text-${locationId}`);
                if (progresoText) {
                    if (total_items > 0) {
                        progresoText.textContent = `${items_synced} de ${total_items} productos (${porcentaje}%)`;
                    } else if (status === 'running') {
                        progresoText.textContent = `Iniciando sincronización... (${items_synced} items procesados)`;
                    } else {
                        progresoText.textContent = `${items_synced} items procesados`;
                    }
                }

                let progressFill = document.getElementById(`progress-bar-fill-${locationId}`);
                if (!progressFill && progressContainer) {
                    const progressBar = progressContainer.querySelector('.progress-bar');
                    if (progressBar) {
                        progressFill = document.createElement('div');
                        progressFill.id = `progress-bar-fill-${locationId}`;
                        progressFill.className = 'progress-bar-fill';
                        progressFill.style.cssText = 'height: 100%; width: 0%; background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%); transition: width 0.5s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold;';
                        progressBar.appendChild(progressFill);
                    }
                }
                
                if (progressFill) {
                    progressFill.style.width = `${porcentaje}%`;
                    progressFill.textContent = porcentaje > 0 ? `${porcentaje}%` : '';
                }
            }

            if (last_sync_at) {
                const detailItems = item.querySelectorAll('.ubicacion-details .detail-item');
                detailItems.forEach(detail => {
                    const strong = detail.querySelector('strong');
                    if (strong && strong.textContent.includes('Última sincronización')) {
                        const span = detail.querySelector('span');
                        if (span && last_sync_at) {
                            try {
                                const fecha = new Date(last_sync_at + (last_sync_at.endsWith('Z') ? '' : 'Z'));
                                const fechaFormateada = fecha.toLocaleString('es-DO', {
                                    timeZone: 'America/Santo_Domingo',
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                });
                                span.textContent = fechaFormateada;
                            } catch (e) {
                                // Si hay error, mantener el valor actual
                            }
                        }
                    }
                });
            }

            if (status === 'done' || status === 'error' || status === 'partial') {
                
                detenerPolling(locationId);
                
                const btn = document.getElementById(`btn-sync-${locationId}`);
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove('syncing');
                    btn.innerHTML = '🔄 Re-sincronizar';
                }

                if (status === 'done') {
                    mostrarMensaje('success', 
                        `✅ ${locationName} sincronizada exitosamente: ${items_synced} de ${total_items} productos`
                    );
                } else if (status === 'partial') {
                    mostrarMensaje('success', 
                        `⏸️ ${locationName} sincronización parcial: ${items_synced} de ${total_items} productos (puedes continuar después)`
                    );
                } else if (status === 'error') {
                    mostrarMensaje('error', 
                        `Error al sincronizar ${locationName}: ${last_error || 'Error desconocido'}`
                    );
                }

                setTimeout(() => {
                    cargarUbicaciones();
                }, 3000);
            }
        } catch (error) {
            console.error('Error en polling de progreso:', error);
            detenerPolling(locationId);
        }
    };

    actualizarProgreso();

    pollingIntervals[locationId] = setInterval(actualizarProgreso, 1500);
}

function detenerPolling(locationId) {
    if (pollingIntervals[locationId]) {
        clearInterval(pollingIntervals[locationId]);
        delete pollingIntervals[locationId];
    }
    if (pollingStartTimes[locationId]) {
        delete pollingStartTimes[locationId];
    }
}

async function cargarUltimaSincronizacionCatalogo() {
    try {
        const response = await fetch('/api/sincronizar/estado');
        const data = await response.json();
        
        if (data.success && data.ultima_sincronizacion) {
            const fecha = new Date(data.ultima_sincronizacion + (data.ultima_sincronizacion.endsWith('Z') ? '' : 'Z'));
            const fechaFormateada = fecha.toLocaleString('es-DO', {
                timeZone: 'America/Santo_Domingo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            document.getElementById('catalogo-fecha-sincronizacion').textContent = fechaFormateada;
        } else {
            document.getElementById('catalogo-fecha-sincronizacion').textContent = 'Nunca';
        }
    } catch (error) {
        document.getElementById('catalogo-fecha-sincronizacion').textContent = 'Error al cargar';
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
            await cargarUltimaSincronizacionCatalogo();
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
    const cardsEl = document.getElementById('ubicaciones-mobile-cards');

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
        if (cardsEl) {
            cardsEl.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">📍</div><div class="wms-empty-title">No hay ubicaciones físicas creadas</div></div>';
        }
        return;
    }

    tbody.innerHTML = ubicacionesData.map(u => `
        <tr>
            <td><strong>${escapeHtml(u.codigo)}</strong></td>
            <td>${escapeHtml(u.nombre)}</td>
            <td class="admin-cell-muted">${escapeHtml(u.descripcion || '—')}</td>
            <td>${escapeHtml(u.tipo || '—')}</td>
            <td>
                <span class="status-badge ${u.activa ? 'status-active' : 'status-inactive'}">
                    ${u.activa ? 'Activa' : 'Inactiva'}
                </span>
            </td>
            <td class="admin-actions-cell">
                <div class="admin-actions-inline">
                    <button type="button" class="btn-admin btn-admin--secondary" onclick="editarUbicacion(${u.id})">Editar</button>
                    <button type="button" class="btn-admin btn-admin--outline" onclick='generarCodigoBarras(${JSON.stringify(u.codigo)}, ${JSON.stringify(u.nombre || u.codigo)})'>Código barras</button>
                    <button type="button" class="btn-admin btn-admin--danger" onclick='eliminarUbicacion(${u.id}, ${JSON.stringify(u.codigo)})'>Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');

    if (cardsEl) {
        cardsEl.innerHTML = ubicacionesData.map(u => `
            <div class="wms-mobile-card admin-ubicacion-card">
                <div class="wms-mobile-card-header">
                    <div>
                        <span class="wms-mobile-card-title">${escapeHtml(u.codigo)}</span>
                        <span class="wms-mobile-card-meta">${escapeHtml(u.nombre || '—')}</span>
                    </div>
                    <span class="status-badge ${u.activa ? 'status-active' : 'status-inactive'}">${u.activa ? 'Activa' : 'Inactiva'}</span>
                </div>
                <div class="wms-mobile-card-rows admin-ubicacion-card-rows">
                    <div><div class="wms-mobile-card-label">Descripción</div><div class="wms-mobile-card-value">${escapeHtml(u.descripcion || '—')}</div></div>
                    <div><div class="wms-mobile-card-label">Tipo</div><div class="wms-mobile-card-value">${escapeHtml(u.tipo || '—')}</div></div>
                </div>
                <div class="admin-ubicacion-card-actions">
                    <button type="button" class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarUbicacion(${u.id})">Editar</button>
                    <button type="button" class="wms-btn wms-btn-secondary wms-btn-sm admin-ubicacion-btn-codigo" onclick='generarCodigoBarras(${JSON.stringify(u.codigo)}, ${JSON.stringify(u.nombre || u.codigo)})'>Código barras</button>
                    <button type="button" class="wms-btn wms-btn-danger wms-btn-sm" onclick='eliminarUbicacion(${u.id}, ${JSON.stringify(u.codigo)})'>Eliminar</button>
                </div>
            </div>`).join('');
    }
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
            response = await fetch(`/api/ubicaciones-fisicas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
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

// Funciones para modal de Excel
function abrirModalCargarExcel() {
    document.getElementById('form-excel').reset();
    document.getElementById('resultado-excel').style.display = 'none';
    document.getElementById('resultado-excel').innerHTML = '';
    document.getElementById('modal-excel').classList.add('active');
}

function cerrarModalExcel() {
    document.getElementById('modal-excel').classList.remove('active');
}

async function cargarExcel(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('archivo-excel');
    const file = fileInput.files[0];
    
    if (!file) {
        mostrarMensaje('error', 'Por favor selecciona un archivo Excel');
        return;
    }

    const formData = new FormData();
    formData.append('archivo', file);

    const btnCargar = document.getElementById('btn-cargar-excel');
    const textoOriginal = btnCargar.textContent;
    btnCargar.disabled = true;
    btnCargar.textContent = '⏳ Procesando...';

    const resultadoDiv = document.getElementById('resultado-excel');
    resultadoDiv.style.display = 'block';
    resultadoDiv.innerHTML = '<div class="empty-state"><p>⏳ Procesando archivo Excel...</p></div>';

    try {
        const response = await fetch('/api/ubicaciones-fisicas/cargar-excel', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.success) {
            let html = '<div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin-top: 15px;">';
            html += `<h4 style="color: #2e7d32; margin-bottom: 10px;">✅ Proceso Completado</h4>`;
            html += `<p><strong>Total procesadas:</strong> ${result.total}</p>`;
            html += `<p style="color: #2e7d32;"><strong>✅ Creadas:</strong> ${result.creadas}</p>`;
            html += `<p style="color: #1976d2;"><strong>🔄 Actualizadas:</strong> ${result.actualizadas}</p>`;
            
            if (result.errores && result.errores.length > 0) {
                html += `<p style="color: #c62828;"><strong>❌ Errores:</strong> ${result.errores.length}</p>`;
                html += '<ul style="margin-top: 10px; max-height: 200px; overflow-y: auto;">';
                result.errores.forEach(error => {
                    html += `<li style="color: #c62828; margin-bottom: 5px;">${error}</li>`;
                });
                html += '</ul>';
            }
            
            html += '</div>';
            resultadoDiv.innerHTML = html;
            
            await cargarUbicacionesFisicas();
            
            mostrarMensaje('success', `Proceso completado: ${result.creadas} creadas, ${result.actualizadas} actualizadas`);
        } else {
            resultadoDiv.innerHTML = `<div style="background: #ffebee; padding: 15px; border-radius: 5px; color: #c62828;"><strong>❌ Error:</strong> ${result.error || 'Error al procesar el archivo'}</div>`;
            mostrarMensaje('error', result.error || 'Error al procesar el archivo Excel');
        }
    } catch (error) {
        resultadoDiv.innerHTML = `<div style="background: #ffebee; padding: 15px; border-radius: 5px; color: #c62828;"><strong>❌ Error:</strong> ${error.message}</div>`;
        mostrarMensaje('error', 'Error de conexión al procesar el archivo');
    } finally {
        btnCargar.disabled = false;
        btnCargar.textContent = textoOriginal;
    }
}

document.getElementById('modal-excel').addEventListener('click', (e) => {
    if (e.target.id === 'modal-excel') {
        cerrarModalExcel();
    }
});

['modal-crear-usuario', 'modal-editar-usuario', 'modal-reset-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => {
        if (e.target.id === id) {
            if (id === 'modal-crear-usuario') cerrarModalUsuario();
            else if (id === 'modal-editar-usuario') cerrarModalEditarUsuario();
            else cerrarModalResetPassword();
        }
    });
});

// ============================================
// FUNCIÓN: Generar Código de Barras (55mm × 153mm)
// Layout: Texto arriba, código de barras abajo
// ============================================

const MM_TO_IN = 1 / 25.4;
const PT_PER_IN = 72;
const LABEL_W_MM = 153;
const LABEL_H_MM = 55;
const LABEL_W_PT = LABEL_W_MM * MM_TO_IN * PT_PER_IN;
const LABEL_H_PT = LABEL_H_MM * MM_TO_IN * PT_PER_IN;

async function generarCodigoBarras(codigo, nombre) {
    if (!codigo || codigo.trim() === '') {
        mostrarMensaje('error', 'El código de ubicación está vacío');
        return;
    }

    try {
        mostrarMensaje('info', 'Generando código de barras...');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'temp-barcode-svg');
        svg.style.position = 'absolute';
        svg.style.left = '-9999px';
        document.body.appendChild(svg);

        JsBarcode(svg, codigo, {
            format: 'CODE128',
            displayValue: false,
            background: '#ffffff',
            lineColor: '#000000',
            width: 2,
            height: 40,
            margin: 10
        });

        const svgString = new XMLSerializer().serializeToString(svg);
        document.body.removeChild(svg);

        const pngBytes = await svgToPngBytes(svgString);

        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        page.drawRectangle({
            x: 0,
            y: 0,
            width: LABEL_W_PT,
            height: LABEL_H_PT,
            color: rgb(1, 1, 1)
        });

        const padPt = 8;
        const pageW = LABEL_W_PT;
        const pageH = LABEL_H_PT;

        const codigoSize = 18;
        const codigoText = codigo;
        const codigoTextWidth = fontBold.widthOfTextAtSize(codigoText, codigoSize);
        const codigoX = (pageW - codigoTextWidth) / 2;
        const codigoY = pageH - padPt - codigoSize - 5;

        page.drawText(codigoText, {
            x: codigoX,
            y: codigoY,
            size: codigoSize,
            font: fontBold,
            color: rgb(0, 0, 0)
        });

        const pngImage = await pdfDoc.embedPng(pngBytes);
        const maxBarcodeW = pageW - padPt * 2;
        const maxBarcodeH = pageH * 0.5;

        const imgW = pngImage.width;
        const imgH = pngImage.height;
        const scale = Math.min(maxBarcodeW / imgW, maxBarcodeH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;

        const barcodeX = (pageW - drawW) / 2;
        const barcodeY = padPt;

        page.drawImage(pngImage, {
            x: barcodeX,
            y: barcodeY,
            width: drawW,
            height: drawH
        });

        const pdfBytes = await pdfDoc.save();

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codigo_barras_${codigo}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        mostrarMensaje('success', `Código de barras generado: ${codigo}`);

    } catch (error) {
        console.error('Error generando código de barras:', error);
        mostrarMensaje('error', `Error al generar código de barras: ${error.message}`);
    }
}

async function svgToPngBytes(svgString) {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.decoding = 'async';

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });

    URL.revokeObjectURL(url);

    const SCALE = 4;
    const baseW = img.width || 800;
    const baseH = img.height || 240;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    ctx.imageSmoothingEnabled = false;

    canvas.width = baseW * SCALE;
    canvas.height = baseH * SCALE;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png', 1.0));
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
}

// ============================================
// SECCIÓN: NOTIFICACIONES
// ============================================
async function cargarConfigNotificaciones() {
    try {
        const response = await fetch('/api/notificaciones/config');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('chk-email-discrepancias').checked = data.data.email_discrepancias_activo;
            document.getElementById('chk-email-estado-sync').checked = data.data.email_estado_sync_activo;
            
            document.getElementById('notificaciones-loading').style.display = 'none';
            document.getElementById('notificaciones-content').style.display = 'block';
        } else {
            mostrarMensaje('error', 'Error al cargar configuración de notificaciones');
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar configuración');
    }
}

async function actualizarNotificaciones() {
    const data = {
        email_discrepancias_activo: document.getElementById('chk-email-discrepancias').checked,
        email_estado_sync_activo: document.getElementById('chk-email-estado-sync').checked
    };
    
    try {
        const response = await fetch('/api/notificaciones/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje('success', 'Configuración de notificaciones actualizada');
        } else {
            mostrarMensaje('error', result.error || 'Error al actualizar configuración');
            await cargarConfigNotificaciones();
        }
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al actualizar configuración');
        await cargarConfigNotificaciones();
    }
}

// ============================================
// SECCIÓN: USUARIOS - CRUD
// ============================================
let usuariosPaginacion = { page: 1, page_size: 15, total: 0, total_pages: 0 };

function filtrarUsuarios() {
    usuariosPaginacion.page = 1;
    cargarUsuarios();
}

async function cargarUsuarios() {
    const tbody = document.getElementById('usuarios-tbody');
    const cardsEl = document.getElementById('usuarios-mobile-cards');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px;">Cargando usuarios...</td></tr>';
    if (cardsEl) {
        cardsEl.innerHTML = '<div class="wms-empty"><div class="wms-empty-title">Cargando usuarios…</div></div>';
    }

    const q = (document.getElementById('usuarios-filtro') || {}).value || '';
    const rol = (document.getElementById('usuarios-filtro-rol') || {}).value || '';
    const page = usuariosPaginacion.page;
    const pageSize = usuariosPaginacion.page_size;
    const sort = 'updated_at';
    const dir = 'desc';

    const params = new URLSearchParams({ page, page_size: pageSize, sort, dir });
    if (q) params.set('q', q);
    if (rol) params.set('rol', rol);

    try {
        const response = await fetch(`/api/usuarios?${params}`);
        const data = await response.json();

        if (!response.ok) {
            const errMsg = escapeHtml(data.error || 'Error al cargar');
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #c62828;">Error: ${errMsg}</td></tr>`;
            if (cardsEl) {
                cardsEl.innerHTML = `<div class="wms-empty" style="color:#c62828;text-align:center;"><div class="wms-empty-title">Error: ${errMsg}</div></div>`;
            }
            return;
        }

        const usuarios = data.data || [];
        const pag = data.pagination || {};
        usuariosPaginacion.total = pag.total || 0;
        usuariosPaginacion.total_pages = pag.pages || 1;

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px;">No hay usuarios</td></tr>';
            if (cardsEl) {
                cardsEl.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">👥</div><div class="wms-empty-title">No hay usuarios</div></div>';
            }
        } else {
            tbody.innerHTML = usuarios.map(u => {
                const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '-';
                const requiere = u.must_change_password ? 'Sí' : 'No';
                const estado = u.activo ? '<span style="color: green;">Activo</span>' : '<span style="color: #999;">Inactivo</span>';
                return `
                    <tr>
                        <td>${escapeHtml(u.email)}</td>
                        <td>${escapeHtml(u.nombre || '-')}</td>
                        <td>${escapeHtml(u.rol || '-')}</td>
                        <td>${estado}</td>
                        <td>${lastLogin}</td>
                        <td>${requiere}</td>
                        <td>
                            <button class="btn-secondary btn-sm" onclick="abrirModalEditarUsuario(${u.id})" title="Editar">✏️</button>
                            <button class="btn-secondary btn-sm" onclick="abrirModalResetPassword(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Reset contraseña">🔑</button>
                            ${u.activo
                                ? `<button class="btn-secondary btn-sm" onclick="desactivarUsuario(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Desactivar">⏸️</button>`
                                : `<button class="btn-secondary btn-sm" onclick="activarUsuario(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Activar">▶️</button>`
                            }
                        </td>
                    </tr>
                `;
            }).join('');

            if (cardsEl) {
                cardsEl.innerHTML = usuarios.map(u => {
                    const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '-';
                    const requiere = u.must_change_password ? 'Sí' : 'No';
                    const estadoBadge = u.activo
                        ? '<span class="status-badge status-active">Activo</span>'
                        : '<span class="status-badge status-inactive">Inactivo</span>';
                    return `
            <div class="wms-mobile-card admin-usuario-card">
                <div class="wms-mobile-card-header">
                    <div>
                        <span class="wms-mobile-card-title">${escapeHtml(u.email)}</span>
                        <span class="wms-mobile-card-meta">${escapeHtml(u.nombre || '—')}</span>
                    </div>
                    ${estadoBadge}
                </div>
                <div class="wms-mobile-card-rows admin-usuario-card-rows">
                    <div><div class="wms-mobile-card-label">Rol</div><div class="wms-mobile-card-value">${escapeHtml(u.rol || '—')}</div></div>
                    <div><div class="wms-mobile-card-label">Último acceso</div><div class="wms-mobile-card-value">${escapeHtml(lastLogin)}</div></div>
                    <div><div class="wms-mobile-card-label">Debe cambiar contraseña</div><div class="wms-mobile-card-value">${escapeHtml(requiere)}</div></div>
                </div>
                <div class="admin-usuario-card-actions">
                    <button type="button" class="wms-btn wms-btn-secondary wms-btn-sm" onclick="abrirModalEditarUsuario(${u.id})" title="Editar">✏️ Editar</button>
                    <button type="button" class="wms-btn wms-btn-secondary wms-btn-sm" onclick="abrirModalResetPassword(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Reset contraseña">🔑 Reset</button>
                    ${u.activo
                        ? `<button type="button" class="wms-btn wms-btn-secondary wms-btn-sm" onclick="desactivarUsuario(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Desactivar">⏸️ Desactivar</button>`
                        : `<button type="button" class="wms-btn wms-btn-secondary wms-btn-sm" onclick="activarUsuario(${u.id}, this.getAttribute('data-email')||'')" data-email="${escapeHtml(u.email || '')}" title="Activar">▶️ Activar</button>`
                    }
                </div>
            </div>`;
                }).join('');
            }
        }

        renderUsuariosPaginacion();
    } catch (err) {
        const errMsg = escapeHtml(err.message || 'Error');
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #c62828;">Error: ${errMsg}</td></tr>`;
        if (cardsEl) {
            cardsEl.innerHTML = `<div class="wms-empty" style="color:#c62828;text-align:center;"><div class="wms-empty-title">Error: ${errMsg}</div></div>`;
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderUsuariosPaginacion() {
    const div = document.getElementById('usuarios-paginacion');
    if (!div || usuariosPaginacion.total_pages <= 1) {
        if (div) div.innerHTML = '';
        return;
    }
    const { page, total_pages, total } = usuariosPaginacion;
    let html = '';
    if (page > 1) html += `<button class="btn-secondary btn-sm" onclick="usuariosPaginacion.page=1; cargarUsuarios();">«</button> `;
    html += ` Página ${page} de ${total_pages} (${total} usuarios) `;
    if (page < total_pages) html += `<button class="btn-secondary btn-sm" onclick="usuariosPaginacion.page=${page + 1}; cargarUsuarios();">»</button>`;
    div.innerHTML = html;
}

function abrirModalCrearUsuario() {
    document.getElementById('form-crear-usuario').reset();
    document.getElementById('usuario-must-change-crear').checked = true;
    document.getElementById('usuario-activo-crear').checked = true;
    document.getElementById('modal-crear-usuario').classList.add('active');
}

function cerrarModalUsuario() {
    document.getElementById('modal-crear-usuario').classList.remove('active');
}

async function guardarUsuario(event) {
    event.preventDefault();
    const email = document.getElementById('usuario-email-crear').value.trim();
    const nombre = document.getElementById('usuario-nombre-crear').value.trim();
    const rol = document.getElementById('usuario-rol-crear').value;
    const password = document.getElementById('usuario-password-crear').value;
    const activo = document.getElementById('usuario-activo-crear').checked;
    const must_change_password = document.getElementById('usuario-must-change-crear').checked;

    if (password.length < 8) {
        mostrarMensaje('error', 'La contraseña debe tener al menos 8 caracteres');
        return;
    }

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creando...';
    try {
        const response = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, nombre, rol, password, activo, must_change_password })
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Usuario creado correctamente');
            cerrarModalUsuario();
            cargarUsuarios();
        } else {
            mostrarMensaje('error', data.error || 'Error al crear usuario');
        }
    } catch (err) {
        mostrarMensaje('error', 'Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear Usuario';
    }
}

function abrirModalEditarUsuario(id) {
    fetch(`/api/usuarios/${id}`)
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                mostrarMensaje('error', data.error || 'Error al cargar usuario');
                return;
            }
            const u = data.usuario;
            document.getElementById('usuario-id-editar').value = u.id;
            document.getElementById('usuario-email-editar').value = u.email || '';
            document.getElementById('usuario-nombre-editar').value = u.nombre || '';
            document.getElementById('usuario-rol-editar').value = u.rol || 'despachador';
            document.getElementById('usuario-activo-editar').checked = !!u.activo;
            document.getElementById('usuario-must-change-editar').checked = !!u.must_change_password;
            document.getElementById('modal-editar-usuario').classList.add('active');
        })
        .catch(err => mostrarMensaje('error', 'Error: ' + err.message));
}

function cerrarModalEditarUsuario() {
    document.getElementById('modal-editar-usuario').classList.remove('active');
}

async function editarUsuario(event) {
    event.preventDefault();
    const id = document.getElementById('usuario-id-editar').value;
    const nombre = document.getElementById('usuario-nombre-editar').value.trim();
    const rol = document.getElementById('usuario-rol-editar').value;
    const activo = document.getElementById('usuario-activo-editar').checked;
    const must_change_password = document.getElementById('usuario-must-change-editar').checked;

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
        const response = await fetch(`/api/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, rol, activo, must_change_password })
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Usuario actualizado correctamente');
            cerrarModalEditarUsuario();
            cargarUsuarios();
        } else {
            mostrarMensaje('error', data.error || 'Error al actualizar usuario');
        }
    } catch (err) {
        mostrarMensaje('error', 'Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Cambios';
    }
}

function abrirModalResetPassword(id, email) {
    document.getElementById('usuario-id-reset').value = id;
    document.getElementById('usuario-password-reset').value = '';
    document.getElementById('usuario-must-change-reset').checked = true;
    document.getElementById('reset-password-info').textContent = `Restablecer contraseña para: ${email}`;
    document.getElementById('modal-reset-password').classList.add('active');
}

function cerrarModalResetPassword() {
    document.getElementById('modal-reset-password').classList.remove('active');
}

async function resetPasswordUsuario(event) {
    event.preventDefault();
    const id = document.getElementById('usuario-id-reset').value;
    const password = document.getElementById('usuario-password-reset').value.trim();
    const must_change_password = document.getElementById('usuario-must-change-reset').checked;

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Restableciendo...';
    try {
        const body = { must_change_password };
        if (password) body.password = password;
        const response = await fetch(`/api/usuarios/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', data.password_temporal ? `Contraseña actualizada: ${data.password_temporal}` : 'Contraseña restablecida correctamente');
            cerrarModalResetPassword();
            cargarUsuarios();
        } else {
            mostrarMensaje('error', data.error || 'Error al restablecer contraseña');
        }
    } catch (err) {
        mostrarMensaje('error', 'Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Restablecer Contraseña';
    }
}

async function activarUsuario(id, email) {
    if (!confirm(`¿Activar usuario ${email}?`)) return;
    try {
        const response = await fetch(`/api/usuarios/${id}/activar`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Usuario activado');
            cargarUsuarios();
        } else {
            mostrarMensaje('error', data.error || 'Error');
        }
    } catch (err) {
        mostrarMensaje('error', err.message);
    }
}

async function desactivarUsuario(id, email) {
    if (!confirm(`¿Desactivar usuario ${email}? El usuario no podrá iniciar sesión.`)) return;
    try {
        const response = await fetch(`/api/usuarios/${id}/desactivar`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await response.json();
        if (data.success) {
            mostrarMensaje('success', 'Usuario desactivado');
            cargarUsuarios();
        } else {
            mostrarMensaje('error', data.error || 'Error');
        }
    } catch (err) {
        mostrarMensaje('error', err.message);
    }
}
