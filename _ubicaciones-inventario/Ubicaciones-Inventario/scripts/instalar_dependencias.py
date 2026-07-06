#!/usr/bin/env python3
"""
Instala los paquetes de requirements.txt en el virtualenv activo.
Ejecutar desde cPanel "Execute python script":
  scripts/instalar_dependencias.py
"""
import subprocess
import sys
import os

# cPanel puede ejecutar el script desde distintos directorios de trabajo.
# Buscamos requirements.txt probando rutas conocidas.
_CANDIDATES = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "requirements.txt"),
    os.path.join(os.getcwd(), "requirements.txt"),
    "/home/adesa/wms.adesa.com.do/requirements.txt",
]
REQ_FILE = next((p for p in _CANDIDATES if os.path.isfile(p)), _CANDIDATES[0])

print(f"Python: {sys.executable}")
print(f"requirements.txt: {REQ_FILE}")
print()

result = subprocess.run(
    [sys.executable, "-m", "pip", "install", "-r", REQ_FILE],
    capture_output=True,
    text=True,
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr[:2000])

if result.returncode == 0:
    print("\nOK: dependencias instaladas correctamente.")
else:
    print(f"\nERROR: returncode={result.returncode}")

sys.exit(result.returncode)
