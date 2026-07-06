"""
Script para migrar/crear las nuevas tablas sin perder datos existentes
Ejecutar desde raíz: python scripts/migrar_tablas_nuevas.py
"""
import os
import sys

# Añadir raíz del proyecto al path para que encuentre app_wms
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import TransferenciaProcesada, MapeoUbicacionADM_WMS, RecepcionProcesada

def migrar_tablas():
    """Crea las nuevas tablas sin afectar las existentes"""
    with app.app_context():
        try:
            print("[*] Creando nuevas tablas...")
            
            # Crear solo las nuevas tablas
            TransferenciaProcesada.__table__.create(db.engine, checkfirst=True)
            print("[OK] Tabla 'transferencias_procesadas' creada/verificada")
            
            RecepcionProcesada.__table__.create(db.engine, checkfirst=True)
            print("[OK] Tabla 'recepciones_procesadas' creada/verificada")
            
            MapeoUbicacionADM_WMS.__table__.create(db.engine, checkfirst=True)
            print("[OK] Tabla 'mapeo_ubicaciones_adm_wms' creada/verificada")
            
            # Agregar columnas nuevas a FacturaProcesada si no existen
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)
            columns = [col['name'] for col in inspector.get_columns('facturas_procesadas')]
            
            if 'location_id' not in columns:
                print("[*] Agregando columna 'location_id' a facturas_procesadas...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_id VARCHAR(100)"))
                print("[OK] Columna 'location_id' agregada")
            
            if 'location_name' not in columns:
                print("[*] Agregando columna 'location_name' a facturas_procesadas...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_name VARCHAR(200)"))
                print("[OK] Columna 'location_name' agregada")
            
            # Crear índice en location_id si no existe (MySQL no soporta CREATE INDEX IF NOT EXISTS)
            indexes = [idx['name'] for idx in inspector.get_indexes('facturas_procesadas')]
            if 'ix_facturas_procesadas_location_id' not in indexes:
                try:
                    db.session.execute(text("CREATE INDEX ix_facturas_procesadas_location_id ON facturas_procesadas(location_id)"))
                    print("[OK] Indice en location_id creado")
                except Exception as e:
                    print(f"[INFO] Indice location_id: {e}")
            else:
                print("[OK] Indice en location_id ya existe")
            
            db.session.commit()
            
            print("\n[OK] Migracion completada exitosamente!")
            print("\nNuevas tablas creadas:")
            print("  - transferencias_procesadas")
            print("  - mapeo_ubicaciones_adm_wms")
            print("\nNuevas columnas en facturas_procesadas:")
            print("  - location_id")
            print("  - location_name")
            
        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error durante la migracion: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == '__main__':
    migrar_tablas()




