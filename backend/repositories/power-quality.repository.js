'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { query } = require('../config/database');
const { env } = require('../config/env');

const STORAGE = path.resolve(__dirname, '../../storage/power-quality');

function asegurarStorage() {
  for (const sub of ['uploads', 'reports', 'templates']) {
    fs.mkdirSync(path.join(STORAGE, sub), { recursive: true });
  }
}

async function listarProyectos(usuarioId) {
  return query(
    `SELECT uuid, cliente_nombre, proyecto_nombre, ubicacion, equipo_medicion,
            estado, error_mensaje, creado_en, actualizado_en
       FROM pq_proyectos
      WHERE usuario_id = ?
      ORDER BY creado_en DESC
      LIMIT 50`,
    [usuarioId],
  );
}

async function obtenerProyecto(uuid, usuarioId) {
  const rows = await query(
    `SELECT * FROM pq_proyectos WHERE uuid = ? AND usuario_id = ? LIMIT 1`,
    [uuid, usuarioId],
  );
  return rows[0] || null;
}

async function listarArchivos(proyectoId) {
  return query(
    `SELECT tipo, nombre_original, ruta_storage, creado_en
       FROM pq_archivos WHERE proyecto_id = ? ORDER BY creado_en`,
    [proyectoId],
  );
}

async function listarPlantillas(usuarioId) {
  return query(
    `SELECT uuid, nombre, tipo_analisis, es_sistema, activo, creado_en
       FROM pq_plantillas
      WHERE (usuario_id IS NULL OR usuario_id = ?) AND activo = 1
      ORDER BY es_sistema DESC, nombre`,
    [usuarioId],
  );
}

async function crearProyecto(usuarioId, meta, parametros) {
  asegurarStorage();
  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO pq_proyectos
       (uuid, usuario_id, cliente_nombre, proyecto_nombre, ubicacion, equipo_medicion, parametros_json, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'borrador')`,
    [
      uuid,
      usuarioId,
      meta.cliente_nombre,
      meta.proyecto_nombre,
      meta.ubicacion || null,
      meta.equipo_medicion || null,
      JSON.stringify(parametros),
    ],
  );
  const rows = await query(`SELECT id FROM pq_proyectos WHERE uuid = ?`, [uuid]);
  return { uuid, id: rows[0].id };
}

async function guardarArchivo(proyectoId, tipo, nombreOriginal, buffer) {
  asegurarStorage();
  const ext = path.extname(nombreOriginal) || '.bin';
  const fname = `${crypto.randomUUID()}${ext}`;
  const rel = path.join('uploads', fname);
  const abs = path.join(STORAGE, rel);
  fs.writeFileSync(abs, buffer);
  await query(
    `INSERT INTO pq_archivos (proyecto_id, tipo, nombre_original, ruta_storage) VALUES (?, ?, ?, ?)`,
    [proyectoId, tipo, nombreOriginal, rel],
  );
  return abs;
}

async function marcarEstado(proyectoId, estado, errorMensaje = null) {
  await query(
    `UPDATE pq_proyectos SET estado = ?, error_mensaje = ?, actualizado_en = NOW() WHERE id = ?`,
    [estado, errorMensaje, proyectoId],
  );
}

async function ejecutarPipeline(proyecto) {
  const archivos = await listarArchivos(proyecto.id);
  const excel = archivos.find((a) => a.tipo === 'excel');
  const plantilla = archivos.find((a) => a.tipo === 'plantilla');
  if (!excel) throw new Error('Falta archivo Excel');

  const scriptPath = path.resolve(__dirname, '../workers/power-quality/run_job.py');
  const params = typeof proyecto.parametros_json === 'string'
    ? JSON.parse(proyecto.parametros_json)
    : proyecto.parametros_json;

  const outputName = `${proyecto.uuid}_reporte.docx`;
  const outputRel = path.join('reports', outputName);
  const outputAbs = path.join(STORAGE, outputRel);

  let templatePath = plantilla ? path.join(STORAGE, plantilla.ruta_storage) : null;
  if (!templatePath) {
    const def = path.resolve(__dirname, '../../../PowerQuality/templates/Reporte Analisis de datos.docx');
    if (fs.existsSync(def)) templatePath = def;
  }

  const payload = {
    excel_path: path.join(STORAGE, excel.ruta_storage),
    template_path: templatePath,
    output_path: outputAbs,
    metadata: params,
  };

  await marcarEstado(proyecto.id, 'procesando');

  return new Promise((resolve, reject) => {
    const proc = spawn(
      env.PYTHON_BIN || 'python',
      [scriptPath, '--json', JSON.stringify(payload)],
      { cwd: path.dirname(scriptPath) },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', async (code) => {
      if (code !== 0 || !fs.existsSync(outputAbs)) {
        const msg = stderr || stdout || 'Pipeline falló';
        await marcarEstado(proyecto.id, 'error', msg.slice(0, 2000));
        return reject(new Error(msg));
      }
      await query(
        `INSERT INTO pq_archivos (proyecto_id, tipo, nombre_original, ruta_storage) VALUES (?, 'reporte', ?, ?)`,
        [proyecto.id, outputName, outputRel],
      );
      await marcarEstado(proyecto.id, 'completado');
      resolve({ outputRel, outputAbs });
    });
    proc.on('error', async (err) => {
      await marcarEstado(proyecto.id, 'error', err.message);
      reject(err);
    });
  });
}

module.exports = {
  STORAGE,
  asegurarStorage,
  listarProyectos,
  obtenerProyecto,
  listarArchivos,
  listarPlantillas,
  crearProyecto,
  guardarArchivo,
  ejecutarPipeline,
};
