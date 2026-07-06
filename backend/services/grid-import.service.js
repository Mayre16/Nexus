'use strict';

/** Detecta si el medidor tiene cliente asignado en el portal (nombre real vs solo serial). */
function detectarAsignadoPortal(nombre, serial, cuenta) {
  const n = String(nombre || '').trim();
  const s = String(serial || '').trim();
  const c = String(cuenta || '').trim();
  if (!n) return false;
  if (/^\d+$/.test(n)) return false;
  if (s && n.replace(/\s+/g, '') === s.replace(/\s+/g, '')) return false;
  if (c && n === c && /^\d+$/.test(c)) return false;
  return true;
}

/** Normaliza nombre para import: si no hay cliente, el título es el serial. */
function normalizarImportEquipo(item) {
  const serial = String(item.serial || item.external_id || '').trim();
  const cuenta = item.metadata?.cuenta || item.cuenta || '';
  let nombre = String(item.nombre || '').trim();
  const asignado = item.asignado_portal != null
    ? Boolean(item.asignado_portal)
    : detectarAsignadoPortal(nombre, serial, cuenta);

  if (!asignado) {
    nombre = serial || nombre;
  }

  return {
    ...item,
    serial,
    nombre,
    asignado_portal: asignado ? 1 : 0,
    plataforma: item.plataforma || 'adesa_cloud',
  };
}

module.exports = { detectarAsignadoPortal, normalizarImportEquipo };
