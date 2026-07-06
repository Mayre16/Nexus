"""
Migración 002: Crear tabla audit_log para trazabilidad

Usa modelo SQLAlchemy + db.create_all(tables=[...]) para compatibilidad
SQLite y MySQL/MariaDB en cPanel.

Campo extra_data: db.Text (TEXT/LONGTEXT) para JSON serializado,
sin depender de tipo JSON nativo.

Ejecutar desde cPanel: Execute python script → scripts/migrations/002_create_audit_log.py
"""
import sys
import os

# Asegurar que el script encuentra la app (para cPanel Execute python script)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..', '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from datetime import datetime
from app_wms import app
from database import db
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError


# Modelo definido aquí para la migración; compatible SQLite y MySQL
# Usa db.Text para extra_data (no JSON nativo) - funciona en ambos motores
class AuditLog(db.Model):
    """Tabla de auditoría - registro de eventos del sistema"""
    __tablename__ = 'audit_log'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_type = db.Column(db.String(50), nullable=False, index=True)
    user_id = db.Column(db.Integer, nullable=True)
    target_user_id = db.Column(db.Integer, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    extra_data = db.Column(db.Text, nullable=True)  # JSON como texto (SQLite/MySQL compatible)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


def get_db_engine():
    """Detecta el motor de base de datos"""
    url = str(db.engine.url)
    if 'sqlite' in url:
        return 'sqlite'
    if 'mysql' in url or 'mariadb' in url:
        return 'mysql'
    return 'unknown'


def audit_log_exists(engine_type):
    """Verifica si la tabla audit_log ya existe"""
    try:
        if engine_type == 'sqlite':
            r = db.session.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
            ))
        else:
            r = db.session.execute(text(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'"
            ))
        return r.fetchone() is not None
    except Exception as e:
        print(f"[ERROR] No se pudo verificar tabla audit_log: {e}")
        return False


def run_migration():
    """Ejecuta la migración"""
    with app.app_context():
        engine_type = get_db_engine()
        print(f"[MIGRACION 002] Crear tabla audit_log")
        print(f"[DETECTADO] Motor: {engine_type}")

        if engine_type == 'unknown':
            print("[ERROR] Motor de BD no reconocido.")
            return False

        if audit_log_exists(engine_type):
            print("[SKIP] Tabla audit_log ya existe")
            print("\n[OK] Migracion 002 ya estaba aplicada. Nada que hacer.")
            return True

        try:
            # Flask-SQLAlchemy.db.create_all() no acepta 'tables'; usar metadata directamente
            # create_all con tables=[...] crea SOLO la tabla audit_log
            db.Model.metadata.create_all(bind=db.engine, tables=[AuditLog.__table__])
            db.session.commit()
            print("[EJECUTADO] Tabla audit_log creada")
            print("\n[OK] Migracion 002 completada correctamente")

        except (OperationalError, ProgrammingError) as e:
            db.session.rollback()
            print(f"\n[ERROR] No se pudo crear la tabla audit_log.")
            print(f"        Posible falta de permisos CREATE en la BD.")
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
