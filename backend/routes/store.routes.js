'use strict';

const express = require('express');
const ctrl = require('../controllers/store.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();

router.get('/productos', autenticar, autorizarRoles('admin', 'empleado'), ctrl.productos);
router.get('/pedidos', autenticar, autorizarRoles('admin', 'empleado'), ctrl.listarPedidos);
router.get('/pedidos/:uuid', autenticar, autorizarRoles('admin', 'empleado'), ctrl.detallePedido);
router.post(
  '/pedidos',
  verificarCsrf,
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.validarPedido,
  ctrl.crearPedido
);
router.get('/adm/estado', autenticar, autorizarRoles('admin', 'empleado'), ctrl.estadoAdm);
router.post(
  '/adm/sync',
  verificarCsrf,
  autenticar,
  autorizarRoles('admin'),
  ctrl.syncAdm
);

module.exports = router;
