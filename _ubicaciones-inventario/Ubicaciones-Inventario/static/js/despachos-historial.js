let currentPage = 1;
let perPage = 10;

const tipoMap = {
    'CASH': 'Contado',
    'CREDIT': 'Crédito',
    'ORDER': 'Conduce'
};

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
    } catch (error) {
        window.location.href = '/login';
    }
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
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
    }
}

async function aplicarFiltros(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('despachos-tbody');
    const cards = document.getElementById('despachos-cards');
    tbody.innerHTML = '<tr><td colspan="13" class="text-center" style="padding:var(--space-8)"><div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div></td></tr>';
    cards.innerHTML = '<div class="wms-loading"><div class="wms-spinner"></div> Cargando...</div>';

    const params = new URLSearchParams({
        page: currentPage, per_page: perPage,
        fecha_desde: document.getElementById('fecha_desde').value || '',
        fecha_hasta: document.getElementById('fecha_hasta').value || '',
        ubicacion_adm: document.getElementById('ubicacion_adm').value || '',
        ubicacion_fisica: document.getElementById('ubicacion_fisica').value || '',
        tipo_documento: document.getElementById('tipo_documento').value || '',
        estado: document.getElementById('estado').value || '',
        cliente: document.getElementById('cliente').value || '',
        usuario_id: document.getElementById('usuario_id').value || '',
        search: document.getElementById('search').value || ''
    });

    try {
        const response = await fetch('/api/historial/despachos?' + params);
        const data = await response.json();
        if (!data.success) { mostrarMensaje('error', data.error || 'Error al cargar despachos'); return; }
        renderizarTabla(data.despachos);
        renderizarCards(data.despachos);
        renderizarPaginacion(data.total, data.page, data.pages);
    } catch (error) {
        mostrarMensaje('error', 'Error de conexión al cargar despachos');
        tbody.innerHTML = '<tr><td colspan="13" class="text-center" style="padding:var(--space-8)"><div class="wms-empty">Error al cargar datos</div></td></tr>';
        cards.innerHTML = '<div class="wms-empty">Error al cargar datos</div>';
    }
}

function renderizarTabla(despachos) {
    const tbody = document.getElementById('despachos-tbody');
    if (despachos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center" style="padding:var(--space-8)"><div class="wms-empty"><div class="wms-empty-icon">📋</div><div class="wms-empty-title">No se encontraron despachos</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = despachos.map(d => '<tr>' +
        '<td><strong>' + escapeHtml(d.factura_docid) + '</strong></td>' +
        '<td>' + formatarFechaDocumento(d.fecha) + '</td>' +
        '<td>' + (tipoMap[d.tipo_documento] || d.tipo_documento) + '</td>' +
        '<td>' + escapeHtml(d.cliente || 'N/A') + '</td>' +
        '<td>' + escapeHtml(d.ubicacion_adm || 'N/A') + '</td>' +
        '<td>' + escapeHtml((d.ubicaciones_fisicas || []).join(', ') || 'N/A') + '</td>' +
        '<td>' + d.cantidad_productos + '</td>' +
        '<td>' + (d.cantidad_total_despachada || 0).toFixed(0) + '</td>' +
        '<td>$' + d.total.toFixed(2) + '</td>' +
        '<td><span class="status-badge status-' + d.estado.toLowerCase().replace('_', '-') + '">' + d.estado.replace('_', ' ') + '</span></td>' +
        '<td>' + escapeHtml(d.usuario_solicitante || 'N/A') + '</td>' +
        '<td>' + escapeHtml(d.usuario || 'N/A') + '</td>' +
        '<td><button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + d.factura_guid + '\')">Ver</button> <button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarDespacho(\'' + d.factura_guid + '\')">Editar</button></td>' +
        '</tr>'
    ).join('');
}

function renderizarCards(despachos) {
    const container = document.getElementById('despachos-cards');
    if (despachos.length === 0) {
        container.innerHTML = '<div class="wms-empty"><div class="wms-empty-icon">📋</div><div class="wms-empty-title">No se encontraron despachos</div></div>';
        return;
    }
    container.innerHTML = despachos.map(d => {
        const estadoClass = 'status-' + d.estado.toLowerCase().replace('_', '-');
        return '<div class="wms-mobile-card">' +
            '<div class="wms-mobile-card-header">' +
                '<div><span class="wms-mobile-card-title">' + escapeHtml(d.factura_docid) + '</span><span class="wms-mobile-card-meta">' + formatarFechaDocumento(d.fecha) + ' · ' + (tipoMap[d.tipo_documento] || d.tipo_documento) + '</span></div>' +
                '<span class="status-badge ' + estadoClass + '">' + d.estado.replace('_', ' ') + '</span>' +
            '</div>' +
            '<div class="wms-mobile-card-rows">' +
                '<div><div class="wms-mobile-card-label">Cliente</div><div class="wms-mobile-card-value">' + escapeHtml(d.cliente || 'N/A') + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Total</div><div class="wms-mobile-card-value">$' + d.total.toFixed(2) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Productos</div><div class="wms-mobile-card-value">' + d.cantidad_productos + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Cantidad</div><div class="wms-mobile-card-value">' + (d.cantidad_total_despachada || 0).toFixed(0) + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Ubicación</div><div class="wms-mobile-card-value">' + escapeHtml(d.ubicacion_adm || 'N/A') + '</div></div>' +
                '<div><div class="wms-mobile-card-label">Usuario</div><div class="wms-mobile-card-value">' + escapeHtml(d.usuario || 'N/A') + '</div></div>' +
            '</div>' +
            '<div class="wms-mobile-card-actions">' +
                '<button class="wms-btn wms-btn-primary wms-btn-sm" onclick="verDetalle(\'' + d.factura_guid + '\')">Ver Detalle</button>' +
                '<button class="wms-btn wms-btn-secondary wms-btn-sm" onclick="editarDespacho(\'' + d.factura_guid + '\')">Editar</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderizarPaginacion(total, page, pages) {
    document.getElementById('pagination-info').textContent = 'Mostrando ' + (((page - 1) * perPage) + 1) + ' - ' + Math.min(page * perPage, total) + ' de ' + total + ' registros';
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
    document.getElementById('fecha_desde').value = '';
    document.getElementById('fecha_hasta').value = '';
    document.getElementById('ubicacion_adm').value = '';
    document.getElementById('ubicacion_fisica').value = '';
    document.getElementById('tipo_documento').value = '';
    document.getElementById('estado').value = '';
    document.getElementById('cliente').value = '';
    document.getElementById('usuario_id').value = '';
    document.getElementById('search').value = '';
    aplicarFiltros(1);
}

function nuevoDespacho() { window.location.href = '/despacho'; }
function verDetalle(guid) { window.location.href = '/despacho?guid=' + guid; }
function editarDespacho(guid) { window.location.href = '/despacho?guid=' + guid + '&editar=true'; }
