"""
Aplicación Flask WMS (Warehouse Management System)
Sistema de gestión de almacenes integrado con ADM Cloud
"""
import sys
import logging
import io

# Crear handler que maneja errores de encoding y broken pipe
class SafeStreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            if self.stream is None:
                return
            msg = self.format(record)
            self.stream.write(msg + self.terminator)
            try:
                self.flush()
            except (BrokenPipeError, OSError, UnicodeEncodeError):
                pass
        except (BrokenPipeError, OSError, UnicodeEncodeError):
            pass
        except Exception:
            try:
                self.handleError(record)
            except Exception:
                pass

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
    handlers=[
        SafeStreamHandler(sys.stderr),  # Escribe a stderr (aparece en stderr.log)
        SafeStreamHandler(sys.stdout)   # También a stdout (aparece en stdout.log)
    ]
)
logger = logging.getLogger(__name__)

from flask import Flask, render_template, jsonify, session, send_from_directory
from config import get_config
from database import db
import os
from datetime import datetime

# Intentar importar blueprints con manejo de errores
try:
    from routes import auth_bp, facturas_bp, despacho_bp, despachos_bp, recepciones_bp, transferencias_bp, stock_bp, dashboard_bp, consulta_bp, ajustes_bp, productos_bp, sincronizar_bp, ubicaciones_fisicas_bp, historiales_bp, detalles_bp, admin_bp, usuarios_bp, abastecimiento_bp
    from routes.auth import require_auth, require_admin
except ImportError as e:
    logger.error(f"Error al importar blueprints: {e}")
    import traceback
    traceback.print_exc()
    raise

# Crear aplicación Flask
app = Flask(__name__)

@app.before_request
def csrf_origin_check():
    """Validación de Origin/Referer para protección CSRF en requests mutantes"""
    from flask import request as req
    if req.method in ('GET', 'HEAD', 'OPTIONS'):
        return None
    origin = req.headers.get('Origin', '')
    referer = req.headers.get('Referer', '')
    host = req.host
    if req.headers.get('X-CRON-TOKEN'):
        return None
    if origin:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        if parsed.netloc and parsed.netloc != host:
            logger.warning(f"CSRF: Origin mismatch origin={origin} host={host}")
            return jsonify({"success": False, "error": "Origen no autorizado"}), 403
    elif referer:
        from urllib.parse import urlparse
        parsed = urlparse(referer)
        if parsed.netloc and parsed.netloc != host:
            logger.warning(f"CSRF: Referer mismatch referer={referer} host={host}")
            return jsonify({"success": False, "error": "Origen no autorizado"}), 403
    return None

@app.after_request
def after_request(response):
    """Agregar headers CORS y de seguridad después de cada request"""
    from flask import request
    allowed_origin = os.environ.get('CORS_ALLOWED_ORIGIN', '*')
    origin = request.headers.get('Origin', '')
    if allowed_origin == '*' or origin == allowed_origin:
        response.headers['Access-Control-Allow-Origin'] = origin or allowed_origin
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response

# Cargar configuración
config_class = get_config()
app.config.from_object(config_class)

# Aplicar configuración de engine (MySQL o SQLite según DATABASE_URL)
if hasattr(config_class, 'SQLALCHEMY_ENGINE_OPTIONS'):
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = config_class.SQLALCHEMY_ENGINE_OPTIONS

# Inicializar base de datos
db.init_app(app)

# Crear todas las tablas si no existen (incluyendo las nuevas)
with app.app_context():
    try:
        db.create_all()
        logger.info("Tablas de base de datos verificadas/creadas")
    except Exception as e:
        logger.error(f"Error al crear tablas: {e}")

# Manejar errores globalmente
@app.errorhandler(500)
def internal_error(error):
    """Maneja errores 500 y los registra"""
    import traceback
    error_trace = traceback.format_exc()
    logger.error(f"Error 500: {str(error)}")
    logger.error(error_trace)
    payload = {
        "success": False,
        "error": "Error interno del servidor",
        "message": str(error),
    }
    if app.config.get('DEBUG', False):
        payload["traceback"] = error_trace.split('\n')[:15]
    return jsonify(payload), 500

@app.errorhandler(405)
def method_not_allowed(error):
    """Maneja errores 405 Method Not Allowed"""
    logger.warning(f"Error 405: {str(error)}")
    return jsonify({
        "success": False,
        "error": "Método no permitido",
        "message": f"El método HTTP utilizado no está permitido para esta URL"
    }), 405

@app.errorhandler(Exception)
def handle_exception(e):
    """Maneja todas las excepciones no capturadas. Siempre JSON."""
    import traceback
    import uuid
    error_trace = traceback.format_exc()
    error_msg = str(e).encode('ascii', 'replace').decode('ascii')
    request_id = uuid.uuid4().hex[:8]
    logger.error(f"[{request_id}] Excepcion no manejada: {error_msg}")
    logger.error(error_trace)
    print(f"[{request_id}] EXCEPCION: {error_msg}", file=sys.stderr)
    print(f"TRACEBACK:\n{error_trace}", file=sys.stderr)
    sys.stderr.flush()
    err_lower = str(e).lower()
    is_db_error = any(x in err_lower for x in [
        'packet sequence', 'command out of sync', 'lost connection',
        'mysql server has gone away', 'result length not requested'
    ])
    payload = {
        "success": False,
        "error": "db_unavailable" if is_db_error else "Error inesperado",
        "message": str(e) if is_db_error or app.config.get('DEBUG', False) else "Error interno del servidor",
        "_request_id": request_id
    }
    if app.config.get('DEBUG', False):
        payload["traceback"] = error_trace.split('\n')[:15]
    return jsonify(payload), 503 if is_db_error else 500

