'use strict';

const TIPOS_DISPOSITIVO = {
  pc: { id: 'pc', label: 'PC / Escritorio', icon: '🖥️' },
  laptop: { id: 'laptop', label: 'Laptop', icon: '💻' },
  mac: { id: 'mac', label: 'Mac', icon: '🍎' },
  tablet: { id: 'tablet', label: 'Tablet', icon: '📱' },
  telefono: { id: 'telefono', label: 'Teléfono', icon: '📲' },
  voip: { id: 'voip', label: 'VoIP / Tel. IP', icon: '☎️' },
  impresora: { id: 'impresora', label: 'Impresora', icon: '🖨️' },
  streaming: { id: 'streaming', label: 'TV / Streaming', icon: '📺' },
  otro: { id: 'otro', label: 'Otro', icon: '🔌' },
  pendiente_nombre: { id: 'pendiente_nombre', label: 'Sin nombre', icon: '❓' },
};

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function normalizarMac(mac) {
  if (!mac) return '';
  const limpio = String(mac).trim().toLowerCase().replace(/-/g, ':');
  if (/^[0-9a-f]{12}$/.test(limpio)) {
    return limpio.match(/.{2}/g).join(':');
  }
  return limpio;
}

/** True si el cliente UniFi aún no tiene nombre amigable (solo MAC). */
function nombrePendiente(nombre, mac) {
  const n = String(nombre || '').trim();
  if (!n) return true;
  const macNorm = normalizarMac(mac);
  if (MAC_RE.test(n)) return true;
  if (macNorm && n.toLowerCase() === macNorm) return true;
  return false;
}

function clasificarTipoDispositivo(nombre, conexion, tipoOverride) {
  if (tipoOverride && TIPOS_DISPOSITIVO[tipoOverride]) return tipoOverride;
  if (nombrePendiente(nombre)) return 'pendiente_nombre';

  const n = String(nombre || '').toLowerCase();
  const wired = String(conexion || '').toUpperCase() === 'WIRED';

  if (/macbook|mac-mini|mac mini|imac|macbookpro|macbookair|macpro|mac studio/.test(n)) return 'mac';
  if (/mini-de-|mini de /.test(n) && /mac|mil|apple/.test(n)) return 'mac';
  if (/galaxy.tab|galaxy tab|ipad|tablet|tab-a|tab a|kindle|surface go|nexus 7|nexus 9/.test(n)) {
    return 'tablet';
  }
  if (/galaxy(?! tab)|iphone|pixel|android|moto g|redmi|celular|mobile|phone|a04|a05|a14|a15/.test(n)) {
    return 'telefono';
  }
  if (/canon|hp |epson|brother|printer|impresora|laserjet|deskjet|mfc-/.test(n)) return 'impresora';
  if (/grandstream|grp|gwn|gxp|voip|sip|siera|gvx|telefono ip|ip phone/.test(n)) return 'voip';
  if (/apple tv|roku|chromecast|fire tv|firestick|smart tv/.test(n)) return 'streaming';
  if (/laptop|notebook|thinkpad|latitude|elitebook|vivobook|ideapad|pavilion/.test(n)) return 'laptop';
  if (/desktop|pc-|workstation|optiplex|prodesk|precision|tower|all-in-one| aio/.test(n)) {
    return 'pc';
  }
  if (wired && !/canon|grandstream|siera|grp|gwn|apple tv/.test(n)) return 'pc';
  if (/mac/i.test(n) && !/mac address/.test(n)) return 'mac';

  return 'otro';
}

module.exports = {
  TIPOS_DISPOSITIVO,
  normalizarMac,
  nombrePendiente,
  clasificarTipoDispositivo,
};
