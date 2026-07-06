#!/usr/bin/env python3
"""
Diagnóstico de entorno (producción o local): BD + llamada mínima a ADM.
Ejecutar desde la raíz del proyecto o vía cPanel "Execute python script":
  scripts/diagnostico_entorno.py

No imprime contraseñas ni cuerpos completos de respuesta; solo OK/FALLO y mensajes breves.
"""
from __future__ import annotations

import logging
import os
import sys

logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("urllib3.connectionpool").setLevel(logging.WARNING)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)
os.chdir(PROJECT_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_DIR, ".env"))
except ImportError:
    pass


def _line(title: str) -> None:
    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def check_env_flags() -> None:
    _line("Variables (solo nombres / valores no secretos)")
    print(f"FLASK_ENV={os.environ.get('FLASK_ENV', '(no definido)')}")
    print(f"DB_USE_NULLPOOL={os.environ.get('DB_USE_NULLPOOL', '(no definido)')}")
    has_db = bool(os.environ.get("DATABASE_URL", "").strip())
    print(f"DATABASE_URL definida: {'sí' if has_db else 'no (probable SQLite en local)'}")
    print(f"ADM_EMAIL definido: {'sí' if os.environ.get('ADM_EMAIL') else 'no'}")
    print(f"ADM_APPID definido: {'sí' if os.environ.get('ADM_APPID') else 'no'}")
    print(f"ADM_COMPANY definido: {'sí' if os.environ.get('ADM_COMPANY') else 'no'}")
    print(f"ADM_ROLE definido: {'sí' if os.environ.get('ADM_ROLE') else 'no'}")


def check_database() -> bool:
    _line("Base de datos")
    try:
        from app_wms import app
        from sqlalchemy import text

        with app.app_context():
            from database import db

            with db.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        print("Resultado: OK (SELECT 1 ejecutado con el mismo engine que la app)")
        return True
    except Exception as e:
        print(f"Resultado: FALLO — {type(e).__name__}: {str(e)[:500]}")
        return False


def check_adm_locations() -> bool:
    _line("ADM Cloud (GET Locations, skip=0, take=1)")
    try:
        from utils.helpers import get_adm_client

        adm = get_adm_client()
        r = adm._make_request("Locations/", {"skip": 0, "take": 1})
        if r.get("success"):
            data = r.get("data")
            n = len(data) if isinstance(data, list) else 0
            print(f"Resultado: OK (HTTP 200, {n} fila(s) en muestra)")
            return True
        code = r.get("status_code", "?")
        fk = r.get("failure_kind", "")
        msg = (r.get("message") or r.get("error") or "")[:400]
        extra = f" | failure_kind={fk}" if fk else ""
        print(f"Resultado: FALLO — HTTP/código interno={code}{extra} | {msg}")
        return False
    except Exception as e:
        print(f"Resultado: FALLO — {type(e).__name__}: {str(e)[:500]}")
        return False


def main() -> int:
    print("WMS — diagnostico_entorno.py")
    check_env_flags()
    ok_db = check_database()
    ok_adm = check_adm_locations()
    _line("Resumen")
    print(f"Base de datos: {'OK' if ok_db else 'FALLO'}")
    print(f"ADM Locations: {'OK' if ok_adm else 'FALLO'}")
    if ok_db and not ok_adm:
        print(
            "\nNota: Si BD está OK pero ADM falla, suele ser red/credenciales/ADM, no MySQL."
        )
    if not ok_db and ok_adm:
        print(
            "\nNota: Si ADM está OK pero BD falla, revisa DATABASE_URL, usuario MySQL y NullPool."
        )
    return 0 if (ok_db and ok_adm) else 1


if __name__ == "__main__":
    sys.exit(main())
