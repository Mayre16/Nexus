'use strict';

const express = require('express');
const ctrl = require('../controllers/personas.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');
const { verificarCsrf } = require('../middleware/csrfProtection');

const router = express.Router();
const staff = ['admin', 'empleado'];

router.get('/meta', autenticar, autorizarRoles(...staff), ctrl.meta);
router.get('/', autenticar, autorizarRoles(...staff), ctrl.buscar);
router.post('/', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.validarCrear, ctrl.crear);
router.get('/evento/:tipo/:ref', autenticar, autorizarRoles(...staff), ctrl.listarEvento);
router.post(
  '/evento/:tipo/:ref',
  verificarCsrf,
  autenticar,
  autorizarRoles(...staff),
  ctrl.validarEtiquetar,
  ctrl.etiquetar,
);
router.delete('/vinculos/:uuid', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.quitar);
router.get('/:uuid', autenticar, autorizarRoles(...staff), ctrl.detalle);
router.patch('/:uuid', verificarCsrf, autenticar, autorizarRoles(...staff), ctrl.actualizar);

module.exports = router;
