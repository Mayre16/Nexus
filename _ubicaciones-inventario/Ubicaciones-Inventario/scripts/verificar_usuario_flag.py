"""
Verifica el estado del flag must_change_password para diagnóstico.

Ejecutar en cPanel: Execute python script → scripts/verificar_usuario_flag.py

Busca: despachador@test.local
Imprime valores reales de BD para diagnosticar el flujo must_change_password.
"""
import sys
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

EMAIL = "despachador@test.local"

from app_wms import app
from database.models import Usuario


def run():
    with app.app_context():
        user = Usuario.query.filter_by(email=EMAIL).first()

        print("=" * 50)
        print("VERIFICACION USUARIO Y FLAG must_change_password")
        print("=" * 50)
        print(f"Email buscado: {EMAIL}")
        print("")

        if not user:
            print("[ERROR] Usuario no encontrado en BD")
            return False

        print("[OK] Usuario encontrado")
        print("")

        # Valores de BD
        print("--- Valores en BD ---")
        print(f"  email:              {user.email}")
        print(f"  nombre:             {user.nombre}")
        print(f"  rol:                {user.rol}")
        print(f"  activo:             {user.activo}")

        if hasattr(user, 'must_change_password'):
            val = user.must_change_password
            print(f"  must_change_password: {val} (tipo: {type(val).__name__})")
        else:
            print("  must_change_password: [COLUMNA NO EXISTE EN MODELO]")

        if hasattr(user, 'last_login_at'):
            print(f"  last_login_at:       {user.last_login_at}")
        else:
            print("  last_login_at:       [N/A]")

        if hasattr(user, 'password_updated_at'):
            print(f"  password_updated_at: {user.password_updated_at}")
        else:
            print("  password_updated_at: [N/A]")

        if hasattr(user, 'updated_at'):
            print(f"  updated_at:          {user.updated_at}")
        else:
            print("  updated_at:          [N/A]")

        print("")
        print("--- Simulacion to_dict() (lo que devuelve /api/auth/login) ---")
        d = user.to_dict()
        print(f"  must_change_password en to_dict: {d.get('must_change_password', '[NO INCLUIDO]')}")
        print(f"  last_login_at en to_dict: {d.get('last_login_at', '[NO INCLUIDO]')}")
        print("")
        print("--- Config app (feature flag) ---")
        flag = app.config.get('FEATURE_MUST_CHANGE_PASSWORD', 'NO_DEFINIDO')
        print(f"  FEATURE_MUST_CHANGE_PASSWORD: {flag}")
        print("")
        print("=" * 50)

        # Criterio para que el frontend redirija
        must_val = getattr(user, 'must_change_password', None)
        must_bool = bool(must_val) if must_val is not None else False
        feat_on = app.config.get('FEATURE_MUST_CHANGE_PASSWORD', False)

        if feat_on and must_bool:
            print("[ESPERADO] Frontend DEBERIA redirigir a /cambiar-password")
        elif not feat_on:
            print("[INFO] Flag FEATURE_MUST_CHANGE_PASSWORD esta OFF - no redirige")
        elif not must_bool:
            print("[INFO] Usuario tiene must_change_password=False - no redirige")
        print("=" * 50)

        return True


if __name__ == '__main__':
    run()
