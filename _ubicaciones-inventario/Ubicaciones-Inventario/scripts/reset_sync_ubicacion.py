"""
Quita estado 'running' de una ubicación en sync_locations_status (dev/ops).
Por defecto: ADESA. Cierra el SyncRun asociado si sigue en 'running'.

  python scripts/reset_sync_ubicacion.py
  python scripts/reset_sync_ubicacion.py --name "MIRADOR SUR"
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app_wms import app
from database import db
from database.models import SyncLocationStatus, SyncRun


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="ADESA", help="Nombre de ubicación (substring, ilike)")
    args = p.parse_args()
    needle = args.name.strip()
    now = datetime.utcnow()

    with app.app_context():
        rows = (
            SyncLocationStatus.query.filter(
                SyncLocationStatus.location_name.ilike(f"%{needle}%"),
                SyncLocationStatus.status == "running",
            ).all()
        )
        if not rows:
            print(f"[OK] No hay filas en 'running' para ubicacion que coincida con {needle!r}.")
            return

        for e in rows:
            rid = e.running_run_id
            if rid:
                run = db.session.get(SyncRun, rid)
                if run and run.status == "running":
                    run.status = "failed"
                    run.finished_at = now
                    run.notas = (run.notas or "") + " | reset_sync_ubicacion.py"
            e.status = "pending"
            e.running_run_id = None
            e.last_heartbeat_at = None
            e.last_error = None
            print(f"[OK] {e.location_name!r} ({e.location_id}): running -> pending")

        db.session.commit()
        print("[OK] Commit hecho.")


if __name__ == "__main__":
    main()
