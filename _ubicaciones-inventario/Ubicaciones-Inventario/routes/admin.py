"""
Rutas de administración para discrepancias y sincronizaciones
"""
from flask import Blueprint, request, jsonify
from routes.auth import require_admin
from database import db
from database.models import EnRevision, SyncRun, SyncLocationStatus
from sqlalchemy import case, or_
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/api/test-email', methods=['GET'])
@require_admin
def test_email():
    """Endpoint de prueba para verificar configuración de email"""
    try:
        from utils.email import enviar_email
        
        asunto = "Test WMS - Configuración de Email"
        cuerpo_html = f"""
        <html>
        <body>
            <h2>Test de Email WMS</h2>
            <p>Este es un email de prueba para verificar la configuración SMTP.</p>
            <p>Si recibes este email, la configuración está correcta.</p>
            <p><strong>Fecha:</strong> {datetime.utcnow().isoformat()}</p>
        </body>
        </html>
        """
        
        cuerpo_texto = "Test de Email WMS - Si recibes este email, la configuración está correcta."
        
        resultado = enviar_email(asunto, cuerpo_html, cuerpo_texto)
        
        if resultado:
            return jsonify({
                "success": True,
                "message": "Email de prueba enviado exitosamente",
                "destinatario": "luis.useche@adesa.com.do"
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": "Error al enviar email. Revisa logs para más detalles."
            }), 500
            
    except Exception as e:
        logger.error(f"Error en test-email: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500


@admin_bp.route('/api/en-revision', methods=['GET'])
@require_admin
def listar_en_revision():
    """
    Lista discrepancias en revisión (solo lectura, paginado)
    
    Query params:
        location_id: Filtrar por ubicación
        severidad: Filtrar por severidad (critica, alta, media, baja)
        tipo: Filtrar por tipo
        estado: Filtrar por estado (pendiente, resuelto, ignorado)
        sku: Buscar por SKU (búsqueda parcial)
        page: Número de página (default: 1)
        per_page: Items por página (default: 50, max: 100)
    """
    try:
        # Parámetros de paginación
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)  # Máximo 100
        
        # Filtros
        query = EnRevision.query
        
        location_id = request.args.get('location_id')
        if location_id:
            query = query.filter_by(location_id=location_id)
        
        severidad = request.args.get('severidad')
        if severidad:
            query = query.filter_by(severidad=severidad)
        
        tipo = request.args.get('tipo')
        if tipo:
            query = query.filter_by(tipo=tipo)
        
        estado = request.args.get('estado', 'pendiente')
        if estado:
            query = query.filter_by(estado=estado)
        
        sku = request.args.get('sku')
        if sku:
            query = query.filter(EnRevision.sku.ilike(f'%{sku}%'))
        
        # Ordenar por severidad + fecha detección
        orden_severidad = case(
            (EnRevision.severidad == 'critica', 4),
            (EnRevision.severidad == 'alta', 3),
            (EnRevision.severidad == 'media', 2),
            else_=1
        )
        query = query.order_by(orden_severidad.desc(), EnRevision.fecha_deteccion.desc())
        
        # Paginación
        paginacion = query.paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            "success": True,
            "data": [item.to_dict() for item in paginacion.items],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginacion.total,
                "pages": paginacion.pages
            }
        })
        
    except Exception as e:
        logger.error(f"Error en listar_en_revision: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500


@admin_bp.route('/api/sync-runs', methods=['GET'])
@require_admin
def listar_sync_runs():
    """
    Lista historial de runs de sincronización (solo lectura, paginado)
    
    Query params:
        location_id: Filtrar por ubicación
        status: Filtrar por status (running, done, partial, failed)
        page: Número de página (default: 1)
        per_page: Items por página (default: 50, max: 100)
    """
    try:
        # Parámetros de paginación
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)
        
        # Filtros
        query = SyncRun.query
        
        location_id = request.args.get('location_id')
        if location_id:
            query = query.filter_by(location_id=location_id)
        
        status = request.args.get('status')
        if status:
            query = query.filter_by(status=status)
        
        # Ordenar por fecha (más recientes primero)
        query = query.order_by(SyncRun.started_at.desc())
        
        # Paginación
        paginacion = query.paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            "success": True,
            "data": [item.to_dict() for item in paginacion.items],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginacion.total,
                "pages": paginacion.pages
            }
        })
        
    except Exception as e:
        logger.error(f"Error en listar_sync_runs: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500


# Respuesta por defecto cuando la DB no está disponible (evita 500 intermitentes)
_NOTIFICACIONES_CONFIG_DEFAULT = {
    "id": None,
    "email_discrepancias_activo": True,
    "email_estado_sync_activo": True,
    "email_destinatario": None,
    "updated_at": None,
}


@admin_bp.route('/api/notificaciones/config', methods=['GET'])
@require_admin
def obtener_config_notificaciones():
    """Obtiene la configuración de notificaciones. Siempre 200 JSON.
    Si la DB falla, retorna valores por defecto (sin tocar DB).
    """
    import uuid
    request_id = uuid.uuid4().hex[:8]
    logger.info(f"[{request_id}] GET /api/notificaciones/config")
    try:
        from database.models import NotificacionesConfig
        from utils.db_helpers import db_query_with_retry

        config = db_query_with_retry(
            lambda: NotificacionesConfig.get_config(),
            tag="obtener_config_notificaciones"
        )
        if config is not None:
            return jsonify({
                "success": True,
                "data": config.to_dict(),
                "_request_id": request_id
            })
    except Exception as e:
        logger.warning(f"[{request_id}] obtener_config_notificaciones: DB no disponible, usando defaults: {e}")
    return jsonify({
        "success": True,
        "data": _NOTIFICACIONES_CONFIG_DEFAULT,
        "_fallback": True,
        "_request_id": request_id,
    })


@admin_bp.route('/api/notificaciones/config', methods=['PUT'])
@require_admin
def actualizar_config_notificaciones():
    """Actualiza la configuración de notificaciones"""
    try:
        from database.models import NotificacionesConfig
        data = request.get_json()
        
        config = NotificacionesConfig.get_config()
        
        # Actualizar campos
        if 'email_discrepancias_activo' in data:
            config.email_discrepancias_activo = bool(data['email_discrepancias_activo'])
        if 'email_estado_sync_activo' in data:
            config.email_estado_sync_activo = bool(data['email_estado_sync_activo'])
        if 'email_destinatario' in data:
            config.email_destinatario = data['email_destinatario'] or None
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Configuración de notificaciones actualizada",
            "data": config.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al actualizar config de notificaciones: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500


