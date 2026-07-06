"""Test rápido del endpoint"""
import requests
import base64

email = "luis.useche@adesa.com.do"
password = "Merida.123"
appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
role = "Administradores"

credenciales = f"{email}:{password}"
encoded = base64.b64encode(credenciales.encode('ascii')).decode('ascii')
auth_header = f"Basic {encoded}"

url = "https://api.admcloud.net/api/items/"
headers = {
    "Authorization": auth_header,
    "Accept": "application/json"
}
params = {
    "skip": 0,
    "appid": appid,
    "company": company,
    "role": role,
    "OnlyActive": "false"
}

print("Probando conexión directa...")
response = requests.get(url, headers=headers, params=params, timeout=10)
print(f"Status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    if isinstance(data, dict) and "data" in data:
        items = data["data"]
    else:
        items = data
    
    print(f"Total items: {len(items) if isinstance(items, list) else 0}")
    if isinstance(items, list) and len(items) > 0:
        print(f"\nPrimeros 3 SKUs:")
        for item in items[:3]:
            print(f"  - {item.get('SKU', 'N/A')}")
else:
    print(f"Error: {response.text[:200]}")






