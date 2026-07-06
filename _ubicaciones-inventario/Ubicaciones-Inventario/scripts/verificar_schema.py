"""
Verificación del esquema de BD: tabla usuarios, columnas existentes y motor.

Ejecutar desde cPanel: Execute python script → scripts/verificar_schema.py
"""
import sys
import os

# Asegurar que el script encuentra la app
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import Usuario
from sqlalchemy import text


def get_db_engine():
    url = str(db.engine.url)
    if 'sqlite' in url:
        return 'sqlite'
    if 'mysql' in url or 'mariadb' in url:
        return 'mysql'
    return 'unknown'


def get_table_columns(table_name):
    """Obtiene lista de columnas de una tabla (usa reflection para compatibilidad)"""
    try:
        from sqlalchemy import inspect
        insp = inspect(db.engine)
        cols = insp.get_columns(table_name)
        return [(c['name'], str(c['type'])) for c in cols]
    except Exception as e:
        return [('ERROR', str(e))]


def table_exists(engine_type, table_name):
    try:
        if engine_type == 'sqlite':
            r = db.session.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=:t"
            ), {'t': table_name})
        else:
            r = db.session.execute(text(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
            ), {'t': table_name})
        return r.fetchone() is not None
    except Exception:
        return False


def run():
    with app.app_context():
        engine = get_db_engine()
        table_name = Usuario.__tablename__

        print("=" * 50)
        print("VERIFICACION DE SCHEMA - WMS")
        print("=" * 50)

        # Conexión (consumir resultado para evitar Command Out of Sync)
        try:
            db.session.execute(text("SELECT 1")).scalar()
            print("[1] Conexion BD: OK")
        except Exception as e:
            print(f"[1] Conexion BD: FALLO - {e}")
            return

        # Motor
        print(f"[2] Motor detectado: {engine}")

        # Tabla usuarios (nombre desde modelo)
        print(f"[3] Tabla usuarios (desde Usuario.__tablename__): {table_name}")

        if not table_exists(engine, table_name):
            print(f"[4] Tabla '{table_name}': NO EXISTE")
            print("    Ejecute init_db o migracion 001.")
            return

        print(f"[4] Tabla '{table_name}': EXISTE")

        # Columnas
        cols = get_table_columns(table_name)
        print(f"[5] Columnas en '{table_name}':")
        for cname, ctype in cols:
            if cname == 'ERROR':
                print(f"    Error al obtener: {ctype}")
            else:
                print(f"    - {cname} ({ctype})")

        # audit_log
        if table_exists(engine, 'audit_log'):
            print("[6] Tabla audit_log: EXISTE")
            cols_audit = get_table_columns('audit_log')
            print("    Columnas:")
            for cname, ctype in cols_audit:
                if cname != 'ERROR':
                    print(f"    - {cname} ({ctype})")
        else:
            print("[6] Tabla audit_log: NO EXISTE")

        print("=" * 50)
        print("Verificacion completada")
        print("=" * 50)


if __name__ == '__main__':
    run()
