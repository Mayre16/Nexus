'use strict';

const express = require('express');
const ctrl = require('../controllers/power-quality.controller');
const { autenticar } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { verificarModulo } = require('../middleware/moduleAccess');

const router = express.Router();

router.get('/proyectos', autenticar, verificarModulo('power_quality'), ctrl.listar);
router.get('/proyectos/:uuid', autenticar, verificarModulo('power_quality'), ctrl.detalle);
router.post('/proyectos', verificarCsrf, autenticar, verificarModulo('power_quality'), ctrl.crear);
router.get('/proyectos/:uuid/descargar', autenticar, verificarModulo('power_quality'), ctrl.descargar);
router.get('/plantillas', autenticar, verificarModulo('power_quality'), ctrl.plantillas);

module.exports = router;
