"""Uso único: probar conexión ADM con variables de entorno (sin imprimir secretos)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_config

get_config()
from utils.helpers import get_adm_client


def brief(name: str, r: dict) -> None:
    if r.get("success"):
        data = r.get("data")
        if isinstance(data, list):
            print(f"{name}: OK (200) elementos_en_muestra={len(data)}")
        else:
            print(f"{name}: OK (200) tipo={type(data).__name__}")
    else:
        sc = r.get("status_code", "?")
        msg = (r.get("message") or "")[:200].replace("\n", " ")
        print(f"{name}: FALLO HTTP {sc} | {msg}")


if __name__ == "__main__":
    adm = get_adm_client()
    brief("GET items/", adm._make_request("items/", {"skip": 0, "take": 1, "OnlyActive": "false"}))
    brief("GET Locations/", adm._make_request("Locations/", {"skip": 0, "take": 1}))
