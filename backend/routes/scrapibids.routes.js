'use strict';

const express = require('express');
const ctrl = require('../controllers/scrapibids.controller');
const { autenticar } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { verificarModulo } = require('../middleware/moduleAccess');

const router = express.Router();

router.get('/config', autenticar, verificarModulo('scrapibids'), ctrl.getConfig);
router.put('/config', verificarCsrf, autenticar, verificarModulo('scrapibids'), ctrl.putConfig);
router.get('/ejecuciones', autenticar, verificarModulo('scrapibids'), ctrl.ejecuciones);
router.post('/ejecutar', verificarCsrf, autenticar, verificarModulo('scrapibids'), ctrl.ejecutar);

module.exports = router;
