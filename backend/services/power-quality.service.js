'use strict';

const pqRepo = require('../repositories/power-quality.repository');

async function listarProyectos(usuario) {
  return pqRepo.listarProyectos(usuario.id);
}

async function crearYProcesar(usuario, body, files) {
  const meta = {
    cliente_nombre: body.cliente_nombre,
    proyecto_nombre: body.proyecto_nombre,
    ubicacion: body.ubicacion,
    equipo_medicion: body.equipo_medicion,
  };
  if (!meta.cliente_nombre || !meta.proyecto_nombre) {
    throw Object.assign(new Error('Cliente y proyecto son requeridos'), { status: 400 });
  }

  let parametros = {};
  try {
    parametros = typeof body.parametros === 'string' ? JSON.parse(body.parametros) : (body.parametros || {});
  } catch (_) {
    throw Object.assign(new Error('parametros JSON inválido'), { status: 400 });
  }

  const { uuid, id } = await pqRepo.crearProyecto(usuario.id, meta, parametros);

  if (files?.excel) {
    await pqRepo.guardarArchivo(id, 'excel', files.excel.name, files.excel.buffer);
  } else if (body.excel_base64) {
    const buf = Buffer.from(body.excel_base64, 'base64');
    await pqRepo.guardarArchivo(id, 'excel', body.excel_nombre || 'datos.xlsx', buf);
  } else {
    throw Object.assign(new Error('Sube un archivo Excel'), { status: 400 });
  }

  if (files?.plantilla) {
    await pqRepo.guardarArchivo(id, 'plantilla', files.plantilla.name, files.plantilla.buffer);
  }

  const proyecto = await pqRepo.obtenerProyecto(uuid, usuario.id);
  await pqRepo.ejecutarPipeline(proyecto);
  const archivos = await pqRepo.listarArchivos(proyecto.id);
  return { uuid, archivos };
}

async function obtenerDetalle(usuario, uuid) {
  const p = await pqRepo.obtenerProyecto(uuid, usuario.id);
  if (!p) return null;
  const archivos = await pqRepo.listarArchivos(p.id);
  return { proyecto: p, archivos };
}

async function listarPlantillas(usuario) {
  return pqRepo.listarPlantillas(usuario.id);
}

module.exports = {
  listarProyectos,
  crearYProcesar,
  obtenerDetalle,
  listarPlantillas,
};
