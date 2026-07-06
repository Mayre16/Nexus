'use strict';

/**
 * authMiddleware.js — Autenticación (JWT en cookie HttpOnly) + RBAC.
 * ---------------------------------------------------------------------
 * Defensas (D1 + D2):
 *   - `autenticar`: valida el JWT que viaja en la cookie HttpOnly. Si el
 *     token falta/expira/está manipulado → 401. Verifica además que el
 *     usuario siga activo y que `token_version` coincida (invalidación).
 *   - `autorizarRoles(...)`: RBAC estricto. Solo deja pasar los roles
 *     indicados (admin, empleado, cliente_externo, cliente_suscriptor).
 *   - `restringirDivision`: aísla datos por división de negocio
 *     (energia | deportes) salvo que el usuario sea de "ambas"/admin.
 *
 * Nunca confiamos en el frontend para autorización: TODO se valida aquí.
 */

const { query } = require('../config/database');
const { COOKIE_ACCESS, verificarAccessToken } = require('../utils/tokens');
const securityLogger = require('../utils/securityLogger');

/**
 * Middleware: exige un usuario autenticado válido.
 * Adjunta `req.usuario` con datos NO sensibles del usuario.
 */
async function autenticar(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[COOKIE_ACCESS] : null;
    if (!token) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    let payload;
    try {
      payload = verificarAccessToken(token);
    } catch (err) {
      // Token expirado/manipulado/alg inválido → 401 genérico (no filtrar detalle)
      await securityLogger.registrar({
        evento: 'TOKEN_INVALIDO',
        severidad: 'warning',
        detalle: err.name,
        req,
      });
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    // Cargamos el usuario por su UUID público (consulta parametrizada).
    const filas = await query(
      `SELECT u.id, u.uuid, u.nombre_completo, u.email, u.rol, u.division, u.activo,
              u.token_version, u.cliente_empresa_id,
              p.acceso_portal, p.acceso_expira_en
         FROM usuarios u
         LEFT JOIN nexus_personas p ON p.usuario_id = u.id
        WHERE u.uuid = ? LIMIT 1`,
      [payload.sub]
    );
    const usuario = filas[0];

    if (!usuario || usuario.activo !== 1) {
      return res.status(401).json({ error: 'Cuenta no disponible.' });
    }

    if (
      usuario.acceso_portal === 'temporal' &&
      usuario.acceso_expira_en &&
      new Date(usuario.acceso_expira_en) < new Date()
    ) {
      return res.status(401).json({ error: 'Tu acceso al portal ha expirado.' });
    }

    // Invalidación masiva: si cambió token_version, el JWT ya no vale.
    if (Number(payload.tv) !== Number(usuario.token_version)) {
      return res.status(401).json({ error: 'Sesión revocada. Inicia sesión de nuevo.' });
    }

    // Solo exponemos lo necesario (no password_hash, no secretos).
    req.usuario = {
      id: usuario.id,
      uuid: usuario.uuid,
      nombre: usuario.nombre_completo,
      email: usuario.email,
      rol: usuario.rol,
      division: usuario.division,
      cliente_empresa_id: usuario.cliente_empresa_id || null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Middleware factory: RBAC. Solo permite los roles indicados.
 * @param {...('admin'|'empleado'|'cliente_externo'|'cliente_suscriptor')} rolesPermitidos
 */
function autorizarRoles(...rolesPermitidos) {
  return async function (req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      await securityLogger.registrar({
        evento: 'ACCESS_DENIED',
        severidad: 'warning',
        usuarioId: req.usuario.id,
        detalle: `rol=${req.usuario.rol} ruta=${req.originalUrl}`,
        req,
      });
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    return next();
  };
}

/**
 * Middleware factory: confina al usuario a una división de negocio.
 * Admin y usuarios "ambas" pasan siempre. Útil para endpoints específicos
 * de energia o deportes.
 * @param {'energia'|'deportes'} divisionRequerida
 */
function restringirDivision(divisionRequerida) {
  return function (req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    const u = req.usuario;
    if (u.rol === 'admin' || u.division === 'ambas' || u.division === divisionRequerida) {
      return next();
    }
    return res.status(403).json({ error: 'División de negocio no autorizada.' });
  };
}

module.exports = { autenticar, autorizarRoles, restringirDivision };
