#!/usr/bin/env python3
"""Ejecuta el pipeline Power Quality desde Nexus (arg JSON)."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

PQ_DEV = Path(__file__).resolve().parents[4] / "PowerQuality" / "dev"
if str(PQ_DEV) not in sys.path:
    sys.path.insert(0, str(PQ_DEV))

from src.pipeline import Pipeline, ProjectMetadata  # noqa: E402


def build_metadata(raw: dict) -> ProjectMetadata:
    return ProjectMetadata(
        client_name=raw.get("client_name") or raw.get("cliente_nombre") or "Cliente",
        project_name=raw.get("project_name") or raw.get("proyecto_nombre") or "Proyecto",
        location=raw.get("location") or raw.get("ubicacion") or "",
        system_phase_type=raw.get("system_phase_type") or raw.get("fase") or "Trifásico",
        system_connection=raw.get("system_connection") or raw.get("conexion") or "Estrella (con neutro)",
        voltage_level=raw.get("voltage_level") or raw.get("tension") or "120 V",
        nominal_voltage=float(raw.get("nominal_voltage") or raw.get("tension_nominal") or 120),
        nominal_current=raw.get("nominal_current") or raw.get("corriente_nominal"),
        sag_limit_pct=raw.get("sag_limit_pct"),
        swell_limit_pct=raw.get("swell_limit_pct"),
        thd_voltage_limit=raw.get("thd_voltage_limit"),
        thd_current_limit=raw.get("thd_current_limit"),
        standard=raw.get("standard") or "IEEE",
        report_date=raw.get("report_date") or date.today().isoformat(),
        compute_energy=bool(raw.get("compute_energy", False)),
        analyze_power_quality=bool(raw.get("analyze_power_quality", True)),
        analyze_peaks=bool(raw.get("analyze_peaks", False)),
        voltage_type=raw.get("voltage_type") or "L-N",
        analyze_power_factor=bool(raw.get("analyze_power_factor", True)),
        measurement_equipment=raw.get("measurement_equipment") or raw.get("equipo_medicion") or "",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", required=True)
    args = parser.parse_args()
    payload = json.loads(args.json)

    excel = Path(payload["excel_path"])
    template = Path(payload["template_path"]) if payload.get("template_path") else None
    output = Path(payload["output_path"])
    output.parent.mkdir(parents=True, exist_ok=True)

    if not excel.exists():
        raise FileNotFoundError(f"Excel no encontrado: {excel}")
    if not template or not template.exists():
        raise FileNotFoundError(f"Plantilla no encontrada: {template}")

    meta = build_metadata(payload.get("metadata") or {})
    pipe = Pipeline(workbook_path=excel, template_path=template)
    analysis = pipe.run_analysis(meta)
    if output.exists():
        try:
            output.unlink()
        except OSError:
            output = output.with_name(f"{output.stem}_{meta.report_date}.docx")
    outputs = pipe.generate_report(meta, analysis, output)
    print(json.dumps({"ok": True, "output": str(outputs.get("docx", output))}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
