"""
Script de migración para agregar columnas nuevas a tablas existentes en SQLite
Ejecutar ANTES de crear_indices.py.

Si stock_productos_adm aún tiene UNIQUE(producto_id, location_id) (SQLite antiguo),
tras migrar_tablas ejecuta también: python scripts/migrar_unique_stock_sqlite.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app_wms import app
from database import db
from sqlalchemy import text, inspect

def columna_existe(tabla, columna):
    """Verifica si una columna existe en una tabla"""
    inspector = inspect(db.engine)
    columnas = [col['name'] for col in inspector.get_columns(tabla)]
    return columna in columnas

with app.app_context():
    try:
        print("🔍 Verificando estructura de tablas...\n")
        
        # 1. Agregar sync_run_id a stock_productos_adm
        if not columna_existe('stock_productos_adm', 'sync_run_id'):
            print("➕ Agregando columna sync_run_id a stock_productos_adm...")
            db.session.execute(text("""
                ALTER TABLE stock_productos_adm 
                ADD COLUMN sync_run_id INTEGER;
            """))
            print("✓ Columna sync_run_id agregada a stock_productos_adm")
        else:
            print("✓ Columna sync_run_id ya existe en stock_productos_adm")
        
        # 2. Agregar current_run_id a sync_locations_status
        if not columna_existe('sync_locations_status', 'current_run_id'):
            print("➕ Agregando columna current_run_id a sync_locations_status...")
            db.session.execute(text("""
                ALTER TABLE sync_locations_status 
                ADD COLUMN current_run_id INTEGER;
            """))
            print("✓ Columna current_run_id agregada a sync_locations_status")
        else:
            print("✓ Columna current_run_id ya existe en sync_locations_status")
        
        # 3. Agregar running_run_id a sync_locations_status
        if not columna_existe('sync_locations_status', 'running_run_id'):
            print("➕ Agregando columna running_run_id a sync_locations_status...")
            db.session.execute(text("""
                ALTER TABLE sync_locations_status 
                ADD COLUMN running_run_id INTEGER;
            """))
            print("✓ Columna running_run_id agregada a sync_locations_status")
        else:
            print("✓ Columna running_run_id ya existe en sync_locations_status")
        
        # 4. Actualizar el estado 'partial' en el enum de status (si es necesario)
        # SQLite no tiene enums reales, así que esto no es necesario
        
        db.session.commit()
        print("\n✅ Migración de columnas completada exitosamente")
        print("\n📝 Ahora puedes ejecutar crear_indices.py para crear los índices")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error en migración: {e}")
        import traceback
        traceback.print_exc()



