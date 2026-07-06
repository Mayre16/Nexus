'use strict';

/**
 * auth.controller.js — Lógica de autenticación (D2).
 * ---------------------------------------------------------------------
 * Flujo:
 *   - login: valida credenciales, aplica bloqueo por intentos, emite
 *     JWT (access + refresh) en cookies HttpOnly y audita el evento.
 *   - me: devuelve el usuario autenticado (datos no sensibles).
 *   - logout: revoca la sesión (incrementa token_version) y limpia cookies.
 *   - refresh: renueva el access token usando el refresh token rotativo.
 *
 * Defensas:
 *   - Mensajes genéricos para no revelar si el email existe (anti enumeración).
 *   - Bloqueo temporal tras varios intentos fallidos (anti fuerza bruta).
 *   - Solo se guarda el hash del refresh token en la BD.
 */

const crypto = require('crypto');
const { validationResult } = require('express-validator');

const repo = require('../repositories/usuario.repository');
const { verificarPassword } = require('../utils/password');
const securityLogger = require('../utils/securityLogger');
const { comparacionSegura } = require('../utils/crypto');
const {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  opcionesCookie,
  firmarAccessToken,
  firmarRefreshToken,
  verificarRefreshToken,
} = require('../utils/tokens');

const MAX_INTENTOS = 5; // intentos fallidos antes de bloquear
const BLOQUEO_MINUTOS = 15; // duración del bloqueo temporal
const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 min (alinear con JWT_ACCESS_TTL)
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días

/** Hash determinista del refresh token para guardarlo/compararlo en BD. */
function hashRefresh(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Emite las cookies de sesión (access + refresh) en el response. */
function emitirCookiesSesion(res, usuario) {
  const accessToken = firmarAccessToken({
    uuid: usuario.uuid,
    rol: usuario.rol,
    division: usuario.division,
    tokenVersion: usuario.token_version,
  });
  const refreshToken = firmarRefreshToken({
    uuid: usuario.uuid,
    tokenVersion: usuario.token_version,
  });
  res.cookie(COOKIE_ACCESS, accessToken, opcionesCookie(ACCESS_MAX_AGE));
  res.cookie(COOKIE_REFRESH, refreshToken, opcionesCookie(REFRESH_MAX_AGE));
  return refreshToken;
}

/** POST /api/auth/login */
async function login(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }

    const email = String(req.body.email).toLowerCase().trim();
    const password = String(req.body.password);

    const usuario = await repo.buscarPorEmail(email);

    // Respuesta genérica para no revelar si el correo existe.
    const credencialesInvalidas = () => {
      securityLogger.registrar({
        evento: 'LOGIN_FAIL',
        severidad: 'warning',
        emailIntento: email,
        usuarioId: usuario ? usuario.id : null,
        req,
      });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    };

    if (!usuario || usuario.activo !== 1) {
      await verificarPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidin');
      if (usuario && usuario.activo !== 1) {
        return res.status(401).json({
          error: 'Cuenta pendiente de activación. Revisa tu correo y usa el enlace «Aceptar la invitación».',
        });
      }
      return credencialesInvalidas();
    }

    // ¿Cuenta bloqueada temporalmente?
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      securityLogger.registrar({
        evento: 'LOGIN_BLOCKED',
        severidad: 'warning',
        usuarioId: usuario.id,
        emailIntento: email,
        detalle: `bloqueado hasta ${usuario.bloqueado_hasta}`,
        req,
      });
      return res.status(429).json({
        error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.',
      });
    }

    const passwordOk = await verificarPassword(password, usuario.password_hash);
    if (!passwordOk) {
      await repo.incrementarIntentosFallidos(usuario.id);
      // ¿Alcanzó el umbral? Bloquear temporalmente.
      if (usuario.intentos_fallidos + 1 >= MAX_INTENTOS) {
        const hasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
        await repo.bloquearHasta(usuario.id, hasta);
      }
      return credencialesInvalidas();
    }

    // Éxito: emitir cookies, guardar hash del refresh, auditar.
    const refreshToken = emitirCookiesSesion(res, usuario);
    await repo.registrarLoginExitoso(usuario.id, hashRefresh(refreshToken));
    securityLogger.registrar({
      evento: 'LOGIN_OK',
      severidad: 'info',
      exito: true,
      usuarioId: usuario.id,
      req,
    });

    return res.json({
      usuario: {
        uuid: usuario.uuid,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        division: usuario.division,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/auth/me  (requiere middleware autenticar) */
async function me(req, res) {
  return res.json({ usuario: req.usuario });
}

/** POST /api/auth/logout  (requiere middleware autenticar) */
async function logout(req, res, next) {
  try {
    if (req.usuario) {
      await repo.revocarSesiones(req.usuario.id);
      securityLogger.registrar({
        evento: 'LOGOUT',
        severidad: 'info',
        exito: true,
        usuarioId: req.usuario.id,
        req,
      });
    }
    res.clearCookie(COOKIE_ACCESS, opcionesCookie(0));
    res.clearCookie(COOKIE_REFRESH, opcionesCookie(0));
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/auth/refresh  (usa la cookie de refresh) */
async function refresh(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[COOKIE_REFRESH] : null;
    if (!token) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    let payload;
    try {
      payload = verificarRefreshToken(token);
    } catch (_) {
      return res.status(401).json({ error: 'Sesión expirada.' });
    }

    const usuario = await repo.buscarPorUuid(payload.sub);
    if (!usuario || usuario.activo !== 1) {
      return res.status(401).json({ error: 'Cuenta no disponible.' });
    }
    // El refresh debe coincidir con el guardado y con la versión de token.
    const coincide =
      usuario.refresh_token_hash &&
      comparacionSegura(usuario.refresh_token_hash, hashRefresh(token)) &&
      Number(payload.tv) === Number(usuario.token_version);
    if (!coincide) {
      return res.status(401).json({ error: 'Sesión inválida.' });
    }

    // Rotación: emitimos cookies nuevas y actualizamos el hash guardado.
    const nuevoRefresh = emitirCookiesSesion(res, usuario);
    await repo.actualizarRefreshHash(usuario.id, hashRefresh(nuevoRefresh));
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login, me, logout, refresh };
