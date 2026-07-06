'use strict';

const { createProxyMiddleware } = require('http-proxy-middleware');
const { env } = require('../../config/env');

const IERP_UI_BASE = '/modules/ierp';

/**
 * Proxies hacia el stack iERP (NestJS + Next.js) cuando corre como proceso separado.
 * Nexus expone:
 *   /ierp.html        → shell Nexus + iframe del módulo
 *   /api/ierp/*       → iERP backend /api/*
 *   /modules/ierp/*   → iERP frontend (Next, embebido; basePath /modules/ierp)
 */

function crearProxyApiIerp() {
  return createProxyMiddleware({
    target: env.IERP_API_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/ierp'),
    pathRewrite: (pathname) => pathname.replace(/^\/api\/ierp/, '/api'),
    onProxyReq(proxyReq) {
      proxyReq.setHeader('X-Nexus-Module', 'ierp');
      proxyReq.setHeader('X-Forwarded-Prefix', '/api/ierp');
    },
    onError(err, req, res) {
      console.error('[MOD iERP] API proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'iERP backend no disponible',
          hint: 'Inicie iERP: npm run dev:backend en el proyecto ERP (puerto 3001)',
        });
      }
    },
  });
}

function crearProxyUiIerp() {
  return createProxyMiddleware({
    target: env.IERP_UI_URL,
    changeOrigin: true,
    ws: true,
    pathFilter: (pathname) => pathname.startsWith(IERP_UI_BASE),
    pathRewrite: (pathname) =>
      pathname.startsWith(IERP_UI_BASE) ? pathname : `${IERP_UI_BASE}${pathname}`,
    onProxyReq(proxyReq) {
      proxyReq.setHeader('X-Nexus-Module', 'ierp');
    },
    onError(err, req, res) {
      console.error('[MOD iERP] UI proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).send(
          '<html><body style="font-family:sans-serif;padding:2rem">' +
            '<h1>iERP no disponible</h1>' +
            '<p>Inicie el frontend iERP en modo módulo Nexus (puerto 3002).</p>' +
            '<p><code>cd ERP/apps/frontend && npm run dev:nexus</code></p>' +
            '<p><a href="/dashboard.html">Volver al panel Nexus</a></p>' +
            '</body></html>',
        );
      }
    },
  });
}

module.exports = { crearProxyApiIerp, crearProxyUiIerp };
