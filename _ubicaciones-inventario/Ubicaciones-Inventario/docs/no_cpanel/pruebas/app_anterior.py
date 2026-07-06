"""
Aplicación Flask para consultar ADM Cloud API
Interfaz web simple para buscar productos y consultar información
"""

from flask import Flask, render_template, request, jsonify
import requests
import base64
import json

app = Flask(__name__)

# Configuración del API
API_CONFIG = {
    "api_base": "https://api.admcloud.net/api/",
    "email": "luis.useche@adesa.com.do",
    "password": "Merida.123.",
    "appid": "cccdf964-1e69-46e7-5ed0-08de4e33921f",
    "company": "7b5f5222-123e-4dc7-a783-2979ea9e6cff",
    "role": "Administradores"
}

def get_auth_header():
    """Genera el header de autenticación"""
    credenciales = f"{API_CONFIG['email']}:{API_CONFIG['password']}"
    encoded = base64.b64encode(credenciales.encode('ascii')).decode('ascii')
    return f"Basic {encoded}"

def make_api_request(endpoint, params=None):
    """Hace una petición al API de ADM Cloud"""
    try:
        url = f"{API_CONFIG['api_base']}{endpoint}"
        headers = {
            "Authorization": get_auth_header(),
            "Accept": "application/json"
        }
        
        if params is None:
            params = {}
        
        # Agregar parámetros comunes
        params.update({
            "appid": API_CONFIG["appid"],
            "company": API_CONFIG["company"],
            "role": API_CONFIG["role"],
            "OnlyActive": "false"
        })
        
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            # Extraer el array de datos si viene en formato {"success": true, "data": [...]}
            if isinstance(data, dict) and "data" in data:
                return {"success": True, "data": data["data"]}
            elif isinstance(data, list):
                return {"success": True, "data": data}
            else:
                return {"success": True, "data": data}
        else:
            error_msg = response.text[:500] if response.text else "Sin mensaje de error"
            return {
                "success": False,
                "error": f"Error {response.status_code}",
                "message": error_msg,
                "status_code": response.status_code
            }
    except Exception as e:
        return {
            "success": False,
            "error": "Error de conexión",
            "message": str(e)
        }

def obtener_todos_los_productos():
    """Obtiene TODOS los productos usando paginación
    ADM Cloud limita a 50 productos por petición, así que hacemos múltiples peticiones
    """
    todos_productos = []
    skip = 0
    batch_size = 50  # ADM Cloud limita a 50 productos por petición
    
    while True:
        result = make_api_request("items/", {"skip": skip})
        
        if not result["success"]:
            return result
        
        productos = result["data"]
        
        if not productos or len(productos) == 0:
            break
        
        todos_productos.extend(productos)
        
        # Si recibimos menos productos de los solicitados, significa que ya no hay más
        if len(productos) < batch_size:
            break
        
        skip += batch_size
        
        # Límite de seguridad: máximo 100 peticiones (5000 productos)
        if skip >= 5000:
            break
    
    return {"success": True, "data": todos_productos}

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/buscar-producto', methods=['POST'])
def buscar_producto():
    """Busca un producto por SKU"""
    try:
        sku = request.json.get('sku', '').strip().upper()
        
        if not sku:
            return jsonify({
                "success": False,
                "error": "SKU requerido"
            }), 400
        
        # Obtener TODOS los productos usando paginación
        result = obtener_todos_los_productos()
        
        if not result["success"]:
            return jsonify(result), 500
        
        # Buscar el producto por SKU
        productos = result["data"]
        producto_encontrado = None
        
        for producto in productos:
            if producto.get("SKU", "").upper() == sku:
                producto_encontrado = producto
                break
        
        if producto_encontrado:
            return jsonify({
                "success": True,
                "producto": producto_encontrado,
                "total_productos_buscados": len(productos)
            })
        else:
            return jsonify({
                "success": False,
                "error": f"Producto con SKU '{sku}' no encontrado",
                "total_productos_buscados": len(productos)
            }), 404
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al buscar producto",
            "message": str(e)
        }), 500

