'use strict';

const express = require('express');
const ctrl = require('../controllers/portal.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const cliente = ctrl.rolesCliente;
const staff = ctrl.rolesStaff;

// —— Público (KB sin login) ——
router.get('/kb', ctrl.listarKb);
router.get('/kb/:uuid', ctrl.detalleKb);

// —— Activación (sin login) ——
router.get('/invitacion/:token', ctrl.validarInvitacion);
router.post('/activar', verificarCsrf, ctrl.validarActivar, ctrl.activarCuenta);

// —— Cliente autenticado ——
router.get('/me', autenticar, autorizarRoles(...cliente), ctrl.me);
router.get('/tickets', autenticar, autorizarRoles(...cliente), ctrl.listarTickets);
router.get('/tickets/:uuid', autenticar, autorizarRoles(...cliente), ctrl.detalleTicket);
router.post('/tickets', verificarCsrf, autenticar, autorizarRoles(...cliente), ctrl.crearTicket);
router.post(
  '/tickets/:uuid/seguimientos',
  verificarCsrf,
  autenticar,
  autorizarRoles(...cliente),
  ctrl.responderTicket,
);
router.post(
  '/tickets/:uuid/satisfaccion',
  verificarCsrf,
  autenticar,
  autorizarRoles(...cliente),
  ctrl.calificar,
);

router.get('/foro/categorias', autenticar, autorizarRoles(...cliente), ctrl.foroCategorias);
router.get('/foro/categorias/:categoriaUuid/temas', autenticar, autorizarRoles(...cliente), ctrl.foroTemas);
router.get('/foro/temas/:uuid', autenticar, autorizarRoles(...cliente), ctrl.foroDetalle);
router.post('/foro/temas', verificarCsrf, autenticar, autorizarRoles(...cliente), ctrl.foroCrearTema);
router.post(
  '/foro/temas/:uuid/posts',
  verificarCsrf,
  autenticar,
  autorizarRoles(...cliente),
  ctrl.foroCrearPost,
);

// —— Staff: invitar clientes y gestionar KB ——
router.post(
  '/invitar',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.validarInvitar,
  ctrl.invitar,
);
router.get('/admin/clientes', autenticar, autorizarRoles(...staff), ctrl.listarClientesInvite);
router.get('/admin/kb', autenticar, autorizarRoles(...staff), ctrl.adminKbListar);
router.post('/admin/kb', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.adminKbCrear);
router.patch(
  '/admin/kb/:uuid',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.adminKbActualizar,
);

module.exports = router;
