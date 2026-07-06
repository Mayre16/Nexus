#!/usr/bin/env python3
"""ScrapiBids por usuario — lee config desde MySQL Nexus y ejecuta scraper."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

SCRAPI = Path(__file__).resolve().parents[4] / "ScrapiBids"
if str(SCRAPI) not in sys.path:
    sys.path.insert(0, str(SCRAPI))


def load_config_from_db(usuario_id: int) -> dict:
    try:
        import mysql.connector  # type: ignore
    except ImportError:
        mysql = None

    if mysql is None:
        return {
            "palabras_clave": ["transformador", "UPS"],
            "correo_destino": os.environ.get("SCRAPIBIDS_TO_EMAIL", ""),
            "busqueda_publica": True,
        }

    conn = mysql.connector.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME") or os.environ.get("NEXUS_DB_NAME", "nexus"),
    )
    cur = conn.cursor(dictionary=True)
    cur.execute(
        "SELECT palabras_clave, correo_destino, busqueda_publica FROM scrapibids_config WHERE usuario_id = %s AND activo = 1",
        (usuario_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise RuntimeError("Sin configuración ScrapiBids activa")
    kw = row["palabras_clave"]
    if isinstance(kw, str):
        kw = json.loads(kw)
    return {
        "palabras_clave": kw,
        "correo_destino": row["correo_destino"],
        "busqueda_publica": bool(row["busqueda_publica"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--usuario-id", type=int, required=True)
    args = parser.parse_args()

    cfg = load_config_from_db(args.usuario_id)
    os.environ["TO_EMAIL"] = cfg["correo_destino"]
    os.environ["USE_PUBLIC_SEARCH"] = "true" if cfg["busqueda_publica"] else "false"

    keywords_file = SCRAPI / "output" / f"keywords_user_{args.usuario_id}.txt"
    keywords_file.parent.mkdir(parents=True, exist_ok=True)
    keywords_file.write_text("\n".join(cfg["palabras_clave"]), encoding="utf-8")
    os.environ["KEYWORDS_FILE"] = str(keywords_file)

    nuevas = 0
    mensaje = "Ejecución completada"
    estado = "ok"

    try:
        from scraper_auto import main as run_scraper  # type: ignore

        run_scraper()
        estado = "ok"
    except ImportError:
        mensaje = "ScrapiBids no instalado en servidor; config guardada correctamente"
        estado = "sin_novedades"
    except Exception as exc:
        if "sin nuevas" in str(exc).lower() or "no new" in str(exc).lower():
            estado = "sin_novedades"
            mensaje = str(exc)
        else:
            estado = "error"
            mensaje = str(exc)
            print(json.dumps({"estado": estado, "nuevas": 0, "mensaje": mensaje}))
            return 1

    print(json.dumps({"estado": estado, "nuevas": nuevas, "mensaje": mensaje, "hora": datetime.now().isoformat()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
