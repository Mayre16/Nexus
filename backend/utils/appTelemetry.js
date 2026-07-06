'use strict';

/** Navegadores conocidos (proceso Windows). */
const BROWSER_PROCESSES = new Set([
  'chrome', 'msedge', 'firefox', 'brave', 'opera', 'iexplore', 'vivaldi', 'chromium',
]);

const CATEGORY_META = {
  trabajo: { label: 'Trabajo', color: '#be1622' },
  investigacion: { label: 'Investigación', color: '#2563eb' },
  ocio: { label: 'Ocio', color: '#16a34a' },
  oina: { label: 'OINA', color: '#9333ea' },
  otro: { label: 'Otro', color: '#6b7280' },
};

function esAppWeb(proceso, nombreApp) {
  const p = String(proceso || '').toLowerCase().replace(/\.exe$/, '');
  const n = String(nombreApp || '').toLowerCase();

  // Proceso de escritorio conocido → Windows aunque el título sea largo
  const desktop = /^(cursor|whatsapp|whatsapp\.root|outlook|olk|explorer|winword|excel|powerpnt|teams|code|devenv|notepad|slack|zoom|ms-teams|monitorsuite\.admin)$/i;
  if (desktop.test(p)) return false;
  if (/^whatsapp|^outlook|^olk$/.test(p)) return false;

  if (BROWSER_PROCESSES.has(p)) return true;
  return / - google chrome| - microsoft edge| - msedge| - firefox| - brave/.test(n);
}

function esCursor(proceso) {
  return /^cursor$/i.test(String(proceso || '').replace(/\.exe$/, ''));
}

/** Título Cursor: "Nexus - Cursor" → "Nexus" */
function extraerProyectoCursor(proceso, nombreApp) {
  if (!esCursor(proceso)) return null;
  const raw = String(nombreApp || '').trim();
  const m = raw.match(/^(.+?)\s*-\s*cursor\s*$/i);
  if (m && m[1].trim()) return m[1].trim();
  if (raw && !/^cursor$/i.test(raw)) return raw;
  return 'Cursor';
}

function nombreCorto(proceso, nombreApp, esWeb) {
  const proyecto = extraerProyectoCursor(proceso, nombreApp);
  if (proyecto) {
    return proyecto.length > 45 ? `${proyecto.slice(0, 42)}…` : proyecto;
  }

  const raw = String(nombreApp || '').trim();
  if (esWeb && raw.includes(' - ')) {
    const parts = raw.split(' - ').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const site = parts[parts.length - 2];
      const browser = parts[parts.length - 1].replace(/google chrome/i, 'Chrome').replace(/microsoft edge/i, 'Edge');
      const label = site.length > 42 ? `${site.slice(0, 39)}…` : site;
      return `${label} (${browser})`;
    }
  }

  const proc = String(proceso || '').replace(/\.exe$/i, '');
  if (proc && !esWeb) {
    if (raw && raw.length <= 40) return raw;
    return proc;
  }

  return raw.length > 45 ? `${raw.slice(0, 42)}…` : raw || proc || 'Desconocido';
}

function clasificarCategoria(proceso, nombreApp, url, ctx = {}) {
  const text = `${nombreApp} ${proceso} ${url || ''}`.toLowerCase();
  const tipoEquipo = ctx.tipoEquipo || 'flota';

  for (const regla of ctx.reglasUsuario || []) {
    try {
      if (new RegExp(regla.patron, 'i').test(text)) {
        return regla.categoria;
      }
    } catch (_) {
      if (text.includes(String(regla.patron).toLowerCase())) {
        return regla.categoria;
      }
    }
  }

  const proyectoCursor = extraerProyectoCursor(proceso, nombreApp);
  if (proyectoCursor) {
    if (/civis|acropolis|biblioteca|oina/i.test(proyectoCursor)) return 'oina';
    return 'trabajo';
  }

  // Ocio claro (no depende de flota/personal)
  if (/spotify|netflix|youtube|instagram|tiktok|juego|game|steam|twitch/.test(text)) {
    return 'ocio';
  }

  // Comunicación / redes: en flota ADESA = trabajo; en personal = ocio
  if (/whatsapp|telegram|facebook|discord(?!\s*dev)/.test(text)) {
    return tipoEquipo === 'personal' ? 'ocio' : 'trabajo';
  }

  if (/adm cloud|adesa|nexus|monitor|cotizaci|factura|erp|crm|dynamics|sap|excel|word|outlook|teams|powerpoint|sharepoint|contabil|inventario|ventas|compras/.test(text)) {
    return 'trabajo';
  }

  if (/^code$|visual studio|devenv|notepad\+\+|postman|gitkraken|terminal|powershell|cmd/.test(text)) {
    return 'trabajo';
  }

  if (/stackoverflow|github|gitlab|documentation|docs\.|wiki|wikipedia|investig|research|learn|tutorial|medium\.com|dev\.to/.test(text)) {
    return 'investigacion';
  }

  if (/google search|bing\.com|duckduckgo|google\.com\/search/.test(text)) {
    return 'investigacion';
  }

  return 'otro';
}

