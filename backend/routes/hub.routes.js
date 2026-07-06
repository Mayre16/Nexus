'use strict';

const express = require('express');
const ctrl = require('../controllers/hub.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { verificarModulo } = require('../middleware/moduleAccess');

const router = express.Router();
const admin = ['admin'];
const hubRoles = ['admin', 'empleado', 'cliente_suscriptor'];

router.get('/planes', autenticar, verificarModulo('hub'), ctrl.planes);
router.get('/apps', autenticar, verificarModulo('hub'), ctrl.apps);
router.get('/suscripciones', autenticar, verificarModulo('hub'), ctrl.suscripciones);
router.post('/suscripciones', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.crear);
router.patch('/suscripciones/:uuid', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.patchEstado);

module.exports = router;
