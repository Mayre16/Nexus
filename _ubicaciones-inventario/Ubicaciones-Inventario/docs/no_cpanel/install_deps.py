"""
Script temporal para instalar dependencias en CPanel
Ejecutar desde la interfaz de Python App: Execute python script
"""
import subprocess
import sys
import os

print("="*60)
print("Instalador de Dependencias para WMS")
print("="*60)
print()

dependencias = [
    'Flask>=3.0.0',
    'Flask-SQLAlchemy>=3.1.0',
    'requests>=2.31.0',
    'bcrypt>=4.0.0',
    'Werkzeug>=3.0.0'
]

instaladas = []
errores = []

for dep in dependencias:
    nombre = dep.split('>=')[0] if '>=' in dep else dep.split('==')[0]
    print(f"Instalando {dep}...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", dep],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        instaladas.append(nombre)
        print(f"  ✓ {nombre} instalado correctamente")
    except Exception as e:
        errores.append(nombre)
        print(f"  ✗ Error instalando {nombre}: {str(e)}")
    print()

print("="*60)
print("RESUMEN:")
print("="*60)
print(f"Módulos instalados: {len(instaladas)}/{len(dependencias)}")
if instaladas:
    print("✓ Instalados:", ", ".join(instaladas))
if errores:
    print("✗ Con errores:", ", ".join(errores))

print()
print("="*60)
if len(errores) == 0:
    print("¡TODAS LAS DEPENDENCIAS INSTALADAS EXITOSAMENTE!")
else:
    print("ALGUNAS DEPENDENCIAS NO SE PUDIERON INSTALAR")
    print("Revisa los errores arriba o contacta soporte")
print("="*60)


