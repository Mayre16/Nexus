'use strict';

const officeRepo = require('../repositories/office.repository');
const leadSvc = require('../services/lead-proyectos.service');

async function listar(req, res, next) {
  try {
    const data = await leadSvc.listar(
      {
        division: req.query.division,
        estado: req.query.estado,
        tipo: req.query.tipo,
        estado_proyecto: req.query.estado_proyecto,
      },
      req.usuario,
    );
    return res.json({ leads: data });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await leadSvc.detalle(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function crear(req, res, next) {
  try {
    const data = await leadSvc.crear(req.body, req.usuario);
    const lead = await officeRepo.obtenerLead(data.uuid);
    return res.status(201).json(lead);
  } catch (err) {
    if (err.message && /división|requerido/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const data = await leadSvc.actualizar(req.params.uuid, req.body);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function fromIerp(req, res, next) {
  try {
    const data = await leadSvc.recibirDesdeIerp(req.body);
    return res.status(data.created ? 201 : 200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function syncIerp(req, res, next) {
  try {
    const data = await leadSvc.sincronizarIerp(req.body);
    return res.json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function vinculos(req, res, next) {
  try {
    const data = await leadSvc.listarVinculos(req.params.uuid);
    if (data === null) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.json({ vinculos: data });
  } catch (err) {
    return next(err);
  }
}

async function crearVinculo(req, res, next) {
  try {
    const data = await leadSvc.crearVinculo(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function patchVinculo(req, res, next) {
  try {
    const data = await leadSvc.actualizarVinculo(req.params.uuid, req.params.vinculoUuid, req.body);
    if (!data) return res.status(404).json({ error: 'Vínculo no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function crearTicket(req, res, next) {
  try {
    const data = await leadSvc.crearTicketDesdeLead(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function assigneesIerp(req, res, next) {
  try {
    const data = await leadSvc.listarAssigneesIerp(
      req.query.tenant_id,
      req.query.tipo,
      req.query.search,
    );
    return res.json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function autorizarFacturacion(req, res, next) {
  try {
    const data = await leadSvc.autorizarFacturacionOt(
      req.params.uuid,
      req.params.vinculoUuid,
      req.usuario,
    );
    return res.json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  fromIerp,
  syncIerp,
  vinculos,
  crearVinculo,
  patchVinculo,
  crearTicket,
  assigneesIerp,
  autorizarFacturacion,
};
