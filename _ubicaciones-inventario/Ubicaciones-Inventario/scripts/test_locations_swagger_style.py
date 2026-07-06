"""Replica GET /api/Locations como Swagger (query params); opcional Basic Auth."""
import base64
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

base = (os.getenv("ADM_API_BASE") or "https://api.admcloud.net/api").rstrip("/")
url = f"{base}/Locations"
params = {
    "skip": 0,
    "company": os.environ["ADM_COMPANY"],
    "role": os.environ["ADM_ROLE"],
    "appid": os.environ["ADM_APPID"],
}
headers = {"Accept": "application/json"}

r_a = requests.get(url, params=params, headers=headers, timeout=30)
print("A) Sin Basic Auth:", r_a.status_code)
if r_a.status_code == 200:
    j = r_a.json()
    print("   success=", j.get("success"), "data_count=", len(j.get("data") or []))
    if j.get("data"):
        print("   primer_Name=", j["data"][0].get("Name"))

creds = f"{os.environ['ADM_EMAIL']}:{os.environ['ADM_PASSWORD']}"
b64 = base64.b64encode(creds.encode("ascii")).decode("ascii")
headers_b = {**headers, "Authorization": f"Basic {b64}"}
r_b = requests.get(url, params=params, headers=headers_b, timeout=30)
print("B) Con Basic Auth:", r_b.status_code)
if r_b.status_code == 200:
    j = r_b.json()
    print("   success=", j.get("success"), "data_count=", len(j.get("data") or []))
    if j.get("data"):
        print("   primer_Name=", j["data"][0].get("Name"))
