"""
Script para crear o actualizar usuarios (pruebas y onboarding)

Uso: Editar la sección CONFIG abajo, subir el archivo y ejecutar en cPanel:
     Execute python script → scripts/crear_usuario.py

Sin CRUD en UI, este script permite:
- Crear usuarios no-admin para validar login
- Crear usuarios con must_change_password para probar ese flujo
- Hacer onboarding de usuarios reales
"""
import sys
import os

# Asegurar que el script encuentra la app (para cPanel Execute python script)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

# ==================== CONFIGURAR ANTES DE EJECUTAR ====================
# Edita estos valores, guarda el archivo y ejecútalo en cPanel.

NUEVO_USUARIO = {
    'email': 'despachador@test.local',
    'nombre': 'Despachador Prueba',
    'rol': 'despachador',  # administrador | despachador | almacenista
    'password': 'temp123456',
    'must_change_password': False,   # True = forzar cambio en primer login (si flag ON)
    'activo': True,
}

# =========================================================================


from app_wms import app
from database import db
from database.models import Usuario
import bcrypt


def run():
    cfg = NUEVO_USUARIO
    email = (cfg.get('email') or '').strip().lower()
    nombre = (cfg.get('nombre') or '').strip()
    rol = (cfg.get('rol') or 'despachador').strip().lower()
    password = cfg.get('password', '')
    must_change = cfg.get('must_change_password', False)
    activo = cfg.get('activo', True)

    if not email:
        print("[ERROR] email no puede estar vacío. Edita NUEVO_USUARIO en el script.")
        return False
    if not nombre:
        print("[ERROR] nombre no puede estar vacío. Edita NUEVO_USUARIO en el script.")
        return False
    if not password:
        print("[ERROR] password no puede estar vacío. Edita NUEVO_USUARIO en el script.")
        return False
    if rol not in ('administrador', 'despachador', 'almacenista'):
        print("[ERROR] rol debe ser: administrador, despachador o almacenista")
        return False
    if len(password) < 6:
        print("[ADVERTENCIA] La contraseña tiene menos de 6 caracteres.")

    with app.app_context():
        user = Usuario.query.filter_by(email=email).first()

        if user:
            print(f"[EXISTENTE] Usuario encontrado: {user.nombre} ({user.email})")
            user.nombre = nombre
            user.rol = rol
            user.activo = activo
            user.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            if hasattr(user, 'must_change_password'):
                user.must_change_password = must_change
            action = "actualizado"
        else:
            print(f"[NUEVO] Creando usuario: {nombre} ({email})")
            user = Usuario(
                email=email,
                nombre=nombre,
                password_hash=bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                rol=rol,
                activo=activo
            )
            if hasattr(user, 'must_change_password'):
                user.must_change_password = must_change
            db.session.add(user)
            action = "creado"

        try:
            db.session.commit()
            print("")
            print("=" * 50)
            print("[OK] Usuario " + action + " correctamente")
            print("=" * 50)
            print(f"  Email:   {user.email}")
            print(f"  Nombre:  {user.nombre}")
            print(f"  Rol:     {user.rol}")
            print(f"  Activo:  {user.activo}")
            print(f"  Password temporal: {password}")
            if hasattr(user, 'must_change_password') and user.must_change_password:
                print(f"  must_change_password: True (cambiar en primer login si flag ON)")
            print("")
            return True
        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] No se pudo guardar: {e}")
            return False


if __name__ == '__main__':
    ok = run()
    sys.exit(0 if ok else 1)
