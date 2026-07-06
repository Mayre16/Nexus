/* WMS Common — Shared utilities for all pages */

function cerrarSesion() {
    fetch('/api/auth/logout', { method: 'POST' })
        .then(function() { window.location.href = '/login'; })
        .catch(function() { window.location.href = '/login'; });
}

function mostrarMensaje(tipo, mensaje, duracion) {
    var ids = ['message-success', 'message-error', 'message-warning'];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
    var div = document.getElementById('message-' + tipo);
    if (!div) return;
    div.textContent = mensaje;
    div.classList.add('show');
    var t = duracion || (tipo === 'warning' ? 15000 : 5000);
    setTimeout(function() { div.classList.remove('show'); }, t);
}

function toggleFiltros(ev) {
    var btn = (ev && ev.currentTarget) ? ev.currentTarget : document.querySelector('.wms-filters-toggle');
    if (!btn) return;
    var root = btn.closest('.wms-card-body') || btn.closest('.card') || btn.closest('.wms-page') || document.body;
    var filters = root.querySelector('.wms-filters.collapsible');
    if (!filters) return;
    btn.classList.toggle('active');
    filters.classList.toggle('show');
    var expanded = filters.classList.contains('show');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function initFiltrosToggle() {
    document.querySelectorAll('.wms-filters-toggle').forEach(function(btn) {
        btn.addEventListener('click', toggleFiltros);
    });
}

/** Escaneo de ubicación física (móvil); requiere html5-qrcode + wms-barcode.js en la página */
function abrirEscanerUbicacion(inputId) {
    if (typeof WmsBarcode === 'undefined' || !WmsBarcode.open) {
        if (typeof mostrarMensaje === 'function') {
            mostrarMensaje('error', 'Escáner no disponible. Recarga la página o usa HTTPS.');
        }
        return;
    }
    WmsBarcode.open({
        inputId: inputId,
        title: 'Escanear ubicación',
        intro: 'Apunta al código de la ubicación física (estantería / pasillo).',
        normalize: function (s) {
            return String(s).trim().toUpperCase();
        }
    });
}

document.addEventListener('DOMContentLoaded', initFiltrosToggle);
