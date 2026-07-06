/**
 * WMS — Escaneo de códigos de barras / QR con la cámara (navegador).
 * Requiere: script html5-qrcode cargado antes, HTTPS (o localhost) y permiso de cámara.
 */
(function (global) {
    'use strict';

    var active = false;

    function isSecureEnoughForCamera() {
        if (global.isSecureContext) return true;
        var h = (global.location && global.location.hostname) || '';
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    }

    function notify(msg, tipo) {
        if (typeof global.mostrarMensaje === 'function') {
            global.mostrarMensaje(tipo || 'error', msg);
        } else {
            alert(msg);
        }
    }

    function getFormatsToSupport() {
        if (typeof global.Html5QrcodeSupportedFormats === 'undefined') return null;
        var F = global.Html5QrcodeSupportedFormats;
        var names = ['QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODABAR', 'ITF'];
        var out = [];
        names.forEach(function (n) {
            if (F[n] !== undefined) out.push(F[n]);
        });
        return out.length ? out : null;
    }

    function removeModal(root) {
        if (root && root.parentNode) root.parentNode.removeChild(root);
    }

    function closeScanner(html5QrCode, root, done) {
        if (!html5QrCode) {
            removeModal(root);
            if (done) done();
            return;
        }
        html5QrCode.stop()
            .then(function () {
                try { html5QrCode.clear(); } catch (e) { /* ignore */ }
            })
            .catch(function () { /* ignore */ })
            .finally(function () {
                removeModal(root);
                active = false;
                if (done) done();
            });
    }

    /**
     * @param {object} options
     * @param {string} options.inputId - id del input donde volcar el texto leído
     * @param {string} [options.title] - título del modal
     * @param {string} [options.intro] - texto bajo el título
     * @param {function(string):void} [options.onResult] - tras escribir en el input; recibe el texto leído
     * @param {function(string):string} [options.normalize] - normaliza el texto antes de asignarlo
     */
    function open(options) {
        if (!options || !options.inputId) {
            notify('Configuración de escáner inválida', 'error');
            return;
        }
        if (active) return;
        if (typeof global.Html5Qrcode !== 'function') {
            notify('No se cargó el lector de códigos (html5-qrcode). Recarga la página.', 'error');
            return;
        }
        if (!isSecureEnoughForCamera()) {
            notify('La cámara solo está disponible con HTTPS (o en localhost).', 'error');
            return;
        }

        var id = options.inputId;
        var input = null;
        if (typeof document.querySelector === 'function' && typeof CSS !== 'undefined' && CSS.escape) {
            try {
                input = document.querySelector('input#' + CSS.escape(id));
                if (!input) input = document.querySelector('textarea#' + CSS.escape(id));
            } catch (e) { /* ignore */ }
        }
        if (!input) {
            var el = document.getElementById(id);
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) input = el;
        }
        if (!input) {
            notify('No se encontró el campo de destino.', 'error');
            return;
        }

        active = true;
        var readerId = 'wms-bc-reader-' + String(Date.now());
        var root = document.createElement('div');
        root.className = 'wms-barcode-backdrop';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="wms-barcode-dialog">' +
            '  <div class="wms-barcode-header">' +
            '    <h2 class="wms-barcode-title">' + (options.title || 'Escanear código') + '</h2>' +
            '    <button type="button" class="wms-barcode-close" aria-label="Cerrar">&times;</button>' +
            '  </div>' +
            '  <p class="wms-barcode-intro">' + (options.intro || 'Apunta al código de barras o QR. Permite el acceso a la cámara si el navegador lo solicita.') + '</p>' +
            '  <div id="' + readerId + '" class="wms-barcode-reader"></div>' +
            '  <p class="wms-barcode-footnote">Sin cámara o sin permiso: cierra y escribe el valor manualmente.</p>' +
            '</div>';

        document.body.appendChild(root);
        var btnClose = root.querySelector('.wms-barcode-close');
        var html5QrCode = new global.Html5Qrcode(readerId);
        var finished = false;

        function finish(decodedText) {
            if (finished) return;
            finished = true;
            var raw = decodedText == null ? '' : String(decodedText);
            var normalized = typeof options.normalize === 'function' ? options.normalize(raw) : raw.trim();
            input.value = normalized;
            try {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) { /* ignore */ }
            closeScanner(html5QrCode, root, function () {
                if (typeof options.onResult === 'function') {
                    try {
                        options.onResult(normalized);
                    } catch (err) {
                        console.error(err);
                    }
                }
            });
        }

        function cancel() {
            if (finished) return;
            finished = true;
            closeScanner(html5QrCode, root, null);
        }

        btnClose.addEventListener('click', cancel);
        root.addEventListener('click', function (ev) {
            if (ev.target === root) cancel();
        });

        var formats = getFormatsToSupport();
        var qrboxW = Math.min(340, Math.max(200, (global.innerWidth || 360) - 48));
        var config = {
            fps: 10,
            qrbox: { width: qrboxW, height: Math.min(200, Math.floor(qrboxW * 0.55)) }
        };
        if (formats && formats.length) {
            config.formatsToSupport = formats;
        }

        html5QrCode.start(
            { facingMode: 'environment' },
            config,
            function (decodedText) {
                finish(decodedText);
            },
            function () {
                /* frames sin lectura — silencioso */
            }
        ).catch(function (err) {
            active = false;
            removeModal(root);
            var msg = (err && err.message) ? err.message : String(err);
            if (/Permission|NotAllowed|denied/i.test(msg)) {
                notify('Permiso de cámara denegado. Actívalo en la barra de direcciones o ajustes del sitio.', 'error');
            } else if (/NotFound|DevicesNotFound/i.test(msg)) {
                notify('No se detectó ninguna cámara en este dispositivo.', 'error');
            } else {
                notify('No se pudo iniciar la cámara: ' + msg, 'error');
            }
        });
    }

    global.WmsBarcode = { open: open };
})(typeof window !== 'undefined' ? window : this);
