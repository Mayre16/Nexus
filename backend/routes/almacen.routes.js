'use strict';

const express = require('express');
const ctrl = require('../controllers/almacen.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const roles = ['admin', 'empleado'];

router.get('/pedidos', autenticar, autorizarRoles(...roles), ctrl.listar);
router.get('/pedidos/:uuid', autenticar, autorizarRoles(...roles), ctrl.detalle);
router.patch('/pedidos/:uuid/estado', verificarCsrf, autenticar, autorizarRoles(...roles), ctrl.actualizarEstado);

router.get('/pedidos/:uuid/picking', autenticar, autorizarRoles(...roles), ctrl.estadoPicking);
router.post('/pedidos/:uuid/picking/iniciar', verificarCsrf, autenticar, autorizarRoles(...roles), ctrl.iniciarPicking);
router.post('/pedidos/:uuid/picking/registrar', verificarCsrf, autenticar, autorizarRoles(...roles), ctrl.registrarPick);
router.post('/pedidos/:uuid/picking/completar', verificarCsrf, autenticar, autorizarRoles(...roles), ctrl.completarPicking);

router.get('/ubicaciones', autenticar, autorizarRoles(...roles), ctrl.listarUbicaciones);
router.post('/ubicaciones', verificarCsrf, autenticar, autorizarRoles('admin'), ctrl.crearUbicacion);

module.exports = router;
