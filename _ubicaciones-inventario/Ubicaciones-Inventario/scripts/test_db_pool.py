"""
Script de prueba del pool de conexiones MySQL (cPanel + Passenger).

Ejecuta 30-50 queries SELECT 1 seguidas para detectar errores intermitentes:
- Packet sequence number wrong
- Command Out of Sync
- Lost connection to MySQL server

Uso en cPanel: Execute python script → scripts/test_db_pool.py

Criterio de éxito: Todas las queries completan sin error.
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
from sqlalchemy import text

NUM_QUERIES = 50


def run():
    with app.app_context():
        print("=" * 60)
        print("TEST DB POOL - WMS (cPanel/Passenger)")
        print("=" * 60)
        print(f"Ejecutando {NUM_QUERIES} queries SELECT 1...")
        print()

        ok = 0
        fail = 0
        errors = []

        for i in range(NUM_QUERIES):
            try:
                # Consumir resultado para evitar "Command Out of Sync"
                result = db.session.execute(text("SELECT 1")).scalar()
                if result == 1:
                    ok += 1
                else:
                    fail += 1
                    errors.append((i + 1, f"Valor inesperado: {result}"))
            except Exception as e:
                fail += 1
                errors.append((i + 1, str(e)))
                # Opcional: reconectar y continuar
                try:
                    db.session.rollback()
                    db.session.close()
                except Exception:
                    pass

        print(f"OK: {ok}/{NUM_QUERIES}")
        print(f"Fallos: {fail}/{NUM_QUERIES}")
        if errors:
            print()
            print("Errores detectados:")
            for qnum, msg in errors[:10]:  # Primeros 10
                print(f"  Query #{qnum}: {msg[:80]}...")
            if len(errors) > 10:
                print(f"  ... y {len(errors) - 10} más")
        else:
            print()
            print("Todas las queries completaron correctamente.")

        print("=" * 60)


if __name__ == "__main__":
    run()
