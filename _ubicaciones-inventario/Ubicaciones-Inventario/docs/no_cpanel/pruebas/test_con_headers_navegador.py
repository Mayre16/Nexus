"""
Script para probar con headers copiados del navegador
Una vez que obtengas los headers del navegador, actualiza este script
"""

import requests

# ============================================================================
# CONFIGURACIÓN - ACTUALIZA ESTOS VALORES DESPUÉS DE VER EL NAVEGADOR
# ============================================================================

# URL completa del navegador (copia desde Network)
URL = "https://api.admcloud.net/api/Items/?skip=0&appid=cccdf964-1e69-46e7-5ed0-08de4e33921f&company=7b5f5222-123e-4dc7-a783-2979ea9e6cff&role=Administradores"

# Headers copiados del navegador (Request Headers de la pestaña Network)
HEADERS = {
    "Authorization": "Basic ...",  # ← COPIAR DEL NAVEGADOR
    "Accept": "application/json",
    "Content-Type": "application/json",
    # Si ves cookies en el navegador, agrégalas:
    # "Cookie": "...",  # ← COPIAR DEL NAVEGADOR SI EXISTE
    # Agrega cualquier otro header que veas:
    # "X-API-Key": "...",
    # etc.
}

# ============================================================================
# PRUEBA
# ============================================================================

def prueba_con_headers_navegador():
    """Prueba usando exactamente los mismos headers que el navegador"""
    
    print("="*60)
    print("PRUEBA CON HEADERS DEL NAVEGADOR")
    print("="*60)
    print()
    
    print("URL:", URL)
    print()
    print("Headers:")
    for key, value in HEADERS.items():
        # Ocultar parte del valor si es sensible
        if "Authorization" in key or "Cookie" in key:
            display_value = value[:30] + "..." if len(value) > 30 else value
        else:
            display_value = value
        print(f"  {key}: {display_value}")
    print()
    
    try:
        print("Enviando petición...")
        response = requests.get(URL, headers=HEADERS, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print()
        
        if response.status_code == 200:
            print("✅ ¡ÉXITO! Los headers del navegador funcionaron.")
            print()
            datos = response.json()
            print(f"Respuesta recibida (primeros 500 caracteres):")
            print(str(datos)[:500])
        else:
            print(f"❌ Error {response.status_code}")
            print(f"Respuesta: {response.text[:300]}")
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    print("⚠️  IMPORTANTE: Primero actualiza URL y HEADERS con los valores del navegador")
    print()
    prueba_con_headers_navegador()






