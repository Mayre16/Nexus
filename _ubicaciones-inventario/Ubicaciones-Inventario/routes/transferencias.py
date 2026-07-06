"""
Rutas para consulta y gestión de transferencias entre ubicaciones (LocationTransfers)
Módulo separado: maneja TRANSFERENCIAS de inventario entre ubicaciones ADM
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth, require_admin
from database import db
from database.models import SyncLocationStatus, TransferenciaProcesada, Movimiento, StockUbicacion, Usuario, ProductoADM, StockProductoADM, UbicacionFisica
from utils.helpers import (
    obtener_productos_location_transfer,
    es_ubicacion_adesa,
    formatear_fecha_documento,
    calcular_cantidad_asignada_transfer,
    calcular_cantidad_restante_transfer,
    parse_fecha_adm,
    get_adm_client,
    resolver_nombre_ubicacion_adm,
)
from utils.validaciones import validar_factura_docid, validar_sku, validar_ubicacion, validar_cantidad
from utils.discrepancias import actualizar_discrepancias_por_skus
import json
import traceback
import sys
import logging
from datetime import datetime

transferencias_bp = Blueprint('transferencias', __name__)

logger = logging.getLogger(__name__)


def obtener_nombre_ubicacion_por_id(location_id: str) -> str:
    """
    Obtiene el nombre de una ubicación por su ID (sync_locations_status,
    luego stock_productos_adm; si no, fragmento de GUID).
    """
    return resolver_nombre_ubicacion_adm(location_id or None, None)


@transferencias_bp.route('/api/transferencias/buscar', methods=['POST'])
@require_auth
def buscar_transferencia():
    """Busca una transferencia entre ubicaciones por DocID"""
    try:
        data = request.json or {}
        docid = data.get('docid', '').strip()
        
        # Validar DocID
        es_valido, mensaje = validar_factura_docid(docid)
        if not es_valido:
            return jsonify({
                "success": False,
                "error": mensaje
            }), 400
        
        adm_client = get_adm_client()
        
        # Buscar en ADM Cloud
        try:
            logger.info(f"Buscando transferencia: DocID={docid}")
            transfer_adm = adm_client.buscar_location_transfer_por_docid(docid, max_search=2000)
            logger.info(f"Resultado búsqueda: {transfer_adm is not None}")
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
        
        if not transfer_adm:
            return jsonify({
                "success": False,
                "error": f"Transferencia {docid} no encontrada en ADM Cloud",
                "message": f"La transferencia no se encontró después de buscar hasta 2000 transferencias. Verifica que el DocID '{docid}' sea correcto."
            }), 404
        
        if not isinstance(transfer_adm, dict) or not transfer_adm.get("success"):
            error_msg = transfer_adm.get("message") if isinstance(transfer_adm, dict) else "Error desconocido al consultar ADM Cloud"
            return jsonify({
                "success": False,
                "error": "Error al consultar ADM Cloud",
                "message": error_msg
            }), 500
        
        transfer_data = transfer_adm.get("data", {})
        
        if not transfer_data:
            return jsonify({
                "success": False,
                "error": "Transferencia encontrada pero sin datos",
                "message": "La transferencia se encontró pero no contiene información válida"
            }), 404
        
        # Extraer información de la transferencia
        transfer_guid = transfer_data.get("ID")
        transfer_docid = transfer_data.get("DocID", "")
        doc_type = transfer_data.get("DocType", "INV_TRA")
        
        # Ubicación Origen y Destino
        location_id_origen = transfer_data.get("LocationID")
        location_id_destino = transfer_data.get("ReceptionLocationID")
        
        # Obtener nombres de ubicaciones desde la cache
        origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
        destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)
        
        # Si no se encuentra en cache, intentar usar los nombres del JSON
        if origen_nombre.startswith(location_id_origen[:8] if location_id_origen else ""):
            origen_nombre = transfer_data.get("LocationName", origen_nombre)
        if destino_nombre.startswith(location_id_destino[:8] if location_id_destino else ""):
            destino_nombre = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName", destino_nombre)
        
        fecha_str = transfer_data.get("DocDate") or transfer_data.get("Date") or transfer_data.get("CreatedDate")
        fecha = parse_fecha_adm(fecha_str)
        
        # Obtener productos de la transferencia
        productos = obtener_productos_location_transfer(transfer_data)
        
        # ✅ REGLA DE ORO #4: Detectar si ubicaciones son ADESA (recalcular siempre)
        origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
        destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)
        
        logger.info(f"Transferencia {transfer_guid}: origen_es_adesa={origen_es_adesa} (LocationID={location_id_origen}, Name={origen_nombre}), destino_es_adesa={destino_es_adesa} (LocationID={location_id_destino}, Name={destino_nombre})")
        
        # Obtener usuario actual
        usuario_actual_id = session.get('user_id')
        
        # Verificar si ya fue procesada o buscada
        transferencia_procesada = TransferenciaProcesada.query.filter_by(
            transferencia_guid=transfer_guid
        ).first()
        
        # Si no existe, crear registro inicial con usuario_solicitante
        if not transferencia_procesada:
            transferencia_procesada = TransferenciaProcesada(
                transferencia_docid=transfer_docid,
                transferencia_guid=transfer_guid,
                location_id_origen=location_id_origen,
                location_name_origen=origen_nombre,
                location_id_destino=location_id_destino,
                location_name_destino=destino_nombre,
                fecha_transferencia=fecha,
                estado_procesamiento='PENDIENTE',
                productos_json=json.dumps(productos),
                usuario_solicitante=usuario_actual_id  # Usuario que busca/solicita
            )
            db.session.add(transferencia_procesada)
        else:
            if not transferencia_procesada.usuario_solicitante and usuario_actual_id:
                transferencia_procesada.usuario_solicitante = usuario_actual_id
        
        # Actualizar estado según movimientos existentes (PENDIENTE → EN_PROCESO → PROCESADA)
        movimientos_existentes = Movimiento.query.filter_by(tipo='TRANSFER', factura_guid=transfer_guid).all()
        if movimientos_existentes:
            total_requerido = sum(float(p.get('Quantity', 0)) for p in productos)
            total_registrado = sum(float(m.cantidad) for m in movimientos_existentes)
            if total_registrado >= total_requerido:
                transferencia_procesada.estado_procesamiento = 'PROCESADA'
            else:
                transferencia_procesada.estado_procesamiento = 'EN_PROCESO'
        db.session.commit()
        
        # Obtener información del usuario solicitante si existe
        usuario_solicitante_info = None
        if transferencia_procesada and transferencia_procesada.usuario_solicitante:
            from database.models import Usuario
            usuario_solicitante = Usuario.query.get(transferencia_procesada.usuario_solicitante)
            if usuario_solicitante:
                usuario_solicitante_info = {
                    "id": usuario_solicitante.id,
                    "nombre": usuario_solicitante.nombre
                }
        
        # Preparar respuesta
        respuesta = {
            "success": True,
            "transferencia": {
                "guid": transfer_guid,
                "docid": transfer_docid,
                "tipo": doc_type,
                "fecha": formatear_fecha_documento(fecha),
                "origen_id": location_id_origen,
                "origen_nombre": origen_nombre,
                "destino_id": location_id_destino,
                "destino_nombre": destino_nombre,
                "origen_es_adesa": origen_es_adesa,
                "destino_es_adesa": destino_es_adesa,
                "productos": productos,
                "estado_procesamiento": transferencia_procesada.estado_procesamiento if transferencia_procesada else "PENDIENTE",
                "fecha_procesamiento": transferencia_procesada.fecha_procesamiento.isoformat() if transferencia_procesada and transferencia_procesada.fecha_procesamiento else None,
                "usuario_solicitante": usuario_solicitante_info
            }
        }
        
        return jsonify(respuesta)
        
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"Error inesperado al buscar transferencia: {str(e)}")
        logger.error(error_trace)
        return jsonify({
            "success": False,
            "error": "Error inesperado al buscar transferencia"
        }), 500


@transferencias_bp.route('/api/transferencias/actualizar-solicitante', methods=['POST'])
@require_auth
def actualizar_solicitante_transferencia():
    """Actualiza el usuario solicitante de una transferencia"""
    try:
        data = request.json or {}
        transferencia_guid = data.get('transferencia_guid')
        usuario_id = data.get('usuario_id')
        
        if not transferencia_guid or not usuario_id:
            return jsonify({
                "success": False,
                "error": "GUID de transferencia y usuario son requeridos"
            }), 400
        
        transferencia = TransferenciaProcesada.query.filter_by(transferencia_guid=transferencia_guid).first()
        if not transferencia:
            return jsonify({
                "success": False,
                "error": "Transferencia no encontrada"
            }), 404
        
        transferencia.usuario_solicitante = usuario_id
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Usuario solicitante actualizado"
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al actualizar usuario solicitante: {e}")
        return jsonify({
            "success": False,
            "error": "Error al actualizar usuario solicitante",
            "message": str(e)
        }), 500


@transferencias_bp.route('/api/transferencias/transferencia/<transferencia_guid>/estado', methods=['GET'])
@require_auth
def obtener_estado_transferencia(transferencia_guid):
    """Obtiene el estado de la transferencia por producto (asignado, restante, asignaciones registradas)"""
    try:
        transferencia = TransferenciaProcesada.query.filter_by(transferencia_guid=transferencia_guid).first()
        if not transferencia:
            return jsonify({"success": False, "error": "Transferencia no encontrada"}), 404
        
        productos = json.loads(transferencia.productos_json) if transferencia.productos_json else []
        total_requerido = sum(float(p.get('Quantity', 0)) for p in productos)
        total_registrado = sum(
            float(m.cantidad) for m in Movimiento.query.filter_by(
                tipo='TRANSFER', factura_guid=transferencia_guid
            ).all()
        )
        if total_registrado >= total_requerido:
            estado_transferencia = 'PROCESADA'
        elif total_registrado > 0:
            estado_transferencia = 'EN_PROCESO'
        else:
            estado_transferencia = 'PENDIENTE'
        
        productos_estado = []
        for producto in productos:
            sku = (producto.get("SKU") or producto.get("ItemSKU") or "").strip().upper()
            cantidad_total = float(producto.get("Quantity", 0))
            cantidad_asignada = calcular_cantidad_asignada_transfer(transferencia_guid, sku)
            cantidad_restante = calcular_cantidad_restante_transfer(transferencia_guid, sku, cantidad_total)
            completo = cantidad_restante <= 0
            
            asignaciones_registradas = []
            movs = Movimiento.query.filter_by(
                tipo='TRANSFER', factura_guid=transferencia_guid, sku=sku
            ).order_by(Movimiento.timestamp).all()
            for mov in movs:
                asignaciones_registradas.append({
                    "origen": mov.ubicacion_origen or '',
                    "destino": mov.ubicacion_destino or '',
                    "cantidad": float(mov.cantidad)
                })
            
            productos_estado.append({
                "sku": sku,
                "nombre": producto.get("Name", ""),
                "cantidad_total": cantidad_total,
                "cantidad_asignada": cantidad_asignada,
                "cantidad_restante": cantidad_restante,
                "completo": completo,
                "asignaciones_registradas": asignaciones_registradas
            })
        
        return jsonify({
            "success": True,
            "transferencia_guid": transferencia_guid,
            "estado_transferencia": estado_transferencia,
            "productos": productos_estado
        })
    except Exception as e:
        logger.error(f"Error al obtener estado transferencia: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@transferencias_bp.route('/api/transferencias/registrar-linea', methods=['POST'])
@require_auth
def registrar_linea_transferencia():
    """Registra una línea de transferencia (un SKU con asignaciones origen/destino)"""
    try:
        data = request.json or {}
        transferencia_guid = data.get('transferencia_guid')
        sku = (data.get('sku') or '').strip().upper()
        asignaciones_origen = data.get('asignaciones_origen', [])
        asignaciones_destino = data.get('asignaciones_destino', [])

        if not transferencia_guid:
            return jsonify({"success": False, "error": "GUID de transferencia es requerido"}), 400
        es_valido, mensaje = validar_sku(sku)
        if not es_valido:
            return jsonify({"success": False, "error": mensaje}), 400

        transferencia = TransferenciaProcesada.query.filter_by(transferencia_guid=transferencia_guid).first()
        if not transferencia:
            return jsonify({"success": False, "error": "Transferencia no encontrada"}), 404
        if transferencia.estado_procesamiento == 'PROCESADA':
            return jsonify({"success": False, "error": "Esta transferencia ya fue completada"}), 400

        productos = json.loads(transferencia.productos_json) if transferencia.productos_json else []
        producto = next((p for p in productos if (p.get("SKU") or p.get("ItemSKU") or "").upper() == sku), None)
        if not producto:
            return jsonify({"success": False, "error": f"Producto {sku} no está en esta transferencia"}), 400

        cantidad_total = float(producto.get("Quantity", 0))
        item_id = producto.get("ItemID", "")
        cantidad_ya = calcular_cantidad_asignada_transfer(transferencia_guid, sku)
        restante = calcular_cantidad_restante_transfer(transferencia_guid, sku, cantidad_total)
        if restante <= 0:
            return jsonify({"success": False, "error": f"El producto {sku} ya está completamente registrado"}), 400

        suma_origen = sum(float(a.get('cantidad', 0)) for a in asignaciones_origen)
        suma_destino = sum(float(a.get('cantidad', 0)) for a in asignaciones_destino)
        if suma_origen <= 0 or suma_destino <= 0:
            return jsonify({"success": False, "error": "Se requieren asignaciones de origen y destino"}), 400
        if suma_origen != suma_destino:
            return jsonify({"success": False, "error": "La suma de origen debe coincidir con la suma de destino"}), 400
        if cantidad_ya + suma_destino > cantidad_total:
            return jsonify({"success": False, "error": f"Excedería la cantidad total. Restante: {restante}"}), 400

        # Obtener datos ADM
        adm_client = get_adm_client()
        transfer_adm = adm_client.obtener_location_transfer_por_guid(transferencia_guid)
        if not transfer_adm or not transfer_adm.get("success"):
            return jsonify({"success": False, "error": "No se pudo obtener la transferencia desde ADM Cloud"}), 404
        transfer_data = transfer_adm.get("data", {})
        location_id_origen = transfer_data.get("LocationID")
        location_id_destino = transfer_data.get("ReceptionLocationID")
        origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
        destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)
        if not origen_nombre or origen_nombre.startswith(location_id_origen[:8] if location_id_origen else ""):
            origen_nombre = transfer_data.get("LocationName", origen_nombre)
        if not destino_nombre or destino_nombre.startswith(location_id_destino[:8] if location_id_destino else ""):
            destino_nombre = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName", destino_nombre)

        origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
        destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)

        # Validar y procesar origen
        if origen_es_adesa:
            for a in asignaciones_origen:
                ub = (a.get('ubicacion') or '').strip()
                cant = float(a.get('cantidad', 0))
                if cant <= 0:
                    continue
                es_ok, msg = validar_ubicacion(ub)
                if not es_ok:
                    return jsonify({"success": False, "error": f"Origen: {msg}"}), 400
                if UbicacionFisica.query.filter_by(codigo=ub, activa=True).first() is None:
                    return jsonify({"success": False, "error": f"Ubicación origen '{ub}' no existe"}), 400
                stock_u = StockUbicacion.query.filter_by(sku=sku, ubicacion=ub).first()
                if not stock_u or float(stock_u.cantidad) < cant:
                    sf = float(stock_u.cantidad) if stock_u else 0
                    return jsonify({"success": False, "error": f"Stock insuficiente en {ub}. Disponible: {sf}"}), 400
                stock_u.cantidad = float(stock_u.cantidad) - cant
                stock_u.updated_at = datetime.utcnow()
        else:
            pass

        # Cache ADM origen: actualizar via helper centralizado
        from utils.helpers import actualizar_cache_adm, resolver_producto_adm
        ambos_adesa = origen_es_adesa and destino_es_adesa
        if not ambos_adesa:
            prod_db = resolver_producto_adm(item_id=item_id, sku=sku)
            if prod_db and location_id_origen:
                actualizar_cache_adm(prod_db.id, location_id_origen, delta=-suma_origen, location_name=origen_nombre)

        # Crear movimientos: emparejar origen-destino en orden
        idx_o, idx_d = 0, 0
        rest_o = [float(a.get('cantidad', 0)) for a in asignaciones_origen]
        rest_d = [float(a.get('cantidad', 0)) for a in asignaciones_destino]
        ubic_o = [(a.get('ubicacion') or '').strip() for a in asignaciones_origen]
        ubic_d = [(a.get('ubicacion') or '').strip() for a in asignaciones_destino]
        if not origen_es_adesa:
            ubic_o = [origen_nombre[:200]] * len(ubic_o) if ubic_o else [origen_nombre[:200]]
        if not destino_es_adesa:
            ubic_d = [destino_nombre[:200]] * len(ubic_d) if ubic_d else [destino_nombre[:200]]

        i_o, i_d = 0, 0
        while i_o < len(rest_o) and i_d < len(rest_d):
            c = min(rest_o[i_o], rest_d[i_d])
            if c <= 0:
                if rest_o[i_o] <= 0:
                    i_o += 1
                if rest_d[i_d] <= 0:
                    i_d += 1
                continue
            u_orig = ubic_o[i_o] if i_o < len(ubic_o) else origen_nombre[:200]
            u_dest = ubic_d[i_d] if i_d < len(ubic_d) else destino_nombre[:200]
            if destino_es_adesa:
                st_d = StockUbicacion.query.filter_by(sku=sku, ubicacion=u_dest).first()
                if st_d:
                    st_d.cantidad = float(st_d.cantidad) + c
                    st_d.updated_at = datetime.utcnow()
                else:
                    db.session.add(StockUbicacion(product_id=item_id or "", sku=sku, ubicacion=u_dest, cantidad=c))
            mov = Movimiento(
                tipo="TRANSFER",
                product_id=item_id or "",
                sku=sku,
                ubicacion_origen=u_orig,
                ubicacion_destino=u_dest,
                cantidad=c,
                factura_id=transfer_data.get("DocID", ""),
                factura_guid=transferencia_guid,
                usuario_id=session.get('user_id'),
                notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}."
            )
            db.session.add(mov)
            rest_o[i_o] -= c
            rest_d[i_d] -= c
            if rest_o[i_o] <= 0:
                i_o += 1
            if rest_d[i_d] <= 0:
                i_d += 1

        # Cache ADM destino: actualizar via helper centralizado
        if not ambos_adesa:
            if not prod_db:
                prod_db = resolver_producto_adm(item_id=item_id, sku=sku)
            if prod_db and location_id_destino:
                actualizar_cache_adm(prod_db.id, location_id_destino, delta=+suma_destino, location_name=destino_nombre)

        # Actualizar estado
        if transferencia.estado_procesamiento == 'PENDIENTE':
            transferencia.estado_procesamiento = 'EN_PROCESO'
        total_reg = sum(float(m.cantidad) for m in Movimiento.query.filter_by(tipo='TRANSFER', factura_guid=transferencia_guid).all())
        total_req = sum(float(p.get('Quantity', 0)) for p in productos)
        if total_reg >= total_req:
            transferencia.estado_procesamiento = 'PROCESADA'

        db.session.commit()
        try:
            actualizar_discrepancias_por_skus({sku})
        except Exception:
            pass
        cant_rest = calcular_cantidad_restante_transfer(transferencia_guid, sku, cantidad_total)
        return jsonify({
            "success": True,
            "message": "Línea registrada",
            "cantidad_restante": cant_rest,
            "cantidad_asignada": calcular_cantidad_asignada_transfer(transferencia_guid, sku),
            "estado_transferencia": transferencia.estado_procesamiento
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error registrar-linea transferencia: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@transferencias_bp.route('/api/transferencias/transferencia/<transferencia_guid>/refrescar', methods=['POST'])
@require_auth
def refrescar_transferencia(transferencia_guid):
    """Refresca la transferencia desde ADM Cloud y actualiza productos/estado"""
    try:
        transferencia = TransferenciaProcesada.query.filter_by(transferencia_guid=transferencia_guid).first()
        if not transferencia:
            return jsonify({"success": False, "error": "Transferencia no encontrada"}), 404

        adm_client = get_adm_client()
        transfer_adm = adm_client.obtener_location_transfer_por_guid(transferencia_guid)
        if not transfer_adm or not transfer_adm.get("success"):
            return jsonify({"success": False, "error": "No se pudo obtener la transferencia desde ADM Cloud"}), 404

        transfer_data = transfer_adm.get("data", {})
        if not transfer_data:
            return jsonify({"success": False, "error": "Sin datos de transferencia en ADM"}), 404

        productos = obtener_productos_location_transfer(transfer_data)
        transferencia.productos_json = json.dumps(productos)

        movimientos_existentes = Movimiento.query.filter_by(tipo='TRANSFER', factura_guid=transferencia_guid).all()
        if movimientos_existentes:
            total_requerido = sum(float(p.get('Quantity', 0)) for p in productos)
            total_registrado = sum(float(m.cantidad) for m in movimientos_existentes)
            transferencia.estado_procesamiento = 'PROCESADA' if total_registrado >= total_requerido else 'EN_PROCESO'
        else:
            transferencia.estado_procesamiento = 'PENDIENTE'

        db.session.commit()

        location_id_origen = transfer_data.get("LocationID")
        location_id_destino = transfer_data.get("ReceptionLocationID")
        origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
        destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)
        if not origen_nombre or (location_id_origen and origen_nombre.startswith(location_id_origen[:8])):
            origen_nombre = transfer_data.get("LocationName", origen_nombre)
        if not destino_nombre or (location_id_destino and destino_nombre.startswith(location_id_destino[:8])):
            destino_nombre = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName", destino_nombre)

        origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
        destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)

        return jsonify({
            "success": True,
            "transferencia": {
                "guid": transferencia_guid,
                "docid": transferencia.transferencia_docid,
                "productos": productos,
                "estado_procesamiento": transferencia.estado_procesamiento,
                "origen_nombre": origen_nombre,
                "destino_nombre": destino_nombre,
                "origen_es_adesa": origen_es_adesa,
                "destino_es_adesa": destino_es_adesa,
            }
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al refrescar transferencia: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@transferencias_bp.route('/api/transferencias/registrar', methods=['POST'])
@require_auth
def registrar_transferencia():
    """
    Registra una transferencia entre ubicaciones aplicando cambios en WMS
    Soporta nueva estructura con asignaciones múltiples por SKU (split por filas)
    REGLA DE ORO #4: Solo modifica StockUbicacion cuando ADESA está involucrado
    """
    try:
        data = request.json or {}
        transferencia_guid = data.get('transferencia_guid')
        
        # NUEVA ESTRUCTURA: productos con asignaciones múltiples
        productos = data.get('productos', [])
        # COMPATIBILIDAD: mantener soporte para estructura antigua
        productos_ubicaciones = data.get('productos_ubicaciones', [])
        
        # Validaciones básicas
        if not transferencia_guid:
            return jsonify({
                "success": False,
                "error": "GUID de transferencia es requerido"
            }), 400
        
        # Si viene estructura nueva, usar esa. Si no, convertir estructura antigua
        if productos and len(productos) > 0:
            # Estructura nueva: productos con asignaciones
            usar_estructura_nueva = True
        elif productos_ubicaciones and len(productos_ubicaciones) > 0:
            # Estructura antigua: convertir a nueva
            usar_estructura_nueva = False
            productos_dict = {}
            for prod_ubic in productos_ubicaciones:
                sku = prod_ubic.get('sku', '').strip().upper()
                if sku not in productos_dict:
                    productos_dict[sku] = {
                        'sku': sku,
                        'item_id': prod_ubic.get('item_id', ''),
                        'cantidad_total': 0,
                        'asignaciones_origen': [],
                        'asignaciones_destino': []
                    }
                cantidad = float(prod_ubic.get('cantidad', 0))
                productos_dict[sku]['cantidad_total'] += cantidad
                productos_dict[sku]['asignaciones_origen'].append({
                    'ubicacion': prod_ubic.get('ubicacion_origen', '').strip(),
                    'cantidad': cantidad
                })
                productos_dict[sku]['asignaciones_destino'].append({
                    'ubicacion': prod_ubic.get('ubicacion_destino', '').strip(),
                    'cantidad': cantidad
                })
            productos = list(productos_dict.values())
        else:
            return jsonify({
                "success": False,
                "error": "Debe asignar al menos un producto"
            }), 400
        
        # Verificar si la transferencia ya fue procesada (idempotencia)
        transferencia_existente = TransferenciaProcesada.query.filter_by(
            transferencia_guid=transferencia_guid
        ).first()
        
        if transferencia_existente and transferencia_existente.estado_procesamiento == 'PROCESADA':
            return jsonify({
                "success": False,
                "error": "Esta transferencia ya fue procesada anteriormente",
                "transferencia": transferencia_existente.to_dict()
            }), 400
        
        # Obtener datos de la transferencia desde ADM Cloud para validar
        adm_client = get_adm_client()
        transfer_adm = adm_client.obtener_location_transfer_por_guid(transferencia_guid)
        
        if not transfer_adm or not transfer_adm.get("success"):
            return jsonify({
                "success": False,
                "error": "No se pudo obtener la transferencia desde ADM Cloud"
            }), 404
        
        transfer_data = transfer_adm.get("data", {})
        location_id_origen = transfer_data.get("LocationID")
        location_id_destino = transfer_data.get("ReceptionLocationID")
        
        # Obtener nombres de ubicaciones
        origen_nombre = obtener_nombre_ubicacion_por_id(location_id_origen)
        destino_nombre = obtener_nombre_ubicacion_por_id(location_id_destino)
        
        # Si no se encuentra en cache, usar los nombres del JSON
        if origen_nombre.startswith(location_id_origen[:8] if location_id_origen else ""):
            origen_nombre = transfer_data.get("LocationName", origen_nombre)
        if destino_nombre.startswith(location_id_destino[:8] if location_id_destino else ""):
            destino_nombre = transfer_data.get("TransferLocationName") or transfer_data.get("ReceptionLocationName", destino_nombre)
        
        fecha_transferencia = parse_fecha_adm(transfer_data.get("DocDate"))
        productos_adm = obtener_productos_location_transfer(transfer_data)
        
        # ✅ SEGURIDAD: Backend SIEMPRE recalcula flags (ignora flags del frontend)
        origen_es_adesa = es_ubicacion_adesa(location_id_origen, origen_nombre)
        destino_es_adesa = es_ubicacion_adesa(location_id_destino, destino_nombre)
        
        logger.info(f"Transferencia {transferencia_guid}: origen_es_adesa={origen_es_adesa}, destino_es_adesa={destino_es_adesa} (recalculado desde ADM Cloud)")
        
        # VALIDACIÓN DE SUMATORIA POR SKU Y VALIDACIONES GENERALES
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            cantidad_total = float(producto.get('cantidad_total', 0))
            asignaciones_origen = producto.get('asignaciones_origen', [])
            asignaciones_destino = producto.get('asignaciones_destino', [])
            item_id = producto.get('item_id', '')
            
            # Validar SKU
            es_valido, mensaje = validar_sku(sku)
            if not es_valido:
                return jsonify({
                    "success": False,
                    "error": f"SKU inválido: {mensaje}"
                }), 400
            
            # REGLA DE ORO #4: Validar origen según tipo
            if origen_es_adesa:
                if not asignaciones_origen or len(asignaciones_origen) == 0:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} necesita asignación de ubicación física origen"
                    }), 400
                
                # Validar suma de asignaciones origen
                suma_origen = sum(float(a.get('cantidad', 0)) for a in asignaciones_origen)
                if suma_origen > cantidad_total:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} tiene asignaciones origen que exceden la cantidad total. Total: {cantidad_total}, Suma: {suma_origen}"
                    }), 400
                
                # Validar que todas las asignaciones origen tengan ubicación y cantidad válida
                for asignacion in asignaciones_origen:
                    ubicacion = asignacion.get('ubicacion', '').strip()
                    cantidad = asignacion.get('cantidad', 0)
                    
                    es_valido, mensaje = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Ubicación origen inválida para {sku}: {mensaje}"
                        }), 400
                    
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku} en origen {ubicacion}: {mensaje}"
                        }), 400
            
            # REGLA DE ORO #4: Validar destino según tipo
            if destino_es_adesa:
                if not asignaciones_destino or len(asignaciones_destino) == 0:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} necesita al menos una asignación de ubicación física destino"
                    }), 400
                
                # Validar suma de asignaciones destino
                suma_destino = sum(float(a.get('cantidad', 0)) for a in asignaciones_destino)
                if suma_destino > cantidad_total:
                    return jsonify({
                        "success": False,
                        "error": f"El producto {sku} tiene asignaciones destino que exceden la cantidad total. Total: {cantidad_total}, Suma: {suma_destino}"
                    }), 400
                
                # Validar que todas las asignaciones destino tengan ubicación y cantidad válida
                for asignacion in asignaciones_destino:
                    ubicacion = asignacion.get('ubicacion', '').strip()
                    cantidad = asignacion.get('cantidad', 0)
                    
                    es_valido, mensaje = validar_ubicacion(ubicacion)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Ubicación destino inválida para {sku}: {mensaje}"
                        }), 400
                    
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku} en destino {ubicacion}: {mensaje}"
                        }), 400
            else:
                # Para NO-ADESA destino: solo validar cantidad (no ubicación física)
                for asignacion in asignaciones_destino:
                    cantidad = asignacion.get('cantidad', 0)
                    es_valido, mensaje = validar_cantidad(cantidad)
                    if not es_valido:
                        return jsonify({
                            "success": False,
                            "error": f"Cantidad inválida para {sku}: {mensaje}"
                        }), 400
        
        # Procesar asignaciones
        from utils.helpers import resolver_producto_adm, actualizar_cache_adm, obtener_stock_vigente
        movimientos_creados = []
        skus_afectados = set()
        
        for producto in productos:
            sku = producto.get('sku', '').strip().upper()
            if sku:
                skus_afectados.add(sku)
            cantidad_total = float(producto.get('cantidad_total', 0))
            item_id = producto.get('item_id', '')
            
            # Para destino ADESA: asignaciones múltiples
            asignaciones_destino = producto.get('asignaciones_destino', [])
            # Para origen ADESA: asignación única (o múltiple si se requiere en el futuro)
            asignaciones_origen = producto.get('asignaciones_origen', [])
            
            # REGLA DE ORO #4: Procesar origen según tipo
            if origen_es_adesa:
                # Origen ADESA: procesar cada asignación origen
                for asignacion_origen in asignaciones_origen:
                    ubicacion_origen = asignacion_origen.get('ubicacion', '').strip()
                    cantidad_origen = float(asignacion_origen.get('cantidad', 0))
                    
                    # ✅ VALIDACIÓN DUAL: StockUbicacion (físico) + StockProductoADM LIVE (ADM)
                    stock_ubic_origen = StockUbicacion.query.filter_by(
                        sku=sku,
                        ubicacion=ubicacion_origen
                    ).first()
                    
                    # Validación 1: Stock físico
                    if not stock_ubic_origen or float(stock_ubic_origen.cantidad) < cantidad_origen:
                        stock_fisico = float(stock_ubic_origen.cantidad) if stock_ubic_origen else 0
                        return jsonify({
                            "success": False,
                            "error": f"Stock insuficiente en ubicación física {ubicacion_origen} para SKU {sku}. Stock: {stock_fisico}, requerido: {cantidad_origen}",
                            "sku_afectado": sku,
                            "ubicacion_afectada": ubicacion_origen
                        }), 400
                    
                    # Validación 2: Stock ADM LIVE
                    from utils.helpers import obtener_stock_vigente, resolver_producto_adm
                    producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                    if producto_db:
                        stock_adm_live = obtener_stock_vigente(producto_db.id, location_id_origen)
                        if stock_adm_live and float(stock_adm_live.stock) < cantidad_origen:
                            nombre_producto = producto.get('nombre') or producto.get('Name') or ''
                            solucion = (
                                f"ADM Cloud ya procesó esta transferencia. El stock en ADM del SKU {sku} está en 0. "
                                f"Solución: Use un Ajuste de inventario para reducir el stock físico de {ubicacion_origen} a 0 y alinear WMS con ADM. "
                                f"Ir a: Ajustes → Nuevo Ajuste"
                            )
                            return jsonify({
                                "success": False,
                                "error": f"Stock insuficiente en ADM Cloud para SKU {sku} ({ubicacion_origen}). Stock LIVE: {stock_adm_live.stock}, requerido: {cantidad_origen}",
                                "advertencia": "ADM Cloud ya procesó esta transferencia. Sincroniza antes de transferir.",
                                "solucion_sugerida": solucion,
                                "sku_afectado": sku,
                                "ubicacion_afectada": ubicacion_origen,
                                "producto_nombre": nombre_producto
                            }), 400
                    
                    # Restar stock de origen (físico)
                    stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) - cantidad_origen
                    stock_ubic_origen.updated_at = datetime.utcnow()

                # Origen ADESA: actualizar cache ADM (excepto ADESA→ADESA donde neto=0)
                if not destino_es_adesa:
                    producto_db_origen = resolver_producto_adm(item_id=item_id, sku=sku)
                    if producto_db_origen and location_id_origen:
                        from utils.helpers import actualizar_cache_adm
                        actualizar_cache_adm(producto_db_origen.id, location_id_origen, delta=-cantidad_total, location_name=origen_nombre)
            else:
                # Origen NO-ADESA: no validar stock, pero advertir si sync es vieja
                ubicacion_origen_mov = origen_nombre[:200]  # Truncar a 200 si necesario
                
                # ✅ ADVERTIR si sync es vieja (>2 horas)
                from database.models import SyncLocationStatus
                estado_sync_origen = SyncLocationStatus.query.filter_by(location_id=location_id_origen).first()
                advertencia_sync_vieja = None
                if estado_sync_origen and estado_sync_origen.last_sync_at:
                    horas_desde_sync = (datetime.utcnow() - estado_sync_origen.last_sync_at).total_seconds() / 3600
                    if horas_desde_sync > 2:
                        advertencia_sync_vieja = f"Última sincronización de {origen_nombre} hace {horas_desde_sync:.1f} horas. Los datos pueden estar desactualizados."
                        logger.warning(f"[TRANSFER] {advertencia_sync_vieja}")
                
                # Actualizar cache ADM origen (no-ADESA) via helper
                producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                
                if producto_db and location_id_origen:
                    from utils.helpers import actualizar_cache_adm
                    actualizar_cache_adm(producto_db.id, location_id_origen, delta=-cantidad_total, location_name=origen_nombre)
                elif not producto_db:
                    logger.warning(f"[TRANSFER] No se encontró producto para actualizar cache origen. SKU={sku}, item_id={item_id}")
                elif not location_id_origen:
                    logger.warning(f"[TRANSFER] No hay location_id_origen para actualizar cache. SKU={sku}, origen_nombre={origen_nombre}")
            
            # REGLA DE ORO #4: Procesar destino según tipo
            if destino_es_adesa:
                # Destino ADESA: procesar cada asignación destino (puede ser múltiple)
                for asignacion_destino in asignaciones_destino:
                    ubicacion_destino = asignacion_destino.get('ubicacion', '').strip()
                    cantidad_destino = float(asignacion_destino.get('cantidad', 0))
                    
                    # Sumar stock a destino
                    stock_ubic_destino = StockUbicacion.query.filter_by(
                        sku=sku,
                        ubicacion=ubicacion_destino
                    ).first()
                    
                    if stock_ubic_destino:
                        stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + cantidad_destino
                        stock_ubic_destino.updated_at = datetime.utcnow()
                    else:
                        stock_ubic_destino = StockUbicacion(
                            product_id=item_id or "",
                            sku=sku,
                            ubicacion=ubicacion_destino,
                            cantidad=cantidad_destino
                        )
                        db.session.add(stock_ubic_destino)
                    
                    # Determinar ubicación origen para este movimiento
                    if origen_es_adesa:
                        # Si origen es ADESA, usar la asignación origen correspondiente
                        # (simplificado: usar primera asignación origen si hay múltiples)
                        ubicacion_origen_mov = asignaciones_origen[0].get('ubicacion', '').strip() if asignaciones_origen else ubicacion_origen_mov
                    else:
                        ubicacion_origen_mov = origen_nombre[:200]
                    
                    # Guardar LocationName completo en notas si se truncó
                    notas_adicionales = []
                    if not origen_es_adesa and len(origen_nombre) > 200:
                        notas_adicionales.append(f"Origen ADM completo: {origen_nombre}")
                    if not destino_es_adesa and len(destino_nombre) > 200:
                        notas_adicionales.append(f"Destino ADM completo: {destino_nombre}")
                    
                    # Crear movimiento por cada asignación destino
                    movimiento = Movimiento(
                        tipo="TRANSFER",
                        product_id=item_id or "",
                        sku=sku,
                        ubicacion_origen=ubicacion_origen_mov,
                        ubicacion_destino=ubicacion_destino,
                        cantidad=cantidad_destino,
                        factura_id=transfer_data.get("DocID", ""),
                        factura_guid=transferencia_guid,
                        usuario_id=session.get('user_id'),
                        notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
                              (" ".join(notas_adicionales) if notas_adicionales else "")
                    )
                    db.session.add(movimiento)
                    movimientos_creados.append(movimiento.to_dict())

                # Destino ADESA: actualizar cache ADM (excepto ADESA→ADESA donde neto=0)
                if not origen_es_adesa:
                    producto_db_destino = resolver_producto_adm(item_id=item_id, sku=sku)
                    if producto_db_destino and location_id_destino:
                        from utils.helpers import actualizar_cache_adm
                        actualizar_cache_adm(producto_db_destino.id, location_id_destino, delta=+cantidad_total, location_name=destino_nombre)
            else:
                # Destino NO-ADESA: no modificar StockUbicacion, actualizar cache ADM via helper
                producto_db = resolver_producto_adm(item_id=item_id, sku=sku)
                
                if producto_db and location_id_destino:
                    from utils.helpers import actualizar_cache_adm
                    actualizar_cache_adm(producto_db.id, location_id_destino, delta=+cantidad_total, location_name=destino_nombre)
                elif not producto_db:
                    logger.warning(f"[TRANSFER] No se encontró producto para actualizar cache destino. SKU={sku}, item_id={item_id}")
                elif not location_id_destino:
                    logger.warning(f"[TRANSFER] No hay location_id_destino para actualizar cache. SKU={sku}, destino_nombre={destino_nombre}")
                
                # Si hay asignaciones destino, crear un movimiento por cada una
                if asignaciones_destino and len(asignaciones_destino) > 0:
                    for asignacion_destino in asignaciones_destino:
                        cantidad_destino = float(asignacion_destino.get('cantidad', 0))
                        ubicacion_destino_mov = destino_nombre[:200]
                        
                        # Determinar ubicación origen
                        if origen_es_adesa:
                            ubicacion_origen_mov = asignaciones_origen[0].get('ubicacion', '').strip() if asignaciones_origen else origen_nombre[:200]
                        else:
                            ubicacion_origen_mov = origen_nombre[:200]
                        
                        # Guardar LocationName completo en notas si se truncó
                        notas_adicionales = []
                        if not origen_es_adesa and len(origen_nombre) > 200:
                            notas_adicionales.append(f"Origen ADM completo: {origen_nombre}")
                        if not destino_es_adesa and len(destino_nombre) > 200:
                            notas_adicionales.append(f"Destino ADM completo: {destino_nombre}")
                        
                        # Crear movimiento
                        movimiento = Movimiento(
                            tipo="TRANSFER",
                            product_id=item_id or "",
                            sku=sku,
                            ubicacion_origen=ubicacion_origen_mov,
                            ubicacion_destino=ubicacion_destino_mov,
                            cantidad=cantidad_destino,
                            factura_id=transfer_data.get("DocID", ""),
                            factura_guid=transferencia_guid,
                            usuario_id=session.get('user_id'),
                            notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
                                  (" ".join(notas_adicionales) if notas_adicionales else "")
                        )
                        db.session.add(movimiento)
                        movimientos_creados.append(movimiento.to_dict())
                else:
                    # Si no hay asignaciones, crear movimiento único con cantidad total
                    ubicacion_destino_mov = destino_nombre[:200]
                    
                    # Determinar ubicación origen
                    if origen_es_adesa:
                        ubicacion_origen_mov = asignaciones_origen[0].get('ubicacion', '').strip() if asignaciones_origen else origen_nombre[:200]
                    else:
                        ubicacion_origen_mov = origen_nombre[:200]
                    
                    # Guardar LocationName completo en notas si se truncó
                    notas_adicionales = []
                    if not origen_es_adesa and len(origen_nombre) > 200:
                        notas_adicionales.append(f"Origen ADM completo: {origen_nombre}")
                    if not destino_es_adesa and len(destino_nombre) > 200:
                        notas_adicionales.append(f"Destino ADM completo: {destino_nombre}")
                    
                    # Crear movimiento único
                    movimiento = Movimiento(
                        tipo="TRANSFER",
                        product_id=item_id or "",
                        sku=sku,
                        ubicacion_origen=ubicacion_origen_mov,
                        ubicacion_destino=ubicacion_destino_mov,
                        cantidad=cantidad_total,
                        factura_id=transfer_data.get("DocID", ""),
                        factura_guid=transferencia_guid,
                        usuario_id=session.get('user_id'),
                        notas=f"Transferencia desde {origen_nombre} hacia {destino_nombre}. " + 
                              (" ".join(notas_adicionales) if notas_adicionales else "")
                    )
                    db.session.add(movimiento)
                    movimientos_creados.append(movimiento.to_dict())
        
        # Crear o actualizar registro de TransferenciaProcesada
        if transferencia_existente:
            transferencia_existente.estado_procesamiento = 'PROCESADA'
            transferencia_existente.fecha_procesamiento = datetime.utcnow()
            transferencia_existente.usuario_procesador = session.get('user_id')
            transferencia_existente.productos_json = json.dumps(productos_adm)
        else:
            # Obtener primera ubicación física de productos para mapeo (si aplica)
            primera_ubic_origen = None
            primera_ubic_destino = None
            if productos and len(productos) > 0:
                if productos[0].get('asignaciones_origen') and len(productos[0].get('asignaciones_origen', [])) > 0:
                    primera_ubic_origen = productos[0]['asignaciones_origen'][0].get('ubicacion')
                if productos[0].get('asignaciones_destino') and len(productos[0].get('asignaciones_destino', [])) > 0:
                    primera_ubic_destino = productos[0]['asignaciones_destino'][0].get('ubicacion')
            
            transferencia_procesada = TransferenciaProcesada(
                transferencia_docid=transfer_data.get("DocID", ""),
                transferencia_guid=transferencia_guid,
                location_id_origen=location_id_origen or "",
                location_name_origen=origen_nombre,
                location_id_destino=location_id_destino or "",
                location_name_destino=destino_nombre,
                fecha_transferencia=fecha_transferencia,
                estado_procesamiento='PROCESADA',
                ubicacion_fisica_origen=primera_ubic_origen,
                ubicacion_fisica_destino=primera_ubic_destino,
                usuario_procesador=session.get('user_id'),
                fecha_procesamiento=datetime.utcnow(),
                productos_json=json.dumps(productos_adm)
            )
            db.session.add(transferencia_procesada)
        
        db.session.commit()

        try:
            if skus_afectados:
                actualizar_discrepancias_por_skus(skus_afectados)
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias tras transferencia: {e_disc}")
        
        return jsonify({
            "success": True,
            "message": "Transferencia registrada exitosamente",
            "movimientos": movimientos_creados,
            "total_movimientos": len(movimientos_creados)
        })
        
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"Error al registrar transferencia: {str(e)}")
        logger.error(error_trace)
        return jsonify({
            "success": False,
            "error": "Error al registrar transferencia",
            "message": str(e)
        }), 500


@transferencias_bp.route('/api/transferencias/<transferencia_guid>/revertir', methods=['POST'])
@require_auth
@require_admin
def revertir_transferencia(transferencia_guid):
    """Revertir una transferencia procesada (solo administradores)"""
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
        
        if transferencia.estado_procesamiento != 'PROCESADA':
            return jsonify({
                "success": False,
                "error": "Solo se pueden revertir transferencias procesadas"
            }), 400
        
        # Obtener todos los movimientos de esta transferencia
        movimientos = Movimiento.query.filter_by(
            tipo='TRANSFER',
            factura_guid=transferencia_guid
        ).all()
        
        if not movimientos:
            return jsonify({
                "success": False,
                "error": "No se encontraron movimientos para esta transferencia"
            }), 404
        
        # Determinar si origen y destino son ADESA
        origen_es_adesa = es_ubicacion_adesa(transferencia.location_id_origen, transferencia.location_name_origen)
        destino_es_adesa = es_ubicacion_adesa(transferencia.location_id_destino, transferencia.location_name_destino)
        
        # Revertir stock (físico + cache) y eliminar movimientos
        from utils.helpers import actualizar_cache_adm
        stock_revertido = 0
        cache_revertido = 0
        total_movimientos = len(movimientos)

        # Acumular cantidades por (product_id, sku) para revertir cache
        cantidades_por_producto = {}
        for movimiento in movimientos:
            cant = float(movimiento.cantidad)
            sku_mov = movimiento.sku
            pid_mov = movimiento.product_id or ""
            key = (pid_mov, sku_mov)
            cantidades_por_producto[key] = cantidades_por_producto.get(key, 0) + cant

            # Revertir StockUbicacion destino (si ADESA)
            if destino_es_adesa and movimiento.ubicacion_destino:
                stock_ubic_destino = StockUbicacion.query.filter_by(
                    sku=sku_mov,
                    ubicacion=movimiento.ubicacion_destino
                ).first()
                if stock_ubic_destino:
                    stock_ubic_destino.cantidad = max(0, float(stock_ubic_destino.cantidad) - cant)
                    stock_ubic_destino.updated_at = datetime.utcnow()
                    stock_revertido += 1

            # Revertir StockUbicacion origen (si ADESA)
            if origen_es_adesa and movimiento.ubicacion_origen:
                stock_ubic_origen = StockUbicacion.query.filter_by(
                    sku=sku_mov,
                    ubicacion=movimiento.ubicacion_origen
                ).first()
                if stock_ubic_origen:
                    stock_ubic_origen.cantidad = float(stock_ubic_origen.cantidad) + cant
                    stock_ubic_origen.updated_at = datetime.utcnow()
                    stock_revertido += 1
                else:
                    stock_ubic_origen = StockUbicacion(
                        product_id=movimiento.product_id or "",
                        sku=sku_mov,
                        ubicacion=movimiento.ubicacion_origen,
                        cantidad=cant
                    )
                    db.session.add(stock_ubic_origen)
                    stock_revertido += 1

            db.session.delete(movimiento)

        # Revertir cache ADM (simétrico al registro): sumar en origen, restar en destino
        # Excepto ADESA→ADESA donde no se tocó cache
        from utils.helpers import resolver_producto_adm
        ambos_adesa = origen_es_adesa and destino_es_adesa
        for (pid, sku_rev), cantidad_rev in cantidades_por_producto.items():
            producto_db = resolver_producto_adm(item_id=pid, sku=sku_rev)
            if not producto_db:
                continue

            if not ambos_adesa and transferencia.location_id_origen:
                actualizar_cache_adm(producto_db.id, transferencia.location_id_origen,
                                     delta=+cantidad_rev, location_name=transferencia.location_name_origen)
                cache_revertido += 1

            if not ambos_adesa and transferencia.location_id_destino:
                actualizar_cache_adm(producto_db.id, transferencia.location_id_destino,
                                     delta=-cantidad_rev, location_name=transferencia.location_name_destino)
                cache_revertido += 1
        
        # Marcar transferencia como PENDIENTE
        transferencia.estado_procesamiento = 'PENDIENTE'
        transferencia.fecha_procesamiento = None
        transferencia.usuario_procesador = None
        
        db.session.commit()

        try:
            skus_revertidos = set(sku for (_, sku) in cantidades_por_producto.keys())
            if skus_revertidos:
                actualizar_discrepancias_por_skus(skus_revertidos)
        except Exception as e_disc:
            logger.warning(f"No se pudo actualizar discrepancias tras revertir transferencia: {e_disc}")
        
        logger.info(f"[REVERTIR TRANSFER] Transferencia {transferencia.transferencia_docid} revertida. "
                     f"Físico revertido: {stock_revertido}, cache revertido: {cache_revertido}")
        
        return jsonify({
            "success": True,
            "message": f"Transferencia revertida exitosamente. Stock físico revertido: {stock_revertido}, cache ADM revertido: {cache_revertido}.",
            "stock_revertido": stock_revertido,
            "cache_revertido": cache_revertido,
            "movimientos_eliminados": total_movimientos
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al revertir transferencia: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al revertir transferencia",
            "message": str(e)
        }), 500


