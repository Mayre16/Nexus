"""
Post-despliegue en cPanel (sin terminal SSH).

Ejecutar desde "Setup Python App" > Execute python script, con la RUTA COMPLETA a este archivo, por ejemplo:
  /home2/adesa/wms.adesa.com.do/scripts/cpanel_post_deploy.py

(ajuste usuario y carpeta segun su hosting)

Hace: crear tablas faltantes (db.create_all), comprobar openpyxl, listar si existe abastecimiento_politica.
No crea usuarios ni borra datos.
"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def main() -> int:
    print("[cpanel_post_deploy] Inicio")
    print(f"[cpanel_post_deploy] Raiz proyecto: {_ROOT}")

    from sqlalchemy import inspect

    from app_wms import app
    from database import db

    with app.app_context():
        print("[cpanel_post_deploy] Creando tablas si faltan (create_all)...")
        db.create_all()
        print("[cpanel_post_deploy] [OK] create_all ejecutado")

        insp = inspect(db.engine)
        names = insp.get_table_names()
        if "abastecimiento_politica" in names:
            print("[cpanel_post_deploy] [OK] Tabla abastecimiento_politica existe")
            cols = {c["name"] for c in insp.get_columns("abastecimiento_politica")}
            if "es_base_abastecimiento" not in cols:
                print("[cpanel_post_deploy] [INFO] Agregando columna es_base_abastecimiento...")
                sql_driver = db.engine.url.drivername.lower()
                if "sqlite" in sql_driver:
                    db.session.execute(
                        db.text(
                            "ALTER TABLE abastecimiento_politica "
                            "ADD COLUMN es_base_abastecimiento BOOLEAN NOT NULL DEFAULT 0"
                        )
                    )
                else:
                    db.session.execute(
                        db.text(
                            "ALTER TABLE abastecimiento_politica "
                            "ADD COLUMN es_base_abastecimiento TINYINT(1) NOT NULL DEFAULT 0"
                        )
                    )
                db.session.execute(
                    db.text("UPDATE abastecimiento_politica SET es_base_abastecimiento = 0")
                )
                db.session.commit()
                print("[cpanel_post_deploy] [OK] Columna es_base_abastecimiento creada")
        else:
            print("[cpanel_post_deploy] [AVISO] Tabla abastecimiento_politica no listada; revise motor/permisos")

        try:
            import openpyxl  # noqa: F401
            print("[cpanel_post_deploy] [OK] openpyxl importable (Excel Abastecimiento/Ajustes)")
        except ImportError:
            print("[cpanel_post_deploy] [ERROR] openpyxl no instalado. Use Run Pip Install con requirements.txt")
            return 1

    print("[cpanel_post_deploy] Fin OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
