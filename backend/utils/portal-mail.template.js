'use strict';

const { env } = require('../config/env');

function baseUrl() {
  return env.NEXUS_PUBLIC_URL || 'http://localhost:3000';
}

function plantillaInvitacion({ nombre, email, enlaceActivar, portalNombre = 'Soporte ADESA' }) {
  const saludo = nombre ? `¡Bienvenido ${nombre}!` : '¡Bienvenido!';
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <tr><td style="padding:32px 32px 16px;text-align:center;">
      <img src="${baseUrl()}/assets/favicon.png" alt="ADESA" width="64" height="64" style="display:inline-block;" />
    </td></tr>
    <tr><td style="padding:8px 32px 0;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#555;font-weight:700;">${saludo}</h1>
    </td></tr>
    <tr><td style="padding:20px 32px;text-align:center;color:#444;font-size:15px;line-height:1.6;">
      Has sido invitado a acceder al <strong>Portal de autoservicio de ${portalNombre}</strong>.<br/>
      Desde el portal puedes dar seguimiento a tus solicitudes, consultar la base de conocimientos y participar en la comunidad.
    </td></tr>
    <tr><td style="padding:8px 32px 28px;text-align:center;">
      <a href="${enlaceActivar}" style="display:inline-block;background:#2d9c8a;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;letter-spacing:.5px;">ACEPTAR LA INVITACIÓN</a>
    </td></tr>
    <tr><td style="padding:0 32px 24px;text-align:center;font-size:13px;color:#888;">
      Tu usuario es <strong>${email}</strong><br/>
      También puedes <a href="${enlaceActivar}" style="color:#2d9c8a;">hacer clic aquí</a> para aceptar la invitación.
    </td></tr>
    <tr><td style="padding:16px 32px;background:#fafafa;text-align:center;font-size:12px;color:#aaa;border-top:1px solid #eee;">
      Gracias,<br/>Administrador de ${portalNombre}
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    saludo,
    '',
    `Has sido invitado al portal de autoservicio de ${portalNombre}.`,
    '',
    `Usuario: ${email}`,
    `Aceptar invitación: ${enlaceActivar}`,
    '',
    'Desde el portal puedes seguir tus solicitudes, consultar la base de conocimientos y participar en foros.',
  ].join('\n');

  return { html, text, subject: `Invitación al portal de ${portalNombre}` };
}

function plantillaTicketActualizado({ referencia, asunto, estado, enlacePortal, mensaje }) {
  const { plantillaTicketActualizado: actualizado } = require('./desk-mail.template');
  return actualizado({ referencia, asunto, estado, enlacePortal, mensaje });
}

module.exports = { plantillaInvitacion, plantillaTicketActualizado, baseUrl };
