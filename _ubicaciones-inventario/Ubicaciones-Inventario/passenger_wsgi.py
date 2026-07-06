"""
Archivo WSGI para CPanel (Passenger)
Este archivo permite ejecutar la aplicación Flask en CPanel
"""
import sys
import os

# Obtener el directorio del proyecto de forma absoluta
project_dir = os.path.dirname(os.path.abspath(__file__))

# Buscar el virtualenv probando las rutas posibles de cPanel
_venv_candidates = [
    '/home/adesa/virtualenv/wms.adesa.com.do/3.11',
    '/home2/adesa/virtualenv/wms.adesa.com.do/3.11',
]
venv_path = next((p for p in _venv_candidates if os.path.exists(p)), None)

if venv_path:
    # Agregar el sitio-packages del entorno virtual al path
    site_packages = os.path.join(venv_path, 'lib', 'python3.11', 'site-packages')
    if os.path.exists(site_packages) and site_packages not in sys.path:
        sys.path.insert(0, site_packages)
    # Agregar el bin del entorno virtual al path (por si acaso)
    venv_bin = os.path.join(venv_path, 'bin')
    if os.path.exists(venv_bin) and venv_bin not in sys.path:
        sys.path.insert(0, venv_bin)

# Agregar el directorio del proyecto al path
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

# Cambiar al directorio del proyecto (importante para rutas relativas)
os.chdir(project_dir)

# Importar la aplicación Flask
# Passenger espera que la variable se llame 'application'
try:
    from app_wms import app
    application = app
    
    # Verificar que la aplicación se importó correctamente
    if application is None:
        raise ValueError("La aplicacion Flask no se importo correctamente")
    
    # Verificar que la aplicación se importó correctamente
    # (logging básico para diagnóstico si es necesario)
except Exception as e:
    # Escribir el error a stderr para que aparezca en los logs
    import traceback
    print(f"ERROR en passenger_wsgi.py: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.stderr.flush()
    raise

