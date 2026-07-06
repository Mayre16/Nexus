"""
Script de Prueba para ADM Cloud API
Este script prueba la conexion y obtiene informacion de los endpoints clave
"""

import requests
import base64
import json
from typing import Dict, Any
import sys
import io

# Configurar stdout para UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CONFIG = {
    "api_base": "https://api.admcloud.net/api/",
    "email": "luis.useche@adesa.com.do",
    "password": "Merida.123",
    "appid": "cccdf964-1e69-46e7-5ed0-08de4e33921f",
    "company": "7b5f5222-123e-4dc7-a783-2979ea9e6cff",
    "role": "Administradores"
}

def get_basic_auth_header(email: str, password: str) -> str:
    """Genera header de Basic Authentication"""
    credentials = f"{email}:{password}"
    encoded = base64.b64encode(credentials.encode('ascii')).decode('ascii')
    return f"Basic {encoded}"

def create_session() -> requests.Session:
    """Crea una sesion HTTP con autenticacion configurada"""
    session = requests.Session()
    auth_header = get_basic_auth_header(CONFIG["email"], CONFIG["password"])
    session.headers.update({
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "Accept": "application/json"
    })
    return session

def extract_data_from_response(response_data):
    """Extrae el array de datos de la respuesta (puede venir en formato {"success": true, "data": [...]} o directamente como array)"""
    if isinstance(response_data, dict):
        if "data" in response_data:
            return response_data["data"]
        elif "success" in response_data:
            # Si tiene success pero no data, puede ser que el array esté en otro campo
            return response_data
    return response_data

def test_authentication(session: requests.Session) -> Dict[str, Any]:
    """Prueba 1: Verificar autenticacion"""
    print("\n" + "="*60)
    print("PRUEBA 1: AUTENTICACION")
    print("="*60)
    
    try:
        url = f"{CONFIG['api_base']}Items/"
        params = {
            "skip": 0,
            "appid": CONFIG["appid"],
            "company": CONFIG["company"],
            "role": CONFIG["role"],
            "OnlyActive": "false"
        }
        
        response = session.get(url, params=params)
        
        result = {
            "status_code": response.status_code,
            "success": response.status_code == 200,
            "message": "OK" if response.status_code == 200 else response.text[:200]
        }
        
        print(f"Status Code: {response.status_code}")
        if result["success"]:
            print("[OK] Autenticacion exitosa")
        else:
            print(f"[ERROR] Error: {result['message']}")
        
        return result
        
    except Exception as e:
        print(f"[ERROR] Error de conexion: {str(e)}")
        return {"success": False, "error": str(e)}

def test_items(session: requests.Session) -> Dict[str, Any]:
    """Prueba 2: Obtener productos (Items)"""
    print("\n" + "="*60)
    print("PRUEBA 2: PRODUCTOS (ITEMS)")
    print("="*60)
    
    try:
        url = f"{CONFIG['api_base']}Items/"
        params = {
            "skip": 0,
            "appid": CONFIG["appid"],
            "company": CONFIG["company"],
            "role": CONFIG["role"],
            "OnlyActive": "false"
        }
        
        response = session.get(url, params=params)
        
        if response.status_code == 200:
            response_data = response.json()
            with open("response_items.json", "w", encoding="utf-8") as f:
                json.dump(response_data, f, indent=2, ensure_ascii=False)
            
            print("[OK] Items obtenidos exitosamente")
            
            data = extract_data_from_response(response_data)
            
            if isinstance(data, list) and len(data) > 0:
                first_item = data[0]
                print(f"Campos disponibles: {list(first_item.keys())}")
                print(f"\nEjemplo de Item (primeros campos):")
                for key, value in list(first_item.items())[:10]:
                    print(f"  {key}: {value}")
                
                campos_criticos = ["id", "ID", "sku", "SKU", "Name", "name", "qty", "stock", "quantity"]
                campos_encontrados = [c for c in campos_criticos if c in first_item]
                print(f"\n[OK] Campos criticos encontrados: {campos_encontrados}")
                
                return {
                    "success": True,
                    "total_items": len(data),
                    "campos_disponibles": list(first_item.keys()),
                    "campos_criticos_encontrados": campos_encontrados,
                    "ejemplo": first_item
                }
        else:
            print(f"[ERROR] Error: {response.status_code} - {response.text[:200]}")
            return {"success": False, "error": response.text[:200]}
            
    except Exception as e:
        print(f"[ERROR] Error: {str(e)}")
        return {"success": False, "error": str(e)}

