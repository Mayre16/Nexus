#!/usr/bin/env python3
"""Obtiene refresh JWT de Energify (una vez) para sync por API sin navegador."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / "config" / ".env"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "workers" / "grid"))

from energify_browser_login import browser_login  # noqa: E402


def main() -> int:
    tokens = browser_login()
    refresh = tokens.get("refresh")
    access = tokens.get("access")
    if not refresh:
        print(json.dumps({"ok": False, "error": "No se obtuvo refresh token"}))
        return 1

    if not ENV_PATH.exists():
        print(json.dumps({"ok": False, "error": f"No existe {ENV_PATH}"}))
        return 1

    text = ENV_PATH.read_text(encoding="utf-8")
    for key, val in [
        ("EASYMETERING_REFRESH_TOKEN", refresh),
        ("EASYMETERING_ACCESS_TOKEN", access or ""),
    ]:
        pattern = rf"^{key}=.*$"
        line = f"{key}={val}"
        if re.search(pattern, text, re.M):
            text = re.sub(pattern, line, text, flags=re.M)
        else:
            text = text.rstrip() + f"\n{line}\n"

    ENV_PATH.write_text(text, encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "mensaje": "Tokens guardados en config/.env — reinicie Nexus (npm run dev) y use Sincronizar.",
        "refresh_len": len(refresh),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
