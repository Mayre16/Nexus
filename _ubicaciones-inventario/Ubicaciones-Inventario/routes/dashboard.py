"""
Rutas para dashboard y estadísticas
"""
from flask import Blueprint, request, jsonify
from routes.auth import require_auth
from database.models import FacturaProcesada, Movimiento, PendienteUbicacion
from sqlalchemy import func
from datetime import datetime, timedelta

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/api/dashboard/estadisticas', methods=['GET'])
@require_auth
def obtener_estadisticas():
    """Obtiene estadísticas del dashboard"""
    try:
        # Facturas pendientes
        facturas_pendientes = FacturaProcesada.query.filter_by(
            estado_despacho='PENDIENTE'
        ).count()
        
        # Facturas en proceso
        facturas_proceso = FacturaProcesada.query.filter_by(
            estado_despacho='EN_PROCESO'
        ).count()
        
        # Productos pendientes de ubicación
        pendientes_ubicacion = PendienteUbicacion.query.filter_by(
            status='PENDIENTE'
        ).count()
        
        # Movimientos hoy
        hoy = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        movimientos_hoy = Movimiento.query.filter(
            Movimiento.timestamp >= hoy
        ).count()
        
        return jsonify({
            "success": True,
            "estadisticas": {
                "facturas_pendientes": facturas_pendientes,
                "facturas_proceso": facturas_proceso,
                "pendientes_ubicacion": pendientes_ubicacion,
                "movimientos_hoy": movimientos_hoy
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener estadísticas",
            "message": str(e)
        }), 500




















