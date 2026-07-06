let currentPage = 1;
let perPage = 10;

function filtroValor(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
}

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
    const tbody = document.getElementById('transferencias-tbody');
    const cards = document.getElementById('transferencias-cards');
    tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:var(--space-8)"><div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div></td></tr>';
    cards.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div>';

    const params = new URLSearchParams({
        page: currentPage, per_page: perPage,
        fecha_desde: filtroValor('fecha_desde'),
        fecha_hasta: filtroValor('fecha_hasta'),
        ubicacion_origen: filtroValor('ubicacion_origen'),
        ubicacion_destino: filtroValor('ubicacion_destino'),
        estado: filtroValor('estado'),
        usuario_id: filtroValor('usuario_id'),
        search: filtroValor('search')
    });

    try {
        const response = await fetch('/api/historial/transferencias?' + params);
        const data = await response.json();
        if (!data.success) { mostrarMensaje('error', data.error || 'Error al cargar transferencias'); return; }
        renderizarTabla(data.transferencias);
        renderizarCards(data.transferencias);
        renderizarPaginacion(data.total, data.page, data.pages);
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión');
        tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:var(--space-8)"><div class="wms-empty">Error al cargar datos</div></td></tr>';
        cards.innerHTML = '<div class="wms-empty">Error al cargar datos</div>';
    }
}

function renderizarTabla(transferencias) {
    const tbody = document.getElementById('transferencias-tbody');
    if (transferencias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:var(--space-8)"><div class="wms-empty"><div class="wms-empty-icon">🔄</div><div class="wms-empty-title">No se encontraron transferencias</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = transferencias.map(t =>
        '<tr>' +
        '<td><strong>' + escapeHtml(t.transferencia_docid) + '</strong></td>' +
        '<td>' + formatarFechaDocumento(t.fecha) + '</td>' +
        '<td>' + escapeHtml(t.ubicacion_origen) + '</td>' +
        '<td>' + escapeHtml(t.ubicacion_destino) + '</td>' +
        '<td>' + escapeHtml(t.ubicacion_fisica_origen || 'N/A') + '</td>' +
        '<td>' + escapeHtml(t.ubicacion_fisica_destino || 'N/A') + '</td>' +
        '<td>' + t.cantidad_productos + '</td>' +
        '<td><span class="status-badge status-' + t.estado.toLowerCase() + '">' + t.estado + '</span></td>' +
        '<td>' + escapeHtml(t.usuario_solicitante || 'N/A') + '</td>' +
        '<td>' + escapeHtml(t.usuario || 'N/A') + '</td>' +
        '<td><button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + t.transferencia_guid + '\')">Ver</button> <button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarTransferencia(\'' + t.transferencia_guid + '\')">Editar</button></td>' +
        '</tr>'
    ).join('');
}

function renderizarCards(transferencias) {
    const container = document.getElementById('transferencias-cards');
    if (transferencias.length === 0) {
        container.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">🔄</div><div class="wms-empty-title">No se encontraron transferencias</div></div>';
        return;
    }
    container.innerHTML = transferencias.map(t =>
        '<div class="wms-mobile-card">' +
            '<div class="wms-mobile-card-header">' +
                '<div><span class="wms-mobile-card-title">' + escapeHtml(t.transferencia_docid) + '</span><span class="wms-mobile-card-meta">' + formatarFechaDocumento(t.fecha) + '</span></div>' +
                '<span class="status-badge status-' + t.estado.toLowerCase() + '">' + t.estado + '</span>' +
            '</div>' +
            '<div class="wms-mobile-card-rows">' +
                '<div><div class="wms-mobile-card-label">Origen</div><div class="wms-mobile-card-value">' + escapeHtml(t.ubicacion_origen) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Destino</div><div class="wms-mobile-card-value">' + escapeHtml(t.ubicacion_destino) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Productos</div><div class="wms-mobile-card-value">' + t.cantidad_productos + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Usuario</div><div class="wms-mobile-card-value">' + escapeHtml(t.usuario || 'N/A') + '</div></div>' +
            '</div>' +
            '<div class="wms-mobile-card-actions">' +
                '<button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + t.transferencia_guid + '\')">Ver Detalle</button>' +
                '<button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarTransferencia(\'' + t.transferencia_guid + '\')">Editar</button>' +
            '</div>' +
        '</div>'
    ).join('');
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
    ['fecha_desde', 'fecha_hasta', 'ubicacion_origen', 'ubicacion_destino', 'estado', 'usuario_id', 'search'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    aplicarFiltros(1);
}

function nuevaTransferencia() { window.location.href = '/transferencia'; }
function verDetalle(guid) { window.location.href = '/transferencia?guid=' + guid; }
function editarTransferencia(guid) { window.location.href = '/transferencia?guid=' + guid + '&editar=true'; }
