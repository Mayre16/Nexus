'use strict';

const nodemailer = require('nodemailer');
const configSvc = require('./config.service');
const { env } = require('../config/env');
const { buzonDivision } = require('./deskMailConfig');
const {
  plantillaTicketNuevoCliente,
  plantillaTicketNuevoSoporte,
  referenciaTicket,
} = require('../utils/desk-mail.template');

async function enviar({ division, to, subject, text, html, replyTo }) {
  const cfg = await configSvc.getSmtpEffective(division || 'energia');
  if (!cfg.enabled) {
    return { ok: false, skipped: true, reason: 'SMTP deshabilitado en configuración.' };
  }
  if (!cfg.host || !cfg.user || !cfg.password) {
    return {
      ok: false,
      skipped: true,
      reason: 'SMTP incompleto (host, usuario o contraseña). Configure en Ajustes → Correo.',
    };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: env.esProduccion },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Soporte ADESA" <${cfg.from || cfg.user}>`,
      to,
      subject,
      text,
      html: html || text?.replace(/\n/g, '<br>'),
      replyTo: replyTo || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.warn('[MAIL]', err.message);
    return { ok: false, error: err.message };
  }
}

function emailsCliente(ticket) {
  const set = new Set();
  if (ticket.email_remitente) set.add(ticket.email_remitente.toLowerCase());
  if (ticket.cliente_email) set.add(ticket.cliente_email.toLowerCase());
  return [...set];
}

/**
 * Al crear ticket: dos correos separados como Zoho Desk.
 *  - Cliente: confirmación con #E1234 en asunto (threading IMAP).
 *  - Soporte: alerta al buzón (salvo canal imap — el correo original ya está en la bandeja).
 */
async function notificarTicketCreado(ticket, usuario) {
  const { tickets } = await configSvc.getNotifications();
  if (!tickets.enabled || !tickets.on_create) {
    return { ok: false, skipped: true, reason: 'Notificación de ticket deshabilitada.' };
  }

  const ref = referenciaTicket(ticket);
  const buzon = buzonDivision(ticket.division);
  const resultado = { ok: true, cliente: null, soporte: null };

  const destinosCliente = emailsCliente(ticket);
  if (destinosCliente.length) {
    const nombreCliente =
      usuario?.nombre ||
      usuario?.nombre_completo ||
      ticket.cliente_nombre ||
      null;
    const tpl = plantillaTicketNuevoCliente({
      ticket,
      referencia: ref,
      nombreCliente,
      buzonCorreo: buzon.correo,
    });
    resultado.cliente = await enviar({
      division: ticket.division,
      to: destinosCliente.join(', '),
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      replyTo: buzon.correo,
    });
  }

  if (ticket.canal !== 'imap' && buzon.correo) {
    const tpl = plantillaTicketNuevoSoporte({ ticket, referencia: ref, usuario });
    resultado.soporte = await enviar({
      division: ticket.division,
      to: buzon.correo,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      replyTo: ticket.email_remitente || undefined,
    });
  }

  if (!resultado.cliente?.ok && !resultado.soporte?.ok) {
    const razon =
      resultado.cliente?.reason ||
      resultado.cliente?.error ||
      resultado.soporte?.reason ||
      resultado.soporte?.error ||
      'Sin destinatarios o SMTP no disponible.';
    if (resultado.cliente?.skipped && resultado.soporte?.skipped) {
      return { ok: false, skipped: true, reason: razon };
    }
    if (!destinosCliente.length && ticket.canal === 'imap') {
      return { ok: false, skipped: true, reason: 'Ticket IMAP sin correo de cliente.' };
    }
  }

  return resultado;
}

async function notificarOtLead(lead, vinculo) {
  const { leads } = await configSvc.getNotifications();
  if (!leads.enabled || !leads.on_ot) {
    return { ok: false, skipped: true, reason: 'Notificación OT deshabilitada.' };
  }

  const to = vinculo.assignee_name
    ? null
    : lead.email || (lead.division === 'deportes' ? env.DESK_MAIL_DEPORTES : env.DESK_MAIL_ENERGIA);

  const destino =
    to ||
    (lead.division === 'deportes' ? env.DESK_MAIL_DEPORTES : env.DESK_MAIL_ENERGIA);
  if (!destino) {
    return { ok: false, skipped: true, reason: 'Sin correo destino para OT.' };
  }

  return enviar({
    division: lead.division,
    to: destino,
    subject: `[Nexus Leads] ${vinculo.titulo} — ${lead.referencia || lead.nombre_contacto}`,
    text: [
      `Nueva orden de trabajo vinculada al lead ${lead.referencia || ''}.`,
      ``,
      `Tipo: ${vinculo.tipo}`,
      `Título: ${vinculo.titulo}`,
      lead.ierp_quote_number ? `Cotización iERP: ${lead.ierp_quote_number}` : '',
      vinculo.assignee_name ? `Asignado: ${vinculo.assignee_name}` : '',
      vinculo.fecha_limite ? `Fecha límite: ${vinculo.fecha_limite}` : '',
      ``,
      `Ver lead: ${env.NEXUS_PUBLIC_URL || 'http://localhost:3000'}/leads.html#${lead.uuid}`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

async function probarSmtp(division, to) {
  const cfg = await configSvc.getSmtpEffective(division);
  if (!cfg.host || !cfg.user || !cfg.password) {
    return { ok: false, error: 'SMTP no configurado para esta división.' };
  }
  return enviar({
    division,
    to,
    subject: `[Nexus] Prueba SMTP — ${division}`,
    text: `Correo de prueba desde ${env.APP_NAME} (${division}). Si lo recibes, SMTP está OK.`,
  });
}

module.exports = {
  enviar,
  notificarTicketCreado,
  notificarOtLead,
  probarSmtp,
};
