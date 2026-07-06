"""
Script para corregir problemas de sincronización
Ejecutar en cPanel: python corregir_sincronizacion.py
"""
from app_wms import app
from database import db
from database.models import SyncLocationStatus, FacturaProcesada, TransferenciaProcesada, MapeoUbicacionADM_WMS
from sqlalchemy import inspect, text

def corregir():
    """Corrige problemas comunes de sincronización"""
    with app.app_context():
        print("=" * 60)
        print("CORRECCION DE SINCRONIZACION")
        print("=" * 60)
        
        # 1. Crear todas las tablas
        print("\n[1] Creando/verificando tablas...")
        try:
            db.create_all()
            print("[OK] Tablas creadas/verificadas")
        except Exception as e:
            print(f"[ERROR] Error al crear tablas: {e}")
            import traceback
            traceback.print_exc()
            return
        
        # 2. Verificar y agregar columnas faltantes en facturas_procesadas
        print("\n[2] Verificando columnas de facturas_procesadas...")
        inspector = inspect(db.engine)
        try:
            columnas = inspector.get_columns('facturas_procesadas')
            nombres_columnas = [col['name'] for col in columnas]
            
            if 'location_id' not in nombres_columnas:
                print("[*] Agregando columna 'location_id'...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_id VARCHAR(100)"))
                print("[OK] Columna 'location_id' agregada")
            
            if 'location_name' not in nombres_columnas:
                print("[*] Agregando columna 'location_name'...")
                db.session.execute(text("ALTER TABLE facturas_procesadas ADD COLUMN location_name VARCHAR(200)"))
                print("[OK] Columna 'location_name' agregada")
            
            db.session.commit()
            print("[OK] Columnas verificadas")
        except Exception as e:
            print(f"[ERROR] Error al verificar columnas: {e}")
            db.session.rollback()
            import traceback
            traceback.print_exc()
        
        # 3. Verificar que sync_locations_status existe
        print("\n[3] Verificando tabla sync_locations_status...")
        tablas = inspector.get_table_names()
        if 'sync_locations_status' in tablas:
            print("[OK] Tabla 'sync_locations_status' existe")
        else:
            print("[ERROR] Tabla 'sync_locations_status' NO existe")
            print("[*] Intentando crear...")
            try:
                SyncLocationStatus.__table__.create(db.engine, checkfirst=True)
                print("[OK] Tabla 'sync_locations_status' creada")
            except Exception as e:
                print(f"[ERROR] No se pudo crear: {e}")
                import traceback
                traceback.print_exc()
        
        # 4. Verificar otras tablas nuevas
        print("\n[4] Verificando tablas nuevas...")
        tablas_requeridas = ['transferencias_procesadas', 'mapeo_ubicaciones_adm_wms']
        for tabla in tablas_requeridas:
            if tabla in tablas:
                print(f"[OK] Tabla '{tabla}' existe")
            else:
                print(f"[*] Creando tabla '{tabla}'...")
                try:
                    if tabla == 'transferencias_procesadas':
                        TransferenciaProcesada.__table__.create(db.engine, checkfirst=True)
                    elif tabla == 'mapeo_ubicaciones_adm_wms':
                        MapeoUbicacionADM_WMS.__table__.create(db.engine, checkfirst=True)
                    print(f"[OK] Tabla '{tabla}' creada")
                except Exception as e:
                    print(f"[ERROR] No se pudo crear '{tabla}': {e}")
        
        print("\n" + "=" * 60)
        print("CORRECCION COMPLETADA")
        print("=" * 60)
        print("\nAhora intenta sincronizar una ubicacion de nuevo.")

if __name__ == '__main__':
    corregir()




