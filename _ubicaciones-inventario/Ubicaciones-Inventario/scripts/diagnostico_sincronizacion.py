"""
Script de diagnóstico para verificar problemas de sincronización
Ejecutar: python diagnostico_sincronizacion.py
"""
from app_wms import app
from database import db
from database.models import SyncLocationStatus, FacturaProcesada, TransferenciaProcesada, MapeoUbicacionADM_WMS
from sqlalchemy import inspect, text

def diagnosticar():
    """Diagnostica problemas potenciales en la sincronización"""
    with app.app_context():
        print("=" * 60)
        print("DIAGNOSTICO DE SINCRONIZACION")
        print("=" * 60)
        
        # 1. Verificar que las tablas existen
        print("\n[1] Verificando tablas...")
        inspector = inspect(db.engine)
        tablas_existentes = inspector.get_table_names()
        
        tablas_requeridas = [
            'sync_location_status',
            'facturas_procesadas',
            'transferencias_procesadas',
            'mapeo_ubicaciones_adm_wms'
        ]
        
        for tabla in tablas_requeridas:
            if tabla in tablas_existentes:
                print(f"[OK] Tabla '{tabla}' existe")
            else:
                print(f"[ERROR] Tabla '{tabla}' NO existe")
        
        # 2. Verificar columnas de FacturaProcesada
        print("\n[2] Verificando columnas de facturas_procesadas...")
        if 'facturas_procesadas' in tablas_existentes:
            columnas = inspector.get_columns('facturas_procesadas')
            nombres_columnas = [col['name'] for col in columnas]
            
            columnas_requeridas = ['location_id', 'location_name']
            for col in columnas_requeridas:
                if col in nombres_columnas:
                    print(f"[OK] Columna '{col}' existe")
                else:
                    print(f"[ERROR] Columna '{col}' NO existe")
        
        # 3. Verificar que los modelos se pueden importar
        print("\n[3] Verificando modelos...")
        try:
            from database.models import SyncLocationStatus, FacturaProcesada
            print("[OK] Modelos se pueden importar")
        except Exception as e:
            print(f"[ERROR] Error al importar modelos: {e}")
            import traceback
            traceback.print_exc()
        
        # 4. Verificar que se pueden hacer consultas básicas
        print("\n[4] Verificando consultas básicas...")
        try:
            count = SyncLocationStatus.query.count()
            print(f"[OK] SyncLocationStatus: {count} registros")
        except Exception as e:
            print(f"[ERROR] Error al consultar SyncLocationStatus: {e}")
            import traceback
            traceback.print_exc()
        
        try:
            count = FacturaProcesada.query.count()
            print(f"[OK] FacturaProcesada: {count} registros")
        except Exception as e:
            print(f"[ERROR] Error al consultar FacturaProcesada: {e}")
            import traceback
            traceback.print_exc()
        
        # 5. Verificar estructura de FacturaProcesada
        print("\n[5] Verificando estructura de FacturaProcesada...")
        try:
            # Intentar crear una instancia (sin guardar)
            factura_test = FacturaProcesada(
                factura_docid="TEST",
                factura_guid="test-guid",
                tipo_factura="TEST",
                cliente="Test",
                estado_despacho='PENDIENTE',
                location_id=None,  # Permitir None
                location_name=None  # Permitir None
            )
            print("[OK] Se puede crear instancia de FacturaProcesada")
        except Exception as e:
            print(f"[ERROR] Error al crear instancia de FacturaProcesada: {e}")
            import traceback
            traceback.print_exc()
        
        # 6. Verificar que db.create_all() funciona
        print("\n[6] Verificando db.create_all()...")
        try:
            db.create_all()
            print("[OK] db.create_all() ejecutado sin errores")
        except Exception as e:
            print(f"[ERROR] Error en db.create_all(): {e}")
            import traceback
            traceback.print_exc()
        
        print("\n" + "=" * 60)
        print("DIAGNOSTICO COMPLETADO")
        print("=" * 60)

if __name__ == '__main__':
    diagnosticar()




