"""
Rutas para gestión de stock por ubicación
"""
from flask import Blueprint, request, jsonify
from routes.auth import require_auth
from database import db
from database.models import StockUbicacion
from utils.validaciones import validar_sku, validar_ubicacion, validar_cantidad
from utils.helpers import calcular_stock_total_wms

stock_bp = Blueprint('stock', __name__)


@stock_bp.route('/api/stock/ubicacion', methods=['GET'])
@require_auth
def obtener_stock_ubicacion():
    """Obtiene stock por ubicación"""
    try:
        sku = request.args.get('sku', '').strip().upper()
        ubicacion = request.args.get('ubicacion', '').strip()
        
        query = StockUbicacion.query
        
        if sku:
            query = query.filter_by(sku=sku)
        if ubicacion:
            query = query.filter_by(ubicacion=ubicacion)
        
        stocks = query.all()
        
        return jsonify({
            "success": True,
            "data": [s.to_dict() for s in stocks]
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener stock",
            "message": str(e)
        }), 500


@stock_bp.route('/api/stock/total', methods=['GET'])
@require_auth
def obtener_stock_total():
    """Calcula stock total WMS por SKU"""
    try:
        sku = request.args.get('sku', '').strip().upper()
        
        if not sku:
            return jsonify({
                "success": False,
                "error": "SKU es requerido"
            }), 400
        
        total = calcular_stock_total_wms(sku=sku)
        
        return jsonify({
            "success": True,
            "sku": sku,
            "stock_total": total
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al calcular stock total",
            "message": str(e)
        }), 500


@stock_bp.route('/api/stock/por-skus', methods=['POST'])
@require_auth
def obtener_stock_por_skus():
    """Devuelve stock en ubicaciones físicas WMS por SKU (varios SKUs). Para mostrar en tarjetas de producto (Transferencias, Despacho, Recepciones)."""
    try:
        data = request.json or {}
        skus = data.get('skus', [])
        if not skus:
            return jsonify({"success": True, "data": {}})
        skus_upper = [s.strip().upper() for s in skus if s and str(s).strip()]
        if not skus_upper:
            return jsonify({"success": True, "data": {}})
        result = {}
        for sku in skus_upper:
            rows = StockUbicacion.query.filter_by(sku=sku).all()
            result[sku] = [{"ubicacion": r.ubicacion, "cantidad": float(r.cantidad or 0)} for r in rows if float(r.cantidad or 0) > 0]
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500




















