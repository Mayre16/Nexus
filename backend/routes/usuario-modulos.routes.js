'use strict';

const express = require('express');
const ctrl = require('../controllers/usuario-modulos.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const admin = ['admin'];

router.get('/catalogo', autenticar, autorizarRoles(...admin), ctrl.catalogo);
router.get('/usuarios', autenticar, autorizarRoles(...admin), ctrl.listarUsuarios);
router.get('/usuarios/:uuid', autenticar, autorizarRoles(...admin), ctrl.obtener);
router.put('/usuarios/:uuid', verificarCsrf, autenticar, autorizarRoles(...admin), ctrl.guardar);

module.exports = router;
