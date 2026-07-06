/**
 * Utilidad para formatear fechas de documento (DocDate) en zona local.
 * Las fechas YYYY-MM-DD sin hora se interpretan como UTC midnight en JavaScript,
 * lo que causa desfase de 1 día en zonas como República Dominicana (UTC-4).
 * Esta función parsea fechas solo-fecha como fecha local para mostrar correctamente.
 */
function formatarFechaDocumento(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const s = String(fechaStr).trim();
        // Si es solo fecha (YYYY-MM-DD), parsear como fecha local para evitar desfase
        const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            const y = parseInt(match[1], 10);
            const m = parseInt(match[2], 10) - 1;
            const d = parseInt(match[3], 10);
            return new Date(y, m, d).toLocaleDateString('es-DO');
        }
        // Fallback: timestamp con hora (usar conversión estándar)
        return new Date(s).toLocaleDateString('es-DO');
    } catch (e) {
        return 'N/A';
    }
}
