let currentPage = 1;
let perPage = 10;

window.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacion();
    cargarUsuarios();
    aplicarFiltros();
});

async function verificarAutenticacion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (!data.success) { window.location.href = '/login'; return; }
        document.getElementById('user-info').textContent = data.usuario.nombre + ' (' + data.usuario.rol + ')';
    } catch (error) { window.location.href = '/login'; }
}

async function cargarUsuarios() {
    try {
        const response = await fetch('/api/historial/usuarios');
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('usuario_id');
            data.usuarios.forEach(u => {
                const option = document.createElement('option');
                option.value = u.id; option.textContent = u.nombre;
                select.appendChild(option);
            });
        }
    } catch (error) { console.error('Error al cargar usuarios:', error); }
}

async function aplicarFiltros(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('ajustes-tbody');
    const cards = document.getElementById('ajustes-cards');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:var(--space-8)"><div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div></td></tr>';
    cards.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div>';

    const params = new URLSearchParams({
        page: currentPage, per_page: perPage,
        fecha_desde: document.getElementById('fecha_desde').value || '',
        fecha_hasta: document.getElementById('fecha_hasta').value || '',
        ubicacion_fisica: document.getElementById('ubicacion_fisica').value || '',
        sku: document.getElementById('sku').value || '',
        tipo_ajuste: document.getElementById('tipo_ajuste').value || '',
        usuario_id: document.getElementById('usuario_id').value || '',
        search: document.getElementById('search').value || ''
    });

    try {
        const response = await fetch('/api/historial/ajustes?' + params);
        const data = await response.json();
        if (!data.success) { mostrarMensaje('error', data.error || 'Error al cargar ajustes'); return; }
        renderizarTabla(data.ajustes);
        renderizarCards(data.ajustes);
        renderizarPaginacion(data.total, data.page, data.pages);
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:var(--space-8)"><div class="wms-empty">Error al cargar datos</div></td></tr>';
        cards.innerHTML = '<div class="wms-empty">Error al cargar datos</div>';
    }
}

function renderizarTabla(ajustes) {
    const tbody = document.getElementById('ajustes-tbody');
    if (ajustes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:var(--space-8)"><div class="wms-empty"><div class="wms-empty-icon">📋</div><div class="wms-empty-title">No se encontraron ajustes</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = ajustes.map(a => {
        const tipoBadge = a.tipo_ajuste === 'Físico'
            ? '<span class="status-badge tipo-fisico">📍 Físico</span>'
            : '<span class="status-badge tipo-adm">🏢 ADM</span>';
        const ubicacionDisplay = a.ubicacion_display || (a.es_ubicacion_fisica ? '📍 ' + (a.ubicacion || 'N/A') : '🏢 ' + (a.ubicacion || 'N/A'));
        const productosDisplay = a.skus_display || a.cantidad_productos + ' producto(s)';
        const cantidadDisplay = a.cantidad_total_ajustada ? a.cantidad_total_ajustada.toFixed(2) : 'N/A';
        const notasDisplay = a.notas && a.notas.length > 80 ? a.notas.substring(0, 80) + '...' : (a.notas || 'N/A');
        return '<tr>' +
            '<td>' + (a.fecha ? new Date(a.fecha).toLocaleDateString('es-DO', {day:'2-digit',month:'2-digit',year:'numeric'}) : 'N/A') + '</td>' +
            '<td><strong>' + escapeHtml(ubicacionDisplay) + '</strong></td>' +
            '<td><span class="fw-600" style="color:var(--color-primary)">' + escapeHtml(productosDisplay) + '</span></td>' +
            '<td>' + tipoBadge + '</td>' +
            '<td><strong style="color:var(--color-success)">' + cantidadDisplay + '</strong></td>' +
            '<td>' + escapeHtml(a.usuario || 'N/A') + '</td>' +
            '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(a.notas || '') + '">' + escapeHtml(notasDisplay) + '</td>' +
            '<td><button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + a.id + '\')">Ver</button> <button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarAjuste(\'' + a.id + '\')">Editar</button></td>' +
        '</tr>';
    }).join('');
}

