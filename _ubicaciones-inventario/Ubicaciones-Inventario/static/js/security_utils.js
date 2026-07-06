/**
 * Utilidades de seguridad para el frontend WMS.
 * Incluir en templates que usen innerHTML con datos dinámicos.
 */

/**
 * Escapa caracteres HTML peligrosos en un string.
 * Usar antes de insertar datos dinámicos en innerHTML.
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var s = String(text);
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return s.replace(/[&<>"']/g, function(c) { return map[c]; });
}

/**
 * Escapa caracteres para uso seguro dentro de atributos HTML.
 */
function escapeHtmlAttr(text) {
    return escapeHtml(text);
}
