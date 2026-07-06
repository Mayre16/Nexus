'use strict';

/**
 * server.js — Punto de entrada del backend de ADESA Nexus.
 * =====================================================================
 *  Orden de los middlewares (importa por seguridad):
 *   1. trust proxy        → req.ip real detrás del proxy de cPanel.
 *   2. helmet             → security headers (CSP, HSTS, no-sniff, anti-clickjacking).
 *   3. CORS allowlist     → solo dominios de ADESA, con credenciales.
 *   4. body parsers       → límites de tamaño (anti DoS por payload gigante).
 *   5. cookie-parser      → lectura de cookies HttpOnly.
 *   6. hpp                → anti HTTP Parameter Pollution.
 *   7. CSRF (double-submit)→ protege peticiones mutantes.
 *   8. rate limit general → anti DoS / fuerza bruta.
 *   9. rutas              → /api/... (módulos se montan aquí).
 *  10. 404 + error handler→ respuestas genéricas en prod.
 * =====================================================================
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const hpp = require('hpp');

const { env } = require('./config/env');
const { verificarConexion, cerrarPool } = require('./config/database');
const { limiteGeneral } = require('./middleware/rateLimiter');
const { emitirTokenCsrf, verificarCsrf } = require('./middleware/csrfProtection');
const { capturarRawBody } = require('./middleware/rawBody');
const { noEncontrado, manejadorErrores } = require('./middleware/errorHandler');

const app = express();

// ---------------------------------------------------------------------
// 1) Confianza en el proxy de cPanel (para req.ip, cookies Secure, etc.)
//    Ajustar el número de saltos según la infraestructura real.
// ---------------------------------------------------------------------
app.set('trust proxy', 1);
app.disable('x-powered-by'); // no revelar que usamos Express

// ---------------------------------------------------------------------
// 2) Security headers (D7)
// ---------------------------------------------------------------------
app.use(
  helmet({
    // CSP: por defecto restrictiva. Ajustar `connectSrc`/`imgSrc` cuando
    // se integre el frontend y las pasarelas de pago.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        // NOTA: el Play CDN de Tailwind requiere 'unsafe-inline' y 'unsafe-eval'.
        // Es aceptable solo para DESARROLLO/preview. En producción se debe
        // compilar Tailwind a un .css propio y eliminar estas excepciones.
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'ws://127.0.0.1:3002'],
        upgradeInsecureRequests: env.esProduccion ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: env.esProduccion
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  })
);

// ---------------------------------------------------------------------
// 3) CORS — allowlist explícita de dominios de ADESA (nunca "*")
// ---------------------------------------------------------------------
const corsOptions = {
  origin(origin, callback) {
    // Permite herramientas server-to-server (sin Origin) y los dominios listados.
    if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true, // necesario para enviar/recibir cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 600,
};
app.use(cors(corsOptions));

// ---------------------------------------------------------------------
// 3b) Proxy API iERP — antes de body parsers (si no, POST queda sin body y cuelga).
// ---------------------------------------------------------------------
const { montarProxyApiIerp } = require('./modules/loader');
montarProxyApiIerp(app);

// ---------------------------------------------------------------------
// 4) Parsers con límites de tamaño (anti DoS por payload).
//    capturarRawBody guarda el JSON original para verificar HMAC del agente.
// ---------------------------------------------------------------------
app.use(express.json({ limit: '512kb', verify: capturarRawBody }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// ---------------------------------------------------------------------
// 5) Cookies + compresión + anti parameter pollution
// ---------------------------------------------------------------------
app.use(cookieParser());
app.use(compression());
app.use(hpp());

// ---------------------------------------------------------------------
// 6) CSRF: emite la cookie y verifica en métodos mutantes.
//    (El webhook de pagos y /api/performance/log se montan ANTES o se
//     exceptúan porque usan firma/HMAC en vez de cookies — ver rutas.)
// ---------------------------------------------------------------------
app.use(emitirTokenCsrf);

// ---------------------------------------------------------------------
// 7) Rate limit general a toda la API
// ---------------------------------------------------------------------
app.use('/api', limiteGeneral);

// ---------------------------------------------------------------------
// 8) Healthcheck mínimo (no expone detalles sensibles en prod)
// ---------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    estado: 'ok',
    servicio: env.APP_NAME,
    entorno: env.esProduccion ? 'production' : env.NODE_ENV,
  });
});

// ---------------------------------------------------------------------
// 9) MONTAJE DE RUTAS DE MÓDULOS
//    Cada router aplicará `verificarCsrf` + `autenticar` + RBAC según
//    corresponda. Se irán añadiendo a medida que se desarrollen.
//    Ejemplo de uso (cuando existan):
//      app.use('/api/tickets', verificarCsrf, require('./routes/tickets.routes'));
//      app.use('/api/bitacora',verificarCsrf, require('./routes/bitacora.routes'));
//      app.use('/api/performance', require('./routes/performance.routes')); // HMAC, sin cookies/CSRF
// ---------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/performance', require('./routes/performance.routes'));
app.use('/api/tickets', require('./routes/tickets.routes'));
app.use('/api/office', require('./routes/office.routes'));
app.use('/api/store', require('./routes/store.routes'));
app.use('/api/almacen', require('./routes/almacen.routes'));
app.use('/api/modules', require('./routes/modules.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/tasks', require('./routes/tasks.routes'));
app.use('/api/personas', require('./routes/personas.routes'));
app.use('/api/ierp-nexus', require('./routes/ierp-nexus.routes'));
app.use('/api/usuario-modulos', require('./routes/usuario-modulos.routes'));
app.use('/api/hub', require('./routes/hub.routes'));
app.use('/api/power-quality', require('./routes/power-quality.routes'));
app.use('/api/scrapibids', require('./routes/scrapibids.routes'));
app.use('/api/grid', require('./routes/grid.routes'));
app.use('/api/portal', require('./routes/portal.routes'));

const { montarModulosExternos } = require('./modules/loader');

/** iERP integrado: la raíz del módulo abre la UI nativa Nexus. */
app.get(['/modules/ierp', '/modules/ierp/'], (req, res) => {
  const tab = typeof req.query.tab === 'string' ? req.query.tab : 'cotizaciones';
  const q = new URLSearchParams({ tab });
  if (req.query.highlight) q.set('highlight', String(req.query.highlight));
  res.redirect(`/ierp.html?${q}`);
});

