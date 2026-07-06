'use strict';

const { env } = require('../config/env');

function ierpHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Nexus-Ierp-Key': env.IERP_NEXUS_API_KEY || process.env.IERP_NEXUS_API_KEY || '',
  };
}

async function listarAssignees(tenantId, tipo, search) {
  const base = (env.IERP_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
  const p = new URLSearchParams({ tenant_id: tenantId });
  if (tipo) p.set('tipo', tipo);
  if (search) p.set('search', search);
  const res = await fetch(`${base}/api/integrations/nexus-leads/assignees?${p}`, {
    headers: ierpHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`iERP assignees HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function crearBorradorFactura({ tenantId, quoteId, notas, otTitulo }) {
  const base = (env.IERP_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
  const res = await fetch(`${base}/api/integrations/nexus-leads/draft-invoice`, {
    method: 'POST',
    headers: ierpHeaders(),
    body: JSON.stringify({
      ierp_tenant_id: tenantId,
      ierp_quote_id: quoteId,
      notas,
      ot_titulo: otTitulo,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`iERP draft-invoice HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

module.exports = { listarAssignees, crearBorradorFactura };
