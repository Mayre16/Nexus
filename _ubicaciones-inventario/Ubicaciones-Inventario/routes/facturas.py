"""
Rutas para consulta y gestión de facturas
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth
from api.adm_cloud import ADMCloudClient
from config import get_config
from database import db
from database.models import FacturaProcesada, Movimiento
from utils.helpers import obtener_productos_factura, formatear_fecha_documento, parse_fecha_adm, get_adm_client
from utils.validaciones import validar_factura_docid
import json
import traceback
import sys
import logging
from datetime import datetime

facturas_bp = Blueprint('facturas', __name__)
config = get_config()

logger = logging.getLogger(__name__)


@facturas_bp.route('/api/facturas/actualizar-solicitante', methods=['POST'])
@require_auth
def actualizar_solicitante():
    """Actualiza el usuario solicitante de una factura"""
    try:
        data = request.json or {}
        factura_guid = data.get('factura_guid')
        usuario_id = data.get('usuario_id')
        
        if not factura_guid or not usuario_id:
            return jsonify({
                "success": False,
                "error": "GUID de factura y usuario son requeridos"
            }), 400
        
        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        if not factura:
            return jsonify({
                "success": False,
                "error": "Factura no encontrada"
            }), 404
        
        factura.usuario_solicitante = usuario_id
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Usuario solicitante actualizado"
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al actualizar usuario solicitante: {e}")
        return jsonify({
            "success": False,
            "error": "Error al actualizar usuario solicitante",
            "message": str(e)
        }), 500


@facturas_bp.route('/api/facturas/buscar', methods=['POST'])
@require_auth
def buscar_factura():
    """Busca una factura por DocID"""
    try:
        data = request.json or {}
        docid = data.get('docid', '').strip()
        tipo = data.get('tipo', 'CASH').upper()  # CASH, CREDIT, ORDER
        
        # Validar DocID
        es_valido, mensaje = validar_factura_docid(docid)
        if not es_valido:
            return jsonify({
                "success": False,
                "error": mensaje
            }), 400
        
        # Buscar en base de datos local primero (cache)
        factura_local = FacturaProcesada.query.filter_by(factura_docid=docid).first()
        
        adm_client = get_adm_client()
        
        # Buscar en ADM Cloud
        try:
            logger.info(f"Buscando factura: DocID={docid}, Tipo={tipo}")
            factura_adm = adm_client.buscar_factura_por_docid(docid, tipo, max_search=2000)
            logger.info(f"Resultado busqueda: {factura_adm is not None}")
        except Exception as api_error:
            error_trace = traceback.format_exc()
            print(f"ERROR al consultar ADM Cloud: {str(api_error)}", file=sys.stderr)
            print(f"TRACEBACK:\n{error_trace}", file=sys.stderr)
            sys.stderr.flush()
            logger.error(f"Error al consultar ADM Cloud: {str(api_error)}")
            logger.error(error_trace)
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud"
            }), 500
        
        if not factura_adm:
            return jsonify({
                "success": False,
                "error": f"Factura {docid} no encontrada en ADM Cloud",
                "message": f"La factura no se encontró después de buscar hasta 2000 facturas. Verifica que el DocID '{docid}' sea correcto y que el tipo '{tipo}' sea el adecuado."
            }), 404
        
        if not isinstance(factura_adm, dict) or not factura_adm.get("success"):
            error_msg = factura_adm.get("message") if isinstance(factura_adm, dict) else "Error desconocido al consultar ADM Cloud"
            return jsonify({
                "success": False,
                "error": f"Error al obtener la factura {docid}",
                "message": error_msg
            }), 500
        
        # Extraer datos de la factura
        factura_data = factura_adm.get("data")
        if not factura_data:
            return jsonify({
                "success": False,
                "error": "Error al procesar la respuesta de ADM Cloud",
                "message": "La factura no contiene datos"
            }), 500
        
        # Si la respuesta tiene estructura anidada {"data": {"data": {...}}}
        if isinstance(factura_data, dict) and "data" in factura_data:
            factura_data = factura_data["data"]
        
        if not isinstance(factura_data, dict):
            return jsonify({
                "success": False,
                "error": "Error al procesar la respuesta de ADM Cloud",
                "message": "Formato de datos inválido"
            }), 500
        
        # Extraer productos
        productos = obtener_productos_factura(factura_data)
        
        # Obtener GUID
        guid = factura_data.get("ID")
        if not guid:
            return jsonify({
                "success": False,
                "error": "Error al procesar la factura",
                "message": "La factura no tiene ID (GUID)"
            }), 500
        
        # NUEVO: Extraer ubicación de origen de la factura
        location_id = factura_data.get("LocationID")
        location_name = factura_data.get("LocationName")
        
        # Si no viene LocationName, intentar obtenerlo desde SyncLocationStatus
        if location_id and not location_name:
            from database.models import SyncLocationStatus
            ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
            if ubicacion:
                location_name = ubicacion.location_name
        
        # Default a "ADESA" si no se encuentra (compatibilidad hacia atrás)
        if not location_name:
            location_name = "ADESA"
        
        # Parsear fecha de ADM Cloud a datetime
        fecha_doc = parse_fecha_adm(factura_data.get("DocDate"))
        
        # Obtener usuario actual
        usuario_actual_id = session.get('user_id')
        
        # Guardar o actualizar en base de datos local
        # Primero verificar si ya existe un registro con el nuevo GUID
        existente_por_guid = FacturaProcesada.query.filter_by(factura_guid=guid).first()
        
        if factura_local:
            if factura_local.factura_guid != guid:
                logger.info(f"Actualizando GUID: {factura_local.factura_guid} → {guid} (DocID={docid}, tipo={tipo})")
                if existente_por_guid and existente_por_guid.id != factura_local.id:
                    logger.info(f"Eliminando registro duplicado id={existente_por_guid.id} con mismo GUID")
                    db.session.delete(existente_por_guid)
                factura_local.factura_guid = guid
            factura_local.cliente = factura_data.get("RelationshipName")
            factura_local.fecha = fecha_doc
            factura_local.total = factura_data.get("TotalAmount")
            factura_local.productos_json = json.dumps(productos)
            factura_local.tipo_factura = tipo
            factura_local.location_id = location_id
            factura_local.location_name = location_name
            if not factura_local.usuario_solicitante and usuario_actual_id:
                factura_local.usuario_solicitante = usuario_actual_id
        elif existente_por_guid:
            factura_local = existente_por_guid
            factura_local.factura_docid = docid
            factura_local.cliente = factura_data.get("RelationshipName")
            factura_local.fecha = fecha_doc
            factura_local.total = factura_data.get("TotalAmount")
            factura_local.productos_json = json.dumps(productos)
            factura_local.tipo_factura = tipo
            factura_local.location_id = location_id
            factura_local.location_name = location_name
            if not factura_local.usuario_solicitante and usuario_actual_id:
                factura_local.usuario_solicitante = usuario_actual_id
        else:
            factura_local = FacturaProcesada(
                factura_docid=docid,
                factura_guid=guid,
                tipo_factura=tipo,
                cliente=factura_data.get("RelationshipName"),
                fecha=fecha_doc,
                total=factura_data.get("TotalAmount"),
                productos_json=json.dumps(productos),
                estado_despacho='PENDIENTE',
                location_id=location_id,
                location_name=location_name,
                usuario_solicitante=usuario_actual_id
            )
            db.session.add(factura_local)
        
        db.session.commit()
        
        # Verificar si este despacho ya tiene movimientos PICK (para mostrar botones admin)
        despacho_ya_registrado = Movimiento.query.filter_by(
            tipo='PICK',
            factura_guid=guid
        ).first()
        ya_registrada = despacho_ya_registrado is not None
        fecha_registro = None
        usuario_registro = None
        if ya_registrada and despacho_ya_registrado:
            from utils.helpers import formatear_fecha_iso_utc
            fecha_registro = formatear_fecha_iso_utc(despacho_ya_registrado.timestamp)
            if despacho_ya_registrado.usuario_id:
                from database.models import Usuario
                usuario_registro_obj = Usuario.query.get(despacho_ya_registrado.usuario_id)
                usuario_registro = usuario_registro_obj.nombre if usuario_registro_obj else None
        
        # Obtener información del usuario solicitante si existe
        usuario_solicitante_info = None
        if factura_local.usuario_solicitante:
            from database.models import Usuario
            usuario_solicitante = Usuario.query.get(factura_local.usuario_solicitante)
            if usuario_solicitante:
                usuario_solicitante_info = {
                    "id": usuario_solicitante.id,
                    "nombre": usuario_solicitante.nombre
                }
        
        from utils.helpers import es_ubicacion_adesa
        loc_es_adesa = es_ubicacion_adesa(location_id or "", location_name or "")

        return jsonify({
            "success": True,
            "factura": {
                "docid": docid,
                "guid": guid,
                "tipo": tipo,
                "tipo_factura": tipo,
                "cliente": factura_data.get("RelationshipName"),
                "fecha": formatear_fecha_documento(parse_fecha_adm(factura_data.get("DocDate"))) or factura_data.get("DocDate"),
                "total": factura_data.get("TotalAmount"),
                "estado_despacho": factura_local.estado_despacho,
                "location_id": location_id,
                "location_name": location_name,
                "es_adesa": loc_es_adesa,
                "productos": productos,
                "usuario_solicitante": usuario_solicitante_info,
                "ya_registrada": ya_registrada,
                "fecha_registro": fecha_registro,
                "usuario_registro": usuario_registro
            }
        })
        
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        
        # Escribir error a stderr (se verá en stderr.log)
        print(f"ERROR en buscar_factura: {str(e)}", file=sys.stderr)
        print(f"TRACEBACK:\n{error_trace}", file=sys.stderr)
        sys.stderr.flush()
        
        # También loggear con logging
        logger.error(f"Error al buscar factura: {str(e)}")
        logger.error(traceback.format_exc())
        
        return jsonify({
            "success": False,
            "error": "Error al buscar factura"
        }), 500


@facturas_bp.route('/api/facturas/<docid>', methods=['GET'])
@require_auth
def obtener_factura(docid):
    """Obtiene información de una factura desde la base de datos local"""
    try:
        factura = FacturaProcesada.query.filter_by(factura_docid=docid).first()
        
        if not factura:
            return jsonify({
                "success": False,
                "error": "Factura no encontrada"
            }), 404
        
        return jsonify({
            "success": True,
            "factura": factura.to_dict()
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener factura",
            "message": str(e)
        }), 500


