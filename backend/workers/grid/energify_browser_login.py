#!/usr/bin/env python3
"""Login Energify ADESA vía navegador (reCAPTCHA) y extrae JWT."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[3] / "config" / ".env")
except ImportError:
    pass

BASE = os.environ.get("EASYMETERING_BASE_URL", "https://adesa.cloud.easymetering.com").rstrip("/")
USER = os.environ.get("EASYMETERING_USER", "").strip()
PASSWORD = os.environ.get("EASYMETERING_PASSWORD", "").strip()
LOGIN_URL = os.environ.get("EASYMETERING_LOGIN_URL", f"{BASE}/login?next=/")


def browser_login(timeout_ms: int = 120000) -> dict:
    if not USER or not PASSWORD:
        raise RuntimeError("Configure EASYMETERING_USER y EASYMETERING_PASSWORD en config/.env")

    from playwright.sync_api import sync_playwright

    # reCAPTCHA invisible no funciona en headless — ventana visible breve
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=120)
        page = browser.new_page()
        page.goto(LOGIN_URL, wait_until="networkidle", timeout=timeout_ms)
        page.wait_for_selector("#basic_email", timeout=timeout_ms)
        page.fill("#basic_email", USER)
        page.fill("#basic_password", PASSWORD)
        page.wait_for_timeout(8000)
        page.keyboard.press("Enter")
        time.sleep(22)

        tokens = page.evaluate("""() => {
            try {
                const raw = localStorage.getItem('authTokens');
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        }""")

        if not tokens or not tokens.get("access"):
            alerts = page.evaluate("""() => [...document.querySelectorAll(
                '.ant-form-item-explain-error, .text-danger, [role="alert"]'
            )].map(e => e.innerText.trim()).filter(Boolean)""")
            browser.close()
            raise RuntimeError(" | ".join(alerts) if alerts else f"Login falló — URL: {page.url}")

        browser.close()
        return tokens


if __name__ == "__main__":
    try:
        t = browser_login()
        print(json.dumps({"ok": True, "has_refresh": bool(t.get("refresh"))}))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
