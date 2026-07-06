"""
Rutas de consulta básica para ADM Cloud API
Estas rutas permiten verificar conexión, buscar productos y listar productos
"""
from flask import Blueprint, request, jsonify
from api.adm_cloud import ADMCloudClient
from flask import current_app
from routes.auth import require_auth

consulta_bp = Blueprint('consulta', __name__, url_prefix='/api')


def get_adm_client_from_config() -> ADMCloudClient:
    """Obtiene un cliente ADM Cloud usando la configuración actual"""
    return ADMCloudClient(
        api_base=current_app.config.get('ADM_API_BASE', 'https://api.admcloud.net/api/'),
        email=current_app.config.get('ADM_EMAIL', ''),
        password=current_app.config.get('ADM_PASSWORD', ''),
        appid=current_app.config.get('ADM_APPID', ''),
        company=current_app.config.get('ADM_COMPANY', ''),
        role=current_app.config.get('ADM_ROLE', '')
    )


def get_adm_client_from_request(data: dict) -> ADMCloudClient:
    """Obtiene un cliente ADM Cloud usando SOLO la configuración del servidor.
    Las credenciales del request se ignoran por seguridad (previene SSRF/credential testing).
    """
    return get_adm_client_from_config()


@consulta_bp.route('/verificar-conexion', methods=['POST'])
@require_auth
def verificar_conexion():
    """Verifica la conexión con el API de ADM Cloud"""
    try:
        data = request.json or {}
        
        # Crear cliente con credenciales del request (o usar las del config)
        client = get_adm_client_from_request(data)
        
        # Hacer una petición simple de prueba
        result = client._make_request("items/", {"skip": 0, "take": 50})
        
        if result["success"]:
            # Obtener TODOS los productos para contar correctamente
            todos_result = client.obtener_todos_los_items(max_items=5000)
            
            if todos_result["success"]:
                total_items = len(todos_result["data"])
                return jsonify({
                    "success": True,
                    "message": f"¡Conexión exitosa! Se encontraron {total_items} productos.",
                    "status_code": 200,
                    "total_items": total_items
                })
            else:
                # Si falla obtener todos, al menos contar los primeros
                items_data = result["data"]
                total_items = len(items_data) if isinstance(items_data, list) else 0
                
                return jsonify({
                    "success": True,
                    "message": f"¡Conexión exitosa! Se encontraron al menos {total_items} productos (puede haber más).",
                    "status_code": 200,
                    "total_items": total_items,
                    "nota": "No se pudieron obtener todos los productos, mostrando solo los primeros"
                })
        else:
            return jsonify({
                "success": False,
                "error": result.get("error", "Error desconocido"),
                "message": result.get("message", "Sin mensaje de error"),
                "status_code": result.get("status_code", 500)
            }), result.get("status_code", 500)
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500


@consulta_bp.route('/buscar-producto', methods=['POST'])
@require_auth
def buscar_producto():
    """Busca un producto por SKU"""
    try:
        data = request.json or {}
        sku = data.get('sku', '').strip().upper()
        
        if not sku:
            return jsonify({
                "success": False,
                "error": "SKU requerido"
            }), 400
        
        # Crear cliente con configuración actual
        client = get_adm_client_from_config()
        
        # Buscar producto
        producto = client.buscar_item_por_sku(sku)
        
        if producto:
            # Obtener total de productos para referencia
            todos_result = client.obtener_todos_los_items(max_items=100)
            total_productos = len(todos_result["data"]) if todos_result["success"] else 0
            
            return jsonify({
                "success": True,
                "producto": producto,
                "total_productos_buscados": total_productos
            })
        else:
            return jsonify({
                "success": False,
                "error": f"Producto con SKU '{sku}' no encontrado"
            }), 404
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al buscar producto",
            "message": str(e)
        }), 500


@consulta_bp.route('/listar-productos', methods=['GET'])
@require_auth
def listar_productos():
    """Lista productos (con paginación)"""
    try:
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', 50))
        
        # Crear cliente con configuración actual
        client = get_adm_client_from_config()
        
        # Obtener TODOS los productos
        result = client.obtener_todos_los_items(max_items=5000)
        
        if result["success"]:
            todos_productos = result["data"]
            total = len(todos_productos)
            
            # Aplicar paginación
            productos_paginados = todos_productos[skip:skip+limit]
            
            return jsonify({
                "success": True,
                "total": total,
                "mostrando": len(productos_paginados),
                "skip": skip,
                "limit": limit,
                "data": productos_paginados
            })
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al listar productos",
            "message": str(e)
        }), 500
















