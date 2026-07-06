"""
Script para restaurar desde un backup
Uso: python restaurar_backup.py <timestamp>
Ejemplo: python restaurar_backup.py 2026-01-19_14-30-00
"""
import os
import shutil
import sys

if len(sys.argv) < 2:
    print("[ERROR] Debes proporcionar el timestamp del backup")
    print("Uso: python restaurar_backup.py <timestamp>")
    print("Ejemplo: python restaurar_backup.py 2026-01-19_14-30-00")
    sys.exit(1)

timestamp = sys.argv[1]
backup_dir = f'backup_pre_cambios_{timestamp}'

if not os.path.exists(backup_dir):
    print(f"[ERROR] No se encontro el backup {backup_dir}")
    sys.exit(1)

print(f"[*] Restaurando desde: {backup_dir}")

# Restaurar archivos
archivos_restaurados = 0
for root, dirs, files in os.walk(backup_dir):
    for file in files:
        if file.endswith('.pyc') or file == 'INFO_BACKUP.txt':
            continue
        
        src = os.path.join(root, file)
        # Calcular ruta relativa
        rel_path = os.path.relpath(src, backup_dir)
        dest = rel_path
        
        # Crear directorio destino si no existe
        dest_dir = os.path.dirname(dest)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
        
        # Copiar archivo
        shutil.copy2(src, dest)
        archivos_restaurados += 1
        print(f"[OK] Restaurado: {dest}")

print(f"\n[OK] Restauracion completada: {archivos_restaurados} archivos restaurados")
print("[ADVERTENCIA] IMPORTANTE: Si modificaste la base de datos, es posible que necesites restaurarla manualmente")