def test_stock(session: requests.Session) -> Dict[str, Any]:
    """Prueba 3: Obtener Stock (CRITICO - ver si tiene location_id)"""
    print("\n" + "="*60)
    print("PRUEBA 3: STOCK (CRITICO)")
    print("="*60)
    
    try:
        url = f"{CONFIG['api_base']}Stock/"
        params = {
            "skip": 0,
            "appid": CONFIG["appid"],
            "company": CONFIG["company"],
            "role": CONFIG["role"]
        }
        
        response = session.get(url, params=params)
        
        if response.status_code == 200:
            response_data = response.json()
            with open("response_stock.json", "w", encoding="utf-8") as f:
                json.dump(response_data, f, indent=2, ensure_ascii=False)
            
            print("[OK] Stock obtenido exitosamente")
            
            data = extract_data_from_response(response_data)
            
            if isinstance(data, list) and len(data) > 0:
                first_stock = data[0]
                print(f"Campos disponibles: {list(first_stock.keys())}")
                
                tiene_location = any("location" in k.lower() or "Location" in k for k in first_stock.keys())
                status_location = "[OK]" if tiene_location else "[INFO]"
                print(f"\n{status_location} Tiene informacion de ubicacion: {tiene_location}")
                
                if tiene_location:
                    location_fields = [k for k in first_stock.keys() if "location" in k.lower() or "Location" in k]
                    print(f"   Campos de ubicacion: {location_fields}")
                
                return {
                    "success": True,
                    "tiene_location_id": tiene_location,
                    "campos_disponibles": list(first_stock.keys()),
                    "ejemplo": first_stock
                }
        else:
            print(f"[ERROR] Error: {response.status_code} - {response.text[:200]}")
            return {"success": False, "error": response.text[:200]}
            
    except Exception as e:
        print(f"[ERROR] Error: {str(e)}")
        return {"success": False, "error": str(e)}

def test_locations(session: requests.Session) -> Dict[str, Any]:
    """Prueba 4: Obtener Ubicaciones"""
    print("\n" + "="*60)
    print("PRUEBA 4: UBICACIONES (LOCATIONS)")
    print("="*60)
    
    try:
        url = f"{CONFIG['api_base']}Locations/"
        params = {
            "skip": 0,
            "appid": CONFIG["appid"],
            "company": CONFIG["company"],
            "role": CONFIG["role"]
        }
        
        response = session.get(url, params=params)
        
        if response.status_code == 200:
            response_data = response.json()
            with open("response_locations.json", "w", encoding="utf-8") as f:
                json.dump(response_data, f, indent=2, ensure_ascii=False)
            
            print("[OK] Locations obtenidas exitosamente")
            
            data = extract_data_from_response(response_data)
            
            if isinstance(data, list) and len(data) > 0:
                first_location = data[0]
                print(f"Campos disponibles: {list(first_location.keys())}")
                
                return {
                    "success": True,
                    "total_locations": len(data),
                    "campos_disponibles": list(first_location.keys()),
                    "ejemplo": first_location
                }
        else:
            print(f"[ERROR] Error: {response.status_code} - {response.text[:200]}")
            return {"success": False, "error": response.text[:200]}
            
    except Exception as e:
        print(f"[ERROR] Error: {str(e)}")
        return {"success": False, "error": str(e)}

def test_purchase_orders(session: requests.Session) -> Dict[str, Any]:
    """Prueba 5: Obtener Purchase Orders"""
    print("\n" + "="*60)
    print("PRUEBA 5: PURCHASE ORDERS (COMPRAS)")
    print("="*60)
    
    try:
        url = f"{CONFIG['api_base']}PurchaseOrders/"
        params = {
            "skip": 0,
            "appid": CONFIG["appid"],
            "company": CONFIG["company"],
            "role": CONFIG["role"]
        }
        
        response = session.get(url, params=params)
        
        if response.status_code == 200:
            response_data = response.json()
            with open("response_purchase_orders.json", "w", encoding="utf-8") as f:
                json.dump(response_data, f, indent=2, ensure_ascii=False)
            
            print("[OK] Purchase Orders obtenidas")
            
            data = extract_data_from_response(response_data)
            
            if isinstance(data, list) and len(data) > 0:
                first_po = data[0]
                print(f"Campos disponibles: {list(first_po.keys())}")
                
                return {
                    "success": True,
                    "campos_disponibles": list(first_po.keys()),
                    "ejemplo": first_po
                }
        else:
            print(f"[ERROR] Error: {response.status_code} - {response.text[:200]}")
            return {"success": False, "error": response.text[:200]}
            
    except Exception as e:
        print(f"[ERROR] Error: {str(e)}")
        return {"success": False, "error": str(e)}

def main():
    """Ejecuta todas las pruebas"""
    print("="*60)
    print("PRUEBA DE CONEXION - ADM CLOUD API")
    print("="*60)
    
    session = create_session()
    resultados = {}
    
    resultados["autenticacion"] = test_authentication(session)
    
    if resultados["autenticacion"]["success"]:
        resultados["items"] = test_items(session)
        resultados["stock"] = test_stock(session)
        resultados["locations"] = test_locations(session)
        resultados["purchase_orders"] = test_purchase_orders(session)
    else:
        print("\n[ERROR] No se pueden ejecutar mas pruebas sin autenticacion valida")
    
    print("\n" + "="*60)
    print("RESUMEN DE PRUEBAS")
    print("="*60)
    
    for prueba, resultado in resultados.items():
        status = "[OK]" if resultado.get("success") else "[ERROR]"
        print(f"{status} {prueba.upper()}")
    
    with open("resultados_pruebas.json", "w", encoding="utf-8") as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False, default=str)
    
    print("\nArchivos generados: resultados_pruebas.json y response_*.json")

if __name__ == "__main__":
    main()
