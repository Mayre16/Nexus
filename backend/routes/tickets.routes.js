'use strict';

const express = require('express');
const ctrl = require('../controllers/tickets.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();

router.get(
  '/config/mail',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.configMail
);

router.get(
  '/agentes',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.agentes
);

router.get(
  '/clientes',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.clientesEmpresa
);

router.get(
  '/',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.listar
);

router.get(
  '/:uuid',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  ctrl.detalle
);

router.post(
  '/',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  verificarCsrf,
  ctrl.validacionCrear,
  ctrl.crear
);

router.post(
  '/imap/poll',
  autenticar,
  autorizarRoles('admin'),
  verificarCsrf,
  ctrl.pollImap
);

router.patch(
  '/:uuid',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  verificarCsrf,
  ctrl.actualizar
);

router.post(
  '/:uuid/seguimientos',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  verificarCsrf,
  ctrl.validacionNota,
  ctrl.agregarNota
);

router.post(
  '/:uuid/cerrar',
  autenticar,
  autorizarRoles('admin', 'empleado'),
  verificarCsrf,
  ctrl.cerrar
);

module.exports = router;