function renderizarCards(ajustes) {
    const container = document.getElementById('ajustes-cards');
    if (ajustes.length === 0) {
        container.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">📋</div><div class="wms-empty-title">No se encontraron ajustes</div></div>';
        return;
    }
    container.innerHTML = ajustes.map(a => {
        const ubicacionDisplay = a.ubicacion_display || (a.es_ubicacion_fisica ? '📍 ' + (a.ubicacion || 'N/A') : '🏢 ' + (a.ubicacion || 'N/A'));
        const productosDisplay = a.skus_display || a.cantidad_productos + ' producto(s)';
        const cantidadDisplay = a.cantidad_total_ajustada ? a.cantidad_total_ajustada.toFixed(2) : 'N/A';
        const tipoBadge = a.tipo_ajuste === 'Físico'
            ? '<span class="status-badge tipo-fisico">Físico</span>'
            : '<span class="status-badge tipo-adm">ADM</span>';
        return '<div class="wms-mobile-card">' +
            '<div class="wms-mobile-card-header">' +
                '<div><span class="wms-mobile-card-title">' + escapeHtml(ubicacionDisplay) + '</span><span class="wms-mobile-card-meta">' + (a.fecha ? new Date(a.fecha).toLocaleDateString('es-DO') : 'N/A') + '</span></div>' +
                tipoBadge +
            '</div>' +
            '<div class="wms-mobile-card-rows">' +
                '<div><div class="wms-mobile-card-label">Productos</div><div class="wms-mobile-card-value">' + escapeHtml(productosDisplay) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Cantidad</div><div class="wms-mobile-card-value">' + cantidadDisplay + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Usuario</div><div class="wms-mobile-card-value">' + escapeHtml(a.usuario || 'N/A') + '</div></div>' +
                (a.notas ? '<div><div class="wms-mobile-card-label">Notas</div><div class="wms-mobile-card-value">' + escapeHtml(a.notas.length > 60 ? a.notas.substring(0,60)+'...' : a.notas) + '</div></div>' : '') +
            '</div>' +
            '<div class="wms-mobile-card-actions">' +
                '<button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + a.id + '\')">Ver Detalle</button>' +
                '<button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarAjuste(\'' + a.id + '\')">Editar</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderizarPaginacion(total, page, pages) {
    document.getElementById('pagination-info').textContent = 'Mostrando ' + (((page - 1) * perPage) + 1) + ' - ' + Math.min(page * perPage, total) + ' de ' + total;
    const controls = document.getElementById('pagination-controls');
    controls.innerHTML = '';
    const btnPrev = document.createElement('button');
    btnPrev.className = 'wms-page-btn'; btnPrev.textContent = '← Anterior';
    btnPrev.disabled = page === 1; btnPrev.onclick = () => aplicarFiltros(page - 1);
    controls.appendChild(btnPrev);
    for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
        const btn = document.createElement('button');
        btn.className = 'wms-page-btn' + (i === page ? ' active' : '');
        btn.textContent = i; btn.onclick = () => aplicarFiltros(i);
        controls.appendChild(btn);
    }
    const btnNext = document.createElement('button');
    btnNext.className = 'wms-page-btn'; btnNext.textContent = 'Siguiente →';
    btnNext.disabled = page === pages; btnNext.onclick = () => aplicarFiltros(page + 1);
    controls.appendChild(btnNext);
}

function limpiarFiltros() {
    ['fecha_desde','fecha_hasta','ubicacion_fisica','sku','tipo_ajuste','usuario_id','search'].forEach(id => document.getElementById(id).value = '');
    aplicarFiltros(1);
}

function nuevoAjuste() { window.location.href = '/ajustes/nuevo'; }
function verDetalle(id) { window.location.href = '/ajustes/detalle?id=' + encodeURIComponent(id); }
function editarAjuste(id) { window.location.href = '/ajustes/detalle?id=' + encodeURIComponent(id) + '&editar=true'; }

/* Catálogo */
let catalogoInfoCache = null;

async function abrirModalDescargarCatalogo() {
    document.getElementById('modal-descargar-catalogo').classList.add('show');
    const wmsSpan = document.getElementById('catalogo-wms-count');
    const complSpan = document.getElementById('catalogo-completo-count');
    wmsSpan.textContent = '(cargando...)'; complSpan.textContent = '(cargando...)';
    try {
        const resp = await fetch('/api/ajustes/catalogo-info');
        const data = await resp.json();
        catalogoInfoCache = data;
        if (data.success) {
            wmsSpan.textContent = data.wms.mensaje;
            complSpan.textContent = data.completo.mensaje;
        } else { wmsSpan.textContent = '—'; complSpan.textContent = '—'; }
    } catch (e) { wmsSpan.textContent = '—'; complSpan.textContent = '—'; }
}

function cerrarModalDescargarCatalogo() { document.getElementById('modal-descargar-catalogo').classList.remove('show'); }

function descargarCatalogo(tipo) {
    const info = catalogoInfoCache;
    const d = tipo === 'completo' ? (info?.completo || {}) : (info?.wms || {});
    if (d.truncado && d.total != null && d.descargados != null && !confirm('Hay ' + d.total.toLocaleString() + ' en total. Se incluirán ' + d.descargados.toLocaleString() + '. ¿Continuar?')) return;
    window.location.href = tipo === 'completo' ? '/api/ajustes/descargar-catalogo?tipo=completo' : '/api/ajustes/descargar-catalogo';
    cerrarModalDescargarCatalogo();
}

/* Carga Masiva */
function abrirModalCargaMasiva() { document.getElementById('modal-carga-masiva').classList.add('show'); }

function cerrarModalCargaMasiva() {
    document.getElementById('modal-carga-masiva').classList.remove('show');
    document.getElementById('archivo-excel').value = '';
    document.getElementById('notas-generales').value = '';
    document.getElementById('resultado-carga').innerHTML = '';
}

async function procesarExcel() {
    const archivoInput = document.getElementById('archivo-excel');
    const notasGenerales = document.getElementById('notas-generales').value.trim();
    const resultadoDiv = document.getElementById('resultado-carga');
    if (!archivoInput.files || archivoInput.files.length === 0) { mostrarMensaje('error', 'Selecciona un archivo Excel'); return; }

    const formData = new FormData();
    formData.append('archivo', archivoInput.files[0]);
    if (notasGenerales) formData.append('notas', notasGenerales);
    resultadoDiv.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Procesando...</div>';

    try {
        const response = await fetch('/api/ajustes/cargar-excel', { method: 'POST', body: formData });
        const data = await response.json();
        if (data.success) {
            let html = '<div style="background:var(--color-success-bg);padding:var(--space-4);border-radius:var(--radius-md);margin-bottom:var(--space-4);">' +
                '<strong style="color:var(--color-success-text)">✅ Procesamiento Exitoso</strong>' +
                '<p style="color:var(--color-success-text);margin-top:var(--space-2);font-size:var(--font-size-sm)">' +
                'Ajustes: ' + data.total_ajustes + ' · Movimientos: ' + data.total_movimientos + ' · Productos: ' + data.productos_unicos +
                (data.total_errores > 0 ? ' · Errores: ' + data.total_errores : '') + '</p></div>';
            if (data.errores && data.errores.length > 0) {
                html += '<div style="background:var(--color-warning-bg);padding:var(--space-4);border-radius:var(--radius-md);border-left:4px solid var(--color-warning);">' +
                    '<strong style="color:var(--color-warning-text)">⚠️ Errores (' + data.errores.length + '):</strong>' +
                    '<div style="max-height:200px;overflow-y:auto;margin-top:var(--space-2);font-size:var(--font-size-xs);color:var(--color-warning-text)">' +
                    data.errores.map(e => '<div style="margin-bottom:var(--space-1)"><strong>Fila ' + e.fila + ':</strong> ' + escapeHtml(e.error) + '</div>').join('') +
                    '</div></div>';
                mostrarMensaje('warning', 'Completado con ' + data.total_errores + ' error(es)');
                aplicarFiltros();
            } else {
                mostrarMensaje('success', 'Ajustes procesados: ' + data.total_ajustes + ' ajustes, ' + data.total_movimientos + ' movimientos');
                setTimeout(() => { aplicarFiltros(); cerrarModalCargaMasiva(); }, 3000);
            }
            resultadoDiv.innerHTML = html;
        } else {
            resultadoDiv.innerHTML = '<div style="background:var(--color-danger-bg);padding:var(--space-4);border-radius:var(--radius-md);color:var(--color-danger-text)"><strong>❌ Error:</strong> ' + escapeHtml(data.error || 'Error desconocido') + '</div>';
            mostrarMensaje('error', data.error || 'Error al procesar');
        }
    } catch (error) {
        resultadoDiv.innerHTML = '<div style="background:var(--color-danger-bg);padding:var(--space-4);border-radius:var(--radius-md);color:var(--color-danger-text)">Error de conexión</div>';
        mostrarMensaje('error', 'Error de conexión');
    }
}
