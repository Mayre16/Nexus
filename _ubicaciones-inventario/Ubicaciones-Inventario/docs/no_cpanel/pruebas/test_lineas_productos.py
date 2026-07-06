"""Probar endpoints para obtener líneas de productos de pedidos y facturas"""

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
print("BUSCANDO ENDPOINTS PARA LÍNEAS DE PRODUCTOS")
print("="*60)

# Primero obtener una SalesOrder para usar su ID
print("\n1. OBTENIENDO UNA SALESORDER DE REFERENCIA")
print("-"*60)
url_so = "https://api.admcloud.net/api/SalesOrders/"
r_so = requests.get(url_so, headers=headers, params=params_base, timeout=10)
if r_so.status_code == 200:
    data_so = r_so.json()
    so_data = data_so.get("data", data_so) if isinstance(data_so, dict) else data_so
    if isinstance(so_data, list) and len(so_data) > 0:
        so_ejemplo = so_data[0]
        so_id = so_ejemplo.get("ID")
        so_docid = so_ejemplo.get("DocID")
        print(f"SalesOrder ID: {so_id}")
        print(f"DocID: {so_docid}")
        print(f"Cliente: {so_ejemplo.get('RelationshipName')}")
        print(f"Total: {so_ejemplo.get('TotalAmount')}")
else:
    print("Error obteniendo SalesOrder")
    exit(1)

# Obtener una CashInvoice
print("\n2. OBTENIENDO UNA CASHINVOICE DE REFERENCIA")
print("-"*60)
url_inv = "https://api.admcloud.net/api/CashInvoices/"
r_inv = requests.get(url_inv, headers=headers, params=params_base, timeout=10)
if r_inv.status_code == 200:
    data_inv = r_inv.json()
    inv_data = data_inv.get("data", data_inv) if isinstance(data_inv, dict) else data_inv
    if isinstance(inv_data, list) and len(inv_data) > 0:
        inv_ejemplo = inv_data[0]
        inv_id = inv_ejemplo.get("ID")
        inv_docid = inv_ejemplo.get("DocID")
        print(f"CashInvoice ID: {inv_id}")
        print(f"NCF: {inv_ejemplo.get('NCF')}")
        print(f"Cliente: {inv_ejemplo.get('RelationshipName')}")
        print(f"Total: {inv_ejemplo.get('TotalAmount')}")
else:
    inv_ejemplo = None
    inv_id = None

# Probar endpoints de líneas
print("\n3. PROBANDO ENDPOINTS DE LÍNEAS/DETALLES")
print("-"*60)

endpoints_lineas = [
    # Endpoints de líneas directos
    "SalesOrderLines/",
    "SalesOrderLine/",
    "InvoiceLines/",
    "InvoiceLine/",
    "CashInvoiceLines/",
    "CreditInvoiceLines/",
    "OrderLines/",
    
    # Endpoints de detalles por ID
    f"SalesOrders/{so_id}",
    f"SalesOrders/{so_id}/",
    f"SalesOrders/{so_id}/Lines",
    f"SalesOrders/{so_id}/Lines/",
    
    # Si tenemos invoice ID
    (f"CashInvoices/{inv_id}", inv_id is not None),
    (f"CashInvoices/{inv_id}/", inv_id is not None),
    (f"CashInvoices/{inv_id}/Lines", inv_id is not None),
]

for ep_info in endpoints_lineas:
    if isinstance(ep_info, tuple):
        ep, condicion = ep_info
        if not condicion:
            continue
    else:
        ep = ep_info
    
    url = f"https://api.admcloud.net/api/{ep}"
    try:
        r = requests.get(url, headers=headers, params=params_base, timeout=5)
        print(f"{ep:50} Status: {r.status_code}", end="")
        if r.status_code == 200:
            try:
                data = r.json()
                data_list = data.get("data", data) if isinstance(data, dict) else data
                if isinstance(data_list, list):
                    print(f" -> {len(data_list)} registros")
                    if len(data_list) > 0:
                        # Ver si tiene campos de productos
                        primer_item = data_list[0]
                        campos_producto = [k for k in primer_item.keys() if any(term in k.lower() for term in ['item', 'product', 'sku', 'code', 'quantity', 'cantidad'])]
                        if campos_producto:
                            print(f"      Campos de producto: {', '.join(campos_producto[:5])}")
                else:
                    print(" -> Objeto único")
                    if isinstance(data, dict):
                        campos_producto = [k for k in data.keys() if any(term in k.lower() for term in ['line', 'item', 'product', 'sku'])]
                        if campos_producto:
                            print(f"      Campos relacionados: {', '.join(campos_producto[:5])}")
                        # Guardar para revisar
                        if 'Line' in ep or 'line' in ep or 'Lines' in ep:
                            with open(f"response_{ep.replace('/', '_')}.json", "w", encoding="utf-8") as f:
                                json.dump(data, f, indent=2, ensure_ascii=False)
                            print(f"      -> Guardado en response_{ep.replace('/', '_')}.json")
            except Exception as e:
                print(f" -> Error parseando JSON: {str(e)[:30]}")
        else:
            print()
    except Exception as e:
        print(f"{ep:50} Error: {str(e)[:50]}")

# Intentar obtener detalle completo de SalesOrder
print("\n4. OBTENIENDO DETALLE COMPLETO DE SALESORDER")
print("-"*60)
url_detalle = f"https://api.admcloud.net/api/SalesOrders/{so_id}"
r_detalle = requests.get(url_detalle, headers=headers, params=params_base, timeout=10)
if r_detalle.status_code == 200:
    detalle = r_detalle.json()
    print("Campos en detalle:")
    print(json.dumps(list(detalle.keys())[:20], indent=2))
    # Guardar detalle completo
    with open("response_salesorder_detalle.json", "w", encoding="utf-8") as f:
        json.dump(detalle, f, indent=2, ensure_ascii=False)
    print("\nDetalle completo guardado en response_salesorder_detalle.json")
    
    # Buscar campos relacionados con líneas
    campos_con_lineas = [k for k in detalle.keys() if 'line' in k.lower() or 'item' in k.lower() or 'detail' in k.lower()]
    if campos_con_lineas:
        print(f"\nCampos que podrían contener líneas: {campos_con_lineas}")
        for campo in campos_con_lineas[:3]:
            valor = detalle.get(campo)
            if isinstance(valor, list):
                print(f"\n{campo}: {len(valor)} elementos")
                if len(valor) > 0:
                    print(f"Primer elemento: {json.dumps(valor[0], indent=2, ensure_ascii=False)[:500]}")
            elif isinstance(valor, dict):
                print(f"\n{campo}: objeto")
                print(json.dumps(valor, indent=2, ensure_ascii=False)[:500])
else:
    print(f"Error obteniendo detalle: {r_detalle.status_code}")



