"""
Genera Ubicaciones-Inventario-produccion-minimo.zip solo con lo esencial para arrancar la app
(Passenger/Flask + rutas + plantillas + estáticos + BD models + utils + api + cPanel).

Ejecutar desde la raiz del proyecto:
  python scripts/crear_zip_minimo.py

No incluye: .venv, docs masivos, scripts de desarrollo, SQLite local, etc.
"""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "Ubicaciones-Inventario-produccion-minimo.zip"

SKIP_DIR_NAMES = frozenset({".venv", ".git", "__pycache__", ".cursor", "node_modules"})
SKIP_SUFFIXES = frozenset({".pyc", ".pyo"})


def should_skip_file(rel: Path) -> bool:
    parts = set(rel.parts)
    if "no_cpanel" in parts:
        return True
    name = rel.name.lower()
    if name.endswith(".db") or name.endswith(".db-journal"):
        return True
    if ".db.bak" in name or name.endswith(".bak"):
        return True
    if rel.suffix.lower() in SKIP_SUFFIXES:
        return True
    if OUT.name == rel.name:
        return True
    return False


def add_tree(z: zipfile.ZipFile, base: Path, arc_prefix: str) -> None:
    if not base.is_dir():
        return
    for dirpath, dirnames, filenames in os.walk(base):
        # prune dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES and not d.startswith(".")]
        for fn in filenames:
            fp = Path(dirpath) / fn
            try:
                rel = fp.relative_to(ROOT)
            except ValueError:
                continue
            if should_skip_file(rel):
                continue
            arc = arc_prefix + str(rel).replace("\\", "/")
            z.write(fp, arc)


def main() -> None:
    if OUT.exists():
        OUT.unlink()

    root_files = [
        "app_wms.py",
        "passenger_wsgi.py",
        "config.py",
        "requirements.txt",
        ".htaccess",
    ]
    optional_root = [".env.example"]

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for name in root_files:
            p = ROOT / name
            if p.is_file():
                z.write(p, name.replace("\\", "/"))

        for name in optional_root:
            p = ROOT / name
            if p.is_file():
                z.write(p, name.replace("\\", "/"))

        for folder in ("routes", "templates", "static", "utils", "api", "database"):
            add_tree(z, ROOT / folder, "")

        # Scripts cPanel: post-deploy + diagnóstico Abastecimiento/export
        for script_name in ("cpanel_post_deploy.py", "diagnostico_abastecimiento_cpanel.py"):
            cp = ROOT / "scripts" / script_name
            if cp.is_file():
                z.write(cp, f"scripts/{script_name}")

        dep = ROOT / "docs" / "DEPLOY_PRODUCCION_PASO_A_PASO.md"
        if dep.is_file():
            z.write(dep, "docs/DEPLOY_PRODUCCION_PASO_A_PASO.md")

    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"[OK] Creado: {OUT}")
    print(f"[OK] Tamano: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
