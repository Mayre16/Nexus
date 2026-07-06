"""
Script temporal para instalar openpyxl en cPanel
Ejecutar desde "Execute python script" en cPanel
"""
import subprocess
import sys

def instalar_openpyxl():
    """Instala openpyxl usando pip"""
    try:
        print("🔧 Instalando openpyxl...")
        print("-" * 50)
        
        # Instalar openpyxl
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "openpyxl>=3.1.0"],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            print("✅ openpyxl instalado exitosamente!")
            print("\n📦 Salida de pip:")
            print(result.stdout)
            
            # Verificar instalación
            try:
                import openpyxl
                print(f"\n✅ Verificación: openpyxl versión {openpyxl.__version__} está instalado")
            except ImportError:
                print("\n⚠️ Advertencia: openpyxl instalado pero no se puede importar")
        else:
            print("❌ Error al instalar openpyxl")
            print("\n📋 Salida de error:")
            print(result.stderr)
            print("\n📋 Salida estándar:")
            print(result.stdout)
            
    except subprocess.TimeoutExpired:
        print("❌ Timeout: La instalación tardó más de 2 minutos")
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    instalar_openpyxl()