@app.errorhandler(404)
def not_found(error):
    """Maneja errores 404 Not Found"""
    # No loggear 404 para favicon.ico para evitar spam en logs
    from flask import request
    if request.path == '/favicon.ico':
        return '', 204  # No Content
    return jsonify({
        "success": False,
        "error": "Recurso no encontrado",
        "message": str(error)
    }), 404

# Registrar blueprints (rutas)
# IMPORTANTE: auth_bp debe registrarse PRIMERO para evitar conflictos
try:
    app.register_blueprint(auth_bp)
    app.register_blueprint(facturas_bp)
    app.register_blueprint(despacho_bp)
    app.register_blueprint(despachos_bp)
    app.register_blueprint(recepciones_bp)
    app.register_blueprint(transferencias_bp)
    app.register_blueprint(stock_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(consulta_bp)
    app.register_blueprint(ajustes_bp)
    app.register_blueprint(productos_bp)
    app.register_blueprint(sincronizar_bp)
    app.register_blueprint(ubicaciones_fisicas_bp)
    app.register_blueprint(historiales_bp)
    app.register_blueprint(detalles_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(abastecimiento_bp)
    logger.info("Blueprints registrados correctamente")
except Exception as e:
    logger.error(f"Error al registrar blueprints: {e}")
    import traceback
    traceback.print_exc()
    raise

# Endpoint de prueba (útil para diagnóstico)
@app.route('/test')
def test():
    """Endpoint de prueba para verificar que la aplicación funciona"""
    return jsonify({
        "success": True,
        "message": "Aplicacion Flask funcionando correctamente",
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    })

# Rutas de la interfaz web (mantener compatibilidad con app anterior)
@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/login')
def login_page():
    """Página de login"""
    feature_must_change = app.config.get('FEATURE_MUST_CHANGE_PASSWORD', False)
    return render_template('login.html', feature_must_change_password=feature_must_change)


@app.route('/cambiar-password')
@require_auth
def cambiar_password_page():
    """Página para cambiar contraseña (forzada si must_change_password)"""
    return render_template('cambiar_password.html')

@app.route('/despacho')
@require_auth
def despacho_page():
    """Página de despacho (formulario de registro)"""
    return render_template('despacho.html')

@app.route('/despachos')
@require_auth
def despachos_historial_page():
    """Página de historial de despachos"""
    return render_template('despachos_historial.html')

@app.route('/recepcion')
@require_auth
def recepcion_page():
    """Página de recepción (formulario de registro)"""
    return render_template('recepciones.html')

@app.route('/recepciones')
@require_auth
def recepciones_historial_page():
    """Página de historial de recepciones"""
    return render_template('recepciones_historial.html')

@app.route('/transferencia')
@require_auth
def transferencia_page():
    """Página de transferencia (formulario de registro)"""
    return render_template('transferencias.html')

@app.route('/transferencias')
@require_auth
def transferencias_historial_page():
    """Página de historial de transferencias"""
    return render_template('transferencias_historial.html')

@app.route('/ajustes')
@require_auth
def ajustes_page():
    """Página de historial de ajustes (vista principal)"""
    return render_template('ajustes_historial.html')

@app.route('/ajustes/nuevo')
@require_auth
def ajustes_nuevo_page():
    """Página para crear nuevo ajuste"""
    return render_template('ajustes.html')

@app.route('/ajustes/detalle')
@require_auth
def ajustes_detalle_page():
    """Página de detalle de ajuste (auditoría)"""
    return render_template('ajustes_detalle.html')

@app.route('/productos')
@require_auth
def productos_page():
    """Página de consulta de productos"""
    return render_template('productos.html')

@app.route('/admin')
@require_admin
def admin_page():
    """Página de administración - Sincronización de ubicaciones"""
    return render_template('admin.html')

@app.route('/docs/<filename>')
@require_auth
def descargar_documento(filename):
    """Sirve archivos de documentación (ej: plantillas Excel)"""
    from werkzeug.utils import secure_filename as _sf
    safe_name = _sf(filename)
    if not safe_name or safe_name != filename:
        return jsonify({"success": False, "error": "Nombre de archivo no válido"}), 400
    docs_dir = os.path.join(os.path.dirname(__file__), 'docs')
    return send_from_directory(docs_dir, safe_name, as_attachment=True)

# Mensaje final de inicialización
try:
    logger.info("Aplicacion Flask inicializada correctamente")
    logger.info(f"Modo: {app.config.get('ENV', 'production')}")
    logger.info(f"Debug: {app.config.get('DEBUG', False)}")
except Exception:
    # Ignorar errores de logging en este punto
    pass


if __name__ == '__main__':
    print("="*60)
    print("Sistema WMS - Warehouse Management System")
    print("="*60)
    print("\nIniciando servidor...")
    print("Abre tu navegador en: http://localhost:5000")
    print("\nPresiona Ctrl+C para detener el servidor")
    print("="*60)
    app.run(debug=True, host='0.0.0.0', port=5000)

