#!/usr/bin/env python3
"""
Genera ZIP para subir a cPanel.

  python scripts/crear_zip_cpanel.py           → solo lo esencial para la app web (sin carpeta scripts/)
  python scripts/crear_zip_cpanel.py --full    → casi todo el repo (incluye scripts/; sin venv/.env)

El modo mínimo no incluye scripts/: en producción puedes mantener la carpeta que ya tengas en el servidor sin subirla en cada despliegue.
No incluye: .env, venv, __pycache__, docs/, logs/, tmp/, revision-del-user/, otros .zip.
"""
from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- Modo mínimo (producción): solo lo que necesita la app web ---
MINIMAL_TOP_FILES = frozenset({
    "app_wms.py",
    "config.py",
    "requirements.txt",
    # passenger_wsgi.py NO se incluye: es específico del servidor y no debe
    # sobreescribirse con cada despliegue (tiene rutas absolutas del hosting).
    ".htaccess",
    ".env.example",
})
MINIMAL_DIRS = frozenset({"routes", "api", "database", "utils", "static", "templates"})

EXCLUDE_DIR_NAMES = frozenset(
    {
        ".venv",
        "venv",
        "env",
        "__pycache__",
        ".git",
        ".cursor",
        "node_modules",
        "revision-del-user",
        "logs",
        "tmp",
        "docs",
        "backups",
        "uploads",
        "dist",
        "build",
    }
)
EXCLUDE_FILE_NAMES = frozenset({".env", "wms.db"})
SKIP_TOP_FULL = frozenset({"Logs-auto-sync"})


def skip_common(path: Path, root: Path, zip_out: Path) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return True
    parts = rel.parts
    for p in parts:
        if p in EXCLUDE_DIR_NAMES:
            return True
    if path.is_file():
        if path.name in EXCLUDE_FILE_NAMES:
            return True
        if path.suffix in {".pyc", ".pyo"}:
            return True
        if path.suffix in {".zip", ".db", ".sqlite", ".sqlite3"}:
            return True
        if path.name.endswith(".log"):
            return True
        # backups tipo wms.db.bak_* o *.bak
        if ".bak" in path.name or path.suffix == ".bak":
            return True
        if path.resolve() == zip_out.resolve():
            return True
    return False


def include_minimal(rel: Path) -> bool:
    if not rel.parts:
        return False
    top = rel.parts[0]
    if len(rel.parts) == 1:
        return top in MINIMAL_TOP_FILES
    return top in MINIMAL_DIRS


def build_zip(
    zip_path: Path,
    *,
    minimal: bool,
) -> tuple[int, Path]:
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in ROOT.rglob("*"):
            if skip_common(p, ROOT, zip_path):
                continue
            try:
                rel = p.relative_to(ROOT)
            except ValueError:
                continue
            if minimal:
                if not include_minimal(rel):
                    continue
            else:
                if rel.parts and rel.parts[0] in SKIP_TOP_FULL:
                    continue
            if p.is_file():
                zf.write(p, rel)
                count += 1
    return count, zip_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Empaquetar proyecto para cPanel")
    ap.add_argument(
        "--full",
        action="store_true",
        help="Incluye scripts/ y más archivos de raíz; sigue excluyendo .env, venv, docs/, logs/",
    )
    args = ap.parse_args()

    minimal = not args.full
    if minimal:
        zip_path = ROOT / "Ubicaciones-Inventario-produccion.zip"
        label = "MÍNIMO (producción)"
    else:
        zip_path = ROOT / "Ubicaciones-Inventario-cpanel.zip"
        label = "COMPLETO (--full)"

    count, path = build_zip(zip_path, minimal=minimal)
    mb = path.stat().st_size / 1024 / 1024
    print(f"Modo: {label}")
    print(f"OK: {path}")
    print(f"Archivos: {count}")
    print(f"Tamaño: {mb:.2f} MB")


if __name__ == "__main__":
    main()
