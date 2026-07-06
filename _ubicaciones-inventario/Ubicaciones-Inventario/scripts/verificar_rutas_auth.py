"""
Script para verificar que las rutas de autenticación estén correctamente registradas
"""
from app_wms import app
import sys

def verificar_rutas():
    with app.app_context():
        print("=" * 60)
        print("VERIFICACION DE RUTAS DE AUTENTICACION")
        print("=" * 60)
        
        # Obtener todas las rutas registradas
        print("\n[1] Rutas registradas en la aplicación:")
        print("-" * 60)
        
        rutas_auth = []
        for rule in app.url_map.iter_rules():
            if '/api/auth' in str(rule):
                rutas_auth.append({
                    'endpoint': rule.endpoint,
                    'rule': str(rule),
                    'methods': list(rule.methods)
                })
                print(f"  {str(rule):50} {list(rule.methods)}")
        
        print(f"\n[2] Total de rutas de autenticación encontradas: {len(rutas_auth)}")
        
        # Verificar rutas específicas
        print("\n[3] Verificando rutas específicas:")
        print("-" * 60)
        
        rutas_esperadas = [
            ('/api/auth/login', ['POST']),
            ('/api/auth/logout', ['POST']),
            ('/api/auth/me', ['GET']),
            ('/api/auth/cambiar-password', ['POST'])
        ]
        
        todas_ok = True
        for ruta_esperada, metodos_esperados in rutas_esperadas:
            encontrada = False
            for ruta in rutas_auth:
                if ruta_esperada in ruta['rule']:
                    encontrada = True
                    metodos_correctos = set(metodos_esperados).issubset(set(ruta['methods']))
                    if metodos_correctos:
                        print(f"  ✅ {ruta_esperada:40} {metodos_esperados}")
                    else:
                        print(f"  ❌ {ruta_esperada:40} Métodos incorrectos: {ruta['methods']} (esperado: {metodos_esperados})")
                        todas_ok = False
                    break
            
            if not encontrada:
                print(f"  ❌ {ruta_esperada:40} NO ENCONTRADA")
                todas_ok = False
        
        print("\n" + "=" * 60)
        if todas_ok:
            print("✅ TODAS LAS RUTAS ESTAN CORRECTAMENTE REGISTRADAS")
        else:
            print("❌ HAY PROBLEMAS CON LAS RUTAS")
        print("=" * 60)
        
        return todas_ok

if __name__ == '__main__':
    try:
        verificar_rutas()
    except Exception as e:
        print(f"\n[ERROR] Error al verificar rutas: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)




