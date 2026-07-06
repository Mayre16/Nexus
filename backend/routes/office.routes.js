'use strict';

const express = require('express');
const ctrl = require('../controllers/lead-proyectos.controller');
const legacy = require('../controllers/office.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');
const { verificarIerpApiKey } = require('../middleware/ierpModuleAuth');
const { body } = require('express-validator');
const repo = require('../repositories/office.repository');

const router = express.Router();

const staff = ['admin', 'empleado'];

// --- Integración iERP (server-to-server, sin CSRF) ---
router.post('/leads/from-ierp', verificarIerpApiKey, ctrl.fromIerp);
router.post('/leads/sync-ierp', verificarIerpApiKey, ctrl.syncIerp);

// --- Leads / proyectos (usuarios Nexus) ---
router.get('/leads', autenticar, autorizarRoles(...staff), ctrl.listar);
router.get('/leads/:uuid', autenticar, autorizarRoles(...staff), ctrl.detalle);
router.post(
  '/leads',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  legacy.validarCrear,
  ctrl.crear,
);
router.patch('/leads/:uuid', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.actualizar);

router.get('/leads/:uuid/vinculos', autenticar, autorizarRoles(...staff), ctrl.vinculos);
router.post('/leads/:uuid/vinculos', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.crearVinculo);
router.patch(
  '/leads/:uuid/vinculos/:vinculoUuid',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.patchVinculo,
);
router.post(
  '/leads/:uuid/tickets',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.crearTicket,
);

router.get('/ierp/assignees', autenticar, autorizarRoles(...staff), ctrl.assigneesIerp);

router.post(
  '/leads/:uuid/vinculos/:vinculoUuid/autorizar-facturacion',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.autorizarFacturacion,
);

module.exports = router;
