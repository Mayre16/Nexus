"""
Script para verificar qué dependencias están instaladas
Ejecutar desde la interfaz de Python App: Execute python script
"""
print("="*60)
print("Verificación de Dependencias")
print("="*60)
print()

modulos = {
    'Flask': 'flask',
    'Flask-SQLAlchemy': 'flask_sqlalchemy',
    'requests': 'requests',
    'bcrypt': 'bcrypt',
    'Werkzeug': 'werkzeug'
}

instalados = []
faltantes = []

for nombre_modulo, import_name in modulos.items():
    try:
        __import__(import_name)
        instalados.append(nombre_modulo)
        print(f"✓ {nombre_modulo}: INSTALADO")
    except ImportError:
        faltantes.append(nombre_modulo)
        print(f"✗ {nombre_modulo}: NO INSTALADO")
    except Exception as e:
        faltantes.append(nombre_modulo)
        print(f"✗ {nombre_modulo}: ERROR - {str(e)}")

print()
print("="*60)
print("RESUMEN:")
print("="*60)
print(f"Instalados: {len(instalados)}/{len(modulos)}")
print(f"Faltantes: {len(faltantes)}/{len(modulos)}")

if len(faltantes) == 0:
    print("\n✓ TODAS LAS DEPENDENCIAS ESTÁN INSTALADAS")
else:
    print(f"\n⚠ FALTAN {len(faltantes)} MÓDULOS:")
    for mod in faltantes:
        print(f"  - {mod}")
    print("\nEjecuta install_deps.py para instalarlos")

print("="*60)


