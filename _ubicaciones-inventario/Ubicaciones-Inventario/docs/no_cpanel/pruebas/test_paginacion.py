"""Prueba de paginación - verificar límites del API"""

import requests
import base64

email = "luis.useche@adesa.com.do"
password = "Merida.123."
appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
role = "Administradores"

credenciales = f"{email}:{password}"
encoded = base64.b64encode(credenciales.encode('ascii')).decode('ascii')
auth_header = f"Basic {encoded}"

headers = {
    "Authorization": auth_header,
    "Accept": "application/json"
}

params_base = {
    "appid": appid,
    "company": company,
    "role": role,
    "OnlyActive": "false"
}

# Probar diferentes combinaciones de skip
url = "https://api.admcloud.net/api/items/"

print("Probando paginación:")
print("="*60)

# Petición 1: skip=0
params1 = {**params_base, "skip": 0}
r1 = requests.get(url, headers=headers, params=params1, timeout=10)
if r1.status_code == 200:
    data1 = r1.json()
    items1 = data1.get("data", data1) if isinstance(data1, dict) else data1
    print(f"skip=0: {len(items1)} productos")

# Petición 2: skip=50
params2 = {**params_base, "skip": 50}
r2 = requests.get(url, headers=headers, params=params2, timeout=10)
if r2.status_code == 200:
    data2 = r2.json()
    items2 = data2.get("data", data2) if isinstance(data2, dict) else data2
    print(f"skip=50: {len(items2)} productos")
    if len(items2) > 0:
        print(f"  Primer SKU en skip=50: {items2[0].get('SKU', 'N/A')}")
        if len(items1) > 0:
            print(f"  Primer SKU en skip=0: {items1[0].get('SKU', 'N/A')}")
            if items1[0].get('SKU') != items2[0].get('SKU'):
                print("  [OK] Paginacion funciona (productos diferentes)")
            else:
                print("  [ADVERTENCIA] Mismos productos (posible limite)")

# Petición 3: skip=100
params3 = {**params_base, "skip": 100}
r3 = requests.get(url, headers=headers, params=params3, timeout=10)
if r3.status_code == 200:
    data3 = r3.json()
    items3 = data3.get("data", data3) if isinstance(data3, dict) else data3
    print(f"skip=100: {len(items3)} productos")

print("="*60)
print("\nProbando endpoint de facturas/ventas:")
print("="*60)

# Probar SalesOrders
url_so = "https://api.admcloud.net/api/SalesOrders/"
r_so = requests.get(url_so, headers=headers, params=params_base, timeout=10)
print(f"\nSalesOrders: Status {r_so.status_code}")
if r_so.status_code == 200:
    data_so = r_so.json()
    so_data = data_so.get("data", data_so) if isinstance(data_so, dict) else data_so
    print(f"  Total SalesOrders: {len(so_data) if isinstance(so_data, list) else 'N/A'}")
    if isinstance(so_data, list) and len(so_data) > 0:
        print(f"  Primer SalesOrder (campos): {list(so_data[0].keys())[:10]}")

# Probar CashInvoices
url_inv = "https://api.admcloud.net/api/CashInvoices/"
r_inv = requests.get(url_inv, headers=headers, params=params_base, timeout=10)
print(f"\nCashInvoices: Status {r_inv.status_code}")
if r_inv.status_code == 200:
    data_inv = r_inv.json()
    inv_data = data_inv.get("data", data_inv) if isinstance(data_inv, dict) else data_inv
    print(f"  Total CashInvoices: {len(inv_data) if isinstance(inv_data, list) else 'N/A'}")
    if isinstance(inv_data, list) and len(inv_data) > 0:
        print(f"  Primer CashInvoice (campos): {list(inv_data[0].keys())[:10]}")

