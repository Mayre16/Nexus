#!/usr/bin/env python3
"""Scrape medidores Energify ADESA tras login (tabla /meters/active + KPIs dashboard)."""
from __future__ import annotations

import os
import re
import time
from datetime import date
from typing import Any

BASE = os.environ.get("EASYMETERING_BASE_URL", "https://adesa.cloud.easymetering.com").rstrip("/")


def _map_estado(estatus: str, texto: str = "") -> str:
    t = f"{estatus} {texto}".lower()
    if any(x in t for x in ("en línea", "en linea", "online", "comunic")):
        return "online"
    if any(x in t for x in ("advertencia", "warning", "alerta", "aviso")):
        return "advertencia_offline"
    if any(x in t for x in ("offline", "fuera de línea", "fuera de linea", "sin comunic")):
        return "offline"
    if "activo" in t:
        return "online"
    if "inactivo" in t:
        return "offline"
    return "desconocido"


def scrape_equipos_playwright() -> list[dict]:
    from playwright.sync_api import sync_playwright

    user = os.environ.get("EASYMETERING_USER", "").strip()
    password = os.environ.get("EASYMETERING_PASSWORD", "").strip()
    login_url = os.environ.get("EASYMETERING_LOGIN_URL", f"{BASE}/login?next=/")
    if not user or not password:
        raise RuntimeError("Faltan EASYMETERING_USER / EASYMETERING_PASSWORD")

    hoy = date.today().isoformat()
    equipos: list[dict] = []
    kpis: dict[str, Any] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=80)
        page = browser.new_page()
        page.goto(login_url, wait_until="networkidle", timeout=120000)
        page.wait_for_selector("#basic_email", timeout=60000)
        page.fill("#basic_email", user)
        page.fill("#basic_password", password)
        page.wait_for_timeout(10000)
        page.keyboard.press("Enter")
        time.sleep(22)
        page.goto(f"{BASE}/meters/active", wait_until="networkidle", timeout=120000)
        time.sleep(6)

        if "/login" in page.url:
            browser.close()
            raise RuntimeError("Sesión expirada al abrir medidores — reintente sincronizar")

        # KPIs del dashboard (si están visibles en layout)
        try:
            body = page.inner_text("body")
            m_total = re.search(r"Total de Medidores\s*(\d+)", body, re.I)
            m_on = re.search(r"En L[ií]nea\s*(\d+)", body, re.I)
            m_adv = re.search(r"Advertencia\s*(\d+)", body, re.I)
            m_off = re.search(r"Fuera de L[ií]nea\s*(\d+)", body, re.I)
            kpis = {
                "total": int(m_total.group(1)) if m_total else None,
                "online": int(m_on.group(1)) if m_on else None,
                "advertencia": int(m_adv.group(1)) if m_adv else None,
                "offline": int(m_off.group(1)) if m_off else None,
            }
        except Exception:
            pass

        headers = page.evaluate("""() => {
            const th = [...document.querySelectorAll('table thead th, table tr th')].map(x => x.innerText.trim().toLowerCase());
            return th.length ? th : null;
        }""")

        filas = page.evaluate("""() => {
            const out = [];
            for (const tr of document.querySelectorAll('table tbody tr, table tr')) {
                const cells = [...tr.querySelectorAll('td')].map(c => c.innerText.trim());
                if (cells.length >= 5) out.push(cells);
            }
            return out;
        }""")

        def col(cells: list[str], name: str, fallback: int) -> str:
            if headers:
                for i, h in enumerate(headers):
                    if name in h and i < len(cells):
                        return cells[i]
            return cells[fallback] if fallback < len(cells) else ""

        for cells in filas:
            if len(cells) < 5:
                continue
            medidor = col(cells, "medidor", 0)
            serial = col(cells, "serial", 13) or medidor
            if not serial or serial.lower() in ("medidor", "serial"):
                continue
            cuenta = col(cells, "cuenta", 1)
            nombre = col(cells, "nombre", 2)
            apellido = col(cells, "apellido", 3)
            estatus = col(cells, "estatus", 4)
            region = col(cells, "región", 7) or col(cells, "region", 7)
            modelo = col(cells, "modelo", 8)
            ip = col(cells, "ip", 12)
            label = " ".join(x for x in [nombre, apellido] if x).strip()
            cuenta_txt = (cuenta or "").strip()
            serial_txt = str(serial or medidor).strip()
            # Sin cliente en portal: título = solo serial numérico
            asignado = bool(
                label
                and not re.fullmatch(r"\d+", label.replace(" ", ""))
                and label.replace(" ", "") != serial_txt.replace(" ", "")
            )
            if not asignado:
                label = serial_txt or label

            equipos.append({
                "external_id": str(medidor or serial),
                "serial": serial_txt,
                "nombre": label,
                "asignado_portal": asignado,
                "plataforma": "adesa_cloud",
                "estado": _map_estado(estatus),
                "kwh_dia": None,
                "fecha_lectura": hoy,
                "metadata": {
                    "cuenta": cuenta,
                    "estatus_portal": estatus,
                    "region": region,
                    "modelo": modelo,
                    "ip": ip,
                    "kpis_dashboard": kpis,
                },
            })

        browser.close()

    if not equipos:
        raise RuntimeError("No se encontraron filas en /meters/active")
    return equipos
