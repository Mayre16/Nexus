"""
Diagnóstico: Ajuste CT-5 sin ubicación física (TIENDA)

Verifica en la base de datos:
1. Si existe la ubicación física "TIENDA" (y cómo está guardada)
2. Si hay stock en StockUbicacion para el producto CT-5

Ejecutar desde cPanel: Execute python script → scripts/diagnostico_ajuste_ct5_tienda.py
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
from database.models import UbicacionFisica, StockUbicacion
from sqlalchemy import text

SKU_BUSCAR = "CT-5"
PRODUCT_ID_BUSCAR = "76ad64dc-7e8f-4759-4e54-08dd1ac8414f"
UBICACION_BUSCAR = "TIENDA"


def run():
    with app.app_context():
        print("=" * 60)
        print("DIAGNOSTICO: Ajuste CT-5 / Ubicación TIENDA")
        print("=" * 60)

        # 1. Ubicaciones físicas que coincidan con "TIENDA" (cualquier case)
        print("\n[1] Ubicaciones físicas con codigo similar a 'TIENDA':")
        try:
            ubicaciones = UbicacionFisica.query.filter(
                UbicacionFisica.codigo.ilike(f"%{UBICACION_BUSCAR}%")
            ).all()
            if not ubicaciones:
                print("    NINGUNA encontrada. TIENDA no existe en ubicaciones_fisicas.")
                print("    -> Solución: Crear la ubicación 'TIENDA' en el panel Admin > Ubicaciones Físicas")
            else:
                for u in ubicaciones:
                    print(f"    - id={u.id}, codigo='{u.codigo}' (repr: {repr(u.codigo)}), activa={u.activa}")
                # Check exact match
                exacta = UbicacionFisica.query.filter_by(codigo=UBICACION_BUSCAR, activa=True).first()
                if not exacta:
                    print(f"\n    ADVERTENCIA: No hay registro exacto con codigo='{UBICACION_BUSCAR}' y activa=True")
                    print("    El backend busca codigo='TIENDA' exacto. Si está guardado como 'Tienda', puede fallar.")
        except Exception as e:
            print(f"    Error: {e}")

        # 2. Stock en ubicaciones físicas para CT-5
        print("\n[2] Stock por ubicación para producto CT-5:")
        try:
            stocks = StockUbicacion.query.filter(
                (StockUbicacion.sku == SKU_BUSCAR) |
                (StockUbicacion.sku.ilike(SKU_BUSCAR)) |
                (StockUbicacion.product_id == PRODUCT_ID_BUSCAR)
            ).all()
            if not stocks:
                print("    NINGUN registro. El producto no tiene stock en ubicaciones físicas.")
                print("    -> Esto confirma que el ajuste NO está creando StockUbicacion.")
            else:
                for s in stocks:
                    print(f"    - ubicacion='{s.ubicacion}', cantidad={s.cantidad}, sku='{s.sku}', product_id='{s.product_id}'")
        except Exception as e:
            print(f"    Error: {e}")

        print("\n" + "=" * 60)
        print("Resumen: Si [1] no muestra TIENDA exacta o [2] está vacío,")
        print("el ajuste no puede crear stock. Crear/activar TIENDA en ubicaciones_fisicas.")
        print("=" * 60)


if __name__ == '__main__':
    run()
