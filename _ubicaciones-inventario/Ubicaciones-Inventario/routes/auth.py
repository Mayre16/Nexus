"""
Rutas de autenticación
"""
import logging
import uuid
import time
import threading
from functools import wraps
from datetime import datetime
from flask import Blueprint, request, jsonify, session, redirect, url_for, current_app
import bcrypt
from database import db
from database.models import Usuario
from utils.db_helpers import safe_db_call

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)

_login_attempts = {}
_login_lock = threading.Lock()
LOGIN_WINDOW = 300
LOGIN_MAX_ATTEMPTS = 10


def _check_rate_limit(ip):
    """Retorna True si el IP está dentro del límite, False si excedió."""
    now = time.time()
    with _login_lock:
        if ip in _login_attempts:
            attempts = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW]
            _login_attempts[ip] = attempts
            if len(attempts) >= LOGIN_MAX_ATTEMPTS:
                return False
        return True


def _record_attempt(ip):
    now = time.time()
    with _login_lock:
        if ip not in _login_attempts:
            _login_attempts[ip] = []
        _login_attempts[ip].append(now)


@auth_bp.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    """Endpoint para login de usuarios"""
    # Manejar preflight OPTIONS
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        if current_app.config.get('FEATURE_RATE_LIMIT_LOGIN', False):
            client_ip = request.remote_addr or 'unknown'
            if not _check_rate_limit(client_ip):
                logger.warning(f"Rate limit exceeded for IP {client_ip}")
                return jsonify({
                    "success": False,
                    "error": "Demasiados intentos de login. Intente de nuevo en unos minutos."
                }), 429

        data = request.json or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({
                "success": False,
                "error": "Email y contraseña son requeridos"
            }), 400
        
        # Buscar usuario
        usuario = Usuario.query.filter_by(email=email, activo=True).first()
        
        if not usuario:
            if current_app.config.get('FEATURE_RATE_LIMIT_LOGIN', False):
                _record_attempt(request.remote_addr or 'unknown')
            return jsonify({
                "success": False,
                "error": "Credenciales inválidas"
            }), 401
        
        # Verificar contraseña
        if not bcrypt.checkpw(password.encode('utf-8'), usuario.password_hash.encode('utf-8')):
            if current_app.config.get('FEATURE_RATE_LIMIT_LOGIN', False):
                _record_attempt(request.remote_addr or 'unknown')
            return jsonify({
                "success": False,
                "error": "Credenciales inválidas"
            }), 401

        # Actualizar last_login_at (columna migración 001)
        if hasattr(usuario, 'last_login_at'):
            usuario.last_login_at = datetime.utcnow()
            db.session.commit()

        # Limpiar sesión previa y crear nueva (previene session fixation)
        session.clear()
        session.permanent = True
        session['user_id'] = usuario.id
        session['user_email'] = usuario.email
        session['user_nombre'] = usuario.nombre
        session['user_rol'] = usuario.rol
        session['must_change_password'] = bool(getattr(usuario, 'must_change_password', False))

        return jsonify({
            "success": True,
            "message": "Login exitoso",
            "usuario": usuario.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error en login: {e}")
        return jsonify({
            "success": False,
            "error": "Error en el login"
        }), 500


@auth_bp.route('/api/auth/logout', methods=['POST', 'OPTIONS'])
def logout():
    """Endpoint para cerrar sesión"""
    # Manejar preflight OPTIONS
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    session.clear()
    return jsonify({
        "success": True,
        "message": "Sesión cerrada"
    })


@auth_bp.route('/api/auth/me', methods=['GET', 'OPTIONS'])
def get_current_user():
    """Obtiene información del usuario actual. Nunca provoca redirect falso por errores DB."""
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return response

    request_id = uuid.uuid4().hex[:8]
    user_id = session.get('user_id')

    if not user_id:
        logger.info(f"[{request_id}] auth/me 401 no session")
        return jsonify({
            "success": False,
            "error": "unauthorized",
            "message": "No autenticado"
        }), 401

    def _query():
        usuario = Usuario.query.get(user_id)
        if not usuario or not usuario.activo:
            session.clear()
            return {"_auth_fail": "not_found"}
        return {"_auth_ok": usuario.to_dict()}

    result, recovered = safe_db_call(_query, "auth_me", request_id)

    if result is None:
        # DB falló (safe_db_call retornó None tras excepción)
        logger.warning(f"[{request_id}] auth/me DB unavailable")
        return jsonify({
            "success": False,
            "error": "db_unavailable",
            "message": "Error temporal al conectar con la base de datos"
        }), 503

    if "_auth_fail" in result:
        logger.info(f"[{request_id}] auth/me 401 usuario no encontrado o inactivo")
        return jsonify({
            "success": False,
            "error": "unauthorized",
            "message": "Usuario no encontrado o inactivo"
        }), 401

    logger.info(f"[{request_id}] auth/me 200 user_id={user_id}")
    payload = {
        "success": True,
        "usuario": result["_auth_ok"],
    }
    if current_app.config.get('DEBUG', False):
        payload["_recovered"] = recovered
        payload["_request_id"] = request_id
    return jsonify(payload)


def require_auth(func):
    """Decorador para requerir autenticación.
    Si FEATURE_MUST_CHANGE_PASSWORD está activo y el usuario tiene
    must_change_password=True, bloquea el acceso a cualquier endpoint
    excepto cambiar-password y auth/me.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({
                "success": False,
                "error": "Autenticación requerida"
            }), 401
        if current_app.config.get('FEATURE_MUST_CHANGE_PASSWORD', False):
            if session.get('must_change_password'):
                allowed = ('/api/auth/cambiar-password', '/api/auth/me',
                           '/api/auth/logout', '/cambiar-password')
                if request.path not in allowed:
                    return jsonify({
                        "success": False,
                        "error": "must_change_password",
                        "message": "Debe cambiar su contraseña antes de continuar"
                    }), 403
        return func(*args, **kwargs)
    return wrapper


def require_admin(func):
    """Decorador para requerir rol de administrador.
    También bloquea si must_change_password está activo."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({
                "success": False,
                "error": "Autenticación requerida"
            }), 401
        if current_app.config.get('FEATURE_MUST_CHANGE_PASSWORD', False):
            if session.get('must_change_password'):
                return jsonify({
                    "success": False,
                    "error": "must_change_password",
                    "message": "Debe cambiar su contraseña antes de continuar"
                }), 403
        user_rol = session.get('user_rol', '')
        if user_rol.lower() != 'administrador':
            return jsonify({
                "success": False,
                "error": "Acceso denegado. Se requiere rol de administrador"
            }), 403
        
        return func(*args, **kwargs)
    return wrapper


