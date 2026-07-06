"""
Rutas para el proceso de despacho (picking)
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth, require_admin
from database import db
from database.models import Movimiento, FacturaProcesada, StockUbicacion, Usuario, ProductoADM, StockProductoADM
from utils.validaciones import validar_sku, validar_ubicacion, validar_cantidad
from utils.helpers import (
    calcular_cantidad_despachada,
    calcular_cantidad_pendiente,
    obtener_productos_dispatch,
    formatear_fecha_iso_utc,
    formatear_fecha_documento,
    es_ubicacion_adesa,
    parse_fecha_adm,
    get_adm_client,
)
from utils.discrepancias import actualizar_discrepancias_por_skus
from datetime import datetime
import logging
import json
import traceback
import sys

despacho_bp = Blueprint('despacho', __name__)
logger = logging.getLogger(__name__)


def _crear_movimiento_pick_item(factura, producto_factura, ubicacion, cantidad, tipo_nombre):
    """Crea un movimiento PICK para un Item (requiere ubicación). Retorna (movimiento, stock_ubic) o (None, error_msg)."""
    sku = (producto_factura.get("SKU") or producto_factura.get("ItemSKU") or "").upper()
    factura_guid = factura.factura_guid
    stock_ubic = StockUbicacion.query.filter_by(sku=sku, ubicacion=ubicacion).first()
    if not stock_ubic or float(stock_ubic.cantidad) < float(cantidad):
        return None, f"Stock insuficiente en ubicación {ubicacion}"
    notas_movimiento = f"{tipo_nombre} {factura.factura_docid or 'DocID N/A'} (GUID: {factura_guid[:8]}...) desde ADM Cloud"
    movimiento = Movimiento(
        tipo="PICK",
        product_id=producto_factura.get("ItemID"),
        sku=sku,
        ubicacion_origen=ubicacion,
        ubicacion_destino=None,
        cantidad=cantidad,
        factura_id=factura.factura_docid,
        factura_guid=factura_guid,
        usuario_id=session.get('user_id'),
        notas=notas_movimiento
    )
    db.session.add(movimiento)
    stock_ubic.cantidad = float(stock_ubic.cantidad) - float(cantidad)
    stock_ubic.updated_at = datetime.utcnow()
    return movimiento, stock_ubic


@despacho_bp.route('/api/despacho/registrar', methods=['POST'])
@require_auth
def registrar_pick():
    """Registra un movimiento de picking (despacho). Soporta una asignación o múltiples asignaciones."""
    try:
        data = request.json or {}
        factura_guid = data.get('factura_guid')
        sku_raw = data.get('sku')
        sku = (sku_raw or "").strip().upper() if sku_raw is not None else ""
        asignaciones = data.get('asignaciones', [])

        # Validaciones básicas
        if not factura_guid:
            return jsonify({"success": False, "error": "GUID de documento es requerido"}), 400

        es_valido, mensaje = validar_sku(sku)
        if not es_valido:
            return jsonify({"success": False, "error": mensaje}), 400

        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        if not factura:
            return jsonify({"success": False, "error": "Factura no encontrada"}), 404

        productos = json.loads(factura.productos_json) if factura.productos_json else []
        producto_factura = None
        for p in productos:
            if p.get("SKU", "").upper() == sku or p.get("ItemSKU", "").upper() == sku:
                producto_factura = p
                break

        if not producto_factura:
            return jsonify({"success": False, "error": f"El producto {sku} no está en esta factura"}), 400

        item_type = producto_factura.get("ItemType", "I")
        requiere_ubicacion = producto_factura.get("requiere_ubicacion", item_type == "I")
        cantidad_solicitada = float(producto_factura.get("Quantity", 0))
        cantidad_pendiente = calcular_cantidad_pendiente(factura_guid, sku, cantidad_solicitada)

        tipo_nombre = 'Despacho'
        if factura.tipo_factura == 'CASH':
            tipo_nombre = 'Factura Contado'
        elif factura.tipo_factura == 'CREDIT':
            tipo_nombre = 'Factura Crédito'
        elif factura.tipo_factura == 'ORDER':
            tipo_nombre = 'Pedido de Venta'
        elif factura.tipo_factura == 'DISPATCH':
            tipo_nombre = 'Despacho/Conduce'

        # Construir lista de asignaciones: múltiples o una sola (retrocompatibilidad)
        lista_asignaciones = []
        if asignaciones and len(asignaciones) > 0:
            for a in asignaciones:
                u = (a.get('ubicacion') or '').strip()
                try:
                    c = float(a.get('cantidad') or 0)
                except (ValueError, TypeError):
                    c = 0
                if c > 0:
                    lista_asignaciones.append({'ubicacion': u, 'cantidad': c})
        else:
            ubicacion_raw = data.get('ubicacion')
            ubicacion = (ubicacion_raw or "").strip() if ubicacion_raw is not None else ""
            cantidad = data.get('cantidad')
            if cantidad is not None and float(cantidad) > 0:
                lista_asignaciones.append({'ubicacion': ubicacion, 'cantidad': float(cantidad)})

        # S/K: sin asignaciones (un solo registro de cantidad pendiente)
        if not requiere_ubicacion:
            cantidad = cantidad_pendiente if not lista_asignaciones else sum(a['cantidad'] for a in lista_asignaciones)
            if not lista_asignaciones:
                cantidad = data.get('cantidad')
                if cantidad is None:
                    return jsonify({"success": False, "error": "Cantidad es requerida"}), 400
                cantidad = float(cantidad)
            es_valido, mensaje = validar_cantidad(cantidad)
            if not es_valido:
                return jsonify({"success": False, "error": mensaje}), 400
            if cantidad > cantidad_pendiente + 0.01:
                return jsonify({"success": False, "error": f"Cantidad excede lo pendiente"}), 400

            tipo_item_nombre = 'Servicio' if item_type == 'S' else 'Kit'
            notas_movimiento = f"{tipo_nombre} {factura.factura_docid or 'DocID N/A'} (GUID: {factura_guid[:8]}...) - {tipo_item_nombre} (ItemType: {item_type}) - Sin ubicación física"
            movimiento = Movimiento(
                tipo="PICK",
                product_id=producto_factura.get("ItemID"),
                sku=sku,
                ubicacion_origen=None,
                ubicacion_destino=None,
                cantidad=cantidad,
                factura_id=factura.factura_docid,
                factura_guid=factura_guid,
                usuario_id=session.get('user_id'),
                notas=notas_movimiento
            )
            db.session.add(movimiento)
        else:
            # Items: requiere asignaciones con ubicación
            loc_es_adesa = es_ubicacion_adesa(factura.location_id or "", factura.location_name or "")

            if not lista_asignaciones:
                return jsonify({"success": False, "error": "Ingresa al menos una ubicación y cantidad"}), 400

            suma_asignaciones = sum(a['cantidad'] for a in lista_asignaciones)
            if suma_asignaciones > cantidad_pendiente + 0.01:
                return jsonify({
                    "success": False,
                    "error": f"La suma ({suma_asignaciones:.2f}) excede lo pendiente ({cantidad_pendiente:.2f})"
                }), 400

            if loc_es_adesa:
                # ADESA: micro-ubicaciones físicas WMS, validar y descontar StockUbicacion
                for a in lista_asignaciones:
                    ubicacion = a['ubicacion']
                    cantidad = a['cantidad']
                    if cantidad <= 0:
                        continue
                    if not ubicacion:
                        return jsonify({"success": False, "error": "Ubicación es requerida para cada asignación"}), 400
                    es_valido, mensaje = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({"success": False, "error": mensaje}), 400
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({"success": False, "error": mensaje}), 400

                    mov, err = _crear_movimiento_pick_item(factura, producto_factura, ubicacion, cantidad, tipo_nombre)
                    if mov is None:
                        return jsonify({"success": False, "error": err}), 400
            else:
                # No-ADESA (macro): usar location_name como ubicación, NO tocar StockUbicacion
                location_name = factura.location_name or "NO-ADESA"
                for a in lista_asignaciones:
                    cantidad = a['cantidad']
                    if cantidad <= 0:
                        continue
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({"success": False, "error": mensaje}), 400

                    notas_mov = f"{tipo_nombre} {factura.factura_docid or 'DocID N/A'} (GUID: {factura_guid[:8]}...) desde ADM Cloud - Ubicación ADM: {location_name}"
                    movimiento = Movimiento(
                        tipo="PICK",
                        product_id=producto_factura.get("ItemID"),
                        sku=sku,
                        ubicacion_origen=location_name,
                        ubicacion_destino=None,
                        cantidad=cantidad,
                        factura_id=factura.factura_docid,
                        factura_guid=factura_guid,
                        usuario_id=session.get('user_id'),
                        notas=notas_mov
                    )
                    db.session.add(movimiento)

        # Actualizar estado de factura
        if factura.estado_despacho == 'PENDIENTE':
            factura.estado_despacho = 'EN_PROCESO'
            factura.fecha_inicio = datetime.utcnow()
            factura.usuario_despachador = session.get('user_id')

        total_despachado = sum(
            calcular_cantidad_despachada(factura_guid, p.get("SKU") or p.get("ItemSKU"))
            for p in productos
        )
        total_solicitado = sum(float(p.get("Quantity", 0)) for p in productos)
        if total_despachado >= total_solicitado:
            factura.estado_despacho = 'COMPLETO'
            factura.completed_at = datetime.utcnow()

        # Actualizar cache ADM: restar la cantidad despachada de la ubicación ADM de la factura
        cantidad_pick_total = sum(a['cantidad'] for a in lista_asignaciones) if lista_asignaciones else cantidad
        if factura.location_id and cantidad_pick_total > 0:
            from utils.helpers import actualizar_cache_adm, resolver_producto_adm
            producto_db = resolver_producto_adm(item_id=producto_factura.get("ItemID"), sku=sku)
            if producto_db:
                actualizar_cache_adm(producto_db.id, factura.location_id,
                                     delta=-cantidad_pick_total,
                                     location_name=factura.location_name)

        db.session.commit()

        try:
            actualizar_discrepancias_por_skus({sku})
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias tras picking: {e_disc}")

        return jsonify({
            "success": True,
            "message": "Picking registrado exitosamente",
            "cantidad_pendiente": calcular_cantidad_pendiente(factura_guid, sku, cantidad_solicitada)
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "error": "Error al registrar picking",
            "message": str(e)
        }), 500


@despacho_bp.route('/api/despacho/factura/<factura_guid>/estado', methods=['GET'])
@require_auth
def obtener_estado_despacho(factura_guid):
    """Obtiene el estado de despacho de una factura o dispatch con cantidades despachadas por producto"""
    try:
        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        
        if not factura:
            return jsonify({
                "success": False,
                "error": "Documento no encontrado"
            }), 404
        
        import json
        productos = json.loads(factura.productos_json) if factura.productos_json else []
        
        # Detectar si la ubicación del documento es ADESA (micro-ubicaciones) o no (macro)
        loc_es_adesa = es_ubicacion_adesa(factura.location_id or "", factura.location_name or "")
        
        productos_estado = []
        logger.info(f"DESPACHO - Procesando {len(productos)} productos de factura {factura_guid}, es_adesa={loc_es_adesa}")
        
        for producto in productos:
            # Extraer SKU de la factura (probar múltiples campos posibles)
            sku_raw = producto.get("SKU") or producto.get("ItemSKU") or producto.get("sku") or ""
            sku = sku_raw.strip().upper() if sku_raw else ""
            
            logger.info(f"DESPACHO - Procesando producto: SKU={sku}, campos disponibles: {list(producto.keys())}")
            
            cantidad_solicitada = float(producto.get("Quantity", 0))
            cantidad_despachada = calcular_cantidad_despachada(factura_guid, sku)
            cantidad_pendiente = calcular_cantidad_pendiente(factura_guid, sku, cantidad_solicitada)
            
            # Obtener ubicación de origen de la factura (definir ANTES del if producto_adm para evitar error)
            location_name_origen = factura.location_name or "ADESA"  # Default a ADESA si no está configurado
            
            # Obtener stock de ADESA desde StockProductoADM (cache local)
            # Usar la misma lógica que en productos.py para consistencia
            stock_adesa = 0
            
            if not sku:
                logger.warning(f"DESPACHO - SKU vacío para producto: {producto.get('Name', 'Sin nombre')}")
                productos_estado.append({
                    "sku": sku,
                    "nombre": producto.get("Name", ""),
                    "cantidad_solicitada": cantidad_solicitada,
                    "cantidad_despachada": cantidad_despachada,
                    "cantidad_pendiente": cantidad_pendiente,
                    "completo": cantidad_pendiente <= 0,
                    "stock_adesa_adm": 0,
                    "ubicaciones": [],
                    "picks_registrados": []
                })
                continue
            
            # Buscar producto usando ItemID (prioridad) con fallback a SKU
            from utils.helpers import resolver_producto_adm
            item_id_json = producto.get("ItemID", "")
            producto_adm = resolver_producto_adm(item_id=item_id_json, sku=sku)
            logger.info(f"DESPACHO - resolver_producto_adm(ItemID={item_id_json}, SKU={sku}): {'ENCONTRADO id=' + str(producto_adm.id) if producto_adm else 'NO ENCONTRADO'}")
            
            if producto_adm:
                from utils.helpers import obtener_stock_vigente
                logger.info(f"DESPACHO - Producto ID={producto_adm.id}, SKU={producto_adm.sku}, buscando stock vigente")
                logger.info(f"DESPACHO - Ubicacion de origen de factura: '{location_name_origen}', location_id='{factura.location_id}'")
                
                if factura.location_id:
                    stock_vigente = obtener_stock_vigente(producto_adm.id, factura.location_id)
                    if stock_vigente:
                        stock_cantidad = float(stock_vigente.stock) if stock_vigente.stock else 0.0
                        logger.info(f"DESPACHO - Stock vigente encontrado: {stock_cantidad}")
                        if stock_cantidad > 0:
                            stock_adesa = stock_cantidad
                    else:
                        logger.info(f"DESPACHO - No hay fila vigente para producto_id={producto_adm.id}, location_id={factura.location_id}")
                else:
                    from database.models import SyncLocationStatus
                    loc_status = SyncLocationStatus.query.filter_by(location_name=location_name_origen).first()
                    if not loc_status:
                        loc_status = SyncLocationStatus.query.filter(
                            SyncLocationStatus.location_name.ilike(f'%{location_name_origen}%')
                        ).first()
                    if loc_status:
                        stock_vigente = obtener_stock_vigente(producto_adm.id, loc_status.location_id)
                        if stock_vigente:
                            stock_cantidad = float(stock_vigente.stock) if stock_vigente.stock else 0.0
                            if stock_cantidad > 0:
                                stock_adesa = stock_cantidad
                            logger.info(f"DESPACHO - Stock vigente (fallback por nombre): {stock_cantidad}")
                
                if stock_adesa == 0:
                    logger.warning(f"DESPACHO - Stock {location_name_origen} = 0 para SKU={sku}")
            else:
                logger.warning(f"DESPACHO - ❌ Producto NO encontrado en ProductoADM para SKU={sku}")
            
            # Ubicaciones disponibles: solo micro-ubicaciones WMS si es ADESA
            ubicaciones_disponibles = []
            if loc_es_adesa:
                ubicaciones_producto = StockUbicacion.query.filter_by(sku=sku).all()
                for stock_ubic in ubicaciones_producto:
                    if float(stock_ubic.cantidad) > 0:
                        ubicaciones_disponibles.append({
                            "ubicacion": stock_ubic.ubicacion,
                            "cantidad": float(stock_ubic.cantidad)
                        })
            
            # Picks ya registrados para este SKU
            picks_registrados = []
            movimientos_pick = Movimiento.query.filter_by(
                tipo='PICK',
                factura_guid=factura_guid,
                sku=sku
            ).order_by(Movimiento.timestamp).all()
            for mov in movimientos_pick:
                ubicacion_pick = mov.ubicacion_origen or '(S/K sin ubicación)'
                picks_registrados.append({
                    "ubicacion": ubicacion_pick,
                    "cantidad": float(mov.cantidad)
                })
            
            productos_estado.append({
                "sku": sku,
                "nombre": producto.get("Name", ""),
                "cantidad_solicitada": cantidad_solicitada,
                "cantidad_despachada": cantidad_despachada,
                "cantidad_pendiente": cantidad_pendiente,
                "completo": cantidad_pendiente <= 0,
                "stock_adesa_adm": stock_adesa,
                "ubicacion_origen_factura": location_name_origen,
                "ubicaciones": ubicaciones_disponibles,
                "picks_registrados": picks_registrados
            })
        
        return jsonify({
            "success": True,
            "factura_guid": factura_guid,
            "estado_despacho": factura.estado_despacho,
            "es_adesa": loc_es_adesa,
            "location_name": factura.location_name or "ADESA",
            "productos": productos_estado
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener estado de despacho",
            "message": str(e)
        }), 500


@despacho_bp.route('/api/despacho/<factura_guid>/revertir', methods=['POST'])
@require_admin
def revertir_despacho(factura_guid):
    """Reverte un despacho procesado (solo administradores) - Elimina movimientos y revierte stock"""
    try:
        # Obtener todos los movimientos de este despacho
        movimientos = Movimiento.query.filter_by(
            tipo='PICK',
            factura_guid=factura_guid
        ).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "No se encontraron movimientos para este despacho"
            }), 404
        
        # Obtener factura para determinar ubicación
        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        loc_es_adesa = es_ubicacion_adesa(
            (factura.location_id or "") if factura else "",
            (factura.location_name or "") if factura else ""
        )
        
        # Revertir stock (físico + cache) y eliminar movimientos
        from utils.helpers import actualizar_cache_adm
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

            # Solo revertir StockUbicacion si es ADESA (micro-ubicaciones físicas)
            if loc_es_adesa and movimiento.ubicacion_origen:
                stock_ubic = StockUbicacion.query.filter_by(
                    sku=sku_mov,
                    ubicacion=movimiento.ubicacion_origen
                ).first()
                if stock_ubic:
                    stock_ubic.cantidad = float(stock_ubic.cantidad) + cant
                    stock_ubic.updated_at = datetime.utcnow()
                    stock_revertido += 1

            db.session.delete(movimiento)

        # Revertir cache ADM (simétrico: sumar lo que se restó al registrar)
        from utils.helpers import resolver_producto_adm
        if factura and factura.location_id:
            for (pid, sku_rev), cantidad_rev in cantidades_por_producto.items():
                producto_db = resolver_producto_adm(item_id=pid, sku=sku_rev)
                if producto_db:
                    actualizar_cache_adm(producto_db.id, factura.location_id,
                                         delta=+cantidad_rev, location_name=factura.location_name)
                    cache_revertido += 1
        
        # Actualizar estado de factura
        if factura:
            factura.estado_despacho = 'PENDIENTE'
            factura.fecha_inicio = None
            factura.completed_at = None
            factura.usuario_despachador = None
        
        db.session.commit()

        try:
            skus_revertidos = set(sku for (_, sku) in cantidades_por_producto.keys())
            if skus_revertidos:
                actualizar_discrepancias_por_skus(skus_revertidos)
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias tras revertir despacho: {e_disc}")
        
        mensaje = f"Despacho revertido exitosamente. Se eliminaron {total_movimientos} movimiento(s)."
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
        logger.error(f"Error al revertir despacho: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al revertir despacho",
            "message": str(e)
        }), 500


@despacho_bp.route('/api/despacho/<factura_guid>/refrescar', methods=['POST'])
@require_auth
def refrescar_despacho(factura_guid):
    """Refresca los datos de un despacho desde ADM Cloud"""
    try:
        data = request.json or {}
        docid_provided = data.get('docid', '').strip()
        tipo_frontend = data.get('tipo_factura', '').strip().upper()
        
        logger.info(f"[REFRESCAR] Inicio: GUID={factura_guid}, DocID={docid_provided}, tipo_frontend={tipo_frontend}")
        
        movimientos = Movimiento.query.filter_by(
            tipo='PICK',
            factura_guid=factura_guid
        ).first()
        
        user_rol = session.get('user_rol', '').lower()
        es_admin = user_rol == 'administrador'
        
        if movimientos and not es_admin:
            return jsonify({
                "success": False,
                "error": "No se puede refrescar un despacho ya procesado. Solo administradores pueden hacerlo."
            }), 403
        
        # Buscar factura: primero por GUID, fallback por DocID
        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        if not factura and docid_provided:
            factura = FacturaProcesada.query.filter_by(factura_docid=docid_provided).first()
            if factura:
                logger.info(f"[REFRESCAR] Factura encontrada por DocID fallback. GUID BD={factura.factura_guid}, actualizando a {factura_guid}")
                factura.factura_guid = factura_guid
        
        docid = docid_provided or (factura.factura_docid if factura else '')
        
        if not docid:
            return jsonify({
                "success": False,
                "error": "No se pudo determinar el DocID del despacho. Busca el despacho nuevamente por número."
            }), 400
        
        # Determinar tipo: BD > frontend > default DISPATCH
        tipo_factura = (factura.tipo_factura if factura and factura.tipo_factura else None) \
                       or tipo_frontend \
                       or 'DISPATCH'
        
        logger.info(f"[REFRESCAR] DocID={docid}, tipo_factura resuelto={tipo_factura} (BD={factura.tipo_factura if factura else 'N/A'}, frontend={tipo_frontend})")
        
        adm_client = get_adm_client()
        
        try:
            from utils.helpers import obtener_productos_factura
            adm_data = None
            
            if tipo_factura == 'DISPATCH':
                logger.info(f"[REFRESCAR] Buscando como DISPATCH en ADM...")
                result = adm_client.buscar_dispatch_por_docid(docid, max_search=2000)
                if result and isinstance(result, dict) and result.get("success"):
                    adm_data = result.get("data", {})
            else:
                tipo_busqueda = tipo_factura if tipo_factura in ('CASH', 'CREDIT', 'ORDER') else 'CASH'
                logger.info(f"[REFRESCAR] Buscando como factura tipo={tipo_busqueda} en ADM...")
                result = adm_client.buscar_factura_por_docid(docid, tipo=tipo_busqueda, max_search=2000)
                if result and isinstance(result, dict) and result.get("success"):
                    adm_data = result.get("data", {})
            
            if not adm_data:
                logger.warning(f"[REFRESCAR] Documento {docid} no encontrado con tipo={tipo_factura}")
                return jsonify({
                    "success": False,
                    "error": f"No se encontró el documento {docid} en ADM Cloud (buscado como {tipo_factura})"
                }), 404
            
            guid_adm = adm_data.get("ID")
            
            if tipo_factura == 'DISPATCH':
                productos = obtener_productos_dispatch(adm_data)
            else:
                productos = obtener_productos_factura(adm_data)
            
            cliente = adm_data.get("RelationshipName", "N/A")
            fecha_str = adm_data.get("DocDate") or adm_data.get("Date") or adm_data.get("CreatedDate")
            fecha = parse_fecha_adm(fecha_str)
            location_name = adm_data.get("LocationName", "")
            location_id = adm_data.get("LocationID", "")
            total = float(adm_data.get("Total", 0) or 0)
            
            if factura:
                factura.productos_json = json.dumps(productos)
                if guid_adm and factura.factura_guid != guid_adm:
                    factura.factura_guid = guid_adm
                if location_name:
                    factura.location_name = location_name
                if location_id:
                    factura.location_id = location_id
                factura.tipo_factura = tipo_factura
                db.session.commit()
                logger.info(f"[REFRESCAR] BD actualizada: GUID={guid_adm}, {len(productos)} productos, tipo={tipo_factura}")
            else:
                new_factura = FacturaProcesada(
                    factura_guid=guid_adm or factura_guid,
                    factura_docid=docid,
                    tipo_factura=tipo_factura,
                    cliente=cliente,
                    fecha=fecha,
                    total=total,
                    productos_json=json.dumps(productos),
                    estado_despacho='PENDIENTE',
                    location_id=location_id,
                    location_name=location_name
                )
                db.session.add(new_factura)
                db.session.commit()
                logger.info(f"[REFRESCAR] Nueva factura creada: GUID={guid_adm}, DocID={docid}")
            
            return jsonify({
                "success": True,
                "message": "Datos refrescados desde ADM Cloud y guardados",
                "factura": {
                    "guid": guid_adm or factura_guid,
                    "docid": adm_data.get("DocID", ""),
                    "cliente": cliente,
                    "fecha": formatear_fecha_documento(fecha),
                    "location_id": location_id,
                    "location_name": location_name,
                    "es_adesa": es_ubicacion_adesa(location_id or "", location_name or ""),
                    "total": total,
                    "productos": productos,
                    "tipo_factura": tipo_factura
                }
            })
            
        except Exception as api_error:
            logger.error(f"[REFRESCAR] Error ADM Cloud: {str(api_error)}")
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud",
                "message": str(api_error)
            }), 500
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"[REFRESCAR] Error general: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al refrescar despacho",
            "message": str(e)
        }), 500


