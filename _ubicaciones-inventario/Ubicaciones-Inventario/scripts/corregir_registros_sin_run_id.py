"""
Script para corregir registros de stock que no tienen sync_run_id
Asigna un sync_run_id temporal o elimina registros huérfanos
"""
from app_wms import app
from database import db
from database.models import StockProductoADM, SyncLocationStatus, SyncRun
from datetime import datetime
from sqlalchemy import func

def corregir_registros_sin_run_id():
    """Corrige registros de stock que no tienen sync_run_id"""
    
    with app.app_context():
        print("=" * 80)
        print("🔧 CORRECCIÓN DE REGISTROS SIN sync_run_id")
        print("=" * 80)
        print()
        
        # Contar registros sin sync_run_id
        total_sin_run_id = StockProductoADM.query.filter(
            StockProductoADM.sync_run_id.is_(None)
        ).count()
        
        print(f"📊 Registros sin sync_run_id encontrados: {total_sin_run_id}")
        print()
        
        if total_sin_run_id == 0:
            print("✅ No hay registros sin sync_run_id. Todo está correcto.")
            return
        
        # Obtener todas las ubicaciones únicas de los registros sin sync_run_id
        print("🔍 Analizando por ubicación...")
        print()
        
        # Obtener ubicaciones desde SyncLocationStatus
        ubicaciones_status = SyncLocationStatus.query.all()
        ubicaciones_procesadas = set()
        
        for ubicacion in ubicaciones_status:
            ubicaciones_procesadas.add(ubicacion.location_id)
            registros_sin_run = StockProductoADM.query.filter(
                StockProductoADM.location_id == ubicacion.location_id,
                StockProductoADM.sync_run_id.is_(None)
            ).count()
            
            if registros_sin_run > 0:
                print(f"📍 {ubicacion.location_name}: {registros_sin_run} registros sin sync_run_id")
                
                # Opción 1: Si hay un current_run_id, asignar esos registros a ese run
                if ubicacion.current_run_id:
                    run_existe = SyncRun.query.get(ubicacion.current_run_id)
                    if run_existe:
                        print(f"   ✅ Asignando registros al run_id {ubicacion.current_run_id}...")
                        StockProductoADM.query.filter(
                            StockProductoADM.location_id == ubicacion.location_id,
                            StockProductoADM.sync_run_id.is_(None)
                        ).update({'sync_run_id': ubicacion.current_run_id})
                        db.session.commit()
                        print(f"   ✅ {registros_sin_run} registros asignados al run {ubicacion.current_run_id}")
                    else:
                        print(f"   ⚠️  Run {ubicacion.current_run_id} no existe, eliminando registros...")
                        eliminados = StockProductoADM.query.filter(
                            StockProductoADM.location_id == ubicacion.location_id,
                            StockProductoADM.sync_run_id.is_(None)
                        ).delete()
                        db.session.commit()
                        print(f"   ✅ {eliminados} registros eliminados")
                else:
                    # Opción 2: Eliminar registros (se recrearán con próxima sync)
                    print(f"   🗑️  Eliminando registros legacy (se recrearán con próxima sincronización)...")
                    
                    eliminados = StockProductoADM.query.filter(
                        StockProductoADM.location_id == ubicacion.location_id,
                        StockProductoADM.sync_run_id.is_(None)
                    ).delete()
                    db.session.commit()
                    print(f"   ✅ {eliminados} registros eliminados")
                print()
        
        # Procesar ubicaciones que NO están en SyncLocationStatus pero tienen registros
        ubicaciones_restantes = db.session.query(
            StockProductoADM.location_id,
            StockProductoADM.location_name,
            func.count(StockProductoADM.id).label('total')
        ).filter(
            StockProductoADM.sync_run_id.is_(None)
        ).group_by(
            StockProductoADM.location_id,
            StockProductoADM.location_name
        ).all()
        
        if ubicaciones_restantes:
            print("📍 Ubicaciones adicionales con registros legacy:")
            print()
            for location_id, location_name, total in ubicaciones_restantes:
                if location_id not in ubicaciones_procesadas:
                    print(f"📍 {location_name or 'Sin nombre'} (ID: {location_id[:30]}...): {total} registros")
                    print(f"   🗑️  Eliminando registros legacy...")
                    
                    eliminados = StockProductoADM.query.filter(
                        StockProductoADM.location_id == location_id,
                        StockProductoADM.sync_run_id.is_(None)
                    ).delete()
                    db.session.commit()
                    print(f"   ✅ {eliminados} registros eliminados")
                    print()
        
        # Si aún quedan registros, eliminarlos todos de una vez
        registros_finales = StockProductoADM.query.filter(
            StockProductoADM.sync_run_id.is_(None)
        ).count()
        
        if registros_finales > 0:
            print(f"⚠️  Aún quedan {registros_finales} registros sin sync_run_id")
            print(f"   🗑️  Eliminando todos los registros restantes...")
            eliminados_finales = StockProductoADM.query.filter(
                StockProductoADM.sync_run_id.is_(None)
            ).delete()
            db.session.commit()
            print(f"   ✅ {eliminados_finales} registros eliminados")
            print()
        
        # Verificar resultado final
        registros_restantes = StockProductoADM.query.filter(
            StockProductoADM.sync_run_id.is_(None)
        ).count()
        
        print("=" * 80)
        if registros_restantes == 0:
            print("✅ CORRECCIÓN COMPLETADA")
            print("   Todos los registros ahora tienen sync_run_id o fueron eliminados")
        else:
            print(f"⚠️  Aún quedan {registros_restantes} registros sin sync_run_id")
        print("=" * 80)
        print()
        print("📝 Próximos pasos:")
        print("   1. Ejecutar una nueva sincronización")
        print("   2. La sincronización creará un nuevo SyncRun")
        print("   3. Los registros se crearán con sync_run_id correcto")
        print()

if __name__ == "__main__":
    try:
        corregir_registros_sin_run_id()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        db.session.rollback()

