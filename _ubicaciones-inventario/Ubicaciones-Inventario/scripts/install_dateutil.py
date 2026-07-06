"""
Script para instalar python-dateutil en CPanel
Ejecutar desde: Setup Python App > Execute python script
"""
import subprocess
import sys

print("="*60)
print("Instalando python-dateutil...")
print("="*60)

try:
    # Instalar python-dateutil
    resultado = subprocess.run(
        [sys.executable, "-m", "pip", "install", "python-dateutil>=2.8.0"],
        capture_output=True,
        text=True,
        check=True
    )
    
    print("✓ Instalación exitosa!")
    print("\nSalida de pip:")
    print(resultado.stdout)
    
    # Verificar que se instaló correctamente
    try:
        from dateutil import parser
        print("\n✓ Verificación: dateutil importado correctamente")
    except ImportError as e:
        print(f"\n❌ Error al verificar: {e}")
        
except subprocess.CalledProcessError as e:
    print(f"\n❌ Error durante la instalación:")
    print(f"Exit code: {e.returncode}")
    print(f"Salida: {e.stdout}")
    print(f"Errores: {e.stderr}")
except Exception as e:
    print(f"\n❌ Error inesperado: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)











