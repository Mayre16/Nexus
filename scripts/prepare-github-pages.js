'use strict';

/**
 * Prepara el frontend para GitHub Pages (sitio estático en /Nexus/).
 * - Rutas relativas (sin / absoluto)
 * - Mock de API para vista previa sin backend
 * - Índice preview.html con todas las pantallas
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'frontend');
const OUT = path.join(ROOT, 'gh-pages-out');
const MODULES_DIR = path.join(ROOT, 'backend', 'modules');

const CATEGORY_LABELS = {
  platform: 'Plataforma',
  service: 'Servicio',
  crm: 'CRM y ventas',
  sales: 'Comercio',
  monitoring: 'Monitoreo',
  memberships: 'Membresías',
  erp: 'ERP',
};

function rel(p) {
  if (!p || typeof p !== 'string') return p;
  return p.replace(/^\//, '');
}

function rewriteHtml(content) {
  let c = content;
  c = c.replace(/href="\/"/g, 'href="index.html"');
  c = c.replace(/href='\/'/g, "href='index.html'");
  c = c.replace(/href="\/([^"]*)"/g, (_, p) => `href="${rel(p)}"`);
  c = c.replace(/href='\/([^']*)'/g, (_, p) => `href='${rel(p)}'`);
  c = c.replace(/src="\/([^"]*)"/g, (_, p) => `src="${rel(p)}"`);
  c = c.replace(/src='\/([^']*)'/g, (_, p) => `src='${rel(p)}'`);
  c = c.replace(/url\("\/([^"]*)"\)/g, (_, p) => `url("${rel(p)}")`);
  c = c.replace(/url\('\/([^']*)'\)/g, (_, p) => `url('${rel(p)}')`);
  c = c.replace(/window\.location\.href\s*=\s*"\/([^"]*)"/g, (_, p) =>
    p ? `window.location.href = "${rel(p)}"` : 'window.location.href = "index.html"',
  );
  c = c.replace(/window\.location\.href\s*=\s*'\/([^']*)'/g, (_, p) =>
    p ? `window.location.href = '${rel(p)}'` : "window.location.href = 'index.html'",
  );
  c = c.replace(/location\.href\s*=\s*"\/([^"]*)"/g, (_, p) =>
    p ? `location.href = "${rel(p)}"` : 'location.href = "index.html"',
  );
  c = c.replace(/location\.href\s*=\s*'\/([^']*)'/g, (_, p) =>
    p ? `location.href = '${rel(p)}'` : "location.href = 'index.html'",
  );
  c = c.replace(/fetch\("\/api\//g, 'fetch("api/');
  c = c.replace(/fetch\('\/api\//g, "fetch('api/");
  c = c.replace(/fetch\(`\/api\//g, 'fetch(`api/');
  return c;
}

function loadCatalogo() {
  const instalados = [];
  const enDesarrollo = [];
  if (!fs.existsSync(MODULES_DIR)) return { instalados, enDesarrollo };

  for (const dir of fs.readdirSync(MODULES_DIR)) {
    const manifestPath = path.join(MODULES_DIR, dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const item = {
        ...m,
        technicalName: m.technicalName || dir,
        categoryLabel: CATEGORY_LABELS[m.category] || m.category,
        routes: m.routes
          ? {
              ...m.routes,
              ui: rel(m.routes.ui),
              dashboardPath: rel(m.routes.dashboardPath),
              links: Array.isArray(m.routes.links)
                ? m.routes.links.map((l) => ({ ...l, href: rel(l.href) }))
                : m.routes.links,
            }
          : m.routes,
      };
      if (m.state === 'development' || m.state === 'planned') {
        enDesarrollo.push(item);
      } else {
        instalados.push(item);
      }
    } catch (_) {
      /* skip */
    }
  }
  instalados.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  return { instalados, enDesarrollo, porCategoria: {} };
}

