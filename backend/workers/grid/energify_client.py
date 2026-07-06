#!/usr/bin/env python3
"""Cliente HTTP Energify / EasyMetering AMI Cloud (ADESA)."""
from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any

try:
    from energify_browser_login import browser_login
    from energify_scrape import scrape_equipos_playwright
except ImportError:
    browser_login = None
    scrape_equipos_playwright = None


class EnergifyClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base = (base_url or os.environ.get("EASYMETERING_BASE_URL", "https://adesa.cloud.easymetering.com")).rstrip("/")
        self.api_v2 = f"{self.base}/api/v2"
        self.api_legacy = f"{self.base}/api"
        self.ctx = ssl.create_default_context()
        self.access: str | None = os.environ.get("EASYMETERING_ACCESS_TOKEN", "").strip() or None
        self.refresh: str | None = os.environ.get("EASYMETERING_REFRESH_TOKEN", "").strip() or None
        self.user = os.environ.get("EASYMETERING_USER", "").strip()
        self.password = os.environ.get("EASYMETERING_PASSWORD", "").strip()
        self.recaptcha = os.environ.get("EASYMETERING_RECAPTCHA_TOKEN", "").strip()

    def _request(self, url: str, method: str = "GET", body: dict | None = None, auth: bool = True) -> Any:
        headers = {
            "Accept": "application/json",
            "User-Agent": "NexusGrid/1.0",
            "Origin": self.base,
            "Referer": f"{self.base}/login",
        }
        if auth and self.access:
            headers["Authorization"] = f"Bearer {self.access}"
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=60) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            raw = e.read(2000).decode("utf-8", errors="replace")
            try:
                detail = json.loads(raw)
            except json.JSONDecodeError:
                detail = raw[:300]
            raise RuntimeError(f"HTTP {e.code} {url}: {detail}") from e

    def refresh_access(self) -> None:
        if not self.refresh:
            raise RuntimeError("Sin EASYMETERING_REFRESH_TOKEN")
        data = self._request(f"{self.api_v2}/auth/token/refresh/", "POST", {"refresh": self.refresh}, auth=False)
        self.access = data.get("access") or data.get("access_token")
        if not self.access:
            raise RuntimeError("Refresh no devolvió access token")

    def sign_in_api(self) -> None:
        if not self.user or not self.password:
            raise RuntimeError("Faltan usuario/contraseña")
        if not self.recaptcha:
            raise RuntimeError("Login API requiere EASYMETERING_RECAPTCHA_TOKEN (use login por navegador)")
        data = self._request(
            f"{self.api_v2}/auth/sign_in/{self.recaptcha}",
            "POST",
            {"username": self.user, "password": self.password},
            auth=False,
        )
        self.access = data.get("access")
        self.refresh = data.get("refresh")
        if not self.access:
            raise RuntimeError(f"sign_in sin access: {data}")

    def ensure_auth(self) -> None:
        if self.access:
            try:
                self._request(f"{self.api_v2}/account/get_data_user/")
                return
            except RuntimeError:
                self.access = None
        if self.refresh:
            self.refresh_access()
            return
        if browser_login and self.user and self.password:
            tokens = browser_login()
            self.access = tokens.get("access")
            self.refresh = tokens.get("refresh")
            if not self.access:
                raise RuntimeError("Login navegador sin access token")
            return
        if self.user and self.password and self.recaptcha:
            self.sign_in_api()
            return
        raise RuntimeError(
            "Sin autenticación. Configure EASYMETERING_ACCESS_TOKEN, "
            "EASYMETERING_REFRESH_TOKEN, o USER+PASSWORD (login navegador)."
        )

    def get_json(self, path: str, params: dict | None = None) -> Any:
        q = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = path if path.startswith("http") else f"{self.api_legacy}/{path.lstrip('/')}{q}"
        return self._request(url)

    def fetch_equipos(self) -> list[dict]:
        if scrape_equipos_playwright and self.user and self.password:
            return scrape_equipos_playwright()
        self.ensure_auth()
        hoy = date.today()
        ayer = hoy - timedelta(days=1)
        fecha_es = hoy.strftime("%d/%m/%Y")
        fecha_ini = ayer.strftime("%d/%m/%Y")

        equipos: dict[str, dict] = {}

        def merge_item(item: dict, fuente: str) -> None:
            if not isinstance(item, dict):
                return
            ext = str(
                item.get("id")
                or item.get("ident_id")
                or item.get("meter_id")
                or item.get("serial")
                or item.get("medidor")
                or ""
            )
            if not ext:
                return
            serial = item.get("serial") or item.get("serial_number") or item.get("medidor")
            nombre = (
                item.get("nombre")
                or item.get("name")
                or item.get("descripcion")
                or item.get("customer_name")
                or item.get("cliente")
                or serial
                or ext
            )
            estado_raw = (
                item.get("estado")
                or item.get("status")
                or item.get("connection")
                or item.get("ami_status")
                or item.get("estado_ami")
                or item.get("online")
                or ""
            )
            if isinstance(estado_raw, bool):
                estado = "online" if estado_raw else "offline"
            else:
                estado = _map_estado(str(estado_raw))
            kwh = (
                item.get("kwh_dia")
                or item.get("daily_kwh")
                or item.get("kwh")
                or item.get("consumo")
                or item.get("reading")
            )
            prev = equipos.get(ext, {})
            equipos[ext] = {
                "external_id": ext,
                "serial": serial or prev.get("serial"),
                "nombre": nombre or prev.get("nombre"),
                "estado": estado if estado != "desconocido" else prev.get("estado", "desconocido"),
                "kwh_dia": kwh if kwh is not None else prev.get("kwh_dia"),
                "fecha_lectura": hoy.isoformat(),
                "metadata": {"fuente": fuente, **{k: item.get(k) for k in ("customer", "region", "last_comm") if item.get(k)}},
            }

        # Endpoints legacy AMI (Bearer JWT)
        endpoints = [
            ("actividadamistatus/", {"fecha_inicial": fecha_ini, "fecha_final": fecha_es}),
            ("actividadamistatus/", {"initial_date": fecha_ini, "final_date": fecha_es}),
            ("actividadamistatus/", {}),
            ("amistatusbyday/", {"fecha": fecha_es}),
            ("amistatusbyday/", {"date": fecha_es}),
            ("globalsearch/", {"value": "PM"}),
        ]
        errores: list[str] = []
        for path, params in endpoints:
            try:
                data = self.get_json(path, params)
                items = _flatten_items(data)
                for it in items:
                    merge_item(it, path)
            except RuntimeError as exc:
                errores.append(str(exc))

        if not equipos:
            raise RuntimeError(
                "Autenticado pero sin equipos en APIs AMI. "
                f"Intentos: {'; '.join(errores[:3])}"
            )
        return list(equipos.values())


def _map_estado(raw: str) -> str:
    t = (raw or "").lower()
    if t in ("1", "true", "yes") or any(x in t for x in ("online", "connected", "activo", "en línea", "en linea", "comunic")):
        return "online"
    if any(x in t for x in ("advertencia", "warning", "alert", "aviso")):
        return "advertencia_offline"
    if t in ("0", "false", "no") or any(x in t for x in ("offline", "desconect", "inactivo", "sin comunic")):
        return "offline"
    return "desconocido"


def _flatten_items(data: Any) -> list[dict]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("results", "data", "meters", "devices", "equipos", "serial", "rows", "items", "medidores"):
        val = data.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    # dict of lists
    out: list[dict] = []
    for val in data.values():
        if isinstance(val, list):
            out.extend(x for x in val if isinstance(x, dict))
    if out:
        return out
    return [data]
