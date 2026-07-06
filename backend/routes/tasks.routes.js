'use strict';

const express = require('express');
const ctrl = require('../controllers/tasks.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const staff = ['admin', 'empleado'];

router.get('/agentes', autenticar, autorizarRoles(...staff), ctrl.agentes);
router.get('/', autenticar, autorizarRoles(...staff), ctrl.listar);
router.get('/:uuid', autenticar, autorizarRoles(...staff), ctrl.detalle);
router.post('/', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.validarCrear, ctrl.crear);
router.patch('/:uuid', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.validarActualizar, ctrl.actualizar);
router.post('/:uuid/archivar', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.archivar);
router.post('/:uuid/restaurar', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.restaurar);

module.exports = router;
