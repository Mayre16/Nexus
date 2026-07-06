"""
Rutas para consulta y gestión de despachos/conduces (Dispatchs)
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth
from database import db
from database.models import FacturaProcesada, Movimiento, Usuario
from utils.helpers import obtener_productos_dispatch, formatear_fecha_iso_utc, formatear_fecha_documento, parse_fecha_adm, get_adm_client
from utils.validaciones import validar_factura_docid
import json
import traceback
import sys
import logging
from datetime import datetime

despachos_bp = Blueprint('despachos', __name__)

logger = logging.getLogger(__name__)


@despachos_bp.route('/api/despachos/buscar', methods=['POST'])
@require_auth
def buscar_dispatch():
    """Busca un despacho/conduce por DocID"""
    try:
        data = request.json or {}
        docid = data.get('docid', '').strip()
        location_id = data.get('location_id')  # Opcional
        
        # Validar DocID
        es_valido, mensaje = validar_factura_docid(docid)
        if not es_valido:
            return jsonify({
                "success": False,
                "error": mensaje
            }), 400
        
        adm_client = get_adm_client()
        
        # Buscar en ADM Cloud
        try:
            logger.info(f"Buscando despacho: DocID={docid}, LocationID={location_id}")
            dispatch_adm = adm_client.buscar_dispatch_por_docid(docid, max_search=2000, location_id=location_id)
            logger.info(f"Resultado búsqueda: {dispatch_adm is not None}")
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
        
        if not dispatch_adm:
            return jsonify({
                "success": False,
                "error": f"Despacho {docid} no encontrado en ADM Cloud",
                "message": f"El despacho no se encontró después de buscar hasta 2000 despachos. Verifica que el DocID '{docid}' sea correcto."
            }), 404
        
        if not isinstance(dispatch_adm, dict) or not dispatch_adm.get("success"):
            error_msg = dispatch_adm.get("message") if isinstance(dispatch_adm, dict) else "Error desconocido al consultar ADM Cloud"
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud",
                "message": error_msg
            }), 500
        
        dispatch_data = dispatch_adm.get("data", {})
        
        if not dispatch_data:
            return jsonify({
                "success": False,
                "error": "Despacho encontrado pero sin datos",
                "message": "El despacho se encontró pero no contiene información válida"
            }), 404
        
        # Extraer información del despacho
        dispatch_guid = dispatch_data.get("ID")
        dispatch_docid = dispatch_data.get("DocID", "")
        tipo_factura = "DISPATCH"  # Tipo fijo para despachos
        cliente = dispatch_data.get("RelationshipName", "N/A")
        fecha_str = dispatch_data.get("DocDate") or dispatch_data.get("Date") or dispatch_data.get("CreatedDate")
        fecha = parse_fecha_adm(fecha_str)
        total = float(dispatch_data.get("Total", 0) or 0)
        notas = dispatch_data.get("Notes", "")
        
        # NUEVO: Extraer ubicación de origen del despacho
        location_id = dispatch_data.get("LocationID")
        location_name = dispatch_data.get("LocationName")
        
        # Si no viene LocationName, intentar obtenerlo desde SyncLocationStatus
        if location_id and not location_name:
            from database.models import SyncLocationStatus
            ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
            if ubicacion:
                location_name = ubicacion.location_name
        
        # Default a "ADESA" si no se encuentra (compatibilidad hacia atrás)
        if not location_name:
            location_name = "ADESA"
        
        # Obtener productos del despacho
        productos = obtener_productos_dispatch(dispatch_data)
        
        # Obtener usuario actual
        usuario_actual_id = session.get('user_id')
        
        # Guardar o actualizar en base de datos local (usando FacturaProcesada para mantener compatibilidad)
        # Buscar por GUID primero, luego por DocID como fallback
        factura_local = FacturaProcesada.query.filter_by(factura_guid=dispatch_guid).first()
        if not factura_local:
            factura_local = FacturaProcesada.query.filter_by(factura_docid=dispatch_docid).first()
        
        if factura_local:
            if factura_local.factura_guid != dispatch_guid:
                logger.info(f"Actualizando GUID despacho: {factura_local.factura_guid} → {dispatch_guid} (DocID={dispatch_docid})")
                conflicto = FacturaProcesada.query.filter_by(factura_guid=dispatch_guid).first()
                if conflicto and conflicto.id != factura_local.id:
                    logger.info(f"Eliminando registro duplicado id={conflicto.id} con mismo GUID")
                    db.session.delete(conflicto)
                factura_local.factura_guid = dispatch_guid
            factura_local.factura_docid = dispatch_docid
            factura_local.tipo_factura = tipo_factura
            factura_local.cliente = cliente
            factura_local.fecha = fecha
            factura_local.total = total
            factura_local.productos_json = json.dumps(productos)
            factura_local.location_id = location_id
            factura_local.location_name = location_name
            factura_local.updated_at = datetime.utcnow()
            if not factura_local.usuario_solicitante and usuario_actual_id:
                factura_local.usuario_solicitante = usuario_actual_id
        else:
            factura_local = FacturaProcesada(
                factura_guid=dispatch_guid,
                factura_docid=dispatch_docid,
                tipo_factura=tipo_factura,
                cliente=cliente,
                fecha=fecha,
                total=total,
                productos_json=json.dumps(productos),
                estado_despacho='PENDIENTE',
                location_id=location_id,
                location_name=location_name,
                usuario_solicitante=usuario_actual_id
            )
            db.session.add(factura_local)
        
        db.session.commit()
        
        # Verificar si este despacho ya fue registrado (tiene movimientos PICK)
        despacho_ya_registrado = Movimiento.query.filter_by(
            tipo='PICK',
            factura_guid=dispatch_guid
        ).first()
        
        ya_registrada = despacho_ya_registrado is not None
        fecha_registro = None
        usuario_registro = None
        
        if ya_registrada:
            fecha_registro = formatear_fecha_iso_utc(despacho_ya_registrado.timestamp)
            if despacho_ya_registrado.usuario_id:
                usuario_registro_obj = Usuario.query.get(despacho_ya_registrado.usuario_id)
                usuario_registro = usuario_registro_obj.nombre if usuario_registro_obj else None
        
        from utils.helpers import es_ubicacion_adesa
        loc_es_adesa = es_ubicacion_adesa(location_id or "", location_name or "")

        respuesta = {
            "success": True,
            "factura": {
                "guid": dispatch_guid,
                "docid": dispatch_docid,
                "tipo_factura": tipo_factura,
                "cliente": cliente,
                "fecha": formatear_fecha_documento(fecha),
                "total": total,
                "notas": notas,
                "estado_despacho": factura_local.estado_despacho,
                "productos": productos,
                "location_id": location_id,
                "location_name": location_name,
                "es_adesa": loc_es_adesa,
                "ya_registrada": ya_registrada,
                "fecha_registro": fecha_registro,
                "usuario_registro": usuario_registro
            }
        }
        
        return jsonify(respuesta)
        
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"Error inesperado al buscar despacho: {str(e)}")
        logger.error(error_trace)
        return jsonify({
            "success": False,
            "error": "Error inesperado al buscar despacho"
        }), 500


