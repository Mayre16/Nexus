'use strict';

const repo = require('../repositories/office.repository');
const vincRepo = require('../repositories/lead-vinculos.repository');
const ticketsSvc = require('./tickets.service');
const { env } = require('../config/env');

async function listar(filtros, usuario) {
  return repo.listarLeads(filtros, usuario);
}

async function detalle(uuid, usuario) {
  const lead = await repo.obtenerLead(uuid);
  if (!lead) return null;
  const leadId = await vincRepo.obtenerLeadIdPorUuid(uuid);
  const vinculos = leadId ? await vincRepo.listarPorLead(leadId) : [];
  const pendientes = leadId ? await vincRepo.contarPendientesPorLead(leadId) : 0;
  return { ...lead, vinculos, pendientes_count: pendientes };
}

async function crear(body, usuario) {
  const division = body.division || (usuario.division === 'deportes' ? 'deportes' : 'energia');
  if (usuario.rol !== 'admin' && usuario.division !== 'ambas' && usuario.division !== division) {
    throw new Error('No puedes crear leads en otra división.');
  }
  if (!body.nombre_contacto) throw new Error('Nombre de contacto requerido.');
  return repo.crearLead({ ...body, division, tipo: body.tipo || 'inbound' }, usuario.id);
}

async function actualizar(uuid, body) {
  const ok = await repo.actualizarLead(uuid, body);
  if (!ok) return null;
  return detalle(uuid, { rol: 'admin', division: 'ambas' });
}

/** Fase A/D — iERP empuja cotización como proyecto (API key). */
async function recibirDesdeIerp(body) {
  if (!body.ierp_tenant_id || !body.ierp_quote_id) {
    throw new Error('ierp_tenant_id e ierp_quote_id son obligatorios.');
  }
  if (body.follow_up === false) {
    await repo.archivarLeadIerp(body.ierp_tenant_id, body.ierp_quote_id);
    return { archived: true };
  }

  const division = body.division === 'deportes' ? 'deportes' : 'energia';
  const nombre =
    body.contact_name ||
    body.nombre_contacto ||
    body.ierp_company_name ||
    'Contacto iERP';

  const result = await repo.upsertLeadIerpProyecto({
    division,
    nombre_contacto: nombre,
    empresa: body.ierp_company_name,
    email: body.email,
    telefono: body.phone || body.telefono,
    ierp_tenant_id: body.ierp_tenant_id,
    ierp_quote_id: body.ierp_quote_id,
    ierp_quote_number: body.ierp_quote_number,
    ierp_company_id: body.ierp_company_id,
    ierp_company_name: body.ierp_company_name,
    ierp_quote_total: body.total,
    ierp_quote_currency: body.currency || 'DOP',
    ierp_auth_status: body.quote_authorization_status || null,
    ierp_pipeline_stage: body.pipeline_stage_name || null,
    notas: body.notes || body.notas,
  });

  const leadId = result.id;
  if (result.created && leadId) {
    await vincRepo.crearVinculo(leadId, {
      tipo: 'ierp_cotizacion',
      titulo: `Cotización ${body.ierp_quote_number || body.ierp_quote_id}`,
      descripcion: body.notes || null,
      referencia_modulo: 'ierp',
      referencia_id: body.ierp_quote_id,
      estado: 'en_progreso',
    }, null);
  }

  const lead = await repo.obtenerLead(result.uuid);
  return { lead, created: result.created };
}

/** Fase D — sync estado cotización desde iERP. */
async function sincronizarIerp(body) {
  if (!body.ierp_tenant_id || !body.ierp_quote_id) {
    throw new Error('ierp_tenant_id e ierp_quote_id requeridos.');
  }
  if (body.follow_up === false) {
    await repo.archivarLeadIerp(body.ierp_tenant_id, body.ierp_quote_id);
    return { archived: true };
  }
  const sync = await repo.sincronizarEstadoIerp(
    body.ierp_tenant_id,
    body.ierp_quote_id,
    body.quote_status || 'QUOTE',
    body,
  );
  return sync || { ignored: true };
}

async function listarVinculos(uuid) {
  const leadId = await vincRepo.obtenerLeadIdPorUuid(uuid);
  if (!leadId) return null;
  return vincRepo.listarPorLead(leadId);
}

