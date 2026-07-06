'use strict';

const { env } = require('../config/env');

/** Autenticación server-to-server desde Nexus iERP hacia API Leads. */
function verificarIerpApiKey(req, res, next) {
  const key = req.headers['x-nexus-ierp-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!env.IERP_NEXUS_API_KEY) {
    return res.status(503).json({ error: 'Integración iERP no configurada en Nexus.' });
  }
  if (!key || key !== env.IERP_NEXUS_API_KEY) {
    return res.status(401).json({ error: 'API key iERP inválida.' });
  }
  req.integracion = { origen: 'ierp' };
  return next();
}

module.exports = { verificarIerpApiKey };
