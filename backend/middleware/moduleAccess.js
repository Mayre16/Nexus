'use strict';

const umRepo = require('../repositories/usuario-modulos.repository');
const { obtenerModulo } = require('../modules/registry');

async function usuarioTieneModulo(usuario, technicalName) {
  if (usuario.rol === 'admin') return true;
  const mod = obtenerModulo(technicalName);
  if (!mod) return false;
  if (mod.roles && !mod.roles.includes(usuario.rol)) return false;
  if (!mod.requiresAssignment) return true;
  const asignados = await umRepo.listarTechnicalNames(usuario.id);
  return asignados.has(technicalName);
}

function verificarModulo(technicalName) {
  return async (req, res, next) => {
    try {
      const ok = await usuarioTieneModulo(req.usuario, technicalName);
      if (!ok) {
        return res.status(403).json({ error: 'Sin acceso a este módulo' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { verificarModulo, usuarioTieneModulo };
