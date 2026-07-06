#!/usr/bin/env python3
"""
Migración para automatización de sync: scheduler_lock y last_heartbeat_at.
Ejecutar desde cPanel "Execute Python Script" o: python scripts/migrate_auto_sync.py

Idempotente: no rompe si las tablas/columnas ya existen.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from app_wms import app
    from database import db
    from sqlalchemy import text

    with app.app_context():
        print("Iniciando migración para auto-sync...")
        engine_url = str(db.engine.url)
        is_mysql = "mysql" in engine_url.lower() or "mariadb" in engine_url.lower()

        # 1. Añadir last_heartbeat_at a sync_locations_status
        try:
            if is_mysql:
                db.session.execute(text("""
                    ALTER TABLE sync_locations_status
                    ADD COLUMN last_heartbeat_at DATETIME NULL
                """))
            else:
                db.session.execute(text("""
                    ALTER TABLE sync_locations_status ADD COLUMN last_heartbeat_at DATETIME
                """))
            db.session.commit()
            print("  OK: Columna last_heartbeat_at añadida a sync_locations_status")
        except Exception as e:
            err = str(e).lower()
            if "duplicate column" in err or "already exists" in err or "1060" in str(e):
                print("  SKIP: last_heartbeat_at ya existe")
                db.session.rollback()
            else:
                db.session.rollback()
                raise

        # 2. Crear tabla scheduler_lock
        try:
            if is_mysql:
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS scheduler_lock (
                        id INT PRIMARY KEY DEFAULT 1,
                        locked_until DATETIME NULL,
                        locked_by VARCHAR(64) NULL,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                """))
            else:
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS scheduler_lock (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        locked_until DATETIME,
                        locked_by VARCHAR(64),
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            db.session.commit()
            print("  OK: Tabla scheduler_lock creada")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("  SKIP: scheduler_lock ya existe")
                db.session.rollback()
            else:
                db.session.rollback()
                raise

        # 3. Insertar fila inicial en scheduler_lock
        try:
            if is_mysql:
                db.session.execute(text("""
                    INSERT IGNORE INTO scheduler_lock (id, locked_until, locked_by, updated_at)
                    VALUES (1, NULL, NULL, NOW())
                """))
            else:
                db.session.execute(text("""
                    INSERT OR IGNORE INTO scheduler_lock (id, locked_until, locked_by, updated_at)
                    VALUES (1, NULL, NULL, datetime('now'))
                """))
            db.session.commit()
            print("  OK: Fila inicial en scheduler_lock")
        except Exception as e:
            db.session.rollback()
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                print("  SKIP: Fila inicial ya existe")
            else:
                print("  SKIP o ERROR:", str(e))

        print("Migración completada.")

        # 4. Validar CRON_TOKEN
        token = os.environ.get("CRON_TOKEN")
        if token:
            print(f"CRON_TOKEN configurado: {token[:8]}...")
        else:
            print("ADVERTENCIA: CRON_TOKEN no configurado. Configúralo en cPanel Variables de entorno.")


if __name__ == "__main__":
    main()
