'use strict';

const express = require('express');
const ctrl = require('../controllers/ierp-nexus.controller');
const { autenticar, autorizarRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const roles = ['admin', 'empleado'];

router.get('/estado', autenticar, autorizarRoles(...roles), ctrl.estado);
router.get('/resumen', autenticar, autorizarRoles(...roles), ctrl.resumen);

router.get('/cotizaciones', autenticar, autorizarRoles(...roles), ctrl.cotizaciones);
router.get('/cotizaciones/:id', autenticar, autorizarRoles(...roles), ctrl.cotizacionDetalle);

router.get('/facturas', autenticar, autorizarRoles(...roles), ctrl.facturas);
router.get('/facturas/:id', autenticar, autorizarRoles(...roles), ctrl.facturaDetalle);

router.get('/clientes', autenticar, autorizarRoles(...roles), ctrl.clientes);
router.get('/clientes/:id', autenticar, autorizarRoles(...roles), ctrl.clienteDetalle);

router.get('/productos', autenticar, autorizarRoles(...roles), ctrl.productos);
router.get('/productos/:id', autenticar, autorizarRoles(...roles), ctrl.productoDetalle);

module.exports = router;