montarModulosExternos(app);
// (Resto de routers de módulos pendientes de implementar.)

// ---------------------------------------------------------------------
//  Servir el frontend estático (web responsiva / Capacitor).
//  Cualquier ruta NO /api intenta resolverse contra /frontend.
// ---------------------------------------------------------------------
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
app.use(express.static(FRONTEND_DIR));

// ---------------------------------------------------------------------
// 10) 404 (solo para /api) + manejador de errores
// ---------------------------------------------------------------------
app.use('/api', noEncontrado);
// Para rutas no-API no encontradas, devolvemos el index (navegación SPA).
// Excepto rutas de módulos externos (/modules/*) ya manejadas por proxy.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/modules/')) {
    return next();
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});
app.use(manejadorErrores);

// ---------------------------------------------------------------------
//  Arranque del servidor (fail-fast si la BD no responde)
// ---------------------------------------------------------------------
let server;
async function iniciar() {
  try {
    await verificarConexion();
    console.log('[BD] Conexión a MySQL verificada.');
  } catch (err) {
    // En desarrollo, con ALLOW_NO_DB=true, permitimos arrancar sin BD para
    // previsualizar el servidor. Cualquier endpoint que toque la BD fallará.
    if (env.ALLOW_NO_DB) {
      console.warn(
        '[BD] ⚠ No se pudo conectar a MySQL, pero ALLOW_NO_DB=true ' +
          '(modo previsualización). Los endpoints con BD no funcionarán.'
      );
    } else {
      console.error('[BD] No se pudo conectar a MySQL:', err.message);
      process.exit(1); // no arrancar inseguro/incompleto
    }
  }

  server = app.listen(env.PORT, () => {
    console.log(`[NEXUS] ${env.APP_NAME} escuchando en puerto ${env.PORT} (${env.NODE_ENV}).`);
    if (env.DESK_IMAP_ENABLED) {
      const imapSvc = require('./services/imapIngestion.service');
      const ms = Math.max(60000, env.DESK_IMAP_POLL_MINUTES * 60000);
      console.log(`[DESK] IMAP activo — polling cada ${env.DESK_IMAP_POLL_MINUTES} min.`);
      const ejecutarPoll = () => {
        imapSvc.pollTodosLosBuzones().catch((err) => {
          console.error('[DESK] Error IMAP:', err.message);
        });
      };
      // Primer poll diferido (no bloquear arranque ni tumbar el server si el mail falla).
      setTimeout(ejecutarPoll, 15000);
      setInterval(ejecutarPoll, ms);
    }
  });
}

// Apagado ordenado: cierra HTTP y el pool de BD.
async function apagar(senal) {
  console.log(`\n[NEXUS] Señal ${senal} recibida. Cerrando...`);
  if (server) server.close();
  try {
    await cerrarPool();
  } catch (_) {
    /* noop */
  }
  process.exit(0);
}
process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

// Evita que excepciones no manejadas dejen el proceso en estado indefinido.
// Evita que errores de red (IMAP, etc.) derriben todo Nexus en desarrollo.
process.on('uncaughtException', (err) => {
  console.error('[NEXUS] Excepción no capturada:', err.message || err);
  if (err.code === 'ETIMEOUT' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    return;
  }
  if (env.esProduccion) process.exit(1);
});

process.on('unhandledRejection', (motivo) => {
  console.error('[NEXUS] Promesa no manejada:', motivo?.message || motivo);
});

iniciar();

module.exports = app; // exportado para pruebas