@app.route('/api/listar-productos', methods=['GET'])
def listar_productos():
    """Lista productos (con paginación)"""
    try:
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', 50))
        
        # Obtener TODOS los productos
        result = obtener_todos_los_productos()
        
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

@app.route('/api/stock', methods=['GET'])
def obtener_stock():
    """Obtiene información de stock"""
    try:
        result = make_api_request("stock/")
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener stock",
            "message": str(e)
        }), 500

@app.route('/api/locations', methods=['GET'])
def obtener_locations():
    """Obtiene ubicaciones"""
    try:
        result = make_api_request("locations/")
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener ubicaciones",
            "message": str(e)
        }), 500

@app.route('/api/verificar-conexion', methods=['POST'])
def verificar_conexion():
    """Verifica la conexión con el API de ADM Cloud"""
    try:
        # Obtener credenciales del request (o usar las del config)
        data = request.json or {}
        email = data.get('email', API_CONFIG['email'])
        password = data.get('password', API_CONFIG['password'])
        appid = data.get('appid', API_CONFIG['appid'])
        company = data.get('company', API_CONFIG['company'])
        role = data.get('role', API_CONFIG['role'])
        
        # Hacer una petición simple de prueba
        import base64
        credenciales = f"{email}:{password}"
        encoded = base64.b64encode(credenciales.encode('ascii')).decode('ascii')
        auth_header = f"Basic {encoded}"
        
        url = f"{API_CONFIG['api_base']}items/"
        headers = {
            "Authorization": auth_header,
            "Accept": "application/json"
        }
        params = {
            "skip": 0,
            "appid": appid,
            "company": company,
            "role": role,
            "OnlyActive": "false"
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            # Obtener TODOS los productos para contar correctamente
            # Usar las credenciales del request para obtener todos los productos
            # Guardar credenciales temporales
            creds_originales = {
                'email': API_CONFIG['email'],
                'password': API_CONFIG['password'],
                'appid': API_CONFIG['appid'],
                'company': API_CONFIG['company'],
                'role': API_CONFIG['role']
            }
            
            # Temporalmente actualizar con las credenciales del request
            API_CONFIG['email'] = email
            API_CONFIG['password'] = password
            API_CONFIG['appid'] = appid
            API_CONFIG['company'] = company
            API_CONFIG['role'] = role
            
            try:
                result = obtener_todos_los_productos()
            finally:
                # Restaurar credenciales originales
                API_CONFIG.update(creds_originales)
            
            if result["success"]:
                total_items = len(result["data"])
                return jsonify({
                    "success": True,
                    "message": f"¡Conexión exitosa! Se encontraron {total_items} productos.",
                    "status_code": response.status_code,
                    "total_items": total_items
                })
            else:
                # Si falla obtener todos, al menos contar los primeros
                data = response.json()
                total_items = 0
                if isinstance(data, dict) and "data" in data:
                    total_items = len(data["data"])
                elif isinstance(data, list):
                    total_items = len(data)
                
                return jsonify({
                    "success": True,
                    "message": f"¡Conexión exitosa! Se encontraron al menos {total_items} productos (puede haber más).",
                    "status_code": response.status_code,
                    "total_items": total_items,
                    "nota": "No se pudieron obtener todos los productos, mostrando solo los primeros"
                })
        else:
            return jsonify({
                "success": False,
                "error": f"Error {response.status_code}",
                "message": response.text[:200] if response.text else "Sin mensaje de error",
                "status_code": response.status_code
            }), response.status_code
            
    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "Timeout",
            "message": "El servidor no respondió a tiempo"
        }), 500
    except requests.exceptions.ConnectionError:
        return jsonify({
            "success": False,
            "error": "Error de conexión",
            "message": "No se pudo conectar al servidor"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    print("="*60)
    print("Consultor ADM Cloud API")
    print("="*60)
    print("\nIniciando servidor...")
    print("Abre tu navegador en: http://localhost:5000")
    print("\nPresiona Ctrl+C para detener el servidor")
    print("="*60)
    app.run(debug=True, host='0.0.0.0', port=5000)

