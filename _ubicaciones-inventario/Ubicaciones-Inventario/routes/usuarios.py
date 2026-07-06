"""
CRUD de usuarios (solo administradores)
"""
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from flask import current_app
import bcrypt
import json
import secrets
import string
from routes.auth import require_admin
from database import db
from database.models import Usuario, AuditLog

usuarios_bp = Blueprint('usuarios', __name__)

ROLES_PERMITIDOS = ('administrador', 'despachador', 'almacenista')
MIN_PASSWORD_LEN = 8


def _audit(event_type, target_user_id, extra_data=None):
    """Registra en audit_log solo si FEATURE_AUDIT_LOG está activo"""
    if not current_app.config.get('FEATURE_AUDIT_LOG', False):
        return
    try:
        entry = AuditLog(
            event_type=event_type,
            user_id=session.get('user_id'),
            target_user_id=target_user_id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent'),
            extra_data=json.dumps(extra_data) if extra_data else None
        )
        db.session.add(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()


def _count_admins_activos(excluir_id=None):
    """Cuenta admins activos. Si excluir_id, no cuenta ese usuario."""
    q = Usuario.query.filter_by(rol='administrador', activo=True)
    if excluir_id:
        q = q.filter(Usuario.id != excluir_id)
    return q.count()


def _es_ultimo_admin(user):
    """True si este usuario es el único admin activo"""
    return (user.rol and user.rol.lower() == 'administrador' and
            user.activo and _count_admins_activos(excluir_id=user.id) == 0)


@usuarios_bp.route('/api/usuarios', methods=['GET'])
@require_admin
def listar_usuarios():
    """Lista usuarios con filtros y paginación"""
    try:
        page = request.args.get('page', 1, type=int)
        page_size = min(request.args.get('page_size', 20, type=int), 100)
        q_filter = request.args.get('q', '').strip()
        rol = request.args.get('rol', '').strip().lower()
        _activo = request.args.get('activo', '').lower()
        activo = None if _activo not in ('true', 'false') else (_activo == 'true')
        sort = request.args.get('sort', 'nombre')
        dir_order = request.args.get('dir', 'asc')

        query = Usuario.query

        if q_filter:
            q = f'%{q_filter}%'
            query = query.filter(
                db.or_(Usuario.email.ilike(q), Usuario.nombre.ilike(q))
            )
        if rol and rol in ROLES_PERMITIDOS:
            query = query.filter_by(rol=rol)
        if activo is not None:
            query = query.filter_by(activo=activo)

        order_col = getattr(Usuario, sort, Usuario.nombre)
        query = query.order_by(order_col.asc() if dir_order == 'asc' else order_col.desc())

        pag = query.paginate(page=page, per_page=page_size, error_out=False)

        return jsonify({
            "success": True,
            "data": [u.to_dict() for u in pag.items],
            "pagination": {
                "page": pag.page,
                "page_size": page_size,
                "total": pag.total,
                "pages": pag.pages
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al listar usuarios",
            "message": str(e)
        }), 500


@usuarios_bp.route('/api/usuarios/<int:user_id>', methods=['GET'])
@require_admin
def obtener_usuario(user_id):
    """Obtiene un usuario por ID"""
    user = Usuario.query.get(user_id)
    if not user:
        return jsonify({"success": False, "error": "Usuario no encontrado"}), 404
    return jsonify({"success": True, "usuario": user.to_dict()})


@usuarios_bp.route('/api/usuarios', methods=['POST'])
@require_admin
def crear_usuario():
    """Crea un nuevo usuario"""
    try:
        data = request.json or {}
        email = (data.get('email', '') or '').strip().lower()
        nombre = (data.get('nombre', '') or '').strip()
        rol = (data.get('rol', 'despachador') or 'despachador').strip().lower()
        password = data.get('password', '')
        activo = data.get('activo', True)
        must_change = data.get('must_change_password', True)

        if not email:
            return jsonify({"success": False, "error": "El email es requerido"}), 400
        if not nombre:
            return jsonify({"success": False, "error": "El nombre es requerido"}), 400
        if rol not in ROLES_PERMITIDOS:
            return jsonify({"success": False, "error": "Rol no permitido"}), 400
        if not password or len(password) < MIN_PASSWORD_LEN:
            return jsonify({"success": False, "error": f"La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres"}), 400

        if Usuario.query.filter_by(email=email).first():
            return jsonify({"success": False, "error": "Ya existe un usuario con ese email"}), 400

        pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = Usuario(
            email=email,
            nombre=nombre,
            password_hash=pw_hash,
            rol=rol,
            activo=bool(activo)
        )
        if hasattr(user, 'must_change_password'):
            user.must_change_password = bool(must_change)
        if hasattr(user, 'password_updated_at'):
            user.password_updated_at = datetime.utcnow()
        if hasattr(user, 'updated_at'):
            user.updated_at = datetime.utcnow()

        db.session.add(user)
        db.session.commit()

        _audit('USER_CREATE', user.id, {"email": email, "rol": rol})

        return jsonify({
            "success": True,
            "message": "Usuario creado exitosamente",
            "usuario": user.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@usuarios_bp.route('/api/usuarios/<int:user_id>', methods=['PUT'])
@require_admin
def actualizar_usuario(user_id):
    """Actualiza nombre, rol, activo, must_change_password"""
    try:
        user = Usuario.query.get(user_id)
        if not user:
            return jsonify({"success": False, "error": "Usuario no encontrado"}), 404

        data = request.json or {}
        nombre = (data.get('nombre', '') or '').strip()
        rol = (data.get('rol', '') or '').strip().lower()
        activo = data.get('activo')
        must_change = data.get('must_change_password')

        before = {"nombre": user.nombre, "rol": user.rol, "activo": user.activo}
        if hasattr(user, 'must_change_password'):
            before["must_change_password"] = user.must_change_password

        if nombre:
            user.nombre = nombre

        if rol and rol in ROLES_PERMITIDOS:
            if _es_ultimo_admin(user) and rol != 'administrador':
                return jsonify({
                    "success": False,
                    "error": "No se puede cambiar el rol del último administrador activo. Debe existir al menos un admin."
                }), 400
            user.rol = rol

        if activo is not None:
            if _es_ultimo_admin(user) and not activo:
                return jsonify({
                    "success": False,
                    "error": "No se puede desactivar el último administrador activo. Debe existir al menos un admin."
                }), 400
            user.activo = bool(activo)

        if must_change is not None and hasattr(user, 'must_change_password'):
            user.must_change_password = bool(must_change)

        if hasattr(user, 'updated_at'):
            user.updated_at = datetime.utcnow()

        db.session.commit()

        after = {"nombre": user.nombre, "rol": user.rol, "activo": user.activo}
        if hasattr(user, 'must_change_password'):
            after["must_change_password"] = user.must_change_password
        _audit('USER_UPDATE', user_id, {"before": before, "after": after})

        return jsonify({
            "success": True,
            "message": "Usuario actualizado",
            "usuario": user.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


def _generar_password():
    """Genera contraseña temporal aleatoria"""
    abc = string.ascii_letters + string.digits
    return ''.join(secrets.choice(abc) for _ in range(12))


@usuarios_bp.route('/api/usuarios/<int:user_id>/reset-password', methods=['POST'])
@require_admin
def reset_password(user_id):
    """Resetea contraseña. Body: password (opcional, si no viene se genera una)"""
    try:
        user = Usuario.query.get(user_id)
        if not user:
            return jsonify({"success": False, "error": "Usuario no encontrado"}), 404

        data = request.json or {}
        password = data.get('password', '').strip()

        if not password:
            password = _generar_password()
        elif len(password) < MIN_PASSWORD_LEN:
            return jsonify({"success": False, "error": f"La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres"}), 400

        must_change = data.get('must_change_password', True)

        user.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        if hasattr(user, 'must_change_password'):
            user.must_change_password = bool(must_change)
        if hasattr(user, 'password_updated_at'):
            user.password_updated_at = datetime.utcnow()
        if hasattr(user, 'updated_at'):
            user.updated_at = datetime.utcnow()

        db.session.commit()

        _audit('PASSWORD_RESET', user_id, {"by_admin": session.get('user_id')})

        return jsonify({
            "success": True,
            "message": "Contraseña actualizada",
            "password_temporal": password,
            "usuario": user.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@usuarios_bp.route('/api/usuarios/<int:user_id>/activar', methods=['POST'])
@require_admin
def activar_usuario(user_id):
    """Activa un usuario"""
    user = Usuario.query.get(user_id)
    if not user:
        return jsonify({"success": False, "error": "Usuario no encontrado"}), 404
    if user.activo:
        return jsonify({"success": True, "message": "Usuario ya estaba activo"})
    user.activo = True
    if hasattr(user, 'updated_at'):
        user.updated_at = datetime.utcnow()
    db.session.commit()
    _audit('USER_ENABLE', user_id, {})
    return jsonify({"success": True, "message": "Usuario activado", "usuario": user.to_dict()})


@usuarios_bp.route('/api/usuarios/<int:user_id>/desactivar', methods=['POST'])
@require_admin
def desactivar_usuario(user_id):
    """Desactiva un usuario"""
    user = Usuario.query.get(user_id)
    if not user:
        return jsonify({"success": False, "error": "Usuario no encontrado"}), 404
    if _es_ultimo_admin(user):
        return jsonify({
            "success": False,
            "error": "No se puede desactivar el último administrador activo. Debe existir al menos un admin."
        }), 400
    if not user.activo:
        return jsonify({"success": True, "message": "Usuario ya estaba inactivo"})
    user.activo = False
    if hasattr(user, 'updated_at'):
        user.updated_at = datetime.utcnow()
    db.session.commit()
    _audit('USER_DISABLE', user_id, {})
    return jsonify({"success": True, "message": "Usuario desactivado", "usuario": user.to_dict()})
