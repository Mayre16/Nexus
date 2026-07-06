'use strict';

const { validationResult, body } = require('express-validator');
const portalSvc = require('../services/portal.service');
const inviteSvc = require('../services/portal-invite.service');
const portalRepo = require('../repositories/portal.repository');
const kbRepo = require('../repositories/kb.repository');
const ticketsRepo = require('../repositories/tickets.repository');
const { hashPassword, MIN_LONGITUD } = require('../utils/password');

const rolesCliente = ['cliente_externo', 'cliente_suscriptor'];
const rolesStaff = ['admin', 'empleado'];

async function me(req, res, next) {
  try {
    return res.json(await portalSvc.perfil(req.usuario));
  } catch (e) {
    return next(e);
  }
}

async function listarTickets(req, res, next) {
  try {
    return res.json(await portalSvc.listarTickets(req.usuario, req.query));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function detalleTicket(req, res, next) {
  try {
    const det = await portalSvc.detalleTicket(req.params.uuid, req.usuario);
    if (!det) return res.status(404).json({ error: 'Ticket no encontrado.' });
    return res.json(det);
  } catch (e) {
    return next(e);
  }
}

async function crearTicket(req, res, next) {
  try {
    const det = await portalSvc.crearTicket(req.body, req.usuario);
    return res.status(201).json(det);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function responderTicket(req, res, next) {
  try {
    const det = await portalSvc.responderTicket(req.params.uuid, req.body, req.usuario);
    if (!det) return res.status(404).json({ error: 'Ticket no encontrado.' });
    return res.json(det);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function calificar(req, res, next) {
  try {
    const r = await portalSvc.calificarTicket(req.params.uuid, req.body.valor, req.usuario);
    return res.json(r);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function listarKb(req, res) {
  const division = req.query.division || req.usuario?.division;
  const rows = await portalSvc.listarKb(division, req.query.q);
  return res.json({ articulos: rows });
}

async function detalleKb(req, res) {
  const art = await portalSvc.detalleKb(req.params.uuid);
  if (!art) return res.status(404).json({ error: 'Artículo no encontrado.' });
  return res.json({ articulo: art });
}

async function foroCategorias(req, res) {
  const div = req.query.division || req.usuario?.division;
  const cats = await portalSvc.listarForoCategorias(div);
  return res.json({ categorias: cats });
}

async function foroTemas(req, res) {
  const temas = await portalSvc.listarForoTemas(req.params.categoriaUuid);
  return res.json({ temas });
}

async function foroDetalle(req, res) {
  const det = await portalSvc.detalleForoTema(req.params.uuid);
  if (!det) return res.status(404).json({ error: 'Tema no encontrado.' });
  return res.json(det);
}

async function foroCrearTema(req, res, next) {
  try {
    const tema = await portalSvc.crearForoTema(req.body, req.usuario);
    return res.status(201).json({ tema });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function foroCrearPost(req, res, next) {
  try {
    const post = await portalSvc.crearForoPost(req.params.uuid, req.body, req.usuario);
    return res.status(201).json({ post });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function invitar(req, res, next) {
  try {
    const r = await inviteSvc.invitarCliente(req.body, req.usuario);
    return res.status(201).json(r);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function listarClientesInvite(req, res) {
  const div = req.query.division;
  const rows = await ticketsRepo.listarClientesEmpresa(div || null);
  return res.json({ clientes: rows });
}

async function adminKbListar(req, res) {
  const rows = await kbRepo.listarAdmin(req.query.division);
  return res.json({ articulos: rows });
}

async function adminKbCrear(req, res, next) {
  try {
    const art = await kbRepo.crear(req.body, req.usuario.id);
    return res.status(201).json({ articulo: art });
  } catch (e) {
    return next(e);
  }
}

async function adminKbActualizar(req, res, next) {
  try {
    await kbRepo.actualizar(req.params.uuid, req.body);
    const art = await kbRepo.obtenerAdmin(req.params.uuid);
    return res.json({ articulo: art });
  } catch (e) {
    return next(e);
  }
}

const validarInvitar = [
  body('email').isEmail().normalizeEmail(),
  body('nombre_completo').optional().isString().isLength({ max: 180 }),
  body('cliente_empresa_uuid').optional().isUUID(),
  body('division').optional().isIn(['energia', 'deportes']),
];

const validarActivar = [
  body('token').isString().isLength({ min: 32, max: 128 }),
  body('password').isString().isLength({ min: MIN_LONGITUD }),
];

async function validarInvitacion(req, res) {
  const inv = await portalRepo.buscarInvitacionPorToken(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invitación inválida o ya utilizada.' });
  if (new Date(inv.expira_en) < new Date()) {
    return res.status(410).json({ error: 'La invitación ha expirado.' });
  }
  return res.json({
    email: inv.email,
    nombre: inv.nombre_completo,
    tipo: inv.tipo,
  });
}

async function activarCuenta(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const inv = await portalRepo.buscarInvitacionPorToken(req.body.token);
    if (!inv) return res.status(404).json({ error: 'Invitación inválida o ya utilizada.' });
    if (new Date(inv.expira_en) < new Date()) {
      return res.status(410).json({ error: 'La invitación ha expirado.' });
    }

    const passwordHash = await hashPassword(req.body.password);
    await portalRepo.activarUsuario(inv.usuario_id, passwordHash);
    await portalRepo.marcarInvitacionUsada(inv.uuid);

    return res.json({ ok: true, email: inv.email, mensaje: 'Cuenta activada. Ya puedes iniciar sesión.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  me,
  listarTickets,
  detalleTicket,
  crearTicket,
  responderTicket,
  calificar,
  listarKb,
  detalleKb,
  foroCategorias,
  foroTemas,
  foroDetalle,
  foroCrearTema,
  foroCrearPost,
  invitar,
  listarClientesInvite,
  adminKbListar,
  adminKbCrear,
  adminKbActualizar,
  validarInvitar,
  validarActivar,
  validarInvitacion,
  activarCuenta,
  rolesCliente,
  rolesStaff,
};