function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function diaSql(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

/** Si no hay performance_app_uso, inferir apps web desde URLs registradas. */
function appsDesdeUrls(urlsResumen, urlsDetalle = []) {
  const fuente = (urlsResumen && urlsResumen.length > 0)
    ? urlsResumen
    : agregarUrlsDetalle(urlsDetalle);

  return fuente.map((u) => {
    const nav = String(u.navegador || 'Chrome');
    const navNorm = /edge/i.test(nav) ? 'msedge' : 'chrome';
    const titulo = String(u.titulo || u.url || 'Navegación web').trim();
    const browserLabel = /edge/i.test(nav) ? 'Microsoft Edge' : 'Google Chrome';
    const nombre_app = / - google chrome| - microsoft edge/i.test(titulo)
      ? titulo
      : `${titulo} - ${browserLabel}`;
    return {
      nombre_app,
      proceso: navNorm,
      segundos: Math.max(num(u.segundos), 30),
    };
  });
}

function agregarDesdeDetalle(detalle) {
  const map = new Map();
  for (const d of detalle || []) {
    const key = `${d.proceso}|${d.nombre_app}`.toLowerCase();
    const prev = map.get(key);
    map.set(key, {
      nombre_app: d.nombre_app,
      proceso: d.proceso,
      segundos: (prev?.segundos || 0) + num(d.segundos),
    });
  }
  return [...map.values()].sort((a, b) => b.segundos - a.segundos);
}

function fusionarApps(base, extra) {
  const map = new Map();
  for (const a of base || []) {
    const key = `${a.proceso}|${a.nombre_app}`.toLowerCase();
    map.set(key, {
      nombre_app: a.nombre_app,
      proceso: a.proceso,
      segundos: num(a.segundos),
    });
  }
  for (const a of extra || []) {
    const key = `${a.proceso}|${a.nombre_app}`.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      prev.segundos += num(a.segundos);
    } else {
      map.set(key, {
        nombre_app: a.nombre_app,
        proceso: a.proceso,
        segundos: num(a.segundos),
      });
    }
  }
  return [...map.values()].sort((a, b) => b.segundos - a.segundos);
}

function agregarUrlsDetalle(urls) {
  const map = new Map();
  for (const u of urls || []) {
    const key = `${u.url || ''}|${u.titulo || ''}|${u.navegador || ''}`;
    const prev = map.get(key);
    map.set(key, {
      url: u.url,
      titulo: u.titulo,
      navegador: u.navegador,
      segundos: (prev?.segundos || 0) + Math.max(num(u.segundos), 30),
    });
  }
  return [...map.values()].sort((a, b) => b.segundos - a.segundos);
}

/** Combina apps del agente + detalle ventanas + URLs (sin perder Windows). */
function combinarFuentesApps(appsSql, appsDetalle, urlsResumen, urlsDetalle) {
  let merged = fusionarApps(appsSql, agregarDesdeDetalle(appsDetalle));
  const desdeUrls = appsDesdeUrls(urlsResumen, urlsDetalle);
  return fusionarApps(merged, desdeUrls);
}

