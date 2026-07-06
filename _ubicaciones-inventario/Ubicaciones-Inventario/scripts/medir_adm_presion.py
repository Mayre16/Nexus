#!/usr/bin/env python3
"""
Mide comportamiento de ADM ante muchas peticiones seguidas (mismo patrón que un sync largo).

Uso (desde la raíz del proyecto):
  python scripts/medir_adm_presion.py
  python scripts/medir_adm_presion.py 50

Interpretación rápida:
  - timeout_connect / timeout_read → red lenta o ADM tarda; no es "bloqueo HTTP".
  - failure_kind=http_error con status 429 → rate limit (muchas peticiones).
  - status 403 → prohibido / WAF / IP; revisar con ADM.
  - connection_error sin HTTP → corte TLS/red antes de respuesta (no distingue bloqueo silencioso).

No imprime contraseñas; solo conteos y el último error de muestra.
"""
from __future__ import annotations

import os
import sys

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


def main() -> int:
    n = 40
    if len(sys.argv) > 1:
        try:
            n = max(1, min(500, int(sys.argv[1])))
        except ValueError:
            print("Uso: python scripts/medir_adm_presion.py [N]")
            return 2

    from utils.helpers import get_adm_client

    adm = get_adm_client()
    counts: dict[str, int] = {}
    last_fail: dict | None = None

    print(f"Ejecutando {n} GET seguidos a Locations (skip=0, take=1)...")
    for i in range(n):
        r = adm._make_request("Locations/", {"skip": 0, "take": 1})
        if r.get("success"):
            key = "ok"
        else:
            fk = r.get("failure_kind") or "error"
            sc = r.get("status_code")
            if fk == "http_error" and sc is not None:
                key = f"http_{sc}"
            else:
                key = fk
            last_fail = r
        counts[key] = counts.get(key, 0) + 1
        if (i + 1) % 10 == 0:
            print(f"  ... {i + 1}/{n}")

    print()
    print("Resumen (conteo por resultado):")
    for k in sorted(counts.keys()):
        print(f"  {k}: {counts[k]}")

    if last_fail and not last_fail.get("success"):
        print()
        print("Última respuesta fallida (muestra):")
        safe = {k: last_fail[k] for k in last_fail if k in ("failure_kind", "error", "status_code", "retry_after")}
        safe["message"] = (last_fail.get("message") or "")[:200]
        for k, v in safe.items():
            if v is not None:
                print(f"  {k}: {v}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
