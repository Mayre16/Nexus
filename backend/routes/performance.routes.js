'use strict';

/**
 * performance.routes.js — Rutas Nexus Tracker.
 * ---------------------------------------------------------------------
 *   POST /api/performance/log      → agente Windows (HMAC, sin CSRF/cookies)
 *   GET  /api/performance/resumen  → panel web (JWT + admin/empleado)
 *   GET  /api/performance/dispositivo/:uuid → detalle del día
 */

const express = require('express');
const ctrl = require('../controllers/performance.controller');
const { autenticarDispositivo } = require('../middleware/deviceAuth');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { limiteTracker } = require('../middleware/rateLimiter');

const router = express.Router();

// --- Agente Windows (BadBoy) ---
router.post(
  '/log',
  limiteTracker,
  autenticarDispositivo,
  ctrl.validacionLog,
  ctrl.recibirLog
);

// --- Panel web Nexus ---
router.get(
  '/resumen',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.resumen
);

router.get(
  '/dispositivo/:uuid',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.detalle
);

router.get(
  '/red/clientes',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.clientesRed
);

router.put(
  '/red/clientes/:mac',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  verificarCsrf,
  ctrl.validacionAsignacionRed,
  ctrl.asignarRedCliente
);

module.exports = router;