function completarGraficoDiario(graficoDiario, lotes, appsNorm, urlsResumen, hasta) {
  let rows = normalizarGraficoDiario(graficoDiario).filter((r) => r.seg_activo > 0);

  if (rows.length === 0 && lotes?.length) {
    const map = new Map();
    for (const l of lotes) {
      const dia = diaSql(l.periodo_inicio);
      if (!dia) continue;
      map.set(dia, (map.get(dia) || 0) + num(l.segundos_activo));
    }
    rows = [...map.entries()]
      .map(([dia, seg_activo]) => ({ dia, seg_activo }))
      .filter((r) => r.seg_activo > 0);
  }

  if (rows.length === 0) {
    const totalApps = (appsNorm || []).reduce((s, a) => s + num(a.segundos), 0);
    const totalUrls = (urlsResumen || []).reduce((s, u) => s + num(u.segundos), 0);
    const total = Math.max(totalApps, totalUrls);
    if (total > 0) {
      rows = [{ dia: hasta, seg_activo: total }];
    }
  }

  return rows.sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
}

/** Agrupa filas SQL de apps en estructuras para gráficos y listas. */
function enriquecerTelemetria(apps, urlsResumen = [], ctx = {}) {
  const urlPorTitulo = new Map();
  for (const u of urlsResumen || []) {
    const key = String(u.titulo || u.url || '').toLowerCase();
    if (key) urlPorTitulo.set(key, u.url || u.titulo);
  }

  const filas = (apps || []).map((row) => {
    const segundos = num(row.segundos);
    const esWeb = esAppWeb(row.proceso, row.nombre_app);
    const urlHint = urlPorTitulo.get(String(row.nombre_app || '').toLowerCase());
    const categoria = clasificarCategoria(row.proceso, row.nombre_app, urlHint, ctx);
    const proyectoCursor = extraerProyectoCursor(row.proceso, row.nombre_app);
    return {
      nombre_app: row.nombre_app,
      proceso: row.proceso,
      segundos,
      es_web: esWeb,
      categoria,
      categoria_label: CATEGORY_META[categoria].label,
      nombre_corto: nombreCorto(row.proceso, row.nombre_app, esWeb),
      proyecto_cursor: proyectoCursor,
    };
  });

  const appsWindows = filas.filter((f) => !f.es_web).sort((a, b) => b.segundos - a.segundos);
  const appsWeb = filas.filter((f) => f.es_web).sort((a, b) => b.segundos - a.segundos);

  const agrupar = (items, keyFn) => {
    const map = new Map();
    for (const item of items) {
      const key = keyFn(item);
      map.set(key, (map.get(key) || 0) + item.segundos);
    }
    return [...map.entries()]
      .map(([nombre, segundos]) => ({ nombre, segundos }))
      .sort((a, b) => b.segundos - a.segundos);
  };

  const graficoAppsWindows = agrupar(appsWindows, (i) => i.nombre_corto).slice(0, 10);
  const graficoAppsWeb = agrupar(appsWeb, (i) => i.nombre_corto).slice(0, 10);
  const graficoRanking = agrupar(filas, (i) => i.nombre_corto).slice(0, 12);

  const graficoCategorias = Object.keys(CATEGORY_META)
    .map((id) => ({
      categoria: id,
      label: CATEGORY_META[id].label,
      color: CATEGORY_META[id].color,
      segundos: filas.filter((f) => f.categoria === id).reduce((s, f) => s + f.segundos, 0),
    }))
    .filter((c) => c.segundos > 0)
    .sort((a, b) => b.segundos - a.segundos);

  const graficoApps = agrupar(filas, (i) => i.nombre_corto).slice(0, 15);

  const colorProyecto = (nombre) =>
    (/civis|acropolis|biblioteca|oina/i.test(nombre) ? '#9333ea' : '#be1622');

  const graficoProyectosCursor = agrupar(
    filas.filter((f) => esCursor(f.proceso)),
    (i) => i.proyecto_cursor || i.nombre_corto || 'Cursor'
  )
    .slice(0, 15)
    .map((row) => ({ ...row, color: colorProyecto(row.nombre) }));

  return {
    appsWindows,
    appsWeb,
    graficoApps,
    graficoAppsWindows,
    graficoAppsWeb,
    graficoRanking,
    graficoCategorias,
    graficoProyectosCursor,
    categoryMeta: CATEGORY_META,
  };
}

function normalizarGraficoDiario(filas) {
  return (filas || []).map((r) => ({
    dia: r.dia,
    seg_activo: num(r.seg_activo),
  }));
}

module.exports = {
  enriquecerTelemetria,
  clasificarCategoria,
  extraerProyectoCursor,
  esCursor,
  normalizarGraficoDiario,
  completarGraficoDiario,
  appsDesdeUrls,
  combinarFuentesApps,
  num,
  CATEGORY_META,
};
