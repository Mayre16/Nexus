'use strict';

const { query } = require('../config/database');

async function listarTechnicalNames(usuarioId) {
  const rows = await query(
    `SELECT modulo FROM usuario_modulos
      WHERE usuario_id = ? AND activo = 1
        AND (expira_en IS NULL OR expira_en > NOW())`,
    [usuarioId],
  );
  return new Set(rows.map((r) => r.modulo));
}

async function listarPorUsuario(usuarioId) {
  return query(
    `SELECT id, modulo, activo, concedido_en, expira_en, notas
       FROM usuario_modulos
      WHERE usuario_id = ?
      ORDER BY modulo`,
    [usuarioId],
  );
}

async function reemplazarModulos(usuarioId, modulos, concedidoPor) {
  await query(`DELETE FROM usuario_modulos WHERE usuario_id = ?`, [usuarioId]);
  if (!modulos?.length) return;
  for (const modulo of modulos) {
    await query(
      `INSERT INTO usuario_modulos (usuario_id, modulo, activo, concedido_por)
       VALUES (?, ?, 1, ?)`,
      [usuarioId, modulo, concedidoPor || null],
    );
  }
}

async function concederModulo(usuarioId, modulo, concedidoPor) {
  await query(
    `INSERT INTO usuario_modulos (usuario_id, modulo, activo, concedido_por)
     VALUES (?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE activo = 1, concedido_por = VALUES(concedido_por)`,
    [usuarioId, modulo, concedidoPor || null],
  );
}

async function revocarModulo(usuarioId, modulo) {
  await query(
    `UPDATE usuario_modulos SET activo = 0 WHERE usuario_id = ? AND modulo = ?`,
    [usuarioId, modulo],
  );
}

module.exports = {
  listarTechnicalNames,
  listarPorUsuario,
  reemplazarModulos,
  concederModulo,
  revocarModulo,
};
