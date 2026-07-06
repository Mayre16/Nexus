"""
Script para limpiar registros legacy (sin sync_run_id) antes de la primera sincronización
Ejecutar UNA SOLA VEZ antes de sincronizar
"""
from app_wms import app
from database import db
from sqlalchemy import text

with app.app_context():
    try:
        print("🔍 Verificando registros legacy (sin sync_run_id)...\n")
        
        # Contar registros sin sync_run_id
        resultado = db.session.execute(text("""
            SELECT COUNT(*) as total 
            FROM stock_productos_adm 
            WHERE sync_run_id IS NULL;
        """))
        total_legacy = resultado.fetchone()[0]
        
        print(f"📊 Encontrados {total_legacy} registros legacy (sin sync_run_id)\n")
        
        if total_legacy == 0:
            print("✅ No hay registros legacy. Todo está listo.")
        else:
            print("⚠️  Se encontraron registros legacy.")
            print("💡 Opciones:")
            print("   1. Eliminar todos los registros legacy (recomendado si es la primera sync)")
            print("   2. Asignar un run_id temporal a los registros legacy")
            print("\n🔧 Eliminando registros legacy...")
            
            # Eliminar registros sin sync_run_id
            db.session.execute(text("""
                DELETE FROM stock_productos_adm 
                WHERE sync_run_id IS NULL;
            """))
            
            eliminados = db.session.execute(text("SELECT changes();")).fetchone()[0]
            db.session.commit()
            
            print(f"✅ Eliminados {eliminados} registros legacy")
            print("\n📝 Ahora puedes sincronizar sin problemas.")
            print("   Los registros se crearán con sync_run_id correcto durante la sincronización.")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()



