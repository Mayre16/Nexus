"""
Migración SQLite: reemplaza UNIQUE(producto_id, location_id) por
UNIQUE(producto_id, location_id, sync_run_id) en stock_productos_adm.

Sin esto, la sincronización por run (staging) falla con IntegrityError al insertar
el mismo par producto+ubicación con otro sync_run_id.

Ejecutar una vez en cada BD local antigua (después de migrar_tablas.py si aplica):
  python scripts/migrar_unique_stock_sqlite.py
  python scripts/crear_indices.py

Opcional — desbloquear ubicaciones atascadas en "running" sin heartbeat ni run:
  python scripts/migrar_unique_stock_sqlite.py --reset-stuck-sync
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import os
import shutil
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine.url import make_url

from app_wms import app
from database import db


def _table_sql() -> Optional[str]:
    row = db.session.execute(
        text(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_productos_adm'"
        )
    ).fetchone()
    return row[0] if row else None


def needs_unique_migration(sql: str | None) -> bool:
    if not sql:
        return False
    if "uq_producto_location_run_adm" in sql:
        return False
    return "uq_producto_location_adm" in sql


def run_migration():
    sql = _table_sql()
    if not needs_unique_migration(sql):
        print("[OK] stock_productos_adm ya tiene el UNIQUE por run (uq_producto_location_run_adm). Nada que hacer.")
        return

    uri = str(db.engine.url)
    u = make_url(uri)
    if u.get_backend_name() == "sqlite" and u.database:
        path = u.database
        if not os.path.isabs(path):
            path = os.path.abspath(path)
        backup = f"{path}.bak_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(path, backup)
        print(f"Backup: {backup}")

    # SQLite: recrear tabla (no se puede DROP CONSTRAINT del UNIQUE antiguo de forma portable)
    stmts = [
        """
        PRAGMA foreign_keys=OFF;
        """,
        """
        CREATE TABLE stock_productos_adm__new (
            id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            location_id VARCHAR(100) NOT NULL,
            location_name VARCHAR(200) NOT NULL,
            stock NUMERIC(10, 2) NOT NULL,
            updated_at DATETIME NOT NULL,
            sync_run_id INTEGER,
            PRIMARY KEY (id),
            CONSTRAINT uq_producto_location_run_adm UNIQUE (producto_id, location_id, sync_run_id),
            FOREIGN KEY(producto_id) REFERENCES productos_adm (id),
            FOREIGN KEY(sync_run_id) REFERENCES sync_runs (run_id)
        );
        """,
        """
        INSERT INTO stock_productos_adm__new (
            id, producto_id, location_id, location_name, stock, updated_at, sync_run_id
        )
        SELECT s.id, s.producto_id, s.location_id, s.location_name, s.stock, s.updated_at, s.sync_run_id
        FROM stock_productos_adm s
        WHERE s.id IN (
            SELECT MAX(id) FROM stock_productos_adm
            GROUP BY producto_id, location_id, COALESCE(sync_run_id, -9223372036854775808)
        );
        """,
        """DROP TABLE stock_productos_adm;""",
        """ALTER TABLE stock_productos_adm__new RENAME TO stock_productos_adm;""",
        """
        CREATE INDEX IF NOT EXISTS ix_stock_productos_adm_producto_id
        ON stock_productos_adm (producto_id);
        """,
        """PRAGMA foreign_keys=ON;""",
    ]
    for stmt in stmts:
        db.session.execute(text(stmt.strip()))
    db.session.commit()
    print("[OK] Tabla stock_productos_adm migrada: UNIQUE (producto_id, location_id, sync_run_id)")
    print("     Ejecuta: python scripts/crear_indices.py")


def reset_stuck_sync():
    """Ubicaciones en running sin señal de vida (típico tras rollback por IntegrityError)."""
    from database.models import SyncLocationStatus, SyncRun

    now = datetime.utcnow()
    stuck = (
        SyncLocationStatus.query.filter_by(status="running")
        .filter(
            SyncLocationStatus.last_heartbeat_at.is_(None),
            SyncLocationStatus.running_run_id.is_(None),
        )
        .all()
    )
    if not stuck:
        print("[OK] No hay ubicaciones 'running' bloqueadas (sin heartbeat ni running_run_id).")
        return
    for e in stuck:
        e.status = "error"
        e.last_error = (
            "Desbloqueado tras migración: quedó en sincronizando sin run activo. Vuelve a lanzar sync."
        )
        e.running_run_id = None
    orphan_runs = SyncRun.query.filter_by(status="running").all()
    for r in orphan_runs:
        r.status = "failed"
        r.finished_at = now
        r.notas = (r.notas or "") + " | Cerrado por migrar_unique_stock_sqlite --reset-stuck-sync"
    db.session.commit()
    print(f"[OK] Desbloqueadas {len(stuck)} ubicacion(es); runs huerfanos en running -> failed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrar UNIQUE stock_productos_adm (SQLite)")
    parser.add_argument(
        "--reset-stuck-sync",
        action="store_true",
        help="Marcar error en ubicaciones running sin heartbeat/run (dev)",
    )
    args = parser.parse_args()

    with app.app_context():
        try:
            run_migration()
            if args.reset_stuck_sync:
                reset_stuck_sync()
        except Exception as e:
            db.session.rollback()
            print(f"Error: {e}")
            import traceback

            traceback.print_exc()
