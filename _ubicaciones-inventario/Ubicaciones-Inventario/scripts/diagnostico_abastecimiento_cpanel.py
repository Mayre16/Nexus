"""
Diagnóstico Abastecimiento + export Excel (producción / cPanel).

Ejecutar desde "Setup Python App" > Execute python script:
  /home/adesa/wms.adesa.com.do/scripts/diagnostico_abastecimiento_cpanel.py
(ajustar ruta real)

Comprueba: columna es_base_abastecimiento, consultas tipo export, openpyxl, generate workbook.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def main() -> int:
    print("[diag_abast] Inicio")
    print(f"[diag_abast] Raiz: {_ROOT}")

    from sqlalchemy import inspect, text

    from app_wms import app
    from database import db
    from database.models import AbastecimientoPolitica, ProductoADM

    with app.app_context():
        insp = inspect(db.engine)
        if "abastecimiento_politica" not in insp.get_table_names():
            print("[diag_abast] [ERROR] No existe tabla abastecimiento_politica")
            return 1

        cols = {c["name"] for c in insp.get_columns("abastecimiento_politica")}
        print(f"[diag_abast] Columnas abastecimiento_politica (muestra): {sorted(cols)[:12]}...")
        if "es_base_abastecimiento" not in cols:
            print("[diag_abast] [ERROR] Falta columna es_base_abastecimiento — el export fallará.")
            print("[diag_abast] Ejecute cpanel_post_deploy.py actualizado o ALTER TABLE manual.")
            return 1
        print("[diag_abast] [OK] Columna es_base_abastecimiento existe")

        # Prueba ORM (como usa el export al leer políticas)
        try:
            n = AbastecimientoPolitica.query.count()
            _ = AbastecimientoPolitica.query.limit(1).all()
            print(f"[diag_abast] [OK] ORM AbastecimientoPolitica (filas totales: {n})")
        except Exception as e:
            print(f"[diag_abast] [ERROR] ORM AbastecimientoPolitica: {e}")
            return 1

        # Subconsulta incluidos (misma idea que export)
        try:
            row = db.session.execute(
                text(
                    "SELECT location_id FROM abastecimiento_politica "
                    "WHERE es_base_abastecimiento = 1 LIMIT 1"
                )
            ).fetchone()
            if row:
                lid = row[0]
                cnt = (
                    db.session.query(AbastecimientoPolitica.producto_id)
                    .filter(
                        AbastecimientoPolitica.location_id == lid,
                        AbastecimientoPolitica.es_base_abastecimiento.is_(True),
                    )
                    .count()
                )
                print(f"[diag_abast] [OK] Subquery incluidos ejemplo location_id=...{str(lid)[-8:]} count={cnt}")
            else:
                print("[diag_abast] [OK] Subquery incluidos: 0 políticas marcadas como base (normal al inicio)")
        except Exception as e:
            print(f"[diag_abast] [ERROR] Consulta es_base_abastecimiento: {e}")
            return 1

        # Productos activos + filtro IN (como export)
        try:
            na = ProductoADM.query.filter_by(activo=True).count()
            print(f"[diag_abast] [OK] ProductoADM activos: {na}")
        except Exception as e:
            print(f"[diag_abast] [ERROR] ProductoADM: {e}")
            return 1

        # openpyxl + guardar libro en memoria (misma familia de operaciones que export)
        try:
            from openpyxl import Workbook

            wb = Workbook()
            ws = wb.active
            ws.append(["Product ID", "Test"])
            buf = io.BytesIO()
            wb.save(buf)
            print(f"[diag_abast] [OK] openpyxl Workbook.save en memoria ({buf.tell()} bytes)")
        except Exception as e:
            print(f"[diag_abast] [ERROR] openpyxl: {e}")
            return 1

    print("[diag_abast] Fin OK. Si el export sigue fallando, revise logs Passenger en el instante del GET /export.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
