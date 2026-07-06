"""
Script para verificar el estado de la migración
Ejecutar: python verificar_migracion.py
"""
import sqlite3
import os

db_path = 'database/wms.db'

if not os.path.exists(db_path):
    print("[ERROR] Base de datos no encontrada en:", db_path)
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=" * 60)
print("VERIFICACION DE MIGRACION")
print("=" * 60)

# Verificar tablas nuevas
print("\n[1] Verificando tablas nuevas...")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('transferencias_procesadas', 'mapeo_ubicaciones_adm_wms')")
tablas_nuevas = cursor.fetchall()
tablas_encontradas = [t[0] for t in tablas_nuevas]

if 'transferencias_procesadas' in tablas_encontradas:
    print("[OK] Tabla 'transferencias_procesadas' existe")
else:
    print("[FALTA] Tabla 'transferencias_procesadas' NO existe")

if 'mapeo_ubicaciones_adm_wms' in tablas_encontradas:
    print("[OK] Tabla 'mapeo_ubicaciones_adm_wms' existe")
else:
    print("[FALTA] Tabla 'mapeo_ubicaciones_adm_wms' NO existe")

# Verificar columnas nuevas en facturas_procesadas
print("\n[2] Verificando columnas nuevas en facturas_procesadas...")
cursor.execute("PRAGMA table_info(facturas_procesadas)")
columnas = cursor.fetchall()
nombres_columnas = [col[1] for col in columnas]

if 'location_id' in nombres_columnas:
    print("[OK] Columna 'location_id' existe")
else:
    print("[FALTA] Columna 'location_id' NO existe")

if 'location_name' in nombres_columnas:
    print("[OK] Columna 'location_name' existe")
else:
    print("[FALTA] Columna 'location_name' NO existe")

# Resumen
print("\n" + "=" * 60)
print("RESUMEN")
print("=" * 60)

todo_ok = (
    'transferencias_procesadas' in tablas_encontradas and
    'mapeo_ubicaciones_adm_wms' in tablas_encontradas and
    'location_id' in nombres_columnas and
    'location_name' in nombres_columnas
)

if todo_ok:
    print("[OK] Migracion completada correctamente")
    print("\nNo necesitas ejecutar migrar_tablas_nuevas.py")
    print("La base de datos ya tiene todas las tablas y columnas necesarias")
else:
    print("[PENDIENTE] Faltan algunas tablas o columnas")
    print("\nDEBES ejecutar: python migrar_tablas_nuevas.py")

conn.close()




