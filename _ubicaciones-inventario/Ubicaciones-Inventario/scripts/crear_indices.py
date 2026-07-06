"""
Script temporal para crear índices en SQLite después del despliegue
Ejecutar una sola vez después de desplegar los cambios
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app_wms import app
from database import db
from sqlalchemy import text

with app.app_context():
    try:
        # Índices para StockProductoADM
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_stock_producto_run 
            ON stock_productos_adm(producto_id, location_id, sync_run_id);
        """))
        print("[OK] Indice idx_stock_producto_run creado")
        
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_stock_run_id 
            ON stock_productos_adm(sync_run_id);
        """))
        print("[OK] Indice idx_stock_run_id creado")
        
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_stock_location_run 
            ON stock_productos_adm(location_id, sync_run_id);
        """))
        print("[OK] Indice idx_stock_location_run creado")
        
        # Índices para EnRevision
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_en_revision_location 
            ON en_revision(location_id, estado, severidad);
        """))
        print("[OK] Indice idx_en_revision_location creado")
        
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_en_revision_sku 
            ON en_revision(sku);
        """))
        print("[OK] Indice idx_en_revision_sku creado")
        
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_en_revision_fecha 
            ON en_revision(fecha_deteccion DESC);
        """))
        print("[OK] Indice idx_en_revision_fecha creado")
        
        # Índices para SyncRun
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_run_location_status 
            ON sync_runs(location_id, status, started_at DESC);
        """))
        print("[OK] Indice idx_sync_run_location_status creado")
        
        db.session.commit()
        print("\n[OK] Todos los indices creados exitosamente")
        
    except Exception as e:
        db.session.rollback()
        print(f"Error al crear indices: {e}")
        import traceback
        traceback.print_exc()

