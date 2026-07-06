"""
Script para verificar el estado de la sincronización en la base de datos
Ejecutar desde cPanel: Execute python script -> verificar_bd_sync.py
"""
from app_wms import app
from database import db
from database.models import SyncRun, SyncLocationStatus, StockProductoADM, EnRevision
from sqlalchemy import func, text
from datetime import datetime

def formatear_fecha(dt):
    """Formatea datetime para mostrar"""
    if dt:
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return "N/A"

def verificar_ubicacion(location_id=None):
    """Verifica el estado de sincronización de una ubicación específica o todas"""
    with app.app_context():
        print("=" * 80)
        print("🔍 VERIFICACIÓN DE SINCRONIZACIÓN - BASE DE DATOS")
        print("=" * 80)
        print()
        
        # Obtener ubicaciones
        if location_id:
            estados = SyncLocationStatus.query.filter_by(location_id=location_id).all()
        else:
            estados = SyncLocationStatus.query.order_by(SyncLocationStatus.location_name).all()
        
        if not estados:
            print("❌ No se encontraron ubicaciones en sync_locations_status")
            return
        
        for estado in estados:
            print(f"\n📍 UBICACIÓN: {estado.location_name}")
            print(f"   ID: {estado.location_id}")
            print(f"   Estado: {estado.status}")
            print(f"   Current Run ID: {estado.current_run_id}")
            print(f"   Running Run ID: {estado.running_run_id}")
            print(f"   Última Sync: {formatear_fecha(estado.last_sync_at)}")
            print()
            
            # Verificar SyncRun más reciente
            if estado.current_run_id:
                run_actual = SyncRun.query.get(estado.current_run_id)
                if run_actual:
                    print(f"   ✅ RUN ACTUAL (LIVE):")
                    print(f"      Run ID: {run_actual.run_id}")
                    print(f"      Status: {run_actual.status}")
                    print(f"      Inicio: {formatear_fecha(run_actual.started_at)}")
                    print(f"      Fin: {formatear_fecha(run_actual.finished_at)}")
                    print(f"      Items procesados: {run_actual.total_items_processed}")
                    print(f"      Items ADM: {run_actual.total_items_adm}")
                    print(f"      Sync completa: {'Sí' if run_actual.is_full_sync else 'No'}")
                    if run_actual.error_message:
                        print(f"      ⚠️  Error: {run_actual.error_message}")
                    print()
                    
                    # Contar registros de stock con este run_id
                    total_stock = StockProductoADM.query.filter_by(
                        location_id=estado.location_id,
                        sync_run_id=run_actual.run_id
                    ).count()
                    
                    stock_con_stock = StockProductoADM.query.filter(
                        StockProductoADM.location_id == estado.location_id,
                        StockProductoADM.sync_run_id == run_actual.run_id,
                        StockProductoADM.stock > 0
                    ).count()
                    
                    stock_cero = total_stock - stock_con_stock
                    
                    print(f"   📊 REGISTROS DE STOCK (LIVE):")
                    print(f"      Total: {total_stock}")
                    print(f"      Con stock > 0: {stock_con_stock}")
                    print(f"      Con stock = 0: {stock_cero}")
                    print()
                else:
                    print(f"   ⚠️  Run ID {estado.current_run_id} no encontrado en sync_runs")
                    print()
            else:
                print(f"   ⚠️  No hay current_run_id configurado")
                print()
            
            # Verificar runs anteriores (OLD)
            runs_anteriores = SyncRun.query.filter(
                SyncRun.location_id == estado.location_id,
                SyncRun.run_id != estado.current_run_id
            ).order_by(SyncRun.started_at.desc()).limit(3).all()
            
            if runs_anteriores:
                print(f"   📜 RUNS ANTERIORES (OLD): {len(runs_anteriores)}")
                for run in runs_anteriores:
                    print(f"      - Run {run.run_id}: {run.status} ({formatear_fecha(run.started_at)})")
                print()
            
            # Verificar discrepancias
            if estado.current_run_id:
                discrepancias = EnRevision.query.filter_by(
                    location_id=estado.location_id,
                    run_detectado=estado.current_run_id
                ).all()
                
                if discrepancias:
                    print(f"   ⚠️  DISCREPANCIAS DETECTADAS: {len(discrepancias)}")
                    por_severidad = {}
                    for d in discrepancias:
                        por_severidad[d.severidad] = por_severidad.get(d.severidad, 0) + 1
                    
                    for sev, count in por_severidad.items():
                        print(f"      {sev.upper()}: {count}")
                    print()
                else:
                    print(f"   ✅ Sin discrepancias detectadas")
                    print()
            
            # Verificar registros legacy (sin sync_run_id)
            legacy_count = StockProductoADM.query.filter(
                StockProductoADM.location_id == estado.location_id,
                StockProductoADM.sync_run_id.is_(None)
            ).count()
            
            if legacy_count > 0:
                print(f"   ⚠️  REGISTROS LEGACY (sin sync_run_id): {legacy_count}")
                print()
            else:
                print(f"   ✅ Sin registros legacy")
                print()
            
            print("-" * 80)
        
        # Resumen general
        print("\n" + "=" * 80)
        print("📊 RESUMEN GENERAL")
        print("=" * 80)
        
        total_runs = SyncRun.query.count()
        runs_done = SyncRun.query.filter_by(status='done').count()
        runs_failed = SyncRun.query.filter_by(status='failed').count()
        runs_running = SyncRun.query.filter_by(status='running').count()
        
        print(f"Total de SyncRuns: {total_runs}")
        print(f"  ✅ Completados (done): {runs_done}")
        print(f"  ❌ Fallidos (failed): {runs_failed}")
        print(f"  🔄 En curso (running): {runs_running}")
        print()
        
        total_discrepancias = EnRevision.query.filter_by(estado='pendiente').count()
        print(f"Discrepancias pendientes: {total_discrepancias}")
        print()
        
        total_stock_records = StockProductoADM.query.count()
        stock_con_run_id = StockProductoADM.query.filter(
            StockProductoADM.sync_run_id.isnot(None)
        ).count()
        stock_sin_run_id = total_stock_records - stock_con_run_id
        
        print(f"Total registros StockProductoADM: {total_stock_records}")
        print(f"  Con sync_run_id: {stock_con_run_id}")
        print(f"  Sin sync_run_id (legacy): {stock_sin_run_id}")
        print()
        print("=" * 80)

if __name__ == "__main__":
    import sys
    
    # Si se pasa un location_id como argumento, verificar solo esa ubicación
    location_id = None
    if len(sys.argv) > 1:
        location_id = sys.argv[1]
        print(f"🔍 Verificando ubicación específica: {location_id}\n")
    
    verificar_ubicacion(location_id)

