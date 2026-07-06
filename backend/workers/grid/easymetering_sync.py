#!/usr/bin/env python3
"""Sincroniza equipos EasyMetering Energify (AMI Cloud ADESA).

Autenticación (en orden):
  1. EASYMETERING_ACCESS_TOKEN
  2. EASYMETERING_REFRESH_TOKEN
  3. EASYMETERING_USER + EASYMETERING_PASSWORD (login Playwright + reCAPTCHA)
  4. Modo demo si nada configurado o --demo
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

WORKDIR = Path(__file__).resolve().parent
if str(WORKDIR) not in sys.path:
    sys.path.insert(0, str(WORKDIR))

from energify_client import EnergifyClient  # noqa: E402


def demo_equipos() -> list[dict]:
    hoy = date.today().isoformat()
    return [
        {"external_id": "ezm-demo-001", "serial": "PM5560-ADESA-01", "nombre": "Planta ADESA — Medidor prueba A", "estado": "online", "kwh_dia": 142.5, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-002", "serial": "PM5560-ADESA-02", "nombre": "Laboratorio ADESA — Rack energía", "estado": "online", "kwh_dia": 38.2, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-003", "serial": "ION9000-CLI-884", "nombre": "Cliente Hotel Caribe — Subestación", "estado": "online", "kwh_dia": 890.0, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-004", "serial": "PM8000-CLI-221", "nombre": "Cliente Supermercado Norte", "estado": "advertencia_offline", "kwh_dia": 0, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-005", "serial": "EZM-POOL-009", "nombre": "EasyMetering — Equipo pool EZM", "estado": "online", "kwh_dia": 12.0, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-006", "serial": "SIN-SERIE-778", "nombre": "Medidor sin asignar — Zona Este", "estado": "offline", "kwh_dia": None, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-007", "serial": "PM5560-ADESA-03", "nombre": "ADESA — Banco de pruebas Schneider", "estado": "online", "kwh_dia": 5.1, "fecha_lectura": hoy},
        {"external_id": "ezm-demo-008", "serial": "EZM-POOL-014", "nombre": "EasyMetering — Demo AMI Cloud", "estado": "advertencia_offline", "kwh_dia": None, "fecha_lectura": hoy},
    ]


def _configured_for_live() -> bool:
    if os.environ.get("EASYMETERING_ACCESS_TOKEN", "").strip():
        return True
    if os.environ.get("EASYMETERING_REFRESH_TOKEN", "").strip():
        return True
    user = os.environ.get("EASYMETERING_USER", "").strip()
    pwd = os.environ.get("EASYMETERING_PASSWORD", "").strip()
    return bool(user and pwd)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="Forzar datos de demostración")
    ap.add_argument("--headed", action="store_true", help="Navegador visible (debug login)")
    args = ap.parse_args()

    if args.headed:
        os.environ["EASYMETERING_BROWSER_HEADED"] = "true"

    base = os.environ.get("EASYMETERING_BASE_URL", "https://adesa.cloud.easymetering.com").strip()
    inicio = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    equipos: list[dict] = []
    modo = "demo"
    mensaje = ""

    try:
        if args.demo or not _configured_for_live():
            equipos = demo_equipos()
            mensaje = "Modo demostración — configure credenciales en config/.env"
        else:
            client = EnergifyClient(base)
            equipos = client.fetch_equipos()
            modo = "ok"
            mensaje = f"Sincronizados {len(equipos)} equipos desde {base}"
    except Exception as exc:
        out = {
            "estado": "error",
            "mensaje": str(exc),
            "inicio_en": inicio,
            "fin_en": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "equipos": [],
            "equipos_total": 0,
            "equipos_online": 0,
            "equipos_offline": 0,
            "equipos_alerta": 0,
        }
        print(json.dumps(out, ensure_ascii=False))
        return 1

    online = sum(1 for e in equipos if e.get("estado") == "online")
    offline = sum(1 for e in equipos if e.get("estado") == "offline")
    alerta = sum(1 for e in equipos if e.get("estado") == "advertencia_offline")

    out = {
        "estado": modo if modo == "demo" else "ok",
        "mensaje": mensaje,
        "inicio_en": inicio,
        "fin_en": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "equipos": equipos,
        "equipos_total": len(equipos),
        "equipos_online": online,
        "equipos_offline": offline,
        "equipos_alerta": alerta,
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
