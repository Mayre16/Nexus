let currentPage = 1;
let perPage = 10;
let totalPages = 1;
const tipoMap = { 'RECEPTION': 'Recepción', 'VEND_REC': 'Compra', 'CREDIT_NOTE': 'Nota Crédito' };

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
                option.value = u.id;
                option.textContent = u.nombre;
                select.appendChild(option);
            });
        }
    } catch (error) { console.error('Error al cargar usuarios:', error); }
}

async function aplicarFiltros(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('recepciones-tbody');
    const cards = document.getElementById('recepciones-cards');
    tbody.innerHTML = '<tr><td colspan="12" class="text-center" style="padding:var(--space-8)"><div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div></td></tr>';
    cards.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div>';

    const params = new URLSearchParams({
        page: currentPage, per_page: perPage,
        fecha_desde: document.getElementById('fecha_desde').value || '',
        fecha_hasta: document.getElementById('fecha_hasta').value || '',
        ubicacion_adm: document.getElementById('ubicacion_adm').value || '',
        ubicacion_fisica: document.getElementById('ubicacion_fisica').value || '',
        proveedor: document.getElementById('proveedor').value || '',
        tipo_recepcion: document.getElementById('tipo_recepcion').value || '',
        estado: document.getElementById('estado').value || '',
        usuario_id: document.getElementById('usuario_id').value || '',
        search: document.getElementById('search').value || ''
    });

    try {
        const response = await fetch('/api/historial/recepciones?' + params);
        const data = await response.json();
        if (!data.success) { mostrarMensaje('error', data.error || 'Error al cargar recepciones'); return; }
        totalPages = data.pages;
        renderizarTabla(data.recepciones);
        renderizarCards(data.recepciones);
        renderizarPaginacion(data.total, data.page, data.pages);
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
        tbody.innerHTML = '<tr><td colspan="12" class="text-center" style="padding:var(--space-8)"><div class="wms-empty">Error al cargar datos</div></td></tr>';
        cards.innerHTML = '<div class="wms-empty">Error al cargar datos</div>';
    }
}

function renderizarTabla(recepciones) {
    const tbody = document.getElementById('recepciones-tbody');
    if (recepciones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center" style="padding:var(--space-8)"><div class="wms-empty"><div class="wms-empty-icon">📦</div><div class="wms-empty-title">No se encontraron recepciones</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = recepciones.map(r => {
        const ec = (r.estado || '').toLowerCase().replace('_', '-');
        return '<tr>' +
            '<td><strong>' + escapeHtml(r.numero) + '</strong></td>' +
            '<td>' + (r.fecha ? new Date(r.fecha).toLocaleDateString('es-DO') : 'N/A') + '</td>' +
            '<td>' + (tipoMap[r.tipo] || r.tipo || 'N/A') + '</td>' +
            '<td>' + escapeHtml(r.proveedor || 'N/A') + '</td>' +
            '<td>' + escapeHtml(r.ubicacion_adm || 'N/A') + '</td>' +
            '<td>' + escapeHtml((r.ubicaciones_fisicas || []).join(', ') || 'N/A') + '</td>' +
            '<td>' + r.cantidad_productos + '</td>' +
            '<td>' + r.cantidad_total.toFixed(2) + '</td>' +
            '<td><span class="status-badge status-' + ec + '">' + (r.estado || '').replace('_', ' ') + '</span></td>' +
            '<td>' + escapeHtml(r.usuario_solicitante || 'N/A') + '</td>' +
            '<td>' + escapeHtml(r.usuario || 'N/A') + '</td>' +
            '<td><button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + r.id + '\')">Ver</button></td>' +
        '</tr>';
    }).join('');
}

function renderizarCards(recepciones) {
    const container = document.getElementById('recepciones-cards');
    if (recepciones.length === 0) {
        container.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">📦</div><div class="wms-empty-title">No se encontraron recepciones</div></div>';
        return;
    }
    container.innerHTML = recepciones.map(r => {
        const ec = (r.estado || '').toLowerCase().replace('_', '-');
        return '<div class="wms-mobile-card">' +
            '<div class="wms-mobile-card-header">' +
                '<div><span class="wms-mobile-card-title">' + escapeHtml(r.numero) + '</span><span class="wms-mobile-card-meta">' + (r.fecha ? new Date(r.fecha).toLocaleDateString('es-DO') : 'N/A') + ' · ' + (tipoMap[r.tipo] || r.tipo || '') + '</span></div>' +
                '<span class="status-badge status-' + ec + '">' + (r.estado || '').replace('_', ' ') + '</span>' +
            '</div>' +
            '<div class="wms-mobile-card-rows">' +
                '<div><div class="wms-mobile-card-label">Proveedor</div><div class="wms-mobile-card-value">' + escapeHtml(r.proveedor || 'N/A') + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Productos</div><div class="wms-mobile-card-value">' + r.cantidad_productos + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Cantidad</div><div class="wms-mobile-card-value">' + r.cantidad_total.toFixed(2) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Ubicación</div><div class="wms-mobile-card-value">' + escapeHtml(r.ubicacion_adm || 'N/A') + '</div></div>' +
            '</div>' +
            '<div class="wms-mobile-card-actions">' +
                '<button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + r.id + '\')">Ver Detalle</button>' +
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
    ['fecha_desde','fecha_hasta','ubicacion_adm','ubicacion_fisica','proveedor','tipo_recepcion','estado','usuario_id','search'].forEach(id => document.getElementById(id).value = '');
    aplicarFiltros(1);
}

function nuevaRecepcion() { window.location.href = '/recepcion'; }
function verDetalle(id) { window.location.href = '/recepcion?guid=' + id; }
