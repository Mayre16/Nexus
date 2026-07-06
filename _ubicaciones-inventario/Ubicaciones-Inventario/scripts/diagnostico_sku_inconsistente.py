"""
Diagnóstico: Productos con SKU inconsistente entre StockUbicacion y ProductoADM

Busca registros en stock_por_ubicacion donde el sku no coincide exactamente
con el sku del producto en productos_adm ( mismo product_id ).

Ejecutar desde cPanel: Execute python script → scripts/diagnostico_sku_inconsistente.py
"""
import sys
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import StockUbicacion, ProductoADM
from sqlalchemy.orm import aliased


def run():
    with app.app_context():
        print("=" * 70)
        print("DIAGNOSTICO: SKU inconsistente (StockUbicacion vs ProductoADM)")
        print("=" * 70)

        # Obtener todos los StockUbicacion con cantidad > 0 (stock real)
        stocks = StockUbicacion.query.filter(StockUbicacion.cantidad > 0).all()
        total_con_stock = len(stocks)

        # Para cada uno, verificar si producto_db.sku != stock.sku
        inconsistentes = []
        for s in stocks:
            prod = ProductoADM.query.filter_by(item_id=s.product_id).first()
            if prod and prod.sku != s.sku:
                inconsistentes.append({
                    "product_id": s.product_id,
                    "sku_stock": s.sku,
                    "sku_producto": prod.sku,
                    "ubicacion": s.ubicacion,
                    "cantidad": float(s.cantidad),
                })

        print(f"\n[1] Total registros con stock > 0 en StockUbicacion: {total_con_stock}")
        print(f"[2] Registros con SKU inconsistente: {len(inconsistentes)}")

        if inconsistentes:
            print("\n[3] Detalle (productos afectados):")
            # Agrupar por product_id para no repetir
            vistos = set()
            for r in inconsistentes:
                key = r["product_id"]
                if key not in vistos:
                    vistos.add(key)
                    print(f"    - product_id={key}")
                    print(f"      ProductoADM.sku='{r['sku_producto']}'")
                    filas = [x for x in inconsistentes if x["product_id"] == key]
                    for f in filas:
                        print(f"      StockUbicacion: ubicacion='{f['ubicacion']}', sku='{f['sku_stock']}', cantidad={f['cantidad']}")
        else:
            print("\n    No se encontraron inconsistencias (o eran solo CT-5).")

        print("\n" + "=" * 70)
        print("Nota: La correccion (usar product_id en lugar de sku) ya aplica")
        print("para todos. Estos productos ahora se mostraran correctamente.")
        print("=" * 70)


if __name__ == '__main__':
    run()
