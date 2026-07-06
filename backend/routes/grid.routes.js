'use strict';

const express = require('express');
const ctrl = require('../controllers/grid.controller');
const { autenticar } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { verificarModulo } = require('../middleware/moduleAccess');

const router = express.Router();
const mod = verificarModulo('grid');

router.get('/resumen', autenticar, mod, ctrl.resumen);
router.get('/informe-mes', autenticar, mod, ctrl.informeMes);
router.get('/equipos', autenticar, mod, ctrl.equipos);
router.get('/equipos/:uuid', autenticar, mod, ctrl.equipo);
router.patch('/equipos/:uuid', verificarCsrf, autenticar, mod, ctrl.actualizarEquipo);
router.get('/clientes', autenticar, mod, ctrl.clientes);
router.get('/syncs', autenticar, mod, ctrl.syncs);
router.post('/sync', verificarCsrf, autenticar, mod, ctrl.sincronizar);

module.exports = router;
