"""Probar obtener detalles de una factura específica"""

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
print("PROBANDO DETALLES DE FACTURA")
print("="*60)

# Primero obtener una factura para tener su ID
print("\n1. Obteniendo lista de facturas...")
url_inv = "https://api.admcloud.net/api/CashInvoices/"
r_inv = requests.get(url_inv, headers=headers, params=params_base, timeout=10)

if r_inv.status_code == 200:
    data_inv = r_inv.json()
    inv_data = data_inv.get("data", data_inv) if isinstance(data_inv, dict) else data_inv
    
    if isinstance(inv_data, list) and len(inv_data) > 0:
        primera_factura = inv_data[0]
        factura_id = primera_factura.get("ID")
        doc_id = primera_factura.get("DocID", "N/A")
        ncf = primera_factura.get("NCF", "N/A")
        
        print(f"  Factura seleccionada:")
        print(f"    DocID: {doc_id}")
        print(f"    NCF: {ncf}")
        print(f"    ID: {factura_id}")
        print(f"    Total: {primera_factura.get('TotalAmount', 0)}")
        
        # Probar obtener detalles por ID
        print(f"\n2. Probando endpoint de detalles...")
        
        # Opción 1: /api/CashInvoices/{ID}
        url_detalle1 = f"https://api.admcloud.net/api/CashInvoices/{factura_id}"
        r_detalle1 = requests.get(url_detalle1, headers=headers, params=params_base, timeout=10)
        print(f"\n  GET /api/CashInvoices/{{ID}}")
        print(f"    Status: {r_detalle1.status_code}")
        if r_detalle1.status_code == 200:
            detalle1 = r_detalle1.json()
            detalle_data = detalle1.get("data", detalle1) if isinstance(detalle1, dict) else detalle1
            print(f"    Campos: {list(detalle_data.keys())[:20] if isinstance(detalle_data, dict) else 'N/A'}")
            # Buscar campos relacionados con líneas
            if isinstance(detalle_data, dict):
                campos_lineas = [k for k in detalle_data.keys() if any(term in k.lower() for term in ['line', 'item', 'product', 'detail', 'detalle'])]
                if campos_lineas:
                    print(f"    Campos de líneas: {campos_lineas}")
                with open("response_detalle_factura.json", "w", encoding="utf-8") as f:
                    json.dump(detalle_data, f, indent=2, ensure_ascii=False)
        
        # Opción 2: /api/CashInvoices/{ID}/ (con barra)
        url_detalle2 = f"https://api.admcloud.net/api/CashInvoices/{factura_id}/"
        r_detalle2 = requests.get(url_detalle2, headers=headers, params=params_base, timeout=10)
        print(f"\n  GET /api/CashInvoices/{{ID}}/")
        print(f"    Status: {r_detalle2.status_code}")