def require_admin_or_cron(func):
    """Decorador: permite si X-CRON-TOKEN válido O sesión admin"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = request.headers.get('X-CRON-TOKEN')
        cfg = current_app.config.get('CRON_TOKEN')
        if token and cfg and token == cfg:
            return func(*args, **kwargs)
        if not session.get('user_id'):
            return jsonify({"success": False, "error": "Autenticación requerida"}), 401
        if session.get('user_rol', '').lower() != 'administrador':
            return jsonify({"success": False, "error": "Acceso denegado. Se requiere rol de administrador"}), 403
        return func(*args, **kwargs)
    return wrapper


@auth_bp.route('/api/auth/cambiar-password', methods=['POST'])
@require_auth
def cambiar_password():
    """Endpoint para cambiar la contraseña del usuario actual"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                "success": False,
                "error": "No autenticado"
            }), 401
        
        data = request.json or {}
        password_actual = data.get('password_actual', '')
        password_nueva = data.get('password_nueva', '')
        password_confirmar = data.get('password_confirmar', '')
        
        # Validaciones
        if not password_actual or not password_nueva or not password_confirmar:
            return jsonify({
                "success": False,
                "error": "Todos los campos son requeridos"
            }), 400
        
        if password_nueva != password_confirmar:
            return jsonify({
                "success": False,
                "error": "Las contraseñas nuevas no coinciden"
            }), 400
        
        if len(password_nueva) < 6:
            return jsonify({
                "success": False,
                "error": "La contraseña debe tener al menos 6 caracteres"
            }), 400
        
        # Obtener usuario
        usuario = Usuario.query.get(user_id)
        if not usuario or not usuario.activo:
            return jsonify({
                "success": False,
                "error": "Usuario no encontrado o inactivo"
            }), 401
        
        # Verificar contraseña actual
        if not bcrypt.checkpw(password_actual.encode('utf-8'), usuario.password_hash.encode('utf-8')):
            return jsonify({
                "success": False,
                "error": "Contraseña actual incorrecta"
            }), 401
        
        # Actualizar contraseña
        nuevo_password_hash = bcrypt.hashpw(password_nueva.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        usuario.password_hash = nuevo_password_hash
        if hasattr(usuario, 'must_change_password'):
            usuario.must_change_password = False
        if hasattr(usuario, 'password_updated_at'):
            usuario.password_updated_at = datetime.utcnow()
        db.session.commit()
        session['must_change_password'] = False

        return jsonify({
            "success": True,
            "message": "Contraseña actualizada exitosamente"
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error cambiar password: {e}")
        return jsonify({
            "success": False,
            "error": "Error al cambiar la contraseña"
        }), 500

