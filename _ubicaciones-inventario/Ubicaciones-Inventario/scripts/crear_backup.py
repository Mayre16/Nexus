"""
Script para crear respaldo completo antes de cambios grandes
"""
import os
import shutil
from datetime import datetime

# Timestamp para el backup
timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
backup_dir = f'backup_pre_cambios_{timestamp}'

# Archivos y directorios críticos a respaldar
archivos_criticos = [
    'database/models.py',
    'routes/facturas.py',
    'routes/despacho.py',
    'routes/transferencias.py',
    'routes/recepciones.py',
    'api/adm_cloud.py',
    'utils/helpers.py',
    'app_wms.py',
    'templates/transferencias.html',
    'templates/index.html',
    'database/wms.db',  # Base de datos SQLite
]

directorios_criticos = [
    'routes',
    'api',
    'utils',
    'templates',
    'database',
]

print(f"[*] Creando respaldo en: {backup_dir}")
os.makedirs(backup_dir, exist_ok=True)

# Copiar archivos críticos
for archivo in archivos_criticos:
    if os.path.exists(archivo):
        dest_dir = os.path.join(backup_dir, os.path.dirname(archivo))
        os.makedirs(dest_dir, exist_ok=True)
        shutil.copy2(archivo, os.path.join(backup_dir, archivo))
        print(f"[OK] Respaldo: {archivo}")

# Copiar directorios completos
for directorio in directorios_criticos:
    if os.path.exists(directorio):
        dest = os.path.join(backup_dir, directorio)
        if os.path.exists(dest):
            shutil.rmtree(dest)
        shutil.copytree(directorio, dest, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        print(f"[OK] Respaldo directorio: {directorio}")

# Crear archivo de información del backup
info_file = os.path.join(backup_dir, 'INFO_BACKUP.txt')
with open(info_file, 'w', encoding='utf-8') as f:
    f.write(f"""RESPALDO DEL SISTEMA WMS
=====================

Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Timestamp: {timestamp}

ARCHIVOS RESPALDADOS:
{chr(10).join(archivos_criticos)}

DIRECTORIOS RESPALDADOS:
{chr(10).join(directorios_criticos)}

CAMBIOS QUE SE REALIZARÁN:
1. Agregar tabla TransferenciaProcesada
2. Agregar campos location_id y location_name a FacturaProcesada
3. Modificar lógica de despacho para usar ubicación correcta
4. Implementar registro de transferencias
5. Agregar mapeo de ubicaciones ADM → WMS

PARA RESTAURAR:
Ejecutar: python restaurar_backup.py {timestamp}
""")

print(f"\n[OK] Respaldo completado en: {backup_dir}")
print(f"[INFO] Informacion guardada en: {info_file}")

