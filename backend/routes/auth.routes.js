'use strict';

/**
 * auth.routes.js — Rutas de autenticación.
 * ---------------------------------------------------------------------
 *   POST /api/auth/login    -> rate limit estricto + validación + CSRF
 *   POST /api/auth/refresh  -> renueva el access token
 *   POST /api/auth/logout   -> requiere sesión válida
 *   GET  /api/auth/me       -> devuelve el usuario autenticado
 *
 * La verificación CSRF se aplica a las rutas mutantes (POST). El login
 * necesita que el frontend reenvíe la cookie nexus_csrf en X-CSRF-Token.
 */

const express = require('express');
const { body } = require('express-validator');

const ctrl = require('../controllers/auth.controller');
const { autenticar } = require('../middleware/authMiddleware');
const { limiteLogin } = require('../middleware/rateLimiter');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();

// Validación de entrada (allowlist + normalización en servidor).
const validacionLogin = [
  body('email').isEmail().withMessage('Correo inválido.').normalizeEmail(),
  body('password').isString().isLength({ min: 8 }).withMessage('Contraseña inválida.'),
];

router.post('/login', limiteLogin, verificarCsrf, validacionLogin, ctrl.login);
router.post('/refresh', verificarCsrf, ctrl.refresh);
router.post('/logout', verificarCsrf, autenticar, ctrl.logout);
router.get('/me', autenticar, ctrl.me);

module.exports = router;