function buildPreviewMock(catalogo) {
  return `/* Auto-generado: mock API para GitHub Pages */
(function () {
  window.NEXUS_GH_PAGES = true;
  const CATALOGO = ${JSON.stringify(catalogo)};
  const USUARIO = {
    uuid: "preview-0000-0000-0000-000000000001",
    nombre: "Vista previa",
    email: "preview@adesa.com.do",
    rol: "admin",
    division: "ambas",
  };
  const empty = { ok: true, tickets: [], articulos: [], conteos: {}, participantes: [], personas: [], clientes: [], apps: [], suscripciones: [], equipos: [], seguimientos: [] };

  function json(data, status) {
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const orig = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const path = url.replace(/^https?:\\/\\/[^/]+/, "").replace(/^\\//, "");

    if (path === "api/health" || path.endsWith("/api/health")) {
      return json({ estado: "ok", servicio: "ADESA Nexus (vista previa)", entorno: "github-pages" });
    }
    if (path.includes("api/auth/me")) return json({ usuario: USUARIO });
    if (path.includes("api/auth/login")) return json({ usuario: USUARIO });
    if (path.includes("api/auth/logout")) return json({ ok: true });
    if (path.includes("api/modules/catalogo")) return json(CATALOGO);
    if (path.includes("api/portal/me")) {
      return json({ usuario: USUARIO, cliente: { razon_social: "Cliente demo", division: "energia" } });
    }
    if (path.includes("api/tickets/config/mail")) return json({ buzones: [] });
    if (path.includes("api/tickets/agentes")) return json({ agentes: [] });
    if (path.includes("api/tickets") && init?.method !== "POST") {
      return json({ tickets: [], conteos: {}, buzones: [] });
    }
    if (path.includes("api/grid")) return json({ resumen: { total: 0 }, equipos: [] });
    if (path.includes("api/hub")) return json({ apps: [], suscripciones: [], planes: [] });
    if (path.startsWith("api/")) return json(empty);

    return orig.apply(this, arguments);
  };
})();
`;
}

function injectPreview(html) {
  const inject = `
    <script src="nexus-pages-preview.js"></script>
    <style>#gh-pages-banner{position:fixed;bottom:0;left:0;right:0;background:#111;color:#fcb900;padding:10px 16px;font-size:12px;font-family:Montserrat,system-ui,sans-serif;z-index:99999;text-align:center;box-shadow:0 -2px 12px rgba(0,0,0,.2)}#gh-pages-banner a{color:#fff;font-weight:700;margin-left:10px}</style>
    <div id="gh-pages-banner">Vista previa estática en GitHub Pages — sin base de datos ni login real.
      <a href="preview.html">Índice de pantallas</a> · <a href="https://github.com/Mayre16/Nexus">Código</a></div>
  `;
  if (html.includes('<body')) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${inject}`);
  }
  return inject + html;
}

function buildPreviewIndex(pages) {
  const items = pages
    .filter((p) => p !== 'preview.html')
    .sort()
    .map(
      (p) =>
        `<li><a href="${p}" class="text-adesa-red font-semibold hover:underline">${p}</a></li>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ADESA Nexus · Vista previa (GitHub Pages)</title>
  <link rel="icon" type="image/png" href="assets/favicon.png" />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={theme:{extend:{colors:{adesa:{red:"#be1622",gold:"#fcb900",ink:"#111"}},fontFamily:{sans:["Montserrat","system-ui","sans-serif"]}}}}</script>
  <script src="nexus-pages-preview.js"></script>
</head>
<body class="font-sans bg-gray-50 text-adesa-ink min-h-screen p-8">
  <div class="max-w-2xl mx-auto">
    <img src="assets/favicon.png" alt="ADESA" class="w-14 h-14 mb-4" />
    <h1 class="text-2xl font-bold">ADESA Nexus — Vista previa</h1>
    <p class="mt-2 text-sm text-gray-600">Navegación estática con datos de demostración. Para uso real: clona el repo y ejecuta <code class="bg-gray-200 px-1 rounded">npm run dev</code>.</p>
    <p class="mt-4">
      <a href="index.html" class="inline-block px-4 py-2 bg-adesa-red text-white rounded-lg font-bold text-sm">Pantalla de acceso</a>
      <a href="dashboard.html" class="inline-block ml-2 px-4 py-2 bg-gray-800 text-white rounded-lg font-bold text-sm">Panel (demo)</a>
    </p>
    <h2 class="mt-8 text-sm font-bold uppercase tracking-widest text-gray-400">Todas las pantallas</h2>
    <ul class="mt-3 grid sm:grid-cols-2 gap-2 text-sm list-disc list-inside">${items}</ul>
  </div>
</body>
</html>`;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const catalogo = loadCatalogo();
  fs.writeFileSync(path.join(OUT, 'nexus-pages-preview.js'), buildPreviewMock(catalogo));

  copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'));

  const pages = [];
  for (const name of fs.readdirSync(SRC)) {
    if (!name.endsWith('.html')) continue;
    const raw = fs.readFileSync(path.join(SRC, name), 'utf8');
    const out = injectPreview(rewriteHtml(raw));
    fs.writeFileSync(path.join(OUT, name), out);
    pages.push(name);
  }

  fs.writeFileSync(path.join(OUT, 'preview.html'), buildPreviewIndex(pages));

  console.log(`GitHub Pages build OK → ${OUT} (${pages.length + 1} HTML)`);
}

main();
