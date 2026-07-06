/**
 * Módulo Abastecimiento (admin): políticas min/max y exportación.
 */
(function () {
    'use strict';

    var page = 1;
    var perPage = 50;
    var totalPages = 1;
    /** True si la ubicación de abastecimiento tiene sync "running" (servidor bloquea KPIs/tabla). */
    var syncBloqueado = false;

    function toastError(msg) {
        var el = document.getElementById('message-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 6000);
    }

    function toastOk(msg) {
        var el = document.getElementById('message-success');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 4000);
    }

    function badgeEstado(estado) {
        var map = {
            sin_config: { t: 'Sin configuración', c: 'abast-badge--muted' },
            bajo_minimo: { t: 'Bajo mínimo', c: 'abast-badge--danger' },
            en_rango: { t: 'En rango', c: 'abast-badge--ok' },
            sobre_maximo: { t: 'Sobre máximo', c: 'abast-badge--warn' },
            inactivo: { t: 'Política inactiva', c: 'abast-badge--muted' }
        };
        var x = map[estado] || { t: estado, c: 'abast-badge--muted' };
        return '<span class="abast-badge ' + x.c + '">' + escapeHtml(x.t) + '</span>';
    }

    var PRI_TXT = {
        critica: 'Crítica',
        alta: 'Alta',
        media: 'Media',
        normal: 'Normal',
        sin_config: '—',
        sobre_maximo: 'Sobre máx.'
    };

    /** Muestra fecha UTC del servidor en hora local del navegador */
    function formatLocalSyncDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso.indexOf('Z') === -1 && iso.indexOf('+') === -1 ? iso + 'Z' : iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
    }

    function badgePrioridad(p) {
        var map = {
            critica: 'abast-p--crit',
            alta: 'abast-p--high',
            media: 'abast-p--med',
            normal: 'abast-p--norm',
            sin_config: 'abast-p--none',
            sobre_maximo: 'abast-p--over'
        };
        var t = PRI_TXT[p] || p;
        return '<span class="abast-p ' + (map[p] || 'abast-p--norm') + '">' + escapeHtml(t) + '</span>';
    }

    async function verificarAdmin() {
        var r = await fetch('/api/auth/me');
        var d = await r.json();
        if (!d.success) {
            window.location.href = '/login';
            return false;
        }
        var u = document.getElementById('user-info');
        if (u) u.textContent = d.usuario.nombre || '';
        if (!d.usuario.rol || !/^administrador$/i.test(String(d.usuario.rol))) {
            toastError('Solo administradores pueden acceder a Abastecimiento.');
            setTimeout(function () { window.location.href = '/'; }, 2000);
            return false;
        }
        return true;
    }

    function limpiarKpis() {
        ['kpi-activos', 'kpi-bajo', 'kpi-sin', 'kpi-cero', 'kpi-sugerido', 'kpi-rango'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
    }

    function mostrarBloqueoSync(mensaje) {
        syncBloqueado = true;
        var msg = mensaje || 'Espere a que termine la sincronización y recargue la página.';
        var box = document.getElementById('abastecimiento-sync-alert');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = '<strong>Sincronización en curso.</strong> ' + escapeHtml(msg) +
                ' <button type="button" class="wms-btn wms-btn-sm wms-btn-primary" onclick="location.reload()">Recargar página</button>';
        }
        limpiarKpis();
        var tbody = document.getElementById('tabla-productos-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="abastecimiento-empty">' + escapeHtml(msg) + '</td></tr>';
        }
    }

    async function cargarMeta() {
        var r = await fetch('/api/abastecimiento/meta');
        var text = await r.text();
        var d;
        try {
            d = JSON.parse(text);
        } catch (e) {
            return;
        }
        var alertEl = document.getElementById('abastecimiento-config-alert');
        if (d.error_config) {
            if (alertEl) {
                alertEl.style.display = 'block';
                alertEl.innerHTML = '<strong>Ubicación:</strong> ' + escapeHtml(d.error_config);
            }
        } else {
            if (alertEl) alertEl.style.display = 'none';
        }
        var nameEl = document.getElementById('meta-location-name');
        if (nameEl) nameEl.textContent = d.location_name || d.location_id || '—';
        var syncEl = document.getElementById('meta-last-sync');
        if (syncEl) syncEl.textContent = d.last_sync_at ? formatLocalSyncDate(d.last_sync_at) : '—';
        var stEl = document.getElementById('meta-sync-status');
        if (stEl) stEl.textContent = d.sync_status || '—';

        syncBloqueado = !!d.sync_bloqueando;
        var syncBox = document.getElementById('abastecimiento-sync-alert');
        if (syncBloqueado) {
            mostrarBloqueoSync(d.sync_bloqueo_mensaje || '');
        } else if (syncBox) {
            syncBox.style.display = 'none';
            syncBox.innerHTML = '';
        }
    }

    function setKpi(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    async function cargarKpis() {
        if (syncBloqueado) return;
        var r = await fetch('/api/abastecimiento/kpis?universo=' + encodeURIComponent(readUniverso()));
        var text = await r.text();
        var d;
        try {
            d = JSON.parse(text);
        } catch (e) {
            return;
        }
        if (r.status === 503 && d.error === 'sync_en_curso') {
            mostrarBloqueoSync(d.message);
            return;
        }
        if (!d.success) return;
        setKpi('kpi-activos', d.total_productos_activos);
        setKpi('kpi-bajo', d.bajo_minimo);
        setKpi('kpi-sin', d.sin_politica);
        setKpi('kpi-cero', d.stock_cero);
        setKpi('kpi-sugerido', d.suma_cantidad_sugerida);
        setKpi('kpi-rango', d.porcentaje_en_rango != null ? d.porcentaje_en_rango + '%' : '—');
    }

    function readPerPage() {
        var sel = document.getElementById('filtro-per-page');
        var v = sel ? parseInt(sel.value, 10) : 50;
        if (v === 10 || v === 50 || v === 100) return v;
        return 50;
    }

    function readUniverso() {
        var sel = document.getElementById('filtro-universo');
        var v = sel ? String(sel.value || '').trim() : 'incluidos';
        if (v === 'incluidos' || v === 'no_incluidos' || v === 'todos') return v;
        return 'incluidos';
    }

    async function cargarTabla() {
        if (syncBloqueado) return;
        perPage = readPerPage();
        var q = document.getElementById('filtro-q');
        var est = document.getElementById('filtro-estado');
        var st = document.getElementById('filtro-stock');
        var univ = document.getElementById('filtro-universo');
        var params = new URLSearchParams({
            page: String(page),
            per_page: String(perPage),
            q: q ? q.value.trim() : '',
            estado: est ? est.value : 'todos',
            stock_filtro: st ? st.value : 'todos',
            universo: univ ? univ.value : 'incluidos'
        });
        var r = await fetch('/api/abastecimiento/productos?' + params.toString());
        var text = await r.text();
        var d;
        try {
            d = JSON.parse(text);
        } catch (e) {
            var tbody0 = document.getElementById('tabla-productos-body');
            if (tbody0) tbody0.innerHTML = '<tr><td colspan="9">Respuesta no válida del servidor.</td></tr>';
            return;
        }
        var tbody = document.getElementById('tabla-productos-body');
        if (!tbody) return;
        if (r.status === 503 && d.error === 'sync_en_curso') {
            mostrarBloqueoSync(d.message);
            return;
        }
        if (!d.success) {
            tbody.innerHTML = '<tr><td colspan="9">' + escapeHtml(d.error || 'Error') + '</td></tr>';
            return;
        }
        totalPages = d.pages || 1;
        if (!d.items || !d.items.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="abastecimiento-empty">Sin resultados</td></tr>';
        } else {
            tbody.innerHTML = d.items.map(function (row) {
                var sug = row.cantidad_sugerida != null ? row.cantidad_sugerida.toFixed(2) : '—';
                var btn = '<button type="button" class="wms-btn wms-btn-secondary wms-btn-sm abast-btn-edit" ' +
                    'data-producto-id="' + row.producto_id + '" ' +
                    'data-sku="' + escapeHtmlAttr(row.sku) + '" ' +
                    'data-min="' + (row.tiene_configuracion ? String(row.stock_min) : '') + '" ' +
                    'data-max="' + (row.tiene_configuracion ? String(row.stock_max) : '') + '" ' +
                    'data-activo="' + (row.activo_politica !== false ? '1' : '0') + '" ' +
                    'data-es-base="' + (row.es_base_abastecimiento ? '1' : '0') + '" ' +
                    'data-obs="' + escapeHtmlAttr(row.observacion || '') + '">Editar</button>';
                return '<tr>' +
                    '<td>' + escapeHtml(row.sku) + '</td>' +
                    '<td>' + escapeHtml(row.nombre) + '</td>' +
                    '<td>' + Number(row.stock_actual).toFixed(2) + '</td>' +
                    '<td>' + (row.tiene_configuracion ? Number(row.stock_min).toFixed(2) : '—') + '</td>' +
                    '<td>' + (row.tiene_configuracion ? Number(row.stock_max).toFixed(2) : '—') + '</td>' +
                    '<td>' + badgeEstado(row.estado) + '</td>' +
                    '<td>' + badgePrioridad(row.prioridad) + '</td>' +
                    '<td>' + sug + '</td>' +
                    '<td>' + btn + '</td>' +
                    '</tr>';
            }).join('');
            tbody.querySelectorAll('.abast-btn-edit').forEach(function (b) {
                b.addEventListener('click', function () {
                    abrirModalPolitica({
                        producto_id: parseInt(b.getAttribute('data-producto-id'), 10),
                        sku: b.getAttribute('data-sku') || '',
                        stock_min: b.getAttribute('data-min') || '',
                        stock_max: b.getAttribute('data-max') || '',
                        activo: b.getAttribute('data-activo') === '1',
                        es_base_abastecimiento: b.getAttribute('data-es-base') === '1',
                        observacion: b.getAttribute('data-obs') || ''
                    });
                });
            });
        }
        var pag = document.getElementById('paginacion');
        if (pag) {
            pag.innerHTML = 'Página ' + d.page + ' de ' + (d.pages || 1) + ' · ' + (d.total || 0) + ' registros · ' + (d.per_page || perPage) + ' por página ' +
                '<button type="button" class="wms-btn wms-btn-sm wms-btn-secondary" ' + (page <= 1 ? 'disabled' : '') + ' id="btn-prev">Anterior</button> ' +
                '<button type="button" class="wms-btn wms-btn-sm wms-btn-secondary" ' + (page >= totalPages ? 'disabled' : '') + ' id="btn-next">Siguiente</button>';
            var prev = document.getElementById('btn-prev');
            var next = document.getElementById('btn-next');
            if (prev) prev.onclick = function () { if (page > 1) { page--; cargarTabla(); } };
            if (next) next.onclick = function () { if (page < totalPages) { page++; cargarTabla(); } };
        }
    }

    window.abrirModalPolitica = function (data) {
        document.getElementById('modal-producto-id').value = data.producto_id;
        document.getElementById('modal-politica-sku').textContent = data.sku;
        document.getElementById('modal-min').value = data.stock_min !== '' && data.stock_min !== undefined ? data.stock_min : '';
        document.getElementById('modal-max').value = data.stock_max !== '' && data.stock_max !== undefined ? data.stock_max : '';
        document.getElementById('modal-activo').checked = data.activo !== false;
        document.getElementById('modal-es-base').checked = data.es_base_abastecimiento === true;
        document.getElementById('modal-obs').value = data.observacion || '';
        document.getElementById('modal-politica').style.display = 'flex';
    };

    window.cerrarModalPolitica = function () {
        document.getElementById('modal-politica').style.display = 'none';
    };

    window.guardarPolitica = async function () {
        var pid = document.getElementById('modal-producto-id').value;
        var body = {
            producto_id: parseInt(pid, 10),
            stock_min: document.getElementById('modal-min').value,
            stock_max: document.getElementById('modal-max').value,
            activo: document.getElementById('modal-activo').checked,
            es_base_abastecimiento: document.getElementById('modal-es-base').checked,
            observacion: document.getElementById('modal-obs').value
        };
        var r = await fetch('/api/abastecimiento/politica', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        var text = await r.text();
        var d;
        try {
            d = JSON.parse(text);
        } catch (e) {
            toastError('Error al guardar');
            return;
        }
        if (r.status === 503 && d.error === 'sync_en_curso') {
            toastError(d.message || 'Sincronización en curso');
            mostrarBloqueoSync(d.message);
            cerrarModalPolitica();
            return;
        }
        if (!d.success) {
            toastError(d.error || 'Error al guardar');
            return;
        }
        toastOk('Política guardada');
        cerrarModalPolitica();
        cargarKpis();
        cargarTabla();
    };

    var pendingImportFile = null;

    function setupImport() {
        var input = document.getElementById('input-import');
        if (!input) return;
        input.addEventListener('change', async function () {
            if (!input.files || !input.files[0]) return;
            pendingImportFile = input.files[0];
            var fd = new FormData();
            fd.append('file', pendingImportFile);
            var r = await fetch('/api/abastecimiento/import/preview', { method: 'POST', body: fd });
            var text = await r.text();
            var d;
            try {
                d = JSON.parse(text);
            } catch (e) {
                toastError('Error en vista previa');
                pendingImportFile = null;
                return;
            }
            input.value = '';
            var box = document.getElementById('import-preview');
            if (!box) return;
            if (r.status === 503 && d.error === 'sync_en_curso') {
                toastError(d.message || 'Sincronización en curso');
                mostrarBloqueoSync(d.message);
                pendingImportFile = null;
                return;
            }
            if (!d.success) {
                toastError(d.error || 'Error en vista previa');
                pendingImportFile = null;
                return;
            }
            box.style.display = 'block';
            var errHtml = (d.errores || []).slice(0, 30).map(function (e) {
                var tag = '';
                if (e.item_id) tag += escapeHtml(String(e.item_id));
                else if (e.producto_id != null && e.producto_id !== '') tag += 'id local ' + e.producto_id;
                if (e.sku) tag += (tag ? ' · ' : '') + escapeHtml(e.sku);
                return '<li>Fila ' + e.fila + (tag ? ' · ' + tag : '') + ': ' + escapeHtml(e.error || '') + '</li>';
            }).join('');
            box.innerHTML = '<div class="wms-card-body"><h3 style="margin-top:0;">Vista previa importación</h3>' +
                '<p>Correctas: <strong>' + d.filas_ok + '</strong> · Con error: <strong>' + d.filas_error + '</strong></p>' +
                (errHtml ? '<ul style="max-height:160px;overflow:auto;">' + errHtml + '</ul>' : '') +
                '<p><button type="button" class="wms-btn wms-btn-primary" id="btn-confirm-import">Confirmar importación</button> ' +
                '<button type="button" class="wms-btn wms-btn-secondary" id="btn-cancel-import">Cerrar</button></p></div>';

            document.getElementById('btn-cancel-import').onclick = function () {
                box.style.display = 'none';
                pendingImportFile = null;
            };

            document.getElementById('btn-confirm-import').onclick = async function () {
                if (!pendingImportFile) {
                    toastError('Seleccione el archivo de nuevo.');
                    return;
                }
                if (d.filas_error > 0) {
                    toastError('Corrija los errores antes de confirmar o importe solo filas válidas.');
                    return;
                }
                var fd2 = new FormData();
                fd2.append('file', pendingImportFile);
                var r2 = await fetch('/api/abastecimiento/import/apply', { method: 'POST', body: fd2 });
                var t2 = await r2.text();
                var d2;
                try {
                    d2 = JSON.parse(t2);
                } catch (e2) {
                    toastError('Error al importar');
                    return;
                }
                if (r2.status === 503 && d2.error === 'sync_en_curso') {
                    toastError(d2.message || 'Sincronización en curso');
                    mostrarBloqueoSync(d2.message);
                    return;
                }
                if (!d2.success) {
                    toastError(d2.error || 'Error al importar');
                    return;
                }
                toastOk('Importadas ' + d2.aplicadas + ' filas');
                box.style.display = 'none';
                pendingImportFile = null;
                cargarKpis();
                cargarTabla();
            };
        });
    }

    async function init() {
        if (!(await verificarAdmin())) return;
        await cargarMeta();
        page = 1;
        perPage = readPerPage();
        if (!syncBloqueado) {
            await Promise.all([cargarKpis(), cargarTabla()]);
        }

        var fq = document.getElementById('filtro-q');
        if (fq) {
            fq.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    page = 1;
                    cargarTabla();
                }
            });
        }

        var btn = document.getElementById('btn-buscar');
        if (btn) btn.addEventListener('click', function () { page = 1; cargarTabla(); });

        function refiltrarDesdePaginaUno() {
            page = 1;
            cargarTabla();
        }
        var fe = document.getElementById('filtro-estado');
        if (fe) fe.addEventListener('change', refiltrarDesdePaginaUno);
        var fst = document.getElementById('filtro-stock');
        if (fst) fst.addEventListener('change', refiltrarDesdePaginaUno);
        var fun = document.getElementById('filtro-universo');
        if (fun) fun.addEventListener('change', function () {
            page = 1;
            cargarKpis();
            cargarTabla();
        });
        var fpp = document.getElementById('filtro-per-page');
        if (fpp) fpp.addEventListener('change', function () { page = 1; cargarTabla(); });

        document.getElementById('btn-export-bajo').addEventListener('click', function () {
            window.location.href = '/api/abastecimiento/export?modo=bajo_minimo&universo=' + encodeURIComponent(readUniverso());
        });
        document.getElementById('btn-export-completo').addEventListener('click', function () {
            window.location.href = '/api/abastecimiento/export?modo=completo&universo=' + encodeURIComponent(readUniverso());
        });

        setupImport();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
