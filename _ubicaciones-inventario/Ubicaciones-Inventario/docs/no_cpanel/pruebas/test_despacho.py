"""Probar endpoints relacionados con conduces de despacho"""

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
print("BUSCANDO ENDPOINTS RELACIONADOS CON DESPACHO")
print("="*60)

# Endpoints posibles para probar
endpoints_posibles = [
    "Dispatches/",
    "DispatchOrders/",
    "GuiaDespacho/",
    "Despacho/",
    "Shipments/",
    "DispatchDocuments/",
    "DeliveryNotes/",
    "DeliveryOrders/"
]

print("\nProbando endpoints relacionados con despacho:")
print("-"*60)

for ep in endpoints_posibles:
    url = f"https://api.admcloud.net/api/{ep}"
    try:
        r = requests.get(url, headers=headers, params=params_base, timeout=5)
        print(f"{ep:30} Status: {r.status_code}", end="")
        if r.status_code == 200:
            try:
                data = r.json()
                data_list = data.get("data", data) if isinstance(data, dict) else data
                if isinstance(data_list, list):
                    print(f" -> {len(data_list)} registros encontrados")
                else:
                    print(" -> OK (formato diferente)")
            except:
                print(" -> OK (no JSON)")
        else:
            print()
    except Exception as e:
        print(f"{ep:30} Error: {str(e)[:50]}")

# Revisar SalesOrders para ver estados de despacho
print("\n" + "="*60)
print("REVISANDO SALESORDERS - ESTADOS DE DESPACHO")
print("="*60)

url_so = "https://api.admcloud.net/api/SalesOrders/"
r_so = requests.get(url_so, headers=headers, params=params_base, timeout=10)
if r_so.status_code == 200:
    data_so = r_so.json()
    so_data = data_so.get("data", data_so) if isinstance(data_so, dict) else data_so
    if isinstance(so_data, list):
        print(f"\nTotal SalesOrders encontradas: {len(so_data)}")
        
        # Contar por estado de despacho
        estados_despacho = {}
        for so in so_data:
            estado = so.get("DispatchStatusDesc", "Sin estado")
            estados_despacho[estado] = estados_despacho.get(estado, 0) + 1
        
        print("\nEstados de Despacho encontrados:")
        for estado, cantidad in estados_despacho.items():
            print(f"  {estado}: {cantidad}")
        
        # Mostrar ejemplo de SalesOrder con despacho
        print("\nEjemplo de SalesOrder con información de despacho:")
        if len(so_data) > 0:
            ejemplo = so_data[0]
            campos_despacho = {
                "DocID": ejemplo.get("DocID"),
                "RelationshipName": ejemplo.get("RelationshipName"),
                "DispatchStatus": ejemplo.get("DispatchStatus"),
                "DispatchStatusDesc": ejemplo.get("DispatchStatusDesc"),
                "AuthorizationStatusDesc": ejemplo.get("AuthorizationStatusDesc"),
                "DocDate": ejemplo.get("DocDate"),
                "TotalAmount": ejemplo.get("TotalAmount")
            }
            print(json.dumps(campos_despacho, indent=2, ensure_ascii=False))



