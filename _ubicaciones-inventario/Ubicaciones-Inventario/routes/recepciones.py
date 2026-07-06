"""
Rutas para consulta y gestión de recepciones (Receptions)
Módulo separado de Despacho: maneja ENTRADAS de inventario
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth, require_admin
from database import db
from database.models import Movimiento, StockUbicacion, Usuario, ProductoADM, MapeoUbicacionADM_WMS, UbicacionFisica, RecepcionProcesada
from utils.helpers import (
    obtener_productos_recepcion, obtener_productos_vendor_recepcion, obtener_productos_credit_note,
    formatear_fecha_iso_utc, formatear_fecha_documento,
    calcular_cantidad_asignada_recepcion, calcular_cantidad_restante_recepcion,
    parse_fecha_adm, get_adm_client,
)
from utils.validaciones import validar_factura_docid, validar_sku, validar_ubicacion, validar_cantidad
from utils.discrepancias import actualizar_discrepancias_por_skus
import json
import traceback
import sys
import logging
from datetime import datetime

recepciones_bp = Blueprint('recepciones', __name__)


def _to_usuario_info(usuario):
    """Devuelve {id, nombre} o None si usuario es None"""
    return {"id": usuario.id, "nombre": usuario.nombre} if usuario else None

logger = logging.getLogger(__name__)


@recepciones_bp.route('/api/recepciones/buscar', methods=['POST'])
@require_auth
def buscar_recepcion():
    """Busca una recepción por DocID (Receptions, VendorReceptions o CreditNotes)"""
    try:
        data = request.json or {}
        docid = data.get('docid', '').strip()
        tipo = data.get('tipo', 'RECEPTION').upper()  # RECEPTION, VEND_REC o CREDIT_NOTE
        location_id = data.get('location_id')  # Opcional
        
        # Validar DocID
        es_valido, mensaje = validar_factura_docid(docid)
        if not es_valido:
            return jsonify({
                "success": False,
                "error": mensaje
            }), 400
        
        adm_client = get_adm_client()
        
        # Buscar en ADM Cloud según el tipo
        try:
            if tipo == 'VEND_REC' or tipo == 'VENDOR_RECEPTION':
                logger.info(f"Buscando compra con recepción: DocID={docid}, LocationID={location_id}")
                recepcion_adm = adm_client.buscar_vendor_recepcion_por_docid(docid, max_search=2000, location_id=location_id)
            elif tipo == 'CREDIT_NOTE' or tipo == 'CREDIT_NOTE_CUSTOMER' or tipo == 'CUST_CRE':
                logger.info(f"Buscando nota de crédito: DocID={docid}, LocationID={location_id}")
                recepcion_adm = adm_client.buscar_credit_note_por_docid(docid, max_search=2000, location_id=location_id)
            else:
                logger.info(f"Buscando recepción: DocID={docid}, LocationID={location_id}")
                recepcion_adm = adm_client.buscar_recepcion_por_docid(docid, max_search=2000, location_id=location_id)
            logger.info(f"Resultado búsqueda: {recepcion_adm is not None}")
        except Exception as api_error:
            error_trace = traceback.format_exc()
            print(f"ERROR al consultar ADM Cloud: {str(api_error)}", file=sys.stderr)
            print(f"TRACEBACK:\n{error_trace}", file=sys.stderr)
            sys.stderr.flush()
            logger.error(f"Error al consultar ADM Cloud: {str(api_error)}")
            logger.error(error_trace)
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud"
            }), 500
        
        if not recepcion_adm:
            if tipo == 'VEND_REC' or tipo == 'VENDOR_RECEPTION':
                tipo_nombre = "compra con recepción"
            elif tipo == 'CREDIT_NOTE' or tipo == 'CREDIT_NOTE_CUSTOMER' or tipo == 'CUST_CRE':
                tipo_nombre = "nota de crédito"
            else:
                tipo_nombre = "recepción"
            return jsonify({
                "success": False,
                "error": f"{tipo_nombre.capitalize()} {docid} no encontrada en ADM Cloud",
                "message": f"La {tipo_nombre} no se encontró después de buscar hasta 2000 documentos. Verifica que el DocID '{docid}' sea correcto."
            }), 404
        
        if not isinstance(recepcion_adm, dict) or not recepcion_adm.get("success"):
            error_msg = recepcion_adm.get("message") if isinstance(recepcion_adm, dict) else "Error desconocido al consultar ADM Cloud"
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud",
                "message": error_msg
            }), 500
        
        recepcion_data = recepcion_adm.get("data", {})
        
        if not recepcion_data:
            return jsonify({
                "success": False,
                "error": "Recepción encontrada pero sin datos",
                "message": "La recepción se encontró pero no contiene información válida"
            }), 404
        
        # Extraer información de la recepción
        recepcion_guid = recepcion_data.get("ID")
        recepcion_docid = recepcion_data.get("DocID", "")
        doc_type = recepcion_data.get("DocType", "RECEPTION")
        
        # IMPORTANTE: Extraer LocationName y LocationID ANTES de cualquier otra operación
        # para asegurar que siempre tengamos estos valores
        location_id_resp = recepcion_data.get("LocationID")
        location_name_raw = recepcion_data.get("LocationName")
        location_name = location_name_raw if location_name_raw else ""
        
        # Detectar tipo de recepción
        es_vendor = (tipo == 'VEND_REC' or tipo == 'VENDOR_RECEPTION' or doc_type == 'VEND_REC')
        es_credit_note = (tipo == 'CREDIT_NOTE' or tipo == 'CREDIT_NOTE_CUSTOMER' or tipo == 'CUST_CRE' or doc_type == 'CUST_CRE')
        
        # Inicializar variables comunes
        related_ncf = None
        
        if es_vendor:
            # Compra con Recepción (VendorReception)
            cliente = recepcion_data.get("RelationshipName", "N/A")  # Proveedor
            referencia = recepcion_data.get("Reference", "")  # No. Factura
            fiscal_id = recepcion_data.get("FiscalID", "")  # RNC
            ncf = recepcion_data.get("NCF", "")  # NCF
            currency_id = recepcion_data.get("CurrencyID", "")
            tax_amount = float(recepcion_data.get("TaxAmount", 0) or 0)  # ITBIS
            total = float(recepcion_data.get("TotalAmount", 0) or 0)
            productos = obtener_productos_vendor_recepcion(recepcion_data)
        elif es_credit_note:
            # Nota de Crédito (CustomerCreditNote)
            cliente = recepcion_data.get("RelationshipName", "N/A")  # Cliente que devuelve
            referencia = recepcion_data.get("RelatedDocID", "")  # DocID de la factura original relacionada
            fiscal_id = recepcion_data.get("FiscalID", "")  # RNC del cliente
            ncf = recepcion_data.get("NCF", "")  # NCF de la nota de crédito
            related_ncf = recepcion_data.get("RelatedNCF", "")  # NCF de la factura original
            currency_id = recepcion_data.get("CurrencyID", "")
            tax_amount = float(recepcion_data.get("TaxAmount", 0) or 0)  # ITBIS
            total = float(recepcion_data.get("TotalAmount", 0) or 0)
            productos = obtener_productos_credit_note(recepcion_data)
        else:
            # Recepción normal (Reception)
            cliente = recepcion_data.get("Reference", "N/A")
            referencia = ""
            fiscal_id = ""
            ncf = ""
            currency_id = ""
            tax_amount = 0.0
            total = float(recepcion_data.get("TotalAmount", 0) or 0)
            productos = obtener_productos_recepcion(recepcion_data)
        
        fecha_str = recepcion_data.get("DocDate") or recepcion_data.get("Date") or recepcion_data.get("CreatedDate")
        fecha = parse_fecha_adm(fecha_str)
        # location_id_resp y location_name ya fueron extraídos arriba
        impact_stock = recepcion_data.get("ImpactStock", True)
        void = recepcion_data.get("Void", False)
        
        # Determinar tipo para la respuesta (antes de persistir)
        if es_vendor:
            tipo_respuesta = "VEND_REC"
        elif es_credit_note:
            tipo_respuesta = "CREDIT_NOTE"
        else:
            tipo_respuesta = "RECEPTION"
        
        # Persistir en RecepcionProcesada (igual que Despacho/Transferencias)
        usuario_actual_id = session.get('user_id')
        recepcion_local = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        
        if recepcion_local:
            recepcion_local.recepcion_docid = recepcion_docid
            recepcion_local.tipo_recepcion = tipo_respuesta
            recepcion_local.cliente = cliente
            recepcion_local.fecha = fecha
            recepcion_local.total = total
            recepcion_local.location_id = location_id_resp
            recepcion_local.location_name = location_name
            recepcion_local.productos_json = json.dumps(productos)
            recepcion_local.updated_at = datetime.utcnow()
            if not recepcion_local.usuario_solicitante and usuario_actual_id:
                recepcion_local.usuario_solicitante = usuario_actual_id
        else:
            recepcion_local = RecepcionProcesada(
                recepcion_guid=recepcion_guid,
                recepcion_docid=recepcion_docid,
                tipo_recepcion=tipo_respuesta,
                cliente=cliente,
                fecha=fecha,
                total=total,
                location_id=location_id_resp,
                location_name=location_name,
                productos_json=json.dumps(productos),
                estado_recepcion='PENDIENTE',
                usuario_solicitante=usuario_actual_id
            )
            db.session.add(recepcion_local)
        
        # Actualizar estado según movimientos existentes
        movimientos_existentes = Movimiento.query.filter_by(tipo='RECEIPT', factura_guid=recepcion_guid).count()
        if movimientos_existentes > 0:
            if recepcion_local.estado_recepcion == 'PENDIENTE':
                recepcion_local.estado_recepcion = 'EN_PROCESO'
            # Verificar si está completo (todos los productos asignados)
            total_requerido = sum(float(p.get('Quantity', 0)) for p in productos)
            total_asignado = sum(
                float(m.cantidad) for m in Movimiento.query.filter_by(tipo='RECEIPT', factura_guid=recepcion_guid).all()
            )
            if total_asignado >= total_requerido:
                recepcion_local.estado_recepcion = 'COMPLETO'
                recepcion_local.completed_at = datetime.utcnow()
        
        db.session.commit()
        
        # Verificar si esta recepción ya fue registrada (para mostrar advertencia)
        recepcion_ya_registrada = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).first()
        
        ya_registrada = recepcion_ya_registrada is not None
        fecha_registro = None
        usuario_registro = None
        
        if ya_registrada:
            fecha_registro = formatear_fecha_iso_utc(recepcion_ya_registrada.timestamp)
            if recepcion_ya_registrada.usuario_id:
                usuario_registro_obj = Usuario.query.get(recepcion_ya_registrada.usuario_id)
                usuario_registro = usuario_registro_obj.nombre if usuario_registro_obj else None
        
        # LÓGICA DE UBICACIONES: Detectar si es ADESA y verificar mapeos
        # Consideramos ADESA si el nombre contiene "ADESA" (case-insensitive)
        es_adesa = bool(location_name and "ADESA" in location_name.upper())
        
        # Para ubicaciones NO-ADESA, verificar si tienen mapeo a ubicación física WMS
        tiene_mapeo = False
        ubicacion_fisica_mapeada = None
        ubicaciones_fisicas_mapeadas = []  # Lista de todas las ubicaciones físicas mapeadas
        
        if not es_adesa and location_id_resp:
            # Buscar mapeos activos para esta ubicación ADM
            mapeos = MapeoUbicacionADM_WMS.query.filter_by(
                location_id_adm=location_id_resp,
                activo=True
            ).all()
            
            if mapeos:
                tiene_mapeo = True
                ubicaciones_fisicas_mapeadas = [mapeo.ubicacion_fisica_wms for mapeo in mapeos]
                # Si solo hay un mapeo, usar esa ubicación como única opción
                if len(ubicaciones_fisicas_mapeadas) == 1:
                    ubicacion_fisica_mapeada = ubicaciones_fisicas_mapeadas[0]
        
        # Preparar respuesta
        respuesta = {
            "success": True,
            "recepcion": {
                "guid": recepcion_guid,
                "docid": recepcion_docid,
                "tipo": tipo_respuesta,
                "doc_type": doc_type,
                "cliente": cliente,  # Proveedor, cliente que devuelve, o referencia
                "proveedor": cliente if es_vendor else None,
                "referencia": referencia,  # No. Factura/Referencia o DocID de factura relacionada
                "fiscal_id": fiscal_id,  # RNC
                "ncf": ncf,  # NCF
                "related_ncf": recepcion_data.get("RelatedNCF", "") if es_credit_note else None,  # NCF de factura original (solo para notas de crédito)
                "currency_id": currency_id,
                "tax_amount": tax_amount,  # ITBIS
                "fecha": formatear_fecha_documento(fecha),
                "total": total,
                "location_id": location_id_resp,
                "location_name": location_name,
                "impact_stock": impact_stock,
                "void": void,
                "productos": productos,
                "estado_recepcion": recepcion_local.estado_recepcion if recepcion_local else "PENDIENTE",
                # Información sobre si ya fue registrada
                "ya_registrada": ya_registrada,
                "fecha_registro": fecha_registro,
                "usuario_registro": usuario_registro,
                # Detalles de auditoría (como en Despacho)
                "usuario_solicitante": _to_usuario_info(Usuario.query.get(recepcion_local.usuario_solicitante)) if (recepcion_local and recepcion_local.usuario_solicitante) else None,
                "usuario_procesador": _to_usuario_info(Usuario.query.get(recepcion_local.usuario_procesador)) if (recepcion_local and recepcion_local.usuario_procesador) else None,
                "completed_at": formatear_fecha_iso_utc(recepcion_local.completed_at) if (recepcion_local and recepcion_local.completed_at) else None,
                # Información sobre ubicación y mapeos
                "es_adesa": es_adesa,
                "tiene_mapeo": tiene_mapeo,
                "ubicacion_fisica_mapeada": ubicacion_fisica_mapeada,
                "ubicaciones_fisicas_mapeadas": ubicaciones_fisicas_mapeadas
            }
        }
        
        return jsonify(respuesta)
        
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"Error inesperado al buscar recepción: {str(e)}")
        logger.error(error_trace)
        return jsonify({
            "success": False,
            "error": "Error inesperado al buscar recepción"
        }), 500


@recepciones_bp.route('/api/recepciones/por-guid/<recepcion_guid>', methods=['GET'])
@require_auth
def obtener_recepcion_por_guid(recepcion_guid):
    """Obtiene una recepción persistida por GUID (para retomar sin buscar en ADM)"""
    try:
        recepcion = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        if not recepcion:
            return jsonify({"success": False, "error": "Recepción no encontrada"}), 404
        
        productos = json.loads(recepcion.productos_json) if recepcion.productos_json else []
        recepcion_ya_registrada = Movimiento.query.filter_by(tipo='RECEIPT', factura_guid=recepcion_guid).first()
        ya_registrada = recepcion_ya_registrada is not None
        fecha_registro = None
        usuario_registro = None
        if ya_registrada and recepcion_ya_registrada:
            fecha_registro = formatear_fecha_iso_utc(recepcion_ya_registrada.timestamp)
            if recepcion_ya_registrada.usuario_id:
                usuario_registro_obj = Usuario.query.get(recepcion_ya_registrada.usuario_id)
                usuario_registro = usuario_registro_obj.nombre if usuario_registro_obj else None
        
        es_adesa = bool(recepcion.location_name and "ADESA" in recepcion.location_name.upper())
        mapeos = []
        if not es_adesa and recepcion.location_id:
            mapeos = MapeoUbicacionADM_WMS.query.filter_by(location_id_adm=recepcion.location_id, activo=True).all()
        
        return jsonify({
            "success": True,
            "recepcion": {
                "guid": recepcion.recepcion_guid,
                "docid": recepcion.recepcion_docid,
                "tipo": recepcion.tipo_recepcion,
                "cliente": recepcion.cliente,
                "fecha": formatear_fecha_documento(recepcion.fecha),
                "total": float(recepcion.total) if recepcion.total else 0,
                "location_id": recepcion.location_id,
                "location_name": recepcion.location_name,
                "productos": productos,
                "estado_recepcion": recepcion.estado_recepcion,
                "ya_registrada": ya_registrada,
                "fecha_registro": fecha_registro,
                "usuario_registro": usuario_registro,
                "usuario_solicitante": _to_usuario_info(Usuario.query.get(recepcion.usuario_solicitante)) if recepcion.usuario_solicitante else None,
                "usuario_procesador": _to_usuario_info(Usuario.query.get(recepcion.usuario_procesador)) if recepcion.usuario_procesador else None,
                "completed_at": formatear_fecha_iso_utc(recepcion.completed_at) if recepcion.completed_at else None,
                "es_adesa": es_adesa,
                "tiene_mapeo": len(mapeos) > 0,
                "ubicacion_fisica_mapeada": mapeos[0].ubicacion_fisica_wms if mapeos and len(mapeos) == 1 else None,
                "ubicaciones_fisicas_mapeadas": [m.ubicacion_fisica_wms for m in mapeos]
            }
        })
    except Exception as e:
        logger.error(f"Error al obtener recepción por GUID: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@recepciones_bp.route('/api/recepciones/recepcion/<recepcion_guid>/estado', methods=['GET'])
@require_auth
def obtener_estado_recepcion(recepcion_guid):
    """Obtiene el estado de recepción por producto (asignado, restante, asignaciones registradas)"""
    try:
        recepcion = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        if not recepcion:
            return jsonify({
                "success": False,
                "error": "Recepción no encontrada"
            }), 404
        
        productos = json.loads(recepcion.productos_json) if recepcion.productos_json else []
        productos_estado = []
        
        for producto in productos:
            sku = (producto.get("SKU") or producto.get("ItemSKU") or "").strip().upper()
            cantidad_recibida = float(producto.get("Quantity", 0))
            cantidad_asignada = calcular_cantidad_asignada_recepcion(recepcion_guid, sku)
            cantidad_restante = calcular_cantidad_restante_recepcion(recepcion_guid, sku, cantidad_recibida)
            completo = cantidad_restante <= 0
            
            # Asignaciones ya registradas para este SKU (picks registrados)
            asignaciones_registradas = []
            movimientos = Movimiento.query.filter_by(
                tipo='RECEIPT',
                factura_guid=recepcion_guid,
                sku=sku
            ).order_by(Movimiento.timestamp).all()
            for mov in movimientos:
                ubicacion = mov.ubicacion_destino or '(S/K sin ubicación)'
                asignaciones_registradas.append({
                    "ubicacion": ubicacion,
                    "cantidad": float(mov.cantidad)
                })
            
            productos_estado.append({
                "sku": sku,
                "nombre": producto.get("Name", ""),
                "cantidad_recibida": cantidad_recibida,
                "cantidad_asignada": cantidad_asignada,
                "cantidad_restante": cantidad_restante,
                "completo": completo,
                "asignaciones_registradas": asignaciones_registradas
            })
        
        return jsonify({
            "success": True,
            "recepcion_guid": recepcion_guid,
            "estado_recepcion": recepcion.estado_recepcion,
            "productos": productos_estado
        })
        
    except Exception as e:
        logger.error(f"Error al obtener estado recepción: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al obtener estado",
            "message": str(e)
        }), 500


@recepciones_bp.route('/api/recepciones/registrar-linea', methods=['POST'])
@require_auth
def registrar_linea_recepcion():
    """Registra una línea de recepción (asignaciones de un SKU) - estilo Despacho por línea"""
    try:
        data = request.json or {}
        recepcion_guid = data.get('recepcion_guid')
        sku = (data.get('sku') or '').strip().upper()
        asignaciones = data.get('asignaciones', [])  # [{ubicacion, cantidad}]
        producto_data = data.get('producto', {})  # item_id, cantidad_total, ItemType, requiere_ubicacion
        
        if not recepcion_guid:
            return jsonify({"success": False, "error": "GUID de recepción es requerido"}), 400
        
        es_valido, mensaje = validar_sku(sku)
        if not es_valido:
            return jsonify({"success": False, "error": mensaje}), 400
        
        recepcion = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        if not recepcion:
            return jsonify({"success": False, "error": "Recepción no encontrada"}), 404
        
        productos = json.loads(recepcion.productos_json) if recepcion.productos_json else []
        producto_factura = None
        for p in productos:
            if (p.get("SKU") or p.get("ItemSKU") or "").upper() == sku:
                producto_factura = p
                break
        
        if not producto_factura:
            return jsonify({"success": False, "error": f"Producto {sku} no está en esta recepción"}), 400
        
        cantidad_total = float(producto_factura.get("Quantity", 0))
        item_id = producto_factura.get("ItemID", "")
        item_type = producto_factura.get("ItemType", "I")
        requiere_ubicacion = producto_factura.get("requiere_ubicacion", item_type == "I")
        
        es_adesa = bool(recepcion.location_name and "ADESA" in recepcion.location_name.upper())
        location_name = recepcion.location_name or ""
        
        if requiere_ubicacion:
            if not asignaciones:
                return jsonify({"success": False, "error": f"El producto {sku} requiere al menos una asignación de ubicación"}), 400
            suma = sum(float(a.get('cantidad', 0)) for a in asignaciones)
            if suma > cantidad_total:
                return jsonify({"success": False, "error": f"La suma de asignaciones ({suma}) excede la cantidad recibida ({cantidad_total})"}), 400
            cantidad_asignada_actual = calcular_cantidad_asignada_recepcion(recepcion_guid, sku)
            if cantidad_asignada_actual + suma > cantidad_total:
                return jsonify({"success": False, "error": f"La suma excedería la cantidad recibida. Ya asignado: {cantidad_asignada_actual}"}), 400
            
            for asignacion in asignaciones:
                ubicacion = asignacion.get('ubicacion', '').strip()
                cantidad = float(asignacion.get('cantidad', 0))
                if cantidad <= 0:
                    continue
                if es_adesa:
                    es_valido, msg = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({"success": False, "error": f"{sku}: {msg}"}), 400
                    ubicacion_fisica = UbicacionFisica.query.filter_by(codigo=ubicacion, activa=True).first()
                    if not ubicacion_fisica:
                        return jsonify({"success": False, "error": f"Ubicación '{ubicacion}' no existe o está inactiva"}), 400
                else:
                    ubicacion = location_name or "NO-ADESA"
                
                es_valido, msg = validar_cantidad(cantidad)
                if not es_valido:
                    return jsonify({"success": False, "error": f"{sku}: {msg}"}), 400
                
                tipo_nombre = 'Recepción'
                if recepcion.tipo_recepcion in ('VEND_REC', 'VENDOR_RECEPTION'):
                    tipo_nombre = 'Compra con Recepción (Proveedor)'
                elif recepcion.tipo_recepcion in ('CREDIT_NOTE', 'CREDIT_NOTE_CUSTOMER', 'CUST_CRE'):
                    tipo_nombre = 'Nota de Crédito (Devolución Cliente)'
                
                notas = f"{tipo_nombre} {recepcion.recepcion_docid or 'N/A'} (GUID: {recepcion_guid[:8]}...) desde ADM Cloud"
                if not es_adesa:
                    notas += f" - Ubicación ADM: {location_name}"
                
                mov = Movimiento(
                    tipo="RECEIPT",
                    product_id=item_id or "",
                    sku=sku,
                    ubicacion_origen=None,
                    ubicacion_destino=ubicacion,
                    cantidad=cantidad,
                    factura_id=recepcion.recepcion_docid or recepcion_guid,
                    factura_guid=recepcion_guid,
                    usuario_id=session.get('user_id'),
                    notas=notas
                )
                db.session.add(mov)
                
                if es_adesa:
                    stock_ubic = StockUbicacion.query.filter_by(sku=sku, ubicacion=ubicacion).first()
                    if stock_ubic:
                        stock_ubic.cantidad = float(stock_ubic.cantidad) + cantidad
                        stock_ubic.updated_at = datetime.utcnow()
                    else:
                        stock_ubic = StockUbicacion(
                            product_id=item_id or "",
                            sku=sku,
                            ubicacion=ubicacion,
                            cantidad=cantidad
                        )
                        db.session.add(stock_ubic)

                # Actualizar cache ADM (ADESA y no-ADESA)
                if recepcion.location_id:
                    from utils.helpers import actualizar_cache_adm, resolver_producto_adm
                    producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                    if producto_db:
                        actualizar_cache_adm(producto_db.id, recepcion.location_id,
                                             delta=+cantidad, location_name=location_name)
        else:
            # S/K: sin ubicación
            cantidad_total_sk = float(producto_factura.get("Quantity", 0))
            if cantidad_total_sk <= 0:
                return jsonify({"success": False, "error": f"Cantidad inválida para {sku}"}), 400
            cantidad_ya = calcular_cantidad_asignada_recepcion(recepcion_guid, sku)
            if cantidad_ya >= cantidad_total_sk:
                return jsonify({"success": False, "error": f"El {item_type} {sku} ya está completamente registrado"}), 400
            
            tipo_nombre = 'Recepción'
            if recepcion.tipo_recepcion in ('VEND_REC', 'VENDOR_RECEPTION'):
                tipo_nombre = 'Compra con Recepción (Proveedor)'
            elif recepcion.tipo_recepcion in ('CREDIT_NOTE',):
                tipo_nombre = 'Nota de Crédito (Devolución Cliente)'
            
            tipo_item = 'Servicio' if item_type == 'S' else 'Kit'
            notas = f"{tipo_nombre} {recepcion.recepcion_docid or 'N/A'} - {tipo_item} (ItemType: {item_type}) - Sin ubicación física"
            if not es_adesa:
                notas += f" - Ubicación ADM: {location_name}"
            
            cantidad_sk = cantidad_total_sk - cantidad_ya
            mov = Movimiento(
                tipo="RECEIPT",
                product_id=item_id or "",
                sku=sku,
                ubicacion_origen=None,
                ubicacion_destino=None,
                cantidad=cantidad_sk,
                factura_id=recepcion.recepcion_docid or recepcion_guid,
                factura_guid=recepcion_guid,
                usuario_id=session.get('user_id'),
                notas=notas
            )
            db.session.add(mov)

            # Actualizar cache ADM para S/K
            if recepcion.location_id and cantidad_sk > 0:
                from utils.helpers import actualizar_cache_adm, resolver_producto_adm
                producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                if producto_db:
                    actualizar_cache_adm(producto_db.id, recepcion.location_id,
                                         delta=+cantidad_sk, location_name=location_name)
        
        # Actualizar estado recepcion
        if recepcion.estado_recepcion == 'PENDIENTE':
            recepcion.estado_recepcion = 'EN_PROCESO'
            recepcion.fecha_inicio = datetime.utcnow()
            recepcion.usuario_procesador = session.get('user_id')
        
        total_requerido = sum(float(p.get('Quantity', 0)) for p in productos)
        total_asignado = sum(
            float(m.cantidad) for m in Movimiento.query.filter_by(tipo='RECEIPT', factura_guid=recepcion_guid).all()
        )
        if total_asignado >= total_requerido:
            recepcion.estado_recepcion = 'COMPLETO'
            recepcion.completed_at = datetime.utcnow()
        
        db.session.commit()
        
        try:
            if es_adesa:
                actualizar_discrepancias_por_skus({sku})
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias: {e_disc}")
        
        cantidad_restante = calcular_cantidad_restante_recepcion(recepcion_guid, sku, cantidad_total)
        
        return jsonify({
            "success": True,
            "message": "Línea registrada exitosamente",
            "cantidad_restante": cantidad_restante,
            "cantidad_asignada": calcular_cantidad_asignada_recepcion(recepcion_guid, sku)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al registrar línea recepción: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al registrar línea",
            "message": str(e)
        }), 500


@recepciones_bp.route('/api/recepciones/registrar', methods=['POST'])
@require_auth
def registrar_recepcion():
    """Registra una recepción de productos asignando ubicaciones físicas (WMS)
    Soporta nueva estructura con asignaciones múltiples por SKU (split por filas)
    """
    try:
        data = request.json or {}
        recepcion_guid = data.get('recepcion_guid')
        recepcion_docid = data.get('recepcion_docid', '')
        tipo_recepcion = data.get('tipo_recepcion', 'RECEPTION').upper()  # RECEPTION, VEND_REC, CREDIT_NOTE
        es_adesa = data.get('es_adesa', False)
        location_name = data.get('location_name', '')
        location_id = data.get('location_id', '')
        if not location_id and location_name:
            from database.models import SyncLocationStatus
            loc_status = SyncLocationStatus.query.filter_by(location_name=location_name).first()
            if loc_status:
                location_id = loc_status.location_id
        
        # NUEVA ESTRUCTURA: productos con asignaciones múltiples
        productos = data.get('productos', [])
        # COMPATIBILIDAD: mantener soporte para estructura antigua
        productos_ubicaciones = data.get('productos_ubicaciones', [])
        
        # Validaciones básicas
        if not recepcion_guid:
            return jsonify({
                "success": False,
                "error": "GUID de recepción es requerido"
            }), 400
        
        # Si viene estructura nueva, usar esa. Si no, convertir estructura antigua
        if productos and len(productos) > 0:
            # Estructura nueva: productos con asignaciones
            usar_estructura_nueva = True
        elif productos_ubicaciones and len(productos_ubicaciones) > 0:
            # Estructura antigua: convertir a nueva
            usar_estructura_nueva = False
            # Agrupar por SKU
            productos_dict = {}
            for prod_ubic in productos_ubicaciones:
                sku = prod_ubic.get('sku', '').strip().upper()
                if sku not in productos_dict:
                    productos_dict[sku] = {
                        'sku': sku,
                        'item_id': prod_ubic.get('item_id', ''),
                        'cantidad_total': 0,
                        'asignaciones': []
                    }
                cantidad = float(prod_ubic.get('cantidad', 0))
                productos_dict[sku]['cantidad_total'] += cantidad
                productos_dict[sku]['asignaciones'].append({
                    'ubicacion': prod_ubic.get('ubicacion', '').strip(),
                    'cantidad': cantidad
                })
            productos = list(productos_dict.values())
        else:
            return jsonify({
                "success": False,
                "error": "Debe asignar al menos un producto"
            }), 400
        
        # Verificar si esta recepción ya fue registrada (evitar duplicados)
        recepcion_existente = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).first()
        
        if recepcion_existente:
            docid_mensaje = f" (DocID: {recepcion_docid})" if recepcion_docid else ""
            return jsonify({
                "success": False,
                "error": f"Esta recepción ya fue registrada anteriormente{docid_mensaje}",
                "message": f"La recepción con GUID {recepcion_guid[:8]}... ya tiene movimientos registrados. No se puede duplicar."
            }), 400
        
        # VALIDACIÓN DE SUMATORIA POR SKU Y VALIDACIONES GENERALES
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            cantidad_total = float(producto.get('cantidad_total', 0))
            asignaciones = producto.get('asignaciones', [])
            item_id = producto.get('item_id', '')
            
            # Validar SKU
            es_valido, mensaje = validar_sku(sku)
            if not es_valido:
                return jsonify({
                    "success": False,
                    "error": f"SKU inválido: {mensaje}"
                }), 400
            
            # Obtener ItemType del producto para determinar si requiere ubicación
            item_type = producto.get('ItemType', 'I')
            requiere_ubicacion = producto.get('requiere_ubicacion', item_type == 'I')
            
            # Validar que haya asignaciones SOLO si requiere ubicación (Items)
            if requiere_ubicacion:
                if not asignaciones or len(asignaciones) == 0:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} (Item físico) debe tener al menos una asignación de ubicación"
                    }), 400
            else:
                # Para S/K: no requiere asignaciones, pero validar cantidad total
                if cantidad_total <= 0:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} ({'Servicio' if item_type == 'S' else 'Kit'}) debe tener una cantidad mayor a 0"
                    }), 400
            
            # REGLA DE ORO #4: Validar ubicación física solo si es ADESA Y requiere ubicación
            if es_adesa and requiere_ubicacion:
                # Calcular suma de asignaciones
                suma_asignaciones = sum(float(a.get('cantidad', 0)) for a in asignaciones)
                
                # Validar que la suma no exceda la cantidad total
                if suma_asignaciones > cantidad_total:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} tiene asignaciones que exceden la cantidad recibida. Total recibido: {cantidad_total}, Suma asignada: {suma_asignaciones}"
                    }), 400
                
                # Validar que todas las asignaciones tengan ubicación y cantidad válida
                for asignacion in asignaciones:
                    ubicacion = asignacion.get('ubicacion', '').strip()
                    cantidad = asignacion.get('cantidad', 0)
                    
                    es_valido, mensaje = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Ubicación inválida para {sku}: {mensaje}"
                        }), 400
                    
                    # ✅ Validar que la ubicación física existe y está activa en UbicacionFisica
                    ubicacion_fisica = UbicacionFisica.query.filter_by(
                        codigo=ubicacion,
                        activa=True
                    ).first()
                    
                    if not ubicacion_fisica:
                        return jsonify({
                            "success": False,
                            "error": f"La ubicación física '{ubicacion}' no existe o está inactiva para {sku}. Verifique que la ubicación esté creada y activa en el sistema de ubicaciones físicas."
                        }), 400
                    
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku} en {ubicacion}: {mensaje}"
                        }), 400
            elif requiere_ubicacion:
                # Para NO-ADESA con Items: solo validar cantidad (no ubicación física)
                for asignacion in asignaciones:
                    cantidad = asignacion.get('cantidad', 0)
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku}: {mensaje}"
                        }), 400
            # Si es S/K, no requiere validaciones adicionales de asignaciones
        
        # Procesar asignaciones
        movimientos_creados = []
        
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            item_id = producto.get('item_id', '')
            asignaciones = producto.get('asignaciones', [])
            item_type = producto.get('ItemType', 'I')  # Obtener ItemType del producto
            requiere_ubicacion = producto.get('requiere_ubicacion', item_type == 'I')  # Default basado en ItemType
            
            # Determinar el tipo de recepción para las notas
            tipo_nombre = 'Recepción'
            if tipo_recepcion == 'VEND_REC' or tipo_recepcion == 'VENDOR_RECEPTION':
                tipo_nombre = 'Compra con Recepción (Proveedor)'
            elif tipo_recepcion == 'CREDIT_NOTE' or tipo_recepcion == 'CREDIT_NOTE_CUSTOMER' or tipo_recepcion == 'CUST_CRE':
                tipo_nombre = 'Nota de Crédito (Devolución Cliente)'
            
            # Si es Service (S) o Kit (K), NO requiere ubicación física
            if not requiere_ubicacion:
                # Para S/K: usar la cantidad total del producto (sin asignaciones)
                cantidad_total = float(producto.get('cantidad', 0))
                
                if cantidad_total > 0:
                    # Crear movimiento SIN ubicación física
                    tipo_item_nombre = 'Servicio' if item_type == 'S' else 'Kit'
                    notas_movimiento = f"{tipo_nombre} {recepcion_docid or 'DocID N/A'} (GUID: {recepcion_guid[:8]}...) - {tipo_item_nombre} (ItemType: {item_type}) - Sin ubicación física"
                    if not es_adesa:
                        notas_movimiento += f" - Ubicación ADM: {location_name}"
                    
                    movimiento = Movimiento(
                        tipo="RECEIPT",
                        product_id=item_id or "",
                        sku=sku,
                        ubicacion_origen=None,
                        ubicacion_destino=None,
                        cantidad=cantidad_total,
                        factura_id=recepcion_docid or recepcion_guid,
                        factura_guid=recepcion_guid,
                        usuario_id=session.get('user_id'),
                        notas=notas_movimiento
                    )
                    db.session.add(movimiento)
                    movimientos_creados.append(movimiento.to_dict())

                    # Actualizar cache ADM para S/K
                    if location_id and cantidad_total > 0:
                        from utils.helpers import actualizar_cache_adm, resolver_producto_adm
                        producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                        if producto_db:
                            actualizar_cache_adm(producto_db.id, location_id,
                                                 delta=+cantidad_total, location_name=location_name)
            else:
                # Para Items (I): lógica actual con ubicaciones físicas
                for asignacion in asignaciones:
                    ubicacion = asignacion.get('ubicacion', '').strip()
                    cantidad = float(asignacion.get('cantidad', 0))
                    
                    # REGLA DE ORO #4: Modificar StockUbicacion solo si es ADESA
                    if es_adesa:
                        # Buscar o crear stock en ubicación
                        stock_ubic = StockUbicacion.query.filter_by(
                            sku=sku,
                            ubicacion=ubicacion
                        ).first()
                        
                        if stock_ubic:
                            stock_ubic.cantidad = float(stock_ubic.cantidad) + cantidad
                            stock_ubic.updated_at = datetime.utcnow()
                        else:
                            stock_ubic = StockUbicacion(
                                product_id=item_id or "",
                                sku=sku,
                                ubicacion=ubicacion,
                                cantidad=cantidad
                            )
                            db.session.add(stock_ubic)
                    else:
                        # Para NO-ADESA: usar location_name de ADM como ubicación en Movimiento
                        ubicacion = location_name or "NO-ADESA"
                        # NO modificar StockUbicacion
                    
                    # Crear movimiento siempre (para auditoría)
                    notas_movimiento = f"{tipo_nombre} {recepcion_docid or 'DocID N/A'} (GUID: {recepcion_guid[:8]}...) desde ADM Cloud"
                    if not es_adesa:
                        notas_movimiento += f" - Ubicación ADM: {location_name}"
                    
                    movimiento = Movimiento(
                        tipo="RECEIPT",
                        product_id=item_id or "",
                        sku=sku,
                        ubicacion_origen=None,
                        ubicacion_destino=ubicacion,
                        cantidad=cantidad,
                        factura_id=recepcion_docid or recepcion_guid,
                        factura_guid=recepcion_guid,
                        usuario_id=session.get('user_id'),
                        notas=notas_movimiento
                    )
                    db.session.add(movimiento)
                    movimientos_creados.append(movimiento.to_dict())

                    # Actualizar cache ADM (ADESA y no-ADESA)
                    if location_id:
                        from utils.helpers import actualizar_cache_adm, resolver_producto_adm
                        producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                        if producto_db:
                            actualizar_cache_adm(producto_db.id, location_id,
                                                 delta=+cantidad, location_name=location_name)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Recepción registrada exitosamente",
            "movimientos": movimientos_creados,
            "total_movimientos": len(movimientos_creados)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al registrar recepción: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al registrar recepción",
            "message": str(e)
        }), 500


@recepciones_bp.route('/api/recepciones/<recepcion_guid>/revertir', methods=['POST'])
@require_admin
def revertir_recepcion(recepcion_guid):
    """Reverte una recepción procesada (solo administradores) - Elimina movimientos y revierte stock"""
    try:
        # Obtener todos los movimientos de esta recepción
        movimientos = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "No se encontraron movimientos para esta recepción"
            }), 404
        
        # Determinar es_adesa PRIMERO desde RecepcionProcesada (más fiable que ADM o primer movimiento)
        recepcion_proc = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        es_adesa = False
        location_name = None
        if recepcion_proc and recepcion_proc.location_name:
            location_name = recepcion_proc.location_name
            es_adesa = "ADESA" in location_name.upper()
        
        if not es_adesa:
            # Fallback: intentar obtener desde ADM Cloud
            try:
                if movimientos[0].factura_id and len(movimientos[0].factura_id) < 50:  # Si es DocID (corto), no GUID
                    adm_client = get_adm_client()
                    try:
                        recepcion_adm = adm_client.buscar_recepcion_por_docid(movimientos[0].factura_id, max_search=100)
                        if recepcion_adm and recepcion_adm.get("success") and recepcion_adm.get("data"):
                            recepcion_data = recepcion_adm.get("data")
                            location_name = recepcion_data.get("LocationName", "")
                            if location_name:
                                es_adesa = "ADESA" in location_name.upper()
                    except Exception:
                        try:
                            recepcion_adm = adm_client.buscar_vendor_recepcion_por_docid(movimientos[0].factura_id, max_search=100)
                            if recepcion_adm and recepcion_adm.get("success") and recepcion_adm.get("data"):
                                recepcion_data = recepcion_adm.get("data")
                                location_name = recepcion_data.get("LocationName", "")
                                if location_name:
                                    es_adesa = "ADESA" in location_name.upper()
                        except Exception:
                            pass
            except Exception as e:
                logger.warning(f"No se pudo determinar si la recepción era ADESA: {str(e)}")
            # Fallback final: si ALGÚN movimiento tiene ubicación física WMS, es ADESA
            if not es_adesa:
                for m in movimientos:
                    u = m.ubicacion_destino
                    if u and u not in ["NO-ADESA"] and len(str(u)) < 20:
                        es_adesa = True
                        break
        
        # Obtener location_id para revertir cache ADM
        loc_id = recepcion_proc.location_id if recepcion_proc else None

        # Revertir stock (físico + cache) y eliminar movimientos
        from utils.helpers import actualizar_cache_adm, resolver_producto_adm
        stock_revertido = 0
        cache_revertido = 0
        total_movimientos = len(movimientos)
        cantidades_por_producto = {}

        for movimiento in movimientos:
            cant = float(movimiento.cantidad)
            sku_mov = movimiento.sku
            pid_mov = movimiento.product_id or ""
            key = (pid_mov, sku_mov)
            cantidades_por_producto[key] = cantidades_por_producto.get(key, 0) + cant

            if es_adesa and movimiento.ubicacion_destino:
                stock_ubic = StockUbicacion.query.filter_by(
                    sku=sku_mov,
                    ubicacion=movimiento.ubicacion_destino
                ).first()
                if stock_ubic:
                    stock_ubic.cantidad = max(0, float(stock_ubic.cantidad) - cant)
                    stock_ubic.updated_at = datetime.utcnow()
                    stock_revertido += 1

            db.session.delete(movimiento)

        # Revertir cache ADM (simétrico: restar lo que se sumó al registrar)
        for (pid, sku_rev), cantidad_rev in cantidades_por_producto.items():
            if loc_id:
                producto_db = resolver_producto_adm(item_id=pid, sku=sku_rev)
                if producto_db:
                    actualizar_cache_adm(producto_db.id, loc_id,
                                         delta=-cantidad_rev, location_name=location_name)
                    cache_revertido += 1
        
        # Actualizar RecepcionProcesada a PENDIENTE
        recepcion_proc2 = RecepcionProcesada.query.filter_by(recepcion_guid=recepcion_guid).first()
        if recepcion_proc2:
            recepcion_proc2.estado_recepcion = 'PENDIENTE'
            recepcion_proc2.fecha_inicio = None
            recepcion_proc2.completed_at = None
            recepcion_proc2.usuario_procesador = None
            recepcion_proc2.updated_at = datetime.utcnow()
        
        db.session.commit()

        try:
            skus_revertidos = set(sku for (_, sku) in cantidades_por_producto.keys())
            if skus_revertidos:
                actualizar_discrepancias_por_skus(skus_revertidos)
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias tras revertir recepción: {e_disc}")
        
        mensaje = f"Recepción revertida exitosamente. Se eliminaron {total_movimientos} movimiento(s)."
        if stock_revertido:
            mensaje += f" Stock físico revertido: {stock_revertido}."
        if cache_revertido:
            mensaje += f" Cache ADM revertido: {cache_revertido}."
        
        return jsonify({
            "success": True,
            "message": mensaje,
            "movimientos_eliminados": total_movimientos,
            "stock_revertido": stock_revertido,
            "cache_revertido": cache_revertido
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al revertir recepción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al revertir recepción",
            "message": str(e)
        }), 500


@recepciones_bp.route('/api/recepciones/<recepcion_guid>/refrescar', methods=['POST'])
@require_admin
def refrescar_recepcion(recepcion_guid):
    """Refresca los datos de una recepción desde ADM Cloud"""
    try:
        data = request.json or {}
        docid_provided = data.get('docid', '').strip()  # DocID enviado desde frontend
        tipo_provided = data.get('tipo', 'RECEPTION').upper()  # Tipo enviado desde frontend
        
        # Verificar si tiene movimientos (si tiene, solo admin puede refrescar)
        movimientos = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).first()
        
        user_rol = session.get('user_rol', '').lower()
        es_admin = user_rol == 'administrador'
        
        # Si tiene movimientos y no es admin, no permitir refrescar
        if movimientos and not es_admin:
            return jsonify({
                "success": False,
                "error": "No se puede refrescar una recepción ya procesada. Solo administradores pueden hacerlo."
            }), 403
        
        # Obtener el DocID: primero del request, luego de movimientos, luego de notas
        docid = docid_provided
        tipo_recepcion = tipo_provided
        
        if not docid and movimientos:
            # Intentar obtener DocID desde factura_id o notas
            factura_id = movimientos.factura_id
            if factura_id and '-' not in factura_id and len(factura_id) < 20:
                docid = factura_id
            else:
                # Buscar en notas
                import re
                if movimientos.notas:
                    match = re.search(r'Recepci[oó]n\s+(\d+)', movimientos.notas, re.IGNORECASE)
                    if match:
                        docid = match.group(1)
        
        # Si aún no tenemos DocID, retornar error
        if not docid:
            return jsonify({
                "success": False,
                "error": "No se pudo determinar el DocID de la recepción. Busca la recepción nuevamente por número."
            }), 400
        
        # Buscar en ADM Cloud según el tipo de la recepción cargada (evita GUID incorrecto)
        adm_client = get_adm_client()
        
        try:
            # Buscar primero en el endpoint que corresponde al tipo cargado
            if tipo_recepcion in ('VEND_REC', 'VENDOR_RECEPTION'):
                recepcion_adm = adm_client.buscar_vendor_recepcion_por_docid(docid, max_search=2000)
            elif tipo_recepcion in ('CREDIT_NOTE', 'CREDIT_NOTE_CUSTOMER', 'CUST_CRE'):
                recepcion_adm = adm_client.buscar_credit_note_por_docid(docid, max_search=2000)
            else:
                recepcion_adm = adm_client.buscar_recepcion_por_docid(docid, max_search=2000)
            
            # Si no se encontró en el tipo esperado, intentar los otros (fallback)
            if not recepcion_adm or not isinstance(recepcion_adm, dict) or not recepcion_adm.get("success"):
                recepcion_adm = adm_client.buscar_recepcion_por_docid(docid, max_search=2000)
                if recepcion_adm and recepcion_adm.get("success"):
                    tipo_recepcion = 'RECEPTION'
            if not recepcion_adm or not isinstance(recepcion_adm, dict) or not recepcion_adm.get("success"):
                recepcion_adm = adm_client.buscar_vendor_recepcion_por_docid(docid, max_search=2000)
                if recepcion_adm and recepcion_adm.get("success"):
                    tipo_recepcion = 'VEND_REC'
            if not recepcion_adm or not isinstance(recepcion_adm, dict) or not recepcion_adm.get("success"):
                recepcion_adm = adm_client.buscar_credit_note_por_docid(docid, max_search=2000)
                if recepcion_adm and recepcion_adm.get("success"):
                    tipo_recepcion = 'CREDIT_NOTE'
            
            if not recepcion_adm or not isinstance(recepcion_adm, dict) or not recepcion_adm.get("success"):
                return jsonify({
                    "success": False,
                    "error": f"No se encontró la recepción {docid} en ADM Cloud"
                }), 404
            
            recepcion_data = recepcion_adm.get("data", {})
            if not recepcion_data:
                return jsonify({
                    "success": False,
                    "error": "Recepción encontrada pero sin datos"
                }), 404
            
            # Verificar que el GUID coincida
            guid_adm = recepcion_data.get("ID")
            if guid_adm != recepcion_guid:
                return jsonify({
                    "success": False,
                    "error": "El GUID de la recepción no coincide con ADM Cloud"
                }), 400
            
            # Extraer datos actualizados
            if tipo_recepcion == 'VEND_REC':
                productos = obtener_productos_vendor_recepcion(recepcion_data)
                cliente = recepcion_data.get("RelationshipName", "N/A")
            elif tipo_recepcion == 'CREDIT_NOTE':
                productos = obtener_productos_credit_note(recepcion_data)
                cliente = recepcion_data.get("RelationshipName", "N/A")
            else:
                productos = obtener_productos_recepcion(recepcion_data)
                cliente = recepcion_data.get("Reference", "N/A")
            
            fecha_str = recepcion_data.get("DocDate") or recepcion_data.get("Date") or recepcion_data.get("CreatedDate")
            fecha = parse_fecha_adm(fecha_str)
            location_name = recepcion_data.get("LocationName", "")
            
            return jsonify({
                "success": True,
                "message": "Datos refrescados desde ADM Cloud",
                "recepcion": {
                    "guid": guid_adm,
                    "docid": recepcion_data.get("DocID", ""),
                    "tipo": tipo_recepcion,
                    "cliente": cliente,
                    "fecha": formatear_fecha_documento(fecha),
                    "location_name": location_name,
                    "productos": productos
                }
            })
            
        except Exception as api_error:
            logger.error(f"Error al consultar ADM Cloud: {str(api_error)}")
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud",
                "message": str(api_error)
            }), 500
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al refrescar recepción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al refrescar recepción",
            "message": str(e)
        }), 500

