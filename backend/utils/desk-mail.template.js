'use strict';

const { env } = require('../config/env');

function baseUrl() {
  return env.NEXUS_PUBLIC_URL || 'http://localhost:3000';
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function referenciaTicket(ticket) {
  const pref = ticket.division === 'deportes' ? 'D' : 'E';
  return `#${pref}${ticket.numero}`;
}

const PRIORIDAD = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

const CANAL = {
  imap: 'Correo',
  web: 'Web',
  portal: 'Portal cliente',
  telefono: 'Teléfono',
  manual: 'Manual',
  leads: 'Leads',
};

/**
 * Correo al CLIENTE — equivalente Zoho «Receiving a new ticket».
 * Asunto con #E1234 al inicio para que las respuestas enganchen por IMAP.
 */
function plantillaTicketNuevoCliente({ ticket, referencia, nombreCliente, buzonCorreo }) {
  const ref = referencia || referenciaTicket(ticket);
  const nombre = nombreCliente || ticket.cliente_nombre || 'estimado cliente';
  const portalUrl = `${baseUrl()}/portal.html`;
  const soporte = buzonCorreo || env.DESK_MAIL_ENERGIA || 'soporte@adesa.com.do';
  const asuntoTicket = esc(ticket.asunto);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <tr><td style="padding:28px 32px 12px;text-align:center;">
      <img src="${baseUrl()}/assets/favicon.png" alt="ADESA" width="56" height="56" />
    </td></tr>
    <tr><td style="padding:8px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;color:#444;font-weight:700;">Hemos recibido su solicitud</h1>
    </td></tr>
    <tr><td style="padding:20px 32px;color:#444;font-size:14px;line-height:1.65;">
      <p style="margin:0 0 12px;">Hola <strong>${esc(nombre)}</strong>,</p>
      <p style="margin:0 0 16px;">Gracias por contactar a <strong>Soporte ADESA</strong>. Su caso fue registrado y nuestro equipo lo atenderá pronto.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;margin:0 0 16px;">
        <tr><td style="padding:14px 16px;font-size:13px;">
          <div style="margin-bottom:6px;"><span style="color:#888;">Número de solicitud:</span> <strong style="color:#be1622;font-size:15px;">${esc(ref)}</strong></div>
          <div style="margin-bottom:6px;"><span style="color:#888;">Asunto:</span> ${asuntoTicket}</div>
          <div><span style="color:#888;">Estado:</span> Abierto</div>
        </td></tr>
      </table>
      <p style="margin:0 0 12px;">Puede dar seguimiento en el portal de autoservicio:</p>
    </td></tr>
    <tr><td style="padding:0 32px 24px;text-align:center;">
      <a href="${portalUrl}" style="display:inline-block;background:#2d9c8a;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:6px;">VER EN EL PORTAL</a>
    </td></tr>
    <tr><td style="padding:0 32px 24px;font-size:12px;color:#666;line-height:1.6;">
      Para agregar información, <strong>responda a este correo</strong> sin quitar <strong>${esc(ref)}</strong> del asunto.<br/>
      También puede escribir a <a href="mailto:${esc(soporte)}" style="color:#2d9c8a;">${esc(soporte)}</a>.
    </td></tr>
    <tr><td style="padding:16px 32px;background:#fafafa;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;">
      Soporte ADESA · Este es un mensaje automático, no responda si no desea actualizar su solicitud.
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hola ${nombre},`,
    '',
    'Gracias por contactar a Soporte ADESA. Hemos recibido su solicitud.',
    '',
    `Número de solicitud: ${ref}`,
    `Asunto: ${ticket.asunto}`,
    'Estado: Abierto',
    '',
    `Seguimiento en el portal: ${portalUrl}`,
    '',
    `Para responder, conteste a este correo manteniendo ${ref} en el asunto.`,
    `Soporte: ${soporte}`,
  ].join('\n');

  return {
    html,
    text,
    subject: `[${ref}] Su solicitud fue recibida — ${ticket.asunto}`.slice(0, 250),
  };
}

/**
 * Correo al EQUIPO DE SOPORTE — equivalente Zoho notificación interna / buzón.
 */
function plantillaTicketNuevoSoporte({ ticket, referencia, usuario }) {
  const ref = referencia || referenciaTicket(ticket);
  const deskUrl = `${baseUrl()}/desk.html`;
  const prioridad = PRIORIDAD[ticket.prioridad] || ticket.prioridad;
  const canal = CANAL[ticket.canal] || ticket.canal;
  const creador = usuario
    ? `${usuario.nombre || usuario.nombre_completo || ''} (${usuario.email || ''})`.trim()
    : ticket.email_remitente || ticket.cliente_nombre || 'Desconocido';
  const desc = ticket.descripcion
    ? esc(ticket.descripcion).slice(0, 2000).replace(/\n/g, '<br>')
    : '<em style="color:#999;">Sin descripción</em>';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:16px;font-family:Arial,sans-serif;font-size:14px;color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:8px;">
    <tr><td style="background:#111;color:#fff;padding:14px 18px;font-weight:bold;">
      Nuevo ticket en Nexus Desk — ${esc(ref)}
    </td></tr>
    <tr><td style="padding:18px;">
      <table width="100%" style="font-size:13px;margin-bottom:16px;">
        <tr><td style="color:#888;width:120px;padding:4px 0;">Asunto</td><td><strong>${esc(ticket.asunto)}</strong></td></tr>
        <tr><td style="color:#888;padding:4px 0;">Prioridad</td><td>${esc(prioridad)}</td></tr>
        <tr><td style="color:#888;padding:4px 0;">Canal</td><td>${esc(canal)}</td></tr>
        <tr><td style="color:#888;padding:4px 0;">Cliente</td><td>${esc(ticket.cliente_nombre || '—')}</td></tr>
        <tr><td style="color:#888;padding:4px 0;">Contacto</td><td>${esc(ticket.email_remitente || ticket.cliente_email || '—')}</td></tr>
        <tr><td style="color:#888;padding:4px 0;">Creado por</td><td>${esc(creador)}</td></tr>
      </table>
      <div style="background:#f5f5f5;border-radius:6px;padding:12px;margin-bottom:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;text-transform:uppercase;">Descripción</div>
        <div style="line-height:1.5;">${desc}</div>
      </div>
      <a href="${deskUrl}" style="display:inline-block;background:#be1622;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;font-size:13px;">Abrir en Desk</a>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Nuevo ticket ${ref} en Nexus Desk`,
    '',
    `Asunto: ${ticket.asunto}`,
    `Prioridad: ${prioridad}`,
    `Canal: ${canal}`,
    `Cliente: ${ticket.cliente_nombre || '—'}`,
    `Contacto: ${ticket.email_remitente || ticket.cliente_email || '—'}`,
    `Creado por: ${creador}`,
    '',
    ticket.descripcion ? `Descripción:\n${ticket.descripcion}` : '',
    '',
    `Abrir: ${deskUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    html,
    text,
    subject: `[Nexus Desk] Nuevo ticket ${ref} — ${ticket.asunto}`.slice(0, 250),
  };
}

function plantillaTicketActualizado({ referencia, asunto, estado, enlacePortal, mensaje, nombreCliente }) {
  const nombre = nombreCliente || 'estimado cliente';
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:24px 32px 8px;text-align:center;">
      <img src="${baseUrl()}/assets/favicon.png" alt="ADESA" width="48" height="48" />
    </td></tr>
    <tr><td style="padding:12px 32px 20px;font-size:14px;color:#444;line-height:1.6;">
      <p>Hola <strong>${esc(nombre)}</strong>,</p>
      <p>Su solicitud <strong style="color:#be1622;">${esc(referencia)}</strong> — <em>${esc(asunto)}</em> fue actualizada.</p>
      ${estado ? `<p>Estado actual: <strong>${esc(estado)}</strong></p>` : ''}
      ${mensaje ? `<div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:12px 0;">${esc(mensaje).replace(/\n/g, '<br>')}</div>` : ''}
      <p style="margin-top:16px;"><a href="${enlacePortal}" style="color:#2d9c8a;font-weight:bold;">Ver en el portal de soporte</a></p>
      <p style="font-size:12px;color:#888;margin-top:20px;">Para responder, conteste a este correo manteniendo <strong>${esc(referencia)}</strong> en el asunto.</p>
    </td></tr>
    <tr><td style="padding:12px 32px;background:#fafafa;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;">
      Soporte ADESA
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hola ${nombre},`,
    `Su solicitud ${referencia} — ${asunto} fue actualizada.`,
    estado ? `Estado: ${estado}` : '',
    mensaje || '',
    `Portal: ${enlacePortal}`,
    `Responda manteniendo ${referencia} en el asunto.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    html,
    text,
    subject: `[${referencia}] Actualización — ${asunto}`.slice(0, 250),
  };
}

module.exports = {
  plantillaTicketNuevoCliente,
  plantillaTicketNuevoSoporte,
  plantillaTicketActualizado,
  referenciaTicket,
  baseUrl,
};