async function crearVinculo(uuid, body, usuario) {
  const leadId = await vincRepo.obtenerLeadIdPorUuid(uuid);
  if (!leadId) return null;
  if (!vincRepo.TIPOS.includes(body.tipo)) throw new Error('Tipo de vínculo inválido.');

  let nexusAsignadoId = null;
  if (body.nexus_asignado_uuid) {
    const { query } = require('../config/database');
    const u = await query(`SELECT id FROM usuarios WHERE uuid = ? LIMIT 1`, [body.nexus_asignado_uuid]);
    nexusAsignadoId = u[0]?.id || null;
  }

  const creado = await vincRepo.crearVinculo(
    leadId,
    {
      ...body,
      nexus_asignado_id: nexusAsignadoId,
      notificar: body.notificar !== false && ['ot_levantamiento', 'ot_verificacion'].includes(body.tipo),
    },
    usuario.id,
  );

  if (['ot_levantamiento', 'ot_verificacion', 'ot_servicio'].includes(body.tipo)) {
    await repo.actualizarLead(uuid, { estado_proyecto: 'en_verificacion' });
  }

  const vinculo = await vincRepo.obtenerPorUuid(creado.uuid);
  if (vinculo?.notificar) {
    const lead = await repo.obtenerLead(uuid);
    const mailSvc = require('./mail.service');
    void mailSvc.notificarOtLead(lead, vinculo).then((r) => {
      if (!r.ok && !r.skipped) console.warn('[LEADS] mail OT:', r.error || r.reason);
    });
  }

  return vinculo;
}

async function actualizarVinculo(uuid, vinculoUuid, body) {
  const ok = await vincRepo.actualizarVinculo(vinculoUuid, body);
  if (!ok) return null;
  return vincRepo.obtenerPorUuid(vinculoUuid);
}

/** Fase B — crear ticket Desk vinculado al lead. */
async function crearTicketDesdeLead(uuid, body, usuario) {
  const lead = await repo.obtenerLead(uuid);
  if (!lead) return null;

  const ticket = await ticketsSvc.crear(
    {
      division: lead.division,
      asunto: body.asunto || `[Lead ${lead.referencia}] ${body.titulo || 'Seguimiento'}`,
      descripcion: body.descripcion || `Vinculado al lead ${lead.referencia}`,
      prioridad: body.prioridad || 'media',
      canal: 'leads',
      email_remitente: lead.email || body.email_remitente || null,
    },
    usuario,
  );

  const leadId = await vincRepo.obtenerLeadIdPorUuid(uuid);
  if (leadId && ticket?.ticket) {
    await vincRepo.crearVinculo(
      leadId,
      {
        tipo: 'desk_ticket',
        titulo: ticket.ticket.asunto,
        referencia_modulo: 'desk',
        referencia_id: ticket.ticket.uuid,
        estado: 'en_progreso',
        assignee_source: body.assignee_source,
        assignee_id: body.assignee_id,
        assignee_name: body.assignee_name,
      },
      usuario.id,
    );
  }

  return ticket;
}

async function autorizarFacturacionOt(uuid, vinculoUuid, usuario) {
  const lead = await repo.obtenerLead(uuid);
  if (!lead || !lead.ierp_tenant_id || !lead.ierp_quote_id) {
    throw new Error('Lead sin cotización iERP vinculada.');
  }
  const vinculo = await vincRepo.obtenerPorUuid(vinculoUuid);
  if (!vinculo || !['ot_servicio', 'ot_verificacion'].includes(vinculo.tipo)) {
    throw new Error('Solo OT de servicio o verificación pueden autorizar facturación.');
  }

  const ierp = require('./ierp-client.service');
  const result = await ierp.crearBorradorFactura({
    tenantId: lead.ierp_tenant_id,
    quoteId: lead.ierp_quote_id,
    notas: `Autorizado desde Leads ${lead.referencia}`,
    otTitulo: vinculo.titulo,
  });

  await vincRepo.actualizarVinculo(vinculoUuid, {
    estado: 'completado',
    facturacion_autorizada: 1,
    ierp_invoice_id: result.invoice?.id || null,
  });
  await repo.actualizarLead(uuid, { estado_proyecto: 'completado', estado: 'ganado' });

  return { vinculo: await vincRepo.obtenerPorUuid(vinculoUuid), invoice: result.invoice };
}

async function listarAssigneesIerp(tenantId, tipo, search) {
  if (!tenantId) throw new Error('tenant_id requerido');
  const ierp = require('./ierp-client.service');
  return ierp.listarAssignees(tenantId, tipo, search);
}

function urlPublicaIerp() {
  return env.NEXUS_PUBLIC_URL || 'http://localhost:3000';
}

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  recibirDesdeIerp,
  sincronizarIerp,
  listarVinculos,
  crearVinculo,
  actualizarVinculo,
  crearTicketDesdeLead,
  autorizarFacturacionOt,
  listarAssigneesIerp,
  urlPublicaIerp,
};
