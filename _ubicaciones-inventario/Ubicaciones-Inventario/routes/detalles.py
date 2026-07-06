"""
Rutas para obtener detalles completos de registros (auditoría)
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth
from database import db
from database.models import FacturaProcesada, TransferenciaProcesada, Movimiento, Usuario, SyncLocationStatus
from utils.helpers import (
    obtener_productos_factura,
    obtener_productos_dispatch,
    obtener_productos_location_transfer,
    formatear_fecha_iso_utc,
    formatear_fecha_documento,
    es_ubicacion_adesa,
    parsear_ajuste_id,
    parse_fecha_adm,
    get_adm_client,
    resolver_nombre_ubicacion_adm,
)
from sqlalchemy import or_
import json
import logging
import traceback
import sys

detalles_bp = Blueprint('detalles', __name__)
logger = logging.getLogger(__name__)


@detalles_bp.route('/api/detalles/despacho/<factura_guid>', methods=['GET'])
@require_auth
def detalles_despacho(factura_guid):
    """Obtiene detalles completos de un despacho con todos sus movimientos"""
    try:
        # Obtener factura
        factura = FacturaProcesada.query.filter_by(factura_guid=factura_guid).first()
        if not factura:
            return jsonify({
                "success": False,
                "error": "Despacho no encontrado"
            }), 404
        
        # Si el estado es PENDIENTE, recargar desde ADM Cloud
        if factura.estado_despacho == 'PENDIENTE':
            logger.info(f"Recargando factura PENDIENTE desde ADM Cloud: {factura.factura_docid}")
            try:
                adm_client = get_adm_client()
                
                tipo = factura.tipo_factura or 'CASH'
                es_dispatch = (tipo == 'DISPATCH')
                
                if es_dispatch:
                    dispatch_data = adm_client.buscar_dispatch_por_docid(factura.factura_docid, max_search=2000)
                    if dispatch_data and isinstance(dispatch_data, dict) and dispatch_data.get("success"):
                        factura_adm = dispatch_data.get("data")
                        if isinstance(factura_adm, dict) and "data" in factura_adm:
                            factura_adm = factura_adm["data"]
                    else:
                        factura_adm = None
                else:
                    tipo_busqueda = tipo if tipo in ('CASH', 'CREDIT', 'ORDER') else 'CASH'
                    factura_adm = adm_client.buscar_factura_por_docid(factura.factura_docid, tipo_busqueda, max_search=2000)
                    if factura_adm and isinstance(factura_adm, dict) and factura_adm.get("success"):
                        factura_adm = factura_adm.get("data")
                        if isinstance(factura_adm, dict) and "data" in factura_adm:
                            factura_adm = factura_adm["data"]
                
                if factura_adm and isinstance(factura_adm, dict):
                    if es_dispatch:
                        productos = obtener_productos_dispatch(factura_adm)
                    else:
                        productos = obtener_productos_factura(factura_adm)
                    
                    # Extraer ubicación
                    location_id = factura_adm.get("LocationID")
                    location_name = factura_adm.get("LocationName")
                    if location_id and not location_name:
                        ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id).first()
                        if ubicacion:
                            location_name = ubicacion.location_name
                    if not location_name:
                        location_name = "ADESA"
                    
                    # Actualizar campos
                    factura.cliente = factura_adm.get("RelationshipName") or factura.cliente
                    factura.fecha = parse_fecha_adm(factura_adm.get("DocDate")) or factura.fecha
                    factura.total = factura_adm.get("TotalAmount") or factura.total
                    factura.productos_json = json.dumps(productos)
                    factura.location_id = location_id or factura.location_id
                    factura.location_name = location_name or factura.location_name
                    
                    # Si no tiene usuario_solicitante, asignarlo
                    usuario_actual_id = session.get('user_id')
                    if not factura.usuario_solicitante and usuario_actual_id:
                        factura.usuario_solicitante = usuario_actual_id
                    
                    db.session.commit()
                    logger.info(f"Factura {factura.factura_docid} actualizada desde ADM Cloud")
            except Exception as e:
                logger.error(f"Error al recargar factura desde ADM Cloud: {e}")
                logger.error(traceback.format_exc())
                # Continuar con los datos existentes si falla la recarga
        
        # Obtener productos del JSON
        productos_factura = json.loads(factura.productos_json) if factura.productos_json else []
        
        # Obtener todos los movimientos relacionados
        movimientos = Movimiento.query.filter_by(
            tipo='PICK',
            factura_guid=factura_guid
        ).order_by(Movimiento.timestamp).all()
        
        # Agrupar movimientos por SKU
        movimientos_por_sku = {}
        for mov in movimientos:
            sku = mov.sku
            if sku not in movimientos_por_sku:
                movimientos_por_sku[sku] = {
                    'sku': sku,
                    'nombre': None,  # Se obtendrá del producto
                    'cantidad_solicitada': 0,
                    'cantidad_despachada': 0,
                    'movimientos': []
                }
            
            # Obtener nombre del producto desde productos_factura
            for prod in productos_factura:
                if (prod.get('SKU', '').upper() == sku or 
                    prod.get('ItemSKU', '').upper() == sku):
                    movimientos_por_sku[sku]['nombre'] = prod.get('Name', 'Sin nombre')
                    movimientos_por_sku[sku]['cantidad_solicitada'] = float(prod.get('Quantity', 0))
                    break
            
            movimientos_por_sku[sku]['cantidad_despachada'] += float(mov.cantidad)
            movimientos_por_sku[sku]['movimientos'].append({
                'id': mov.id,
                'ubicacion': mov.ubicacion_origen,
                'cantidad': float(mov.cantidad),
                'fecha': formatear_fecha_iso_utc(mov.timestamp),
                'usuario': mov.usuario.nombre if mov.usuario else 'N/A',
                'notas': mov.notas
            })
        
        # Obtener usuarios
        usuario_despachador = Usuario.query.get(factura.usuario_despachador) if factura.usuario_despachador else None
        usuario_solicitante = Usuario.query.get(factura.usuario_solicitante) if factura.usuario_solicitante else None
        
        from utils.helpers import es_ubicacion_adesa
        return jsonify({
            "success": True,
            "despacho": {
                "id": factura.id,
                "factura_docid": factura.factura_docid,
                "factura_guid": factura.factura_guid,
                "tipo_factura": factura.tipo_factura,
                "cliente": factura.cliente,
                "fecha": formatear_fecha_documento(factura.fecha),
                "total": float(factura.total) if factura.total else 0.0,
                "estado_despacho": factura.estado_despacho,
                "location_id": factura.location_id,
                "location_name": factura.location_name,
                "es_adesa": es_ubicacion_adesa(factura.location_id or "", factura.location_name or ""),
                "productos_originales": productos_factura,
                "usuario_despachador": {
                    "id": usuario_despachador.id,
                    "nombre": usuario_despachador.nombre
                } if usuario_despachador else None,
                "usuario_solicitante": {
                    "id": usuario_solicitante.id,
                    "nombre": usuario_solicitante.nombre
                } if usuario_solicitante else None,
                "fecha_inicio": formatear_fecha_iso_utc(factura.fecha_inicio),
                "completed_at": formatear_fecha_iso_utc(factura.completed_at),
                "created_at": formatear_fecha_iso_utc(factura.created_at),
                "productos_despachados": list(movimientos_por_sku.values()),
                "total_movimientos": len(movimientos)
            }
        })
        
    except Exception as e:
        logger.error(f"Error al obtener detalles de despacho: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener detalles de despacho",
            "message": str(e)
        }), 500


@detalles_bp.route('/api/detalles/recepcion/<recepcion_guid>', methods=['GET'])
@require_auth
def detalles_recepcion(recepcion_guid):
    """Obtiene detalles completos de una recepción con todos sus movimientos"""
    try:
        # Obtener movimientos de recepción
        movimientos = Movimiento.query.filter_by(
            tipo='RECEIPT',
            factura_guid=recepcion_guid
        ).order_by(Movimiento.timestamp).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "Recepción no encontrada"
            }), 404
        
        # Agrupar movimientos por SKU y ubicación
        productos_recepcion = {}
        for mov in movimientos:
            key = f"{mov.sku}_{mov.ubicacion_destino}"
            if key not in productos_recepcion:
                productos_recepcion[key] = {
                    'sku': mov.sku,
                    'product_id': mov.product_id,
                    'ubicacion': mov.ubicacion_destino,
                    'cantidad_total': 0,
                    'movimientos': []
                }
            
            productos_recepcion[key]['cantidad_total'] += float(mov.cantidad)
            productos_recepcion[key]['movimientos'].append({
                'id': mov.id,
                'cantidad': float(mov.cantidad),
                'fecha': formatear_fecha_iso_utc(mov.timestamp),
                'usuario': mov.usuario.nombre if mov.usuario else 'N/A',
                'notas': mov.notas
            })
        
        # Obtener información del primer movimiento (fecha, usuario)
        primer_movimiento = movimientos[0]
        usuario = Usuario.query.get(primer_movimiento.usuario_id) if primer_movimiento.usuario_id else None
        
        return jsonify({
            "success": True,
            "recepcion": {
                "guid": recepcion_guid,
                "fecha": formatear_fecha_iso_utc(primer_movimiento.timestamp),
                "usuario": {
                    "id": usuario.id,
                    "nombre": usuario.nombre
                } if usuario else None,
                "productos": list(productos_recepcion.values()),
                "total_productos": len(productos_recepcion),
                "total_movimientos": len(movimientos)
            }
        })
        
    except Exception as e:
        logger.error(f"Error al obtener detalles de recepción: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener detalles de recepción",
            "message": str(e)
        }), 500


@detalles_bp.route('/api/detalles/transferencia/<transferencia_guid>', methods=['GET'])
@require_auth
def detalles_transferencia(transferencia_guid):
    """Obtiene detalles completos de una transferencia con todos sus movimientos"""
    try:
        # Obtener transferencia
        transferencia = TransferenciaProcesada.query.filter_by(
            transferencia_guid=transferencia_guid
        ).first()
        
        if not transferencia:
            return jsonify({
                "success": False,
                "error": "Transferencia no encontrada"
            }), 404
        
        # Si el estado es PENDIENTE, recargar desde ADM Cloud
        if transferencia.estado_procesamiento == 'PENDIENTE':
            logger.info(f"Recargando transferencia PENDIENTE desde ADM Cloud: {transferencia.transferencia_docid}")
            try:
                adm_client = get_adm_client()
                transfer_adm = adm_client.buscar_location_transfer_por_docid(
                    transferencia.transferencia_docid, 
                    max_search=2000
                )
                
                if transfer_adm and isinstance(transfer_adm, dict) and transfer_adm.get("success"):
                    transfer_data = transfer_adm.get("data", {})
                    if isinstance(transfer_data, dict) and "data" in transfer_data:
                        transfer_data = transfer_data["data"]
                    
                    if transfer_data and isinstance(transfer_data, dict):
                        # Actualizar transferencia con datos frescos de ADM
                        productos = obtener_productos_location_transfer(transfer_data)
                        
                        # Ubicaciones
                        location_id_origen = transfer_data.get("LocationID")
                        location_id_destino = transfer_data.get("ReceptionLocationID")
                        location_name_origen = transfer_data.get("LocationName")
                        location_name_destino = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName")
                        
                        # Obtener nombres desde cache si no vienen
                        if location_id_origen and not location_name_origen:
                            ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id_origen).first()
                            if ubicacion:
                                location_name_origen = ubicacion.location_name
                        if location_id_destino and not location_name_destino:
                            ubicacion = SyncLocationStatus.query.filter_by(location_id=location_id_destino).first()
                            if ubicacion:
                                location_name_destino = ubicacion.location_name
                        
                        # Actualizar campos
                        transferencia.location_id_origen = location_id_origen or transferencia.location_id_origen
                        transferencia.location_name_origen = location_name_origen or transferencia.location_name_origen
                        transferencia.location_id_destino = location_id_destino or transferencia.location_id_destino
                        transferencia.location_name_destino = location_name_destino or transferencia.location_name_destino
                        transferencia.fecha_transferencia = parse_fecha_adm(transfer_data.get("DocDate")) or transferencia.fecha_transferencia
                        transferencia.productos_json = json.dumps(productos)
                        
                        # Si no tiene usuario_solicitante, asignarlo
                        usuario_actual_id = session.get('user_id')
                        if not transferencia.usuario_solicitante and usuario_actual_id:
                            transferencia.usuario_solicitante = usuario_actual_id
                        
                        db.session.commit()
                        logger.info(f"Transferencia {transferencia.transferencia_docid} actualizada desde ADM Cloud")
            except Exception as e:
                logger.error(f"Error al recargar transferencia desde ADM Cloud: {e}")
                logger.error(traceback.format_exc())
                # Continuar con los datos existentes si falla la recarga
        
        # Obtener productos del JSON
        productos_transferencia = json.loads(transferencia.productos_json) if transferencia.productos_json else []
        
        # Obtener todos los movimientos relacionados
        movimientos = Movimiento.query.filter_by(
            tipo='TRANSFER',
            factura_guid=transferencia_guid
        ).order_by(Movimiento.timestamp).all()
        
        # Agrupar movimientos por SKU
        movimientos_por_sku = {}
        
        # Si no hay movimientos, construir desde productos_transferencia (para registros PENDIENTE)
        if not movimientos and productos_transferencia:
            for prod in productos_transferencia:
                sku = (prod.get('SKU') or prod.get('ItemSKU') or '').strip().upper()
                if sku:
                    movimientos_por_sku[sku] = {
                        'sku': sku,
                        'nombre': prod.get('Name', 'Sin nombre'),
                        'cantidad_transferida': float(prod.get('Quantity', 0)),
                        'movimientos': []
                    }
        else:
            # Si hay movimientos, procesarlos normalmente
            for mov in movimientos:
                sku = mov.sku
                if sku not in movimientos_por_sku:
                    movimientos_por_sku[sku] = {
                        'sku': sku,
                        'nombre': None,
                        'cantidad_transferida': 0,
                        'movimientos': []
                    }
                
                # Obtener nombre del producto
                for prod in productos_transferencia:
                    if (prod.get('SKU', '').upper() == sku or 
                        prod.get('ItemSKU', '').upper() == sku):
                        movimientos_por_sku[sku]['nombre'] = prod.get('Name', 'Sin nombre')
                        break
                
                movimientos_por_sku[sku]['cantidad_transferida'] += float(mov.cantidad)
                movimientos_por_sku[sku]['movimientos'].append({
                    'id': mov.id,
                    'ubicacion_origen': mov.ubicacion_origen,
                    'ubicacion_destino': mov.ubicacion_destino,
                    'cantidad': float(mov.cantidad),
                    'fecha': formatear_fecha_iso_utc(mov.timestamp),
                    'usuario': mov.usuario.nombre if mov.usuario else 'N/A',
                    'notas': mov.notas
                })
        
        # Obtener usuarios
        usuario_procesador = Usuario.query.get(transferencia.usuario_procesador) if transferencia.usuario_procesador else None
        usuario_solicitante = Usuario.query.get(transferencia.usuario_solicitante) if transferencia.usuario_solicitante else None
        
        nombre_origen = resolver_nombre_ubicacion_adm(
            transferencia.location_id_origen, transferencia.location_name_origen
        )
        nombre_destino = resolver_nombre_ubicacion_adm(
            transferencia.location_id_destino, transferencia.location_name_destino
        )
        # ✅ REGLA DE ORO #4: Detectar si ubicaciones son ADESA (usar nombre resuelto, no placeholder)
        origen_es_adesa = es_ubicacion_adesa(transferencia.location_id_origen, nombre_origen)
        destino_es_adesa = es_ubicacion_adesa(transferencia.location_id_destino, nombre_destino)

        return jsonify({
            "success": True,
            "transferencia": {
                "id": transferencia.id,
                "transferencia_docid": transferencia.transferencia_docid,
                "transferencia_guid": transferencia.transferencia_guid,
                "guid": transferencia.transferencia_guid,  # ✅ Alias para compatibilidad con frontend
                "docid": transferencia.transferencia_docid,  # ✅ Alias para compatibilidad
                "origen_nombre": nombre_origen,
                "destino_nombre": nombre_destino,
                "location_name_origen": nombre_origen,
                "location_name_destino": nombre_destino,
                "origen_es_adesa": origen_es_adesa,
                "destino_es_adesa": destino_es_adesa,
                "ubicacion_fisica_origen": transferencia.ubicacion_fisica_origen,
                "ubicacion_fisica_destino": transferencia.ubicacion_fisica_destino,
                "fecha_transferencia": formatear_fecha_documento(transferencia.fecha_transferencia),
                "estado_procesamiento": transferencia.estado_procesamiento,
                "productos_originales": productos_transferencia,
                "productos": productos_transferencia,  # Alias para compatibilidad
                "usuario_procesador": {
                    "id": usuario_procesador.id,
                    "nombre": usuario_procesador.nombre
                } if usuario_procesador else None,
                "usuario_solicitante": {
                    "id": usuario_solicitante.id,
                    "nombre": usuario_solicitante.nombre
                } if usuario_solicitante else None,
                "fecha_procesamiento": formatear_fecha_iso_utc(transferencia.fecha_procesamiento),
                "created_at": formatear_fecha_iso_utc(transferencia.created_at),
                "productos_transferidos": list(movimientos_por_sku.values()),
                "total_movimientos": len(movimientos)
            }
        })
        
    except Exception as e:
        logger.error(f"Error al obtener detalles de transferencia: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener detalles de transferencia",
            "message": str(e)
        }), 500


@detalles_bp.route('/api/detalles/ajuste/<ajuste_id>', methods=['GET'])
@require_auth
def detalles_ajuste(ajuste_id):
    """Obtiene detalles completos de un ajuste con todos sus movimientos"""
    try:
        from database.models import UbicacionFisica, ProductoADM
        
        timestamp, ubicacion = parsear_ajuste_id(ajuste_id)
        
        if not timestamp:
            return jsonify({
                "success": False,
                "error": "Formato de ID de ajuste inválido. Formato esperado: timestamp_ubicacion"
            }), 400
        
        # Obtener movimientos de ajuste
        # Si ubicacion es "None" o None, buscar por ubicacion_origen (ajustes que reducen stock a 0)
        # Si ubicacion tiene valor, buscar por ubicacion_destino (ajustes que aumentan stock)
        if ubicacion == "None" or ubicacion is None:
            # Ajuste a 0: buscar por ubicacion_origen
            movimientos = Movimiento.query.filter(
                Movimiento.tipo == 'ADJUSTMENT',
                Movimiento.timestamp == timestamp,
                Movimiento.ubicacion_origen.isnot(None)
            ).order_by(Movimiento.sku).all()
            
            # Si no encuentra por origen, intentar por destino None (por si acaso)
            if not movimientos:
                movimientos = Movimiento.query.filter(
                    Movimiento.tipo == 'ADJUSTMENT',
                    Movimiento.timestamp == timestamp,
                    Movimiento.ubicacion_destino.is_(None)
                ).order_by(Movimiento.sku).all()
        else:
            # Ajuste normal: buscar por ubicacion_destino o ubicacion_origen (para cubrir ambos casos)
            movimientos = Movimiento.query.filter(
                Movimiento.tipo == 'ADJUSTMENT',
                Movimiento.timestamp == timestamp,
                or_(
                    Movimiento.ubicacion_destino == ubicacion,
                    Movimiento.ubicacion_origen == ubicacion
                )
            ).order_by(Movimiento.sku).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "Ajuste no encontrado"
            }), 404
        
        # Determinar ubicación real del ajuste
        # Si ubicacion es "None", obtener la ubicación del primer movimiento (ubicacion_origen)
        ubicacion_real = ubicacion
        if ubicacion == "None" or ubicacion is None:
            if movimientos and movimientos[0].ubicacion_origen:
                ubicacion_real = movimientos[0].ubicacion_origen
            elif movimientos and movimientos[0].ubicacion_destino:
                ubicacion_real = movimientos[0].ubicacion_destino
        
        # Determinar si es ubicación física o ADM
        es_ubicacion_fisica = False
        if ubicacion_real:
            ubicacion_fisica = UbicacionFisica.query.filter_by(
                codigo=ubicacion_real.upper(),
                activa=True
            ).first()
            es_ubicacion_fisica = ubicacion_fisica is not None
            if not es_ubicacion_fisica and len(ubicacion_real) >= 6 and any(c.isdigit() for c in ubicacion_real):
                es_ubicacion_fisica = True
        
        # Agrupar por SKU con información detallada
        productos_ajuste = {}
        for mov in movimientos:
            sku = mov.sku
            if sku not in productos_ajuste:
                from utils.helpers import resolver_producto_adm
                nombre_producto = None
                producto_db = resolver_producto_adm(item_id=mov.product_id, sku=sku)
                if producto_db:
                    nombre_producto = producto_db.nombre
                
                productos_ajuste[sku] = {
                    'sku': sku,
                    'nombre': nombre_producto or 'Sin nombre',
                    'product_id': mov.product_id,
                    'cantidad_ajustada': 0.0,
                    'cantidad_anterior': None,
                    'cantidad_nueva': None,
                    'diferencia': 0.0,
                    'movimientos': [],
                    'notas': mov.notas
                }
            
            cantidad_mov = float(mov.cantidad) if mov.cantidad else 0.0
            productos_ajuste[sku]['cantidad_ajustada'] += abs(cantidad_mov)
            
            # Intentar extraer información de las notas
            notas = mov.notas or ''
            if 'Anterior:' in notas and 'Nuevo:' in notas:
                try:
                    partes_notas = notas.split('Anterior:')[1].split(',') if 'Anterior:' in notas else []
                    if partes_notas:
                        anterior_str = partes_notas[0].strip()
                        nuevo_str = partes_notas[1].split('Nuevo:')[1].strip() if len(partes_notas) > 1 else None
                        if nuevo_str:
                            productos_ajuste[sku]['cantidad_anterior'] = float(anterior_str)
                            productos_ajuste[sku]['cantidad_nueva'] = float(nuevo_str)
                            productos_ajuste[sku]['diferencia'] = productos_ajuste[sku]['cantidad_nueva'] - (productos_ajuste[sku]['cantidad_anterior'] or 0)
                except:
                    pass
            
            productos_ajuste[sku]['movimientos'].append({
                'id': mov.id,
                'cantidad': cantidad_mov,
                'fecha': formatear_fecha_iso_utc(mov.timestamp),
                'usuario': mov.usuario.nombre if mov.usuario else 'N/A',
                'notas': mov.notas,
                'ubicacion_origen': mov.ubicacion_origen,
                'ubicacion_destino': mov.ubicacion_destino
            })
        
        # Obtener usuario del primer movimiento
        usuario = Usuario.query.get(movimientos[0].usuario_id) if movimientos[0].usuario_id else None
        
        # Calcular totales
        total_cantidad_ajustada = sum(p['cantidad_ajustada'] for p in productos_ajuste.values())
        
        return jsonify({
            "success": True,
            "ajuste": {
                "id": ajuste_id,
                "fecha": formatear_fecha_iso_utc(timestamp),
                "ubicacion": ubicacion_real or ubicacion,  # Usar ubicacion_real si está disponible
                "es_ubicacion_fisica": es_ubicacion_fisica,
                "tipo_ajuste": "Físico" if es_ubicacion_fisica else "ADM",
                "usuario": {
                    "id": usuario.id,
                    "nombre": usuario.nombre
                } if usuario else None,
                "productos": list(productos_ajuste.values()),
                "total_productos": len(productos_ajuste),
                "total_movimientos": len(movimientos),
                "total_cantidad_ajustada": total_cantidad_ajustada,
                "notas": movimientos[0].notas if movimientos else None
            }
        })
        
    except Exception as e:
        logger.error(f"Error al obtener detalles de ajuste: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener detalles de ajuste",
            "message": str(e)
        }), 500

