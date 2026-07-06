"""
Migración 001: Añadir campos de auditoría y control a tabla usuarios

Campos: updated_at, last_login_at, must_change_password, password_updated_at

Ejecutar desde cPanel: Execute python script → scripts/migrations/001_add_usuario_fields.py

Requisitos:
- Idempotente (ejecutar 2 veces no falla)
- Usa Usuario.__tablename__ (no hardcode)
- MySQL: verificación vía information_schema antes de ALTER
- SQLite: verificación vía pragma_table_info antes de ALTER
"""
import sys
import os

# Asegurar que el script encuentra la app (para cPanel Execute python script)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..', '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import Usuario
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

# Nombre de tabla desde el modelo (no hardcode)
TABLE_NAME = Usuario.__tablename__

# Campos a añadir: (nombre, sql_sqlite, sql_mysql)
# sql_* = fragmento para ALTER TABLE ADD COLUMN
COLUMNS_TO_ADD = [
    ('updated_at', 'ALTER TABLE "{table}" ADD COLUMN updated_at DATETIME', 'ALTER TABLE `{table}` ADD COLUMN updated_at DATETIME NULL'),
    ('last_login_at', 'ALTER TABLE "{table}" ADD COLUMN last_login_at DATETIME', 'ALTER TABLE `{table}` ADD COLUMN last_login_at DATETIME NULL'),
    ('must_change_password', 'ALTER TABLE "{table}" ADD COLUMN must_change_password INTEGER DEFAULT 0', 'ALTER TABLE `{table}` ADD COLUMN must_change_password TINYINT(1) DEFAULT 0 NULL'),
    ('password_updated_at', 'ALTER TABLE "{table}" ADD COLUMN password_updated_at DATETIME', 'ALTER TABLE `{table}` ADD COLUMN password_updated_at DATETIME NULL'),
]


def get_db_engine():
    """Detecta el motor de base de datos"""
    url = str(db.engine.url)
    if 'sqlite' in url:
        return 'sqlite'
    if 'mysql' in url or 'mariadb' in url:
        return 'mysql'
    return 'unknown'


def table_exists(engine_type):
    """Verifica que la tabla existe"""
    try:
        if engine_type == 'sqlite':
            r = db.session.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=:t"
            ), {'t': TABLE_NAME})
        else:
            r = db.session.execute(text(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
            ), {'t': TABLE_NAME})
        return r.fetchone() is not None
    except Exception as e:
        print(f"[ERROR] No se pudo verificar existencia de tabla: {e}")
        return False


def column_exists(engine_type, col_name):
    """Verifica si la columna ya existe en la tabla"""
    try:
        if engine_type == 'sqlite':
            r = db.session.execute(text(
                "SELECT name FROM pragma_table_info(:t) WHERE name=:c"
            ), {'t': TABLE_NAME, 'c': col_name})
        else:
            r = db.session.execute(text(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
            ), {'t': TABLE_NAME, 'c': col_name})
        return r.fetchone() is not None
    except Exception as e:
        print(f"[ERROR] No se pudo verificar columna {col_name}: {e}")
        return True  # Asumir existe para no intentar ALTER y fallar


def run_migration():
    """Ejecuta la migración"""
    changes = []
    skipped = []

    with app.app_context():
        engine_type = get_db_engine()
        print(f"[MIGRACION 001] Añadir campos a tabla {TABLE_NAME}")
        print(f"[DETECTADO] Motor: {engine_type}")

        if engine_type == 'unknown':
            print("[ERROR] Motor de BD no reconocido. Solo SQLite y MySQL/MariaDB soportados.")
            return False

        # 1. Verificar que la tabla existe
        if not table_exists(engine_type):
            print(f"[ERROR] La tabla '{TABLE_NAME}' no existe. Ejecute init_db primero.")
            return False
        print(f"[VERIFICACION] Tabla '{TABLE_NAME}' existe")

        try:
            for col_name, sql_sqlite, sql_mysql in COLUMNS_TO_ADD:
                if column_exists(engine_type, col_name):
                    print(f"[SKIP] Columna '{col_name}' ya existe")
                    skipped.append(col_name)
                    continue

                if engine_type == 'sqlite':
                    stmt = sql_sqlite.format(table=TABLE_NAME)
                else:
                    stmt = sql_mysql.format(table=TABLE_NAME)

                db.session.execute(text(stmt))
                print(f"[EJECUTADO] Añadida columna '{col_name}'")
                changes.append(col_name)

            if changes:
                db.session.commit()
                print(f"\n[OK] Migracion 001 completada. Cambios aplicados: {', '.join(changes)}")
            else:
                # No hubo cambios pero tampoco error; rollback no necesario si no hubo writes
                print(f"\n[OK] Migracion 001 ya estaba aplicada. Nada que hacer.")

        except (OperationalError, ProgrammingError) as e:
            db.session.rollback()
            print(f"\n[ERROR] No se pudo ejecutar ALTER TABLE.")
            print(f"        Posible falta de permisos ALTER en la BD.")
            print(f"        Contacte al administrador del hosting.")
            print(f"        Detalle: {e}")
            return False
        except Exception as e:
            db.session.rollback()
            print(f"\n[ERROR] Error inesperado: {e}")
            return False

    return True


if __name__ == '__main__':
    ok = run_migration()
    sys.exit(0 if ok else 1)
