'use strict';

const express = require('express');
const ctrl = require('../controllers/settings.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const admin = ['admin'];

router.get('/', autenticar, autorizarRoles(...admin), ctrl.listar);
router.put('/general', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.guardarGeneral);
router.put('/smtp/:division', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.guardarSmtp);
router.put('/notifications/:seccion', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.guardarNotificaciones);
router.put('/integrations/:nombre', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.guardarIntegracion);
router.post('/test-smtp', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.probarSmtp);

module.exports = router;
