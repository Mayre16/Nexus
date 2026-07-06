"""
Prueba Mínima de Conexión a ADM Cloud API
Este script hace una prueba muy simple: ¿funciona la conexión?
"""

import requests
import base64

# ============================================================================
# CONFIGURACIÓN - Tus credenciales
# ============================================================================
EMAIL = "luis.useche@adesa.com.do"
PASSWORD = "Merida.123"
APPID = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
COMPANY = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
ROLE = "Administradores"

# ============================================================================
# FUNCIÓN DE PRUEBA
# ============================================================================
def prueba_conexion():
    """Hace una prueba básica de conexión"""
    
    print("="*60)
    print("PRUEBA DE CONEXIÓN BÁSICA - ADM Cloud API")
    print("="*60)
    print()
    
    # 1. Preparar autenticación
    print("1. Preparando autenticación...")
    credenciales = f"{EMAIL}:{PASSWORD}"
    codificado = base64.b64encode(credenciales.encode('ascii')).decode('ascii')
    auth_header = f"Basic {codificado}"
    print("   ✓ Autenticación preparada")
    print()
    
    # 2. Preparar petición
    print("2. Preparando petición...")
    url = "https://api.admcloud.net/api/items/"
    headers = {
        "Authorization": auth_header,
        "Accept": "application/json"
    }
    params = {
        "skip": 0,
        "appid": APPID,
        "company": COMPANY,
        "role": ROLE,
        "OnlyActive": "false"
    }
    print(f"   URL: {url}")
    print(f"   AppID: {APPID[:20]}...")
    print(f"   Company: {COMPANY[:20]}...")
    print(f"   Role: {ROLE}")
    print()
    
    # 3. Hacer la petición
    print("3. Enviando petición al servidor...")
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        print(f"   ✓ Respuesta recibida")
        print()
        
        # 4. Analizar resultado
        print("4. Analizando respuesta...")
        print(f"   Status Code: {response.status_code}")
        print()
        
        if response.status_code == 200:
            print("="*60)
            print("✅ ¡CONEXIÓN EXITOSA!")
            print("="*60)
            print()
            print("El API está funcionando correctamente.")
            print("Puedes continuar con las pruebas avanzadas.")
            print()
            
            # Intentar mostrar un poco de la respuesta
            try:
                datos = response.json()
                print(f"Tipo de respuesta: {type(datos)}")
                if isinstance(datos, dict):
                    if "data" in datos:
                        print(f"Elementos en 'data': {len(datos['data'])}")
                        if len(datos['data']) > 0:
                            print(f"Primer elemento tiene {len(datos['data'][0])} campos")
                elif isinstance(datos, list):
                    print(f"Total de elementos: {len(datos)}")
            except:
                print("(No se pudo procesar la respuesta como JSON)")
                
        elif response.status_code == 401:
            print("="*60)
            print("❌ ERROR 401 - NO AUTORIZADO")
            print("="*60)
            print()
            print("Las credenciales no fueron aceptadas.")
            print()
            print("Posibles causas:")
            print("  - Credenciales incorrectas")
            print("  - Integración no activa o mal configurada")
            print("  - Permisos insuficientes")
            print()
            print("Qué verificar:")
            print("  1. ¿Las credenciales son correctas?")
            print("  2. ¿La integración existe en ADM Cloud?")
            print("  3. ¿La integración está activa?")
            print("  4. ¿Tienes permisos para usar la API?")
            print()
            print(f"Respuesta del servidor: {response.text[:200]}")
            
        else:
            print("="*60)
            print(f"❌ ERROR {response.status_code}")
            print("="*60)
            print()
            print(f"El servidor respondió con código: {response.status_code}")
            print(f"Respuesta: {response.text[:300]}")
            
    except requests.exceptions.Timeout:
        print("="*60)
        print("❌ ERROR: TIMEOUT")
        print("="*60)
        print()
        print("El servidor no respondió a tiempo.")
        print("Verifica tu conexión a internet.")
        
    except requests.exceptions.ConnectionError:
        print("="*60)
        print("❌ ERROR: NO SE PUDO CONECTAR")
        print("="*60)
        print()
        print("No se pudo establecer conexión con el servidor.")
        print("Verifica:")
        print("  - Tu conexión a internet")
        print("  - Que el firewall no bloquee la conexión")
        print("  - Que puedas acceder a: https://api.admcloud.net")
        
    except Exception as e:
        print("="*60)
        print("❌ ERROR INESPERADO")
        print("="*60)
        print()
        print(f"Error: {str(e)}")
        print(f"Tipo: {type(e).__name__}")

# ============================================================================
# EJECUTAR PRUEBA
# ============================================================================
if __name__ == "__main__":
    prueba_conexion()

