"""
Genera plantilla Excel para importación masiva de Abastecimiento
incluyendo columna INCLUIDO (SI/NO).
"""
from __future__ import annotations

from pathlib import Path


HEADERS = [
    "Product ID",
    "SKU",
    "Nombre",
    "Stock actual",
    "Mínimo",
    "Máximo",
    "Sugerido",
    "Estado",
    "Prioridad",
    "Incluido",
]


def main() -> int:
    try:
        from openpyxl import Workbook
    except Exception:
        print("[ERROR] openpyxl no está disponible. Instala requirements primero.")
        return 1

    root = Path(__file__).resolve().parent.parent
    out = root / "plantilla_abastecimiento_inclusion_masiva.xlsx"

    wb = Workbook()
    ws = wb.active
    ws.title = "Datos"
    ws.append(HEADERS)

    # Filas de ejemplo (puedes borrarlas). Sugerido/Estado son informativos; al importar se ignoran.
    ws.append(["GUID_PRODUCTO_1", "SKU-001", "Producto ejemplo 1", "", 5, 20, "", "", "SI", "SI"])
    ws.append(["GUID_PRODUCTO_2", "SKU-002", "Producto ejemplo 2", "", 3, 10, "", "", "SI", "NO"])

    ley = wb.create_sheet("Instrucciones")
    ley.append(["Plantilla de importación masiva - Abastecimiento"])
    ley.append([])
    ley.append(["Columnas requeridas:", "Product ID, Mínimo, Máximo"])
    ley.append(["Product ID:", "Item ID (GUID) de ADM. También acepta id local legado."])
    ley.append(["Prioridad:", "SI/NO para activar o desactivar política."])
    ley.append(["Incluido:", "SI/NO para incluir o excluir del universo base de abastecimiento."])
    ley.append(["Sugerido / Estado:", "Opcionales e informativos; el import solo usa Product ID, Mínimo, Máximo, Prioridad e Incluido."])
    ley.append([])
    ley.append(["Sugerencia:", "Descarga primero 'Excel completo' para tener Product ID correctos."])

    wb.save(out)
    print(f"[OK] Plantilla creada: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
