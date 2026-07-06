'use strict';

const { env } = require('../config/env');

const DIVISIONES = ['energia', 'deportes'];

function buzonDivision(division) {
  const esDeportes = division === 'deportes';
  return {
    division,
    label: esDeportes ? 'ADESA Deportes' : 'ADESA Energía',
    correo: esDeportes ? env.DESK_MAIL_DEPORTES : env.DESK_MAIL_ENERGIA,
    imapUser: esDeportes ? env.IMAP_DEPORTES_USER : env.IMAP_ENERGIA_USER,
    imapPassword: esDeportes ? env.IMAP_DEPORTES_PASSWORD : env.IMAP_ENERGIA_PASSWORD,
    smtpUser: esDeportes ? env.SMTP_DEPORTES_USER : env.SMTP_ENERGIA_USER,
    smtpPassword: esDeportes ? env.SMTP_DEPORTES_PASSWORD : env.SMTP_ENERGIA_PASSWORD,
  };
}

function buzonConfigurado(buzon, division) {
  const host = division === 'deportes' ? env.IMAP_DEPORTES_HOST : env.IMAP_HOST;
  return Boolean(buzon.correo && buzon.imapUser && buzon.imapPassword && host);
}

function listarBuzonesPublico() {
  return DIVISIONES.map((d) => {
    const b = buzonDivision(d);
    return {
      division: d,
      label: b.label,
      correo: b.correo || null,
      imap_configurado: buzonConfigurado(b, d),
      smtp_configurado: Boolean(
        b.correo && b.smtpUser && (d === 'deportes' ? env.SMTP_DEPORTES_HOST : env.SMTP_HOST)
      ),
    };
  });
}

function imapForDivision(division) {
  const esDeportes = division === 'deportes';
  return {
    host: esDeportes ? env.IMAP_DEPORTES_HOST : env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_TLS,
  };
}

function smtpForDivision(division) {
  const esDeportes = division === 'deportes';
  return {
    host: esDeportes ? env.SMTP_DEPORTES_HOST : env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  };
}

function imapComun() {
  return imapForDivision('energia');
}

function smtpComun() {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  };
}

module.exports = {
  DIVISIONES,
  buzonDivision,
  buzonConfigurado,
  listarBuzonesPublico,
  imapComun,
  imapForDivision,
  smtpForDivision,
  smtpComun,
};
