"""Probar endpoints de facturas/ventas"""

import requests
import base64
import json

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
    "skip": 0,
    "appid": appid,
    "company": company,
    "role": role
}

print("="*60)
print("PROBANDO ENDPOINTS DE FACTURAS/VENTAS")
print("="*60)

# Probar SalesOrders
print("\n1. SALES ORDERS (Ordenes de Venta)")
print("-"*60)
url_so = "https://api.admcloud.net/api/SalesOrders/"
r_so = requests.get(url_so, headers=headers, params=params_base, timeout=10)
print(f"Status: {r_so.status_code}")
if r_so.status_code == 200:
    data_so = r_so.json()
    so_data = data_so.get("data", data_so) if isinstance(data_so, dict) else data_so
    print(f"Total: {len(so_data) if isinstance(so_data, list) else 'N/A'}")
    if isinstance(so_data, list) and len(so_data) > 0:
        print(f"Campos disponibles: {list(so_data[0].keys())[:15]}")
        with open("response_salesorders.json", "w", encoding="utf-8") as f:
            json.dump(so_data[0], f, indent=2, ensure_ascii=False)

# Probar CashInvoices
print("\n2. CASH INVOICES (Facturas de Contado)")
print("-"*60)
url_inv = "https://api.admcloud.net/api/CashInvoices/"
r_inv = requests.get(url_inv, headers=headers, params=params_base, timeout=10)
print(f"Status: {r_inv.status_code}")
if r_inv.status_code == 200:
    data_inv = r_inv.json()
    inv_data = data_inv.get("data", data_inv) if isinstance(data_inv, dict) else data_inv
    print(f"Total: {len(inv_data) if isinstance(inv_data, list) else 'N/A'}")
    if isinstance(inv_data, list) and len(inv_data) > 0:
        print(f"Campos disponibles: {list(inv_data[0].keys())[:15]}")
        # Buscar campos relacionados con productos/líneas
        campos_productos = [k for k in inv_data[0].keys() if any(term in k.lower() for term in ['line', 'item', 'product', 'detail', 'detalle'])]
        print(f"Campos relacionados con productos: {campos_productos}")
        with open("response_cashinvoices.json", "w", encoding="utf-8") as f:
            json.dump(inv_data[0], f, indent=2, ensure_ascii=False)

# Probar CreditInvoices
print("\n3. CREDIT INVOICES (Facturas a Credito)")
print("-"*60)
url_credit = "https://api.admcloud.net/api/CreditInvoices/"
r_credit = requests.get(url_credit, headers=headers, params=params_base, timeout=10)
print(f"Status: {r_credit.status_code}")
if r_credit.status_code == 200:
    data_credit = r_credit.json()
    credit_data = data_credit.get("data", data_credit) if isinstance(data_credit, dict) else data_credit
    print(f"Total: {len(credit_data) if isinstance(credit_data, list) else 'N/A'}")
    if isinstance(credit_data, list) and len(credit_data) > 0:
        print(f"Campos disponibles: {list(credit_data[0].keys())[:15]}")

print("\n" + "="*60)
print("Archivos generados: response_salesorders.json, response_cashinvoices.json")




