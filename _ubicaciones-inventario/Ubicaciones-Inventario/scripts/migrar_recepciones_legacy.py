"""
Script para migrar recepciones legacy (movimientos RECEIPT) a RecepcionProcesada.

El historial de recepciones usa RecepcionProcesada como fuente. Antes de la estandarización,
las recepciones solo generaban movimientos tipo RECEIPT; no había registro en RecepcionProcesada.
Este script crea registros en RecepcionProcesada para esos movimientos antiguos, de modo que
aparezcan en el historial.

Ejecutar desde raíz: python scripts/migrar_recepciones_legacy.py
En cPanel: Execute Python script -> migrar_recepciones_legacy.py
"""
import os
import sys
import json
from collections import defaultdict
from datetime import datetime
from typing import Optional

_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import Movimiento, RecepcionProcesada


def detectar_tipo_recepcion(notas: str) -> str:
    """Detecta el tipo de recepción desde las notas del movimiento."""
    if not notas:
        return 'RECEPTION'
    notas_upper = (notas or '').upper()
    if any(k in notas_upper for k in ['VENDOR', 'PROVEEDOR', 'COMPRA CON RECEPCIÓN', 'VEND_REC']):
        return 'VEND_REC'
    if any(k in notas_upper for k in ['NOTA DE CRÉDITO', 'NOTA DE CREDITO', 'CREDIT NOTE', 'CREDIT_NOTE', 'CUST_CRE', 'DEVOLUCIÓN']):
        return 'CREDIT_NOTE'
    return 'RECEPTION'


def extraer_cliente_de_notas(notas: str) -> str:
    """Intenta extraer cliente/proveedor de las notas. Para legacy suele ser N/A."""
    if not notas or not isinstance(notas, str):
        return 'N/A'
    # Si las notas parecen ser texto descriptivo corto (no JSON ni "Recepción doc X"), usarlas
    n = notas.strip()
    if len(n) <= 100 and not n.startswith('{') and 'Recepción' not in n[:30]:
        return n[:200]
    return 'N/A'


def inferir_location_name(movimientos: list) -> Optional[str]:
    """
    Intenta inferir la ubicación ADM desde movimientos.
    Busca patrones comunes en ubicacion_destino o notas.
    """
    for m in movimientos:
        if m.notas and 'ADESA' in (m.notas or '').upper():
            return 'ADESA'
        if m.ubicacion_destino:
            u = str(m.ubicacion_destino).upper()
            if 'ADESA' in u or 'TIENDA' in u:
                return m.ubicacion_destino[:200] if len(str(m.ubicacion_destino)) > 200 else m.ubicacion_destino
    return None


def migrar_recepciones_legacy():
    with app.app_context():
        try:
            print("[*] Buscando movimientos RECEIPT sin registro en RecepcionProcesada...")

            # Guids que ya están en RecepcionProcesada
            guids_procesados = {
                r.recepcion_guid for r in RecepcionProcesada.query.with_entities(RecepcionProcesada.recepcion_guid).all()
            }

            # Movimientos RECEIPT agrupados por factura_guid
            movs = Movimiento.query.filter_by(tipo='RECEIPT').filter(
                Movimiento.factura_guid.isnot(None),
                Movimiento.factura_guid != ''
            ).order_by(Movimiento.timestamp).all()

            por_guid = defaultdict(list)
            for m in movs:
                if m.factura_guid and m.factura_guid not in guids_procesados:
                    por_guid[m.factura_guid].append(m)

            if not por_guid:
                print("[OK] No hay recepciones legacy pendientes de migrar.")
                return

            print(f"[*] Encontradas {len(por_guid)} recepciones legacy a migrar.")

            creados = 0
            for factura_guid, lista_movs in por_guid.items():
                if not lista_movs:
                    continue

                # Datos derivados
                min_ts = min(m.timestamp for m in lista_movs if m.timestamp)
                if not min_ts:
                    continue

                notas = lista_movs[0].notas if lista_movs else None
                tipo_recepcion = detectar_tipo_recepcion(notas)
                cliente = extraer_cliente_de_notas(notas) if notas else 'N/A'
                location_name = inferir_location_name(lista_movs)

                # recepcion_docid: factura_id si parece docid (numérico), sino primeros 8 del guid
                factura_id = lista_movs[0].factura_id if lista_movs else None
                if factura_id and str(factura_id).replace(' ', '').isdigit():
                    docid = str(factura_id).strip()
                    if len(docid) < 8:
                        docid = docid.zfill(8)
                    recepcion_docid = docid[:50]
                else:
                    recepcion_docid = (factura_guid[:8] if factura_guid else '00000000').upper()

                # productos_json: agrupar por SKU
                sku_cantidad = defaultdict(float)
                for m in lista_movs:
                    if m.sku:
                        sku_cantidad[m.sku] += float(m.cantidad) if m.cantidad else 0.0
                productos = [{"SKU": sku, "Quantity": qty} for sku, qty in sku_cantidad.items()]

                cantidad_total = sum(float(m.cantidad or 0) for m in lista_movs)
                usuario_proc = lista_movs[0].usuario_id if lista_movs and lista_movs[0].usuario_id else None

                rp = RecepcionProcesada(
                    recepcion_guid=factura_guid,
                    recepcion_docid=recepcion_docid,
                    tipo_recepcion=tipo_recepcion,
                    cliente=cliente,
                    fecha=min_ts,
                    total=cantidad_total,
                    location_name=location_name,
                    estado_recepcion='COMPLETO',
                    usuario_procesador=usuario_proc,
                    completed_at=min_ts,
                    productos_json=json.dumps(productos),
                    created_at=min_ts,
                    updated_at=datetime.utcnow()
                )
                db.session.add(rp)
                creados += 1

            db.session.commit()
            print(f"[OK] Migración completada. Se crearon {creados} registros en RecepcionProcesada.")
            print("     Los movimientos antiguos deberían aparecer ahora en el Historial de Recepciones.")

        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error durante la migración: {str(e)}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == '__main__':
    migrar_recepciones_legacy()
