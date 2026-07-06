"""
Script para migrar/agregar campos de sincronización por lotes
Ejecutar: python migrar_campos_lotes_sync.py
"""
from app_wms import app
from database import db
from sqlalchemy import inspect, text

def migrar_campos():
    """Agrega los nuevos campos para sincronización por lotes"""
    with app.app_context():
        try:
            print("[*] Verificando campos nuevos en sync_locations_status...")
            
            inspector = inspect(db.engine)
            columns = inspector.get_columns('sync_locations_status')
            nombres_columnas = [col['name'] for col in columns]
            
            if 'total_items' not in nombres_columnas:
                print("[*] Agregando columna 'total_items'...")
                db.session.execute(text("ALTER TABLE sync_locations_status ADD COLUMN total_items INTEGER DEFAULT 0 NOT NULL"))
                print("[OK] Columna 'total_items' agregada")
            
            if 'skip_actual' not in nombres_columnas:
                print("[*] Agregando columna 'skip_actual'...")
                db.session.execute(text("ALTER TABLE sync_locations_status ADD COLUMN skip_actual INTEGER DEFAULT 0 NOT NULL"))
                print("[OK] Columna 'skip_actual' agregada")
            
            if 'lote_actual' not in nombres_columnas:
                print("[*] Agregando columna 'lote_actual'...")
                db.session.execute(text("ALTER TABLE sync_locations_status ADD COLUMN lote_actual INTEGER DEFAULT 0 NOT NULL"))
                print("[OK] Columna 'lote_actual' agregada")
            
            db.session.commit()
            
            print("\n[OK] Migracion completada exitosamente!")
            print("\nNuevas columnas en sync_locations_status:")
            print("  - total_items (total de items encontrados)")
            print("  - skip_actual (skip actual para continuar)")
            print("  - lote_actual (lote actual)")
            
        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error durante la migracion: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == '__main__':
    migrar_campos()




