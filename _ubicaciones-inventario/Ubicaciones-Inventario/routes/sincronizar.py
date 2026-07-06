"""
Rutas para sincronizar productos y stock desde ADM Cloud a la base de datos local
"""
from flask import Blueprint, request, jsonify, session, current_app
from routes.auth import require_auth, require_admin, require_admin_or_cron
from database import db
from database.models import ProductoADM, StockProductoADM, SyncLocationStatus, Discrepancia, StockUbicacion, SyncRun, EnRevision, SchedulerLock
from datetime import datetime, timedelta
import logging
import threading
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from utils.db_helpers import db_commit_with_retry, db_query_with_retry, safe_db_call
from utils.helpers import get_adm_client

sincronizar_bp = Blueprint('sincronizar', __name__)
logger = logging.getLogger(__name__)

# Almacenamiento del progreso de sincronización por usuario
# Estructura: {user_id: {"porcentaje": 0-100, "mensaje": "..."}}
sync_progress = {}
sync_progress_lock = threading.Lock()


@sincronizar_bp.route('/api/sincronizar/productos', methods=['POST'])
@require_auth
def sincronizar_productos():
    """
    Sincroniza productos desde ADM Cloud a la base de datos local.
    También sincroniza el stock por ubicación.
    """
    user_id = session.get('user_id', 'default')
    
    try:
        # Limpiar progreso anterior
        limpiar_progreso(user_id)
        
        # Crear las tablas si no existen
        from database.models import ProductoADM, StockProductoADM
        db.create_all()
        
        logger.info("Iniciando sincronizacion de productos desde ADM Cloud...")
        actualizar_progreso(user_id, 0, "Iniciando sincronización...")
        
        adm_client = get_adm_client()
        
        # Obtener todos los productos desde ADM (en lotes)
        logger.info("Obteniendo productos desde ADM Cloud...")
        actualizar_progreso(user_id, 1, "Obteniendo productos desde ADM Cloud...")
        productos_adm = []
        skip = 0
        batch_size = 50  # Lote más pequeño para evitar problemas
        max_productos = 5000  # Límite razonable para empezar
        
        while len(productos_adm) < max_productos:
            # Obtener lote de productos usando el método público
            result = adm_client._make_request("items/", {
                "skip": skip,
                "take": batch_size
            })
            
            if not result.get("success", False):
                logger.error(f"Error al obtener productos: {result.get('message', 'Error desconocido')}")
                return jsonify({
                    "success": False,
                    "error": "Error al obtener productos desde ADM Cloud",
                    "message": result.get('message', 'Error desconocido')
                }), 500
            
            items = result.get("data", [])
            if not items or len(items) == 0:
                logger.info(f"No hay mas productos. Total obtenido: {len(productos_adm)}")
                break
            
            productos_adm.extend(items)
            logger.info(f"Productos obtenidos hasta ahora: {len(productos_adm)}")
            
            # Actualizar progreso (1-10% para obtención de productos)
            # Calcular porcentaje basado en productos obtenidos vs máximo esperado
            porcentaje_productos = min(10, 1 + int((len(productos_adm) / max_productos) * 9))
            actualizar_progreso(user_id, porcentaje_productos, f"Obteniendo productos desde ADM Cloud... {len(productos_adm)} productos ({porcentaje_productos}%)")
            
            # Si recibimos menos items de los solicitados, significa que no hay más
            if len(items) < batch_size:
                logger.info(f"Ultimo lote recibido. Total: {len(productos_adm)} productos")
                break
            
            skip += batch_size
            
            # Evitar bucles infinitos
            if skip > max_productos:
                logger.warning(f"Llegamos al limite de productos: {max_productos}")
                break
        
        logger.info(f"Se obtuvieron {len(productos_adm)} productos desde ADM Cloud")
        actualizar_progreso(user_id, 10, f"Productos obtenidos: {len(productos_adm)}. Obteniendo ubicaciones...")
        
        # Obtener ubicaciones ADM
        logger.info("Obteniendo ubicaciones desde ADM Cloud...")
        ubicaciones_result = adm_client.obtener_ubicaciones(skip=0, take=50)
        ubicaciones_map = {}  # location_id -> location_name
        
        if ubicaciones_result["success"]:
            for loc in ubicaciones_result["data"]:
                ubicaciones_map[loc.get("ID")] = loc.get("Name", "")
        
        logger.info(f"Se obtuvieron {len(ubicaciones_map)} ubicaciones")
        actualizar_progreso(user_id, 12, f"Ubicaciones obtenidas: {len(ubicaciones_map)}. Obteniendo stock...")
        
        # Obtener stock por ubicación (para todas las ubicaciones)
        logger.info("Obteniendo stock por ubicacion...")
        stock_por_ubicacion = {}  # location_id -> {item_id: stock}
        stock_items_total = 0
        total_ubicaciones = len(ubicaciones_map)
        ubicaciones_procesadas = 0
        
        for location_id, location_name in ubicaciones_map.items():
            ubicaciones_procesadas += 1
            # Actualizar progreso (12-20% para obtención de stock)
            porcentaje_stock = 12 + int((ubicaciones_procesadas / total_ubicaciones) * 8) if total_ubicaciones > 0 else 12
            porcentaje_stock = min(20, porcentaje_stock)  # Asegurar que no exceda 20%
            actualizar_progreso(user_id, porcentaje_stock, f"Obteniendo stock para {location_name}... ({ubicaciones_procesadas}/{total_ubicaciones}) - {porcentaje_stock}%")
            # Obtener stock con paginación para esta ubicación
            skip = 0
            batch_size = 500
            ubicacion_stock_count = 0
            
            while True:
                stock_result = adm_client.obtener_stock(location_id=location_id, skip=skip, take=batch_size)
                if not stock_result["success"]:
                    logger.warning(f"Error al obtener stock para ubicacion {location_name} (ID: {location_id}): {stock_result.get('error', 'Error desconocido')}")
                    break
                
                items_stock = stock_result.get("data", [])
                if not items_stock or len(items_stock) == 0:
                    break  # No hay más items
                
                for item in items_stock:
                    # Probar diferentes campos posibles para ItemID
                    item_id = None
                    if item.get("ItemID"):
                        item_id = item.get("ItemID")
                    elif item.get("ID"):
                        item_id = item.get("ID")
                    elif isinstance(item.get("Item"), dict):
                        item_id = item.get("Item").get("ID") or item.get("Item").get("ItemID")
                    elif item.get("Item"):
                        item_id = item.get("Item")
                    
                    # Probar diferentes campos posibles para SKU
                    item_sku = ""
                    if item.get("ItemSKU"):
                        item_sku = str(item.get("ItemSKU")).upper()
                    elif item.get("SKU"):
                        item_sku = str(item.get("SKU")).upper()
                    elif isinstance(item.get("Item"), dict):
                        item_sku = str(item.get("Item").get("SKU") or item.get("Item").get("ItemSKU") or "").upper()
                    
                    # Probar diferentes campos posibles para stock
                    # Según la prueba en PowerShell: el campo correcto es "Stock"
                    # Orden de prioridad: Stock primero (confirmado en PowerShell), luego otros campos
                    stock = 0.0
                    stock_raw = None
                    # Intentar todos los campos posibles, PRIORIZANDO "Stock" (confirmado en PowerShell)
                    for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                        if item.get(field) is not None:
                            stock_raw = item.get(field)
                            break
                    
                    # Si no se encontró en el nivel principal, buscar en Item
                    if stock_raw is None and isinstance(item.get("Item"), dict):
                        for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                            if item.get("Item").get(field) is not None:
                                stock_raw = item.get("Item").get(field)
                                break
                    
                    try:
                        if stock_raw is not None:
                            stock = float(stock_raw)
                        else:
                            stock = 0.0
                    except (ValueError, TypeError):
                        stock = 0.0
                    
                    # Log para depuración: mostrar estructura completa de los primeros 2 items con stock > 0
                    # Esto nos permitirá ver exactamente qué campos devuelve la API (como en PowerShell)
                    if stock > 0 and stock_items_total < 2:
                        import json
                        logger.info(f"DEBUG Stock item - Estructura completa de la API:")
                        logger.info(f"DEBUG Keys encontradas: {list(item.keys())}")
                        logger.info(f"DEBUG Item completo (JSON): {json.dumps(item, default=str, indent=2)[:500]}...")
                        logger.info(f"DEBUG ItemID={item_id}, SKU={item_sku}, Stock={stock}, Location={location_name}")
                    
                    # Si stock es 0 pero el item existe, también loguear para ver estructura
                    elif stock == 0 and stock_items_total < 2 and item_id:
                        logger.debug(f"DEBUG Item con stock 0 - SKU={item_sku}, ItemID={item_id}, Location={location_name}")
                    
                    if item_id:
                        if location_id not in stock_por_ubicacion:
                            stock_por_ubicacion[location_id] = {}
                        stock_por_ubicacion[location_id][item_id] = {
                            "stock": stock,
                            "sku": item_sku
                        }
                        ubicacion_stock_count += 1
                        stock_items_total += 1
                
                # Si recibimos menos items de los solicitados, ya no hay más
                if len(items_stock) < batch_size:
                    break
                
                skip += batch_size
                # Limitar a 10000 items por ubicación para evitar loops infinitos
                if skip >= 10000:
                    logger.warning(f"Limite de paginacion alcanzado para ubicacion {location_name}")
                    break
            
            logger.info(f"Stock obtenido para {location_name}: {ubicacion_stock_count} items")
        
        logger.info(f"Stock procesado para {len(stock_por_ubicacion)} ubicaciones, total {stock_items_total} items con stock")
        actualizar_progreso(user_id, 20, "Guardando productos en la base de datos...")
        
        # Sincronizar productos en la base de datos
        productos_actualizados = 0
        productos_creados = 0
        productos_total = len(productos_adm)
        stock_registros_creados = 0
        stock_registros_actualizados = 0
        
        for idx, producto_adm in enumerate(productos_adm):
            # Actualizar progreso con más frecuencia (cada 50 productos)
            if (idx + 1) % 50 == 0 or idx == 0:
                logger.info(f"Procesando producto {idx + 1}/{productos_total}...")
                # Actualizar progreso (20-95% para procesamiento de productos, reservando 5% para commit final)
                if productos_total > 0:
                    porcentaje_procesamiento = 20 + int(((idx + 1) / productos_total) * 75)
                    porcentaje_procesamiento = min(95, porcentaje_procesamiento)
                else:
                    porcentaje_procesamiento = 20
                actualizar_progreso(user_id, porcentaje_procesamiento, f"Procesando productos... {idx + 1}/{productos_total} ({porcentaje_procesamiento}%)")
            
            item_id = producto_adm.get("ID")
            if not item_id:
                continue
            
            sku = (producto_adm.get("SKU") or producto_adm.get("ItemSKU") or "").upper()
            nombre = producto_adm.get("Name", "")
            codigo_barras = producto_adm.get("Barcode") or producto_adm.get("BarcodeValue") or None
            
            # Buscar o crear producto
            producto = ProductoADM.query.filter_by(item_id=item_id).first()
            
            if producto:
                # Actualizar existente
                producto.nombre = nombre
                producto.sku = sku
                producto.codigo_barras = codigo_barras
                producto.updated_at = datetime.utcnow()
                productos_actualizados += 1
            else:
                # Crear nuevo
                producto = ProductoADM(
                    item_id=item_id,
                    nombre=nombre,
                    sku=sku,
                    codigo_barras=codigo_barras,
                    updated_at=datetime.utcnow()
                )
                db.session.add(producto)
                productos_creados += 1
                # Hacer flush para obtener el ID del producto
                db.session.flush()
            
            # Sincronizar stock por ubicación (crear entrada para TODAS las ubicaciones ADM)
            for location_id, location_name in ubicaciones_map.items():
                # Buscar stock del producto en esta ubicación
                stock_data = stock_por_ubicacion.get(location_id, {}).get(item_id)
                stock_value = 0.0
                
                if stock_data:
                    stock_value = float(stock_data.get("stock", 0.0) or 0.0)
                    # Log para depuración (solo los primeros 5 productos con stock)
                    if stock_value > 0 and productos_creados + productos_actualizados < 5:
                        logger.info(f"Producto {sku} en {location_name}: stock={stock_value}")
                
                # Buscar o crear registro de stock para esta ubicación
                # IMPORTANTE: Crear registro para TODAS las ubicaciones, incluso con stock 0
                try:
                    stock_obj = db_query_with_retry(
                        lambda: StockProductoADM.query.filter_by(
                            producto_id=producto.id,
                            location_id=location_id
                        ).first(),
                        max_retries=3,
                        retry_delay=0.5
                    )
                except Exception as e:
                    logger.error(f"Error al buscar stock_obj para producto {producto.id} (después de retries): {e}")
                    try:
                        db.session.rollback()
                        stock_obj = StockProductoADM.query.filter_by(
                            producto_id=producto.id,
                            location_id=location_id
                        ).first()
                    except Exception as e2:
                        logger.error(f"Error crítico al buscar stock_obj para producto {producto.id}: {e2}")
                        continue
                
                if stock_obj:
                    # Actualizar existente
                    stock_obj.stock = stock_value
                    stock_obj.location_name = location_name
                    stock_obj.updated_at = datetime.utcnow()
                    stock_registros_actualizados += 1
                else:
                    # Crear nuevo registro (incluso si stock es 0)
                    stock_obj = StockProductoADM(
                        producto_id=producto.id,
                        location_id=location_id,
                        location_name=location_name,
                        stock=stock_value,
                        updated_at=datetime.utcnow()
                    )
                    db.session.add(stock_obj)
                    stock_registros_creados += 1
            
            # Commit periódico cada 100 productos para evitar pérdida de datos si hay timeout
            if (idx + 1) % 100 == 0:
                try:
                    db.session.commit()
                    logger.debug(f"Commit realizado en producto {idx + 1}")
                except Exception as e:
                    logger.error(f"Error en commit periódico: {e}")
                    db.session.rollback()
        
        # Marcar fecha de sincronización
        ahora = datetime.utcnow()
        for producto in ProductoADM.query.all():
            producto.synced_at = ahora
        
        # Commit final
        db.session.commit()
        
        logger.info(f"Sincronizacion completada: {productos_creados} creados, {productos_actualizados} actualizados")
        logger.info(f"Stock: {stock_registros_creados} registros creados, {stock_registros_actualizados} actualizados")
        actualizar_progreso(user_id, 100, f"Sincronización completada: {productos_total} productos procesados (100%)")
        
        resultado = {
            "success": True,
            "message": "Sincronizacion completada exitosamente",
            "productos_creados": productos_creados,
            "productos_actualizados": productos_actualizados,
            "productos_total": productos_total,
            "ubicaciones": len(ubicaciones_map),
            "stock_registros_creados": stock_registros_creados,
            "stock_registros_actualizados": stock_registros_actualizados
        }
        
        # Limpiar progreso después de unos segundos
        import threading
        def limpiar_despues():
            import time
            time.sleep(5)
            limpiar_progreso(user_id)
        threading.Thread(target=limpiar_despues, daemon=True).start()
        
        return jsonify(resultado)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al sincronizar productos: {e}")
        import traceback
        traceback.print_exc()
        actualizar_progreso(user_id, 0, f"Error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al sincronizar productos",
            "message": str(e)
        }), 500


@sincronizar_bp.route('/api/sincronizar/progreso', methods=['GET'])
@require_auth
def obtener_progreso():
    """Obtiene el progreso de la sincronización actual"""
    try:
        user_id = session.get('user_id', 'default')
        with sync_progress_lock:
            progreso = sync_progress.get(user_id, {
                "porcentaje": 0,
                "mensaje": "Sin sincronización en curso"
            })
        porcentaje = progreso.get("porcentaje", 0)
        mensaje = progreso.get("mensaje", "Sin sincronización en curso")
        return jsonify({
            "success": True,
            "percentage": porcentaje,  # Usar "percentage" para consistencia con frontend
            "porcentaje": porcentaje,  # Mantener también "porcentaje" para compatibilidad
            "message": mensaje,  # Usar "message" para consistencia con frontend
            "mensaje": mensaje  # Mantener también "mensaje" para compatibilidad
        })
    except Exception as e:
        logger.error(f"Error al obtener progreso: {e}")
        return jsonify({
            "success": False,
            "percentage": 0,
            "porcentaje": 0,
            "message": "Error al obtener progreso",
            "mensaje": "Error al obtener progreso"
        }), 500


def actualizar_progreso(user_id, porcentaje, mensaje):
    """Actualiza el progreso de sincronización para un usuario"""
    with sync_progress_lock:
        sync_progress[user_id] = {
            "porcentaje": min(100, max(0, porcentaje)),
            "mensaje": mensaje
        }


def limpiar_progreso(user_id):
    """Limpia el progreso de sincronización para un usuario"""
    with sync_progress_lock:
        if user_id in sync_progress:
            del sync_progress[user_id]


def actualizar_productos_en_segundo_plano():
    """
    Actualiza solo los datos de productos (nombre, SKU, código de barras) desde ADM Cloud.
    NO toca el stock (viene de sincronización por ubicación).
    Se ejecuta en segundo plano después de sincronizar una ubicación.
    Usa paginación eficiente (50 productos por llamada) para evitar timeout.
    """
    logger.info("Iniciando actualización de productos en segundo plano (nombre, SKU, código de barras)...")
    
    try:
        from flask import current_app
        with current_app.app_context():
            adm_client = get_adm_client()
            productos_actualizados = 0
            productos_creados = 0
            skip = 0
            batch_size = 50  # ADM Cloud limita a 50 productos por solicitud
            max_productos = 5000  # Límite razonable
            
            while skip < max_productos:
                # Obtener lote de productos
                result = adm_client._make_request("items/", {
                    "skip": skip,
                    "take": batch_size
                })
                
                if not result.get("success", False):
                    logger.warning(f"Error al obtener productos en segundo plano: {result.get('message', 'Error desconocido')}")
                    break
                
                items = result.get("data", [])
                if not items or len(items) == 0:
                    logger.info(f"No hay más productos. Actualización completada.")
                    break
                
                # Procesar cada producto
                for producto_adm in items:
                    item_id = producto_adm.get("ID")
                    if not item_id:
                        continue
                    
                    sku = (producto_adm.get("SKU") or producto_adm.get("ItemSKU") or "").upper()
                    nombre = producto_adm.get("Name", "")
                    codigo_barras = producto_adm.get("Barcode") or producto_adm.get("BarcodeValue") or None
                    
                    # Buscar producto existente
                    producto = ProductoADM.query.filter_by(item_id=item_id).first()
                    
                    if producto:
                        # Actualizar existente (SOLO nombre, SKU, código de barras - NO tocar stock)
                        necesita_actualizar = False
                        if producto.nombre != nombre:
                            producto.nombre = nombre
                            necesita_actualizar = True
                        if producto.sku != sku:
                            producto.sku = sku
                            necesita_actualizar = True
                        if producto.codigo_barras != codigo_barras:
                            producto.codigo_barras = codigo_barras
                            necesita_actualizar = True
                        
                        if necesita_actualizar:
                            producto.updated_at = datetime.utcnow()
                            productos_actualizados += 1
                    else:
                        # Crear nuevo producto (sin stock, eso viene de sync por ubicación)
                        producto = ProductoADM(
                            item_id=item_id,
                            nombre=nombre,
                            sku=sku,
                            codigo_barras=codigo_barras,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(producto)
                        productos_creados += 1
                
                # Commit periódico cada 100 productos para evitar pérdida de datos
                if (skip // batch_size + 1) % 2 == 0:  # Cada 2 lotes (100 productos)
                    try:
                        db.session.commit()
                        logger.debug(f"Commit periódico en segundo plano: {productos_actualizados} actualizados, {productos_creados} creados")
                    except Exception as e:
                        logger.error(f"Error en commit periódico en segundo plano: {e}")
                        db.session.rollback()
                
                # Si recibimos menos items de los solicitados, ya no hay más
                if len(items) < batch_size:
                    break
                
                skip += batch_size
            
            # Commit final
            try:
                db.session.commit()
                logger.info(f"Actualización de productos completada en segundo plano: {productos_actualizados} actualizados, {productos_creados} creados")
            except Exception as e:
                logger.error(f"Error en commit final en segundo plano: {e}")
                db.session.rollback()
                
    except Exception as e:
        logger.error(f"Error en actualización de productos en segundo plano: {e}")
        import traceback
        traceback.print_exc()


@sincronizar_bp.route('/api/sincronizar/estado', methods=['GET'])
@require_auth
def estado_sincronizacion():
    """Obtiene el estado de la última sincronización. Nunca 500 HTML; siempre JSON."""
    import uuid
    request_id = uuid.uuid4().hex[:8]
    logger.info(f"[{request_id}] GET /api/sincronizar/estado")

    def _query():
        total_productos = ProductoADM.query.count()
        ultimo_producto = ProductoADM.query.order_by(ProductoADM.synced_at.desc()).first()
        return {
            "total_productos": total_productos,
            "ultima_sincronizacion": (ultimo_producto.synced_at.isoformat() + 'Z') if ultimo_producto and ultimo_producto.synced_at else None
        }

    result, recovered = safe_db_call(_query, "estado_sincronizacion", request_id)

    if result is not None:
        return jsonify({
            "success": True,
            "total_productos": result["total_productos"],
            "ultima_sincronizacion": result["ultima_sincronizacion"],
            "_recovered": recovered
        })

    # Fallback: siempre JSON (nunca dejar que el teardown reviente con 500 HTML)
    return jsonify({
        "success": False,
        "error": "Error al obtener estado",
        "message": "No se pudo conectar a la base de datos. Intente nuevamente.",
        "_recovered": False,
        "_request_id": request_id
    }), 503


# ==================== NUEVOS ENDPOINTS: SINCRONIZACIÓN POR UBICACIÓN ====================

@sincronizar_bp.route('/api/sincronizar/ubicacion/<location_id>/estado', methods=['GET'])
@require_admin
def estado_ubicacion(location_id):
    """
    Obtiene el estado de sincronización de una ubicación. Nunca 500 HTML.
    """
    import uuid
    request_id = uuid.uuid4().hex[:8]

    def _query():
        return SyncLocationStatus.query.filter_by(location_id=location_id).first()

    estado, recovered = safe_db_call(_query, f"estado_ubicacion_{location_id}", request_id)

    if estado is None:
        # Incluye caso de error DB: fallback a pending
        return jsonify({
            "success": True,
            "status": "pending",
            "items_synced": 0,
            "total_items": 0,
            "last_sync_at": None,
            "last_error": None,
            "skip_actual": 0,
            "lote_actual": 0,
            "_fallback": True,
            "_request_id": request_id
        }), 200

    return jsonify({
        "success": True,
        "status": estado.status,
        "items_synced": estado.items_synced,
        "total_items": estado.total_items,
        "last_sync_at": (estado.last_sync_at.isoformat() + 'Z') if estado.last_sync_at else None,
        "last_error": estado.last_error,
        "skip_actual": estado.skip_actual,
        "lote_actual": estado.lote_actual,
        "_recovered": recovered
    })


@sincronizar_bp.route('/api/sincronizar/ubicaciones', methods=['GET'])
@require_admin
def listar_ubicaciones():
    """
    Lista todas las ubicaciones con su estado de sincronización.
    Nunca 500 HTML; ante fallo DB retorna fallback con status pending.
    """
    import uuid
    request_id = uuid.uuid4().hex[:8]
    logger.info(f"[{request_id}] GET /api/sincronizar/ubicaciones")

    adm_client = get_adm_client()
    ubicaciones_result = adm_client.obtener_ubicaciones(skip=0, take=100)

    if not ubicaciones_result.get("success", False):
        return jsonify({
            "success": False,
            "error": "Error al obtener ubicaciones desde ADM Cloud",
            "message": ubicaciones_result.get('error', 'Error desconocido')
        }), 500

    ubicaciones_adm = ubicaciones_result.get("data", [])

    def _query_estados():
        try:
            db.create_all()
        except Exception:
            pass
        estados_sync = {}
        for estado in SyncLocationStatus.query.all():
            estados_sync[estado.location_id] = estado
        return estados_sync

    estados_sync, recovered = safe_db_call(_query_estados, "listar_ubicaciones_sync", request_id)
    used_fallback = False
    if estados_sync is None:
        logger.warning(f"[{request_id}] Estados sync no disponibles, usando vacío")
        estados_sync = {}
        used_fallback = True

    # Combinar ubicaciones ADM con estados de sincronización
    ubicaciones_con_estado = []
    for idx, ubicacion in enumerate(ubicaciones_adm, 1):
        location_id = ubicacion.get("ID")
        location_name = ubicacion.get("Name", "")

        estado = estados_sync.get(location_id)

        ubicaciones_con_estado.append({
            "numero": idx,
            "location_id": location_id,
            "location_name": location_name,
            "status": estado.status if estado else "pending",
            "last_sync_at": (estado.last_sync_at.isoformat() + 'Z') if estado and estado.last_sync_at else None,
            "last_error": estado.last_error if estado else None,
            "items_synced": estado.items_synced if estado else 0,
            "total_items": estado.total_items if estado else 0,
            "skip_actual": estado.skip_actual if estado else 0,
            "lote_actual": estado.lote_actual if estado else 0
        })

    # Ordenar ubicaciones:
    # 1. running (sincronizando)
    # 2. ADESA y MIRADOR SUR siempre como 1 y 2
    # 3. pending
    # 4. error
    # 5. paused
    # 6. done (resto): más vieja first (recién sincronizada = última)
    def _parse_last_sync(iso_str):
        if not iso_str:
            return datetime.min
        try:
            s = str(iso_str).replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        except Exception:
            return datetime.min

    def sort_key(u):
        es_running = u["status"] == "running"
        es_adesa = u["location_name"].upper() == "ADESA"
        es_mirador = u["location_name"].upper() == "MIRADOR SUR"
        last_sync_ts = _parse_last_sync(u.get("last_sync_at"))

        if es_running:
            return (0, datetime.min, u["location_name"])
        if es_adesa:
            return (1, 0, u["location_name"])
        if es_mirador:
            return (1, 1, u["location_name"])
        if u["status"] == "pending":
            return (2, datetime.min, u["location_name"])
        if u["status"] == "error":
            return (3, datetime.min, u["location_name"])
        if u["status"] == "paused":
            return (4, datetime.min, u["location_name"])
        if u["status"] == "done":
            # Más vieja first = recién sync va última (ascending por last_sync_at)
            return (5, last_sync_ts, u["location_name"])
        return (99, datetime.min, u["location_name"])

    ubicaciones_con_estado.sort(key=sort_key)

    resp = {
        "success": True,
        "ubicaciones": ubicaciones_con_estado,
        "total": len(ubicaciones_con_estado)
    }
    if used_fallback or recovered:
        resp["_fallback"] = used_fallback
        resp["_recovered"] = recovered
    return jsonify(resp)


def _try_acquire_scheduler_lock():
    """Intenta adquirir el lock global. Retorna True si se adquirió, False si ya está tomado."""
    now = datetime.utcnow()
    expires = now + timedelta(minutes=2)
    result = db.session.execute(
        text("""
            UPDATE scheduler_lock
            SET locked_until = :expires, locked_by = 'cron-tick', updated_at = :now
            WHERE id = 1 AND (locked_until IS NULL OR locked_until < :now)
        """),
        {"expires": expires, "now": now}
    )
    db.session.commit()
    return result.rowcount > 0


def _release_scheduler_lock():
    """Libera el lock global."""
    try:
        db.session.execute(
            text("UPDATE scheduler_lock SET locked_until = NULL, locked_by = NULL WHERE id = 1")
        )
        db.session.commit()
    except Exception as e:
        logger.warning(f"Error al liberar scheduler_lock: {e}")
        db.session.rollback()


@sincronizar_bp.route('/api/sincronizar/auto/tick', methods=['POST'])
def auto_tick():
    """
    Tick para cron de auto-sincronización. Solo decide qué hacer.
    Respuesta: busy | idle | ready.
    Si ready: incluye location_id y target (full|lote).
    El cron wrapper hará el segundo curl a /ubicacion/<id> o /lote.
    """
    token = request.headers.get('X-CRON-TOKEN')
    cfg = current_app.config.get('CRON_TOKEN')
    if not cfg:
        return jsonify({
            "success": False,
            "status": "disabled",
            "error": "CRON_TOKEN no configurado"
        }), 503
    if not token or token != cfg:
        return jsonify({
            "success": False,
            "status": "unauthorized",
            "error": "X-CRON-TOKEN inválido"
        }), 401

    if not _try_acquire_scheduler_lock():
        return jsonify({
            "success": True,
            "status": "busy",
            "reason": "lock"
        }), 200

    try:
        now = datetime.utcnow()
        ZOMBIE_THRESHOLD_MIN = 15
        zombie_threshold = now - timedelta(minutes=ZOMBIE_THRESHOLD_MIN)

        # 1. Limpieza de zombies
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            is_zombie = False
            if estado.last_heartbeat_at:
                is_zombie = estado.last_heartbeat_at < zombie_threshold
            elif estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at < zombie_threshold:
                    is_zombie = True
            if is_zombie:
                if estado.running_run_id:
                    run = SyncRun.query.get(estado.running_run_id)
                    if run:
                        run.status = 'failed'
                        run.finished_at = now
                        run.notas = (run.notas or '') + ' | Zombie cleanup (sin heartbeat 15 min)'
                estado.status = 'error'
                estado.last_error = 'Sync detenida (zombie cleanup - sin heartbeat 15 min)'
                estado.running_run_id = None
        db.session.commit()

        # 2. ¿Hay alguna sync viva (running con heartbeat reciente)?
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            if estado.last_heartbeat_at and estado.last_heartbeat_at >= zombie_threshold:
                return jsonify({
                    "success": True,
                    "status": "busy",
                    "reason": "sync_in_progress"
                }), 200
            if estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at >= zombie_threshold:
                    return jsonify({
                        "success": True,
                        "status": "busy",
                        "reason": "sync_in_progress"
                    }), 200

        # 3. Obtener ubicaciones de ADM
        adm_client = get_adm_client()
        ub_result = adm_client.obtener_ubicaciones(skip=0, take=100)
        if not ub_result.get("success"):
            return jsonify({
                "success": False,
                "status": "error",
                "error": "ADM no disponible"
            }), 500

        estados_map = {e.location_id: e for e in SyncLocationStatus.query.all()}
        ubicaciones_adm = ub_result.get("data", [])
        COOLDOWN_ERROR_MIN = 30
        cooldown_threshold = now - timedelta(minutes=COOLDOWN_ERROR_MIN)

        def _priority(ub):
            loc_id = ub.get("ID")
            est = estados_map.get(loc_id)
            st = est.status if est else "pending"
            is_partial = st in ("partial", "paused")
            last_sync = est.last_sync_at if est and est.last_sync_at else None
            last_sync_ts = last_sync.timestamp() if last_sync else 0
            if is_partial:
                return (0, last_sync_ts, loc_id or "")
            return (1, last_sync_ts, loc_id or "")

        sorted_ub = sorted(ubicaciones_adm, key=_priority)

        for ub in sorted_ub:
            loc_id = ub.get("ID")
            if not loc_id:
                continue
            loc_name = ub.get("Name", "")
            est = estados_map.get(loc_id)
            st = est.status if est else "pending"
            if st == "running":
                continue
            if st == "error" and est and est.updated_at and est.updated_at > cooldown_threshold:
                continue

            # Siguiente candidata
            if st in ("partial", "paused") and est and est.total_items > 0 and est.skip_actual < est.total_items:
                target = "lote"
            else:
                target = "full"

            return jsonify({
                "success": True,
                "status": "ready",
                "location_id": loc_id,
                "location_name": loc_name,
                "target": target
            }), 200

        return jsonify({
            "success": True,
            "status": "idle",
            "reason": "all_done"
        }), 200

    finally:
        _release_scheduler_lock()


def run_tick_internal():
    """
    Lógica del tick para uso interno (script). Sin HTTP, sin auth.
    Retorna dict: {"status": "busy"|"ready"|"idle", "location_id": ..., "location_name": ..., "target": "full"|"lote", "error": ...}
    """
    if not _try_acquire_scheduler_lock():
        return {"status": "busy", "reason": "lock"}
    try:
        now = datetime.utcnow()
        ZOMBIE_THRESHOLD_MIN = 15
        zombie_threshold = now - timedelta(minutes=ZOMBIE_THRESHOLD_MIN)

        # 1. Limpieza de zombies
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            is_zombie = False
            if estado.last_heartbeat_at:
                is_zombie = estado.last_heartbeat_at < zombie_threshold
            elif estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at < zombie_threshold:
                    is_zombie = True
            if is_zombie:
                if estado.running_run_id:
                    run = SyncRun.query.get(estado.running_run_id)
                    if run:
                        run.status = 'failed'
                        run.finished_at = now
                        run.notas = (run.notas or '') + ' | Zombie cleanup (sin heartbeat 15 min)'
                estado.status = 'error'
                estado.last_error = 'Sync detenida (zombie cleanup - sin heartbeat 15 min)'
                estado.running_run_id = None
        db.session.commit()

        # 2. ¿Hay alguna sync viva?
        for estado in SyncLocationStatus.query.filter_by(status='running').all():
            if estado.last_heartbeat_at and estado.last_heartbeat_at >= zombie_threshold:
                return {"status": "busy", "reason": "sync_in_progress"}
            if estado.running_run_id:
                run = SyncRun.query.get(estado.running_run_id)
                if run and run.started_at >= zombie_threshold:
                    return {"status": "busy", "reason": "sync_in_progress"}

        # 3. Obtener ubicaciones ADM
        adm_client = get_adm_client()
        ub_result = adm_client.obtener_ubicaciones(skip=0, take=100)
        if not ub_result.get("success"):
            return {"status": "error", "error": "ADM no disponible"}

        estados_map = {e.location_id: e for e in SyncLocationStatus.query.all()}
        ubicaciones_adm = ub_result.get("data", [])
        COOLDOWN_ERROR_MIN = 30
        cooldown_threshold = now - timedelta(minutes=COOLDOWN_ERROR_MIN)

        def _priority(ub):
            loc_id = ub.get("ID")
            est = estados_map.get(loc_id)
            st = est.status if est else "pending"
            is_partial = st in ("partial", "paused")
            last_sync = est.last_sync_at if est and est.last_sync_at else None
            last_sync_ts = last_sync.timestamp() if last_sync else 0
            if is_partial:
                return (0, last_sync_ts, loc_id or "")
            return (1, last_sync_ts, loc_id or "")

        sorted_ub = sorted(ubicaciones_adm, key=_priority)

        for ub in sorted_ub:
            loc_id = ub.get("ID")
            if not loc_id:
                continue
            loc_name = ub.get("Name", "")
            est = estados_map.get(loc_id)
            st = est.status if est else "pending"
            if st == "running":
                continue
            if st == "error" and est and est.updated_at and est.updated_at > cooldown_threshold:
                continue
            target = "lote" if (st in ("partial", "paused") and est and est.total_items > 0 and est.skip_actual < est.total_items) else "full"
            return {"status": "ready", "location_id": loc_id, "location_name": loc_name, "target": target}

        return {"status": "idle", "reason": "all_done"}
    finally:
        _release_scheduler_lock()


@sincronizar_bp.route('/api/sincronizar/catalogo', methods=['POST'])
@require_auth
@require_admin
def sincronizar_catalogo():
    """
    Sincroniza el catálogo de productos (nombre, SKU, código de barras) desde ADM Cloud.
    
    IMPORTANTE: 
    - SOLO actualiza catálogo (nombre, SKU, código de barras, activo/inactivo, UOM)
    - NO toca stock ERP (viene de sync por ubicación)
    - NO modifica cantidades ni ubicaciones en StockUbicacion
    - Al final: normaliza StockUbicacion.sku para que coincida con ProductoADM (evita CT-5 vs CT5)
    - Usa paginación eficiente (50 productos por llamada) para evitar timeout
    - PROHIBIDO usar /api/Items/{id} individual (causa timeout masivo)
    """
    try:
        adm_client = get_adm_client()
        productos_actualizados = 0
        productos_creados = 0
        skip = 0
        batch_size = 50  # ADM Cloud limita a 50 productos por solicitud
        max_productos = 10000  # Límite aumentado para catálogo completo
        
        logger.info("Iniciando sincronización de catálogo (nombre, SKU, código de barras)...")
        
        while skip < max_productos:
            # Obtener lote de productos usando paginación eficiente
            # PROHIBIDO: NO usar /api/Items/{id} individual
            result = adm_client._make_request("items/", {
                "skip": skip,
                "take": batch_size,
                "OnlyActive": "false"
            })
            
            if not result.get("success", False):
                logger.error(f"Error al obtener productos: {result.get('message', 'Error desconocido')}")
                return jsonify({
                    "success": False,
                    "error": "Error al obtener productos desde ADM Cloud",
                    "message": result.get('message', 'Error desconocido')
                }), 500
            
            items = result.get("data", [])
            if not items or len(items) == 0:
                logger.info(f"No hay más productos. Sincronización completada.")
                break
            
            logger.info(f"Procesando lote {skip // batch_size + 1}: {len(items)} productos...")
            
            # Procesar cada producto
            for producto_adm in items:
                item_id = producto_adm.get("ID")
                if not item_id:
                    continue
                
                sku = (producto_adm.get("SKU") or producto_adm.get("ItemSKU") or "").upper()
                nombre = producto_adm.get("Name", "")
                # Intentar múltiples campos posibles para código de barras
                # IMPORTANTE: El campo correcto en ADM Cloud es "BarCode" (mayúscula B y C)
                codigo_barras = (producto_adm.get("BarCode") or  # Campo correcto de ADM Cloud
                                producto_adm.get("Barcode") or 
                                producto_adm.get("BarcodeValue") or 
                                producto_adm.get("barcode") or
                                producto_adm.get("CodigoBarras") or
                                producto_adm.get("codigo_barras") or
                                None)
                # Si es cadena vacía, convertir a None
                if codigo_barras == "" or codigo_barras == "None":
                    codigo_barras = None
                
                # Extraer estado Inactive de ADM (Fase 1: Mapear Inactive)
                inactive = producto_adm.get("Inactive", False)
                activo = not inactive  # Inactive=true => activo=false
                
                # Buscar producto existente
                producto = ProductoADM.query.filter_by(item_id=item_id).first()
                
                if producto:
                    # Actualizar existente (SOLO catálogo - NO tocar stock)
                    # Se SOBREESCRIBE siempre porque estos campos cambian frecuentemente en ADM
                    producto.nombre = nombre
                    producto.sku = sku
                    producto.codigo_barras = codigo_barras
                    producto.activo = activo  # ✅ Fase 1: Mapear Inactive → activo
                    producto.updated_at = datetime.utcnow()
                    producto.synced_at = datetime.utcnow()  # ✅ Actualizar fecha de sincronización
                    productos_actualizados += 1
                else:
                    # Crear nuevo producto (sin stock, eso viene de sync por ubicación)
                    producto = ProductoADM(
                        item_id=item_id,
                        nombre=nombre,
                        sku=sku,
                        codigo_barras=codigo_barras,
                        activo=activo,  # ✅ Fase 1: Mapear Inactive → activo
                        updated_at=datetime.utcnow(),
                        synced_at=datetime.utcnow()  # ✅ Establecer fecha de sincronización
                    )
                    db.session.add(producto)
                    productos_creados += 1
            
            # Commit periódico cada 100 productos
            if (skip // batch_size + 1) % 2 == 0:  # Cada 2 lotes (100 productos)
                try:
                    db.session.commit()
                    logger.debug(f"Commit periódico: {productos_actualizados} actualizados, {productos_creados} creados")
                except Exception as e:
                    logger.error(f"Error en commit periódico: {e}")
                    db.session.rollback()
            
            # Si recibimos menos items de los solicitados, ya no hay más
            if len(items) < batch_size:
                break
            
            skip += batch_size
        
        # Commit final
        try:
            db.session.commit()
            logger.info(f"Sincronización de catálogo completada: {productos_actualizados} actualizados, {productos_creados} creados")
        except Exception as e:
            logger.error(f"Error en commit final: {e}")
            db.session.rollback()
            return jsonify({
                "success": False,
                "error": "Error al guardar catálogo",
                "message": str(e)
            }), 500

        # Normalizar SKU en StockUbicacion para que coincida con ProductoADM (evita inconsistencias CT-5 vs CT5)
        sku_normalizados = 0
        try:
            rows = ProductoADM.query.with_entities(ProductoADM.item_id, ProductoADM.sku).all()
            productos_map = {r[0]: r[1] for r in rows if r[0] and r[1]}
            for s in StockUbicacion.query.all():
                sku_canonico = productos_map.get(s.product_id)
                if sku_canonico and s.sku != sku_canonico:
                    s.sku = sku_canonico
                    sku_normalizados += 1
            if sku_normalizados > 0:
                db.session.commit()
                logger.info(f"SKU normalizados en StockUbicacion: {sku_normalizados} registros alineados con ProductoADM")
        except Exception as e:
            logger.warning(f"Normalización SKU en StockUbicacion falló (no crítico): {e}")
            db.session.rollback()

        return jsonify({
            "success": True,
            "message": "Sincronización de catálogo completada",
            "productos_actualizados": productos_actualizados,
            "productos_creados": productos_creados,
            "total_procesados": productos_actualizados + productos_creados,
            "sku_normalizados": sku_normalizados
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al sincronizar catálogo: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al sincronizar catálogo",
            "message": str(e)
        }), 500


def validar_cambios_new_vs_old(run_id_new, run_id_old, location_id, location_name):
    """
    Compara NEW vs OLD y detecta discrepancias (cambios bruscos, desaparecidos)
    
    Returns:
        Lista de discrepancias detectadas
    """
    from utils.discrepancias import clasificar_severidad_discrepancia, es_cambio_sospechoso
    from config import get_config
    
    discrepancias = []
    
    if not run_id_old:
        return discrepancias  # Primera sync, no hay OLD
    
    # Obtener stock NEW
    stock_new_list = StockProductoADM.query.filter_by(
        sync_run_id=run_id_new,
        location_id=location_id
    ).all()
    
    # Obtener stock OLD
    stock_old_list = StockProductoADM.query.filter_by(
        sync_run_id=run_id_old,
        location_id=location_id
    ).all()
    
    # Crear diccionarios para comparación rápida
    dict_new = {(s.producto_id, s.location_id): s for s in stock_new_list}
    dict_old = {(s.producto_id, s.location_id): s for s in stock_old_list}
    
    # Comparar cambios
    for key, stock_n in dict_new.items():
        stock_o = dict_old.get(key)
        producto = stock_n.producto
        
        if stock_o:
            stock_old_val = float(stock_o.stock) if stock_o.stock else 0.0
            stock_new_val = float(stock_n.stock) if stock_n.stock else 0.0
            
            # Desaparecido: OLD > 0, NEW = 0
            if stock_old_val > 0 and stock_new_val == 0:
                discrepancias.append({
                    'tipo': 'desaparecido',
                    'producto_id': stock_n.producto_id,
                    'sku': producto.sku,
                    'location_id': location_id,
                    'location_name': location_name,
                    'stock_old': stock_old_val,
                    'stock_new': 0,
                    'stock_fisico': None,
                    'severidad': clasificar_severidad_discrepancia('desaparecido', stock_old_val, 0),
                    'motivo': f'Stock desapareció: {stock_old_val} → 0'
                })
            else:
                # Cambio brusco: verificar si es sospechoso
                es_sospechoso, severidad = es_cambio_sospechoso(stock_old_val, stock_new_val)
                if es_sospechoso:
                    discrepancias.append({
                        'tipo': 'cambio_brusco',
                        'producto_id': stock_n.producto_id,
                        'sku': producto.sku,
                        'location_id': location_id,
                        'location_name': location_name,
                        'stock_old': stock_old_val,
                        'stock_new': stock_new_val,
                        'stock_fisico': None,
                        'severidad': severidad,
                        'motivo': f'Cambio brusco: {stock_old_val} → {stock_new_val}'
                    })
        else:
            # Nuevo producto (no crítico, pero registrar)
            stock_new_val = float(stock_n.stock) if stock_n.stock else 0.0
            if stock_new_val > 0:
                discrepancias.append({
                    'tipo': 'nuevo',
                    'producto_id': stock_n.producto_id,
                    'sku': producto.sku,
                    'location_id': location_id,
                    'location_name': location_name,
                    'stock_old': 0,
                    'stock_new': stock_new_val,
                    'stock_fisico': None,
                    'severidad': 'baja',
                    'motivo': f'Nuevo producto con stock: {stock_new_val}'
                })
    
    # Verificar productos que desaparecieron completamente
    for key, stock_o in dict_old.items():
        if key not in dict_new:
            producto = stock_o.producto
            stock_old_val = float(stock_o.stock) if stock_o.stock else 0.0
            discrepancias.append({
                'tipo': 'desaparecido_completo',
                'producto_id': stock_o.producto_id,
                'sku': producto.sku,
                'location_id': location_id,
                'location_name': location_name,
                'stock_old': stock_old_val,
                'stock_new': 0,
                'stock_fisico': None,
                'severidad': clasificar_severidad_discrepancia('desaparecido', stock_old_val, 0),
                'motivo': f'Producto desapareció completamente de ADM'
            })
    
    return discrepancias


def validar_adm_vs_fisico(run_id_new, location_id, location_name):
    """
    Cruza ADM NEW vs StockUbicacion físico (solo para ADESA)
    
    Returns:
        Lista de discrepancias detectadas
    """
    from utils.discrepancias import clasificar_severidad_discrepancia
    
    discrepancias = []
    
    if "ADESA" not in location_name.upper():
        return discrepancias  # Solo para ADESA
    
    # Obtener stock ADM (NEW)
    stock_adm_list = StockProductoADM.query.filter_by(
        sync_run_id=run_id_new,
        location_id=location_id
    ).all()
    
    for stock_a in stock_adm_list:
        producto = stock_a.producto
        stock_adm_valor = float(stock_a.stock) if stock_a.stock else 0.0
        
        # Obtener stock físico
        stock_fisico_list = StockUbicacion.query.filter_by(
            sku=producto.sku
        ).all()
        stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico_list if float(s.cantidad) > 0)
        
        # Discrepancia crítica: ADM=0 pero Físico>0
        if stock_adm_valor == 0 and stock_fisico_total > 0:
            discrepancias.append({
                'tipo': 'critica_adm_vs_fisico',
                'producto_id': producto.id,
                'sku': producto.sku,
                'location_id': location_id,
                'location_name': location_name,
                'stock_old': None,
                'stock_new': 0,
                'stock_fisico': stock_fisico_total,
                'severidad': 'critica',
                'motivo': f'ADM=0 pero Físico={stock_fisico_total} (CRÍTICO)'
            })
        # Discrepancia alta: diferencia > 20%
        elif stock_fisico_total > 0:
            diferencia = abs(stock_adm_valor - stock_fisico_total)
            porcentaje = (diferencia / stock_fisico_total) * 100 if stock_fisico_total > 0 else 0
            
            if porcentaje > 20:
                discrepancias.append({
                    'tipo': 'alta_diferencia',
                    'producto_id': producto.id,
                    'sku': producto.sku,
                    'location_id': location_id,
                    'location_name': location_name,
                    'stock_old': None,
                    'stock_new': stock_adm_valor,
                    'stock_fisico': stock_fisico_total,
                    'severidad': clasificar_severidad_discrepancia('cambio_brusco', stock_fisico_total, stock_adm_valor, stock_fisico_total),
                    'motivo': f'Diferencia {porcentaje:.1f}%: ADM={stock_adm_valor}, Físico={stock_fisico_total}'
                })
    
    return discrepancias


def poblar_en_revision(discrepancias, run_id, location_id, location_name, limite=1000):
    """
    Pobla EnRevision con discrepancias detectadas (top N por severidad)
    """
    # Ordenar por severidad (crítica > alta > media > baja)
    orden_severidad = {'critica': 4, 'alta': 3, 'media': 2, 'baja': 1}
    discrepancias_ordenadas = sorted(
        discrepancias,
        key=lambda x: orden_severidad.get(x.get('severidad', 'baja'), 0),
        reverse=True
    )[:limite]  # Top 1000
    
    # Poblar EnRevision
    for disc in discrepancias_ordenadas:
        # Verificar si ya existe registro pendiente
        existente = EnRevision.query.filter_by(
            producto_id=disc['producto_id'],
            location_id=location_id,
            estado='pendiente'
        ).first()
        
        if existente:
            # Actualizar existente
            existente.veces_detectado += 1
            existente.run_detectado = run_id
            existente.motivo = disc['motivo']
            existente.severidad = disc['severidad']
            existente.stock_old = disc.get('stock_old')
            existente.stock_new = disc.get('stock_new')
            existente.stock_fisico = disc.get('stock_fisico')
            
            # Si es crónico (>=5 veces), auto-ignorar
            if existente.veces_detectado >= 5:
                existente.estado = 'ignorado_automatico'
                existente.severidad = 'baja'
                existente.notas = f"Casos crónicos detectados {existente.veces_detectado} veces. Auto-ignorado."
        else:
            # Crear nuevo
            en_revision = EnRevision(
                producto_id=disc['producto_id'],
                sku=disc.get('sku', ''),
                location_id=location_id,
                location_name=location_name,
                motivo=disc['motivo'],
                tipo=disc['tipo'],
                severidad=disc.get('severidad', 'media'),
                run_detectado=run_id,
                estado='pendiente',
                stock_old=disc.get('stock_old'),
                stock_new=disc.get('stock_new'),
                stock_fisico=disc.get('stock_fisico'),
                veces_detectado=1
            )
            db.session.add(en_revision)
    
    db.session.commit()
    logger.info(f"Pobladas {len(discrepancias_ordenadas)} discrepancias en EnRevision (de {len(discrepancias)} totales)")


def run_sync_ubicacion(location_id, triggered_by='manual'):
    """
    Lógica principal de sincronización por ubicación. Reutilizable desde endpoint HTTP o script.
    Retorna dict (no jsonify). Incluye _http_status en errores para que el caller convierta a HTTP.
    """
    try:
        # Crear tablas si no existen
        db.create_all()
        
        adm_client = get_adm_client()
        
        # Obtener información de la ubicación
        ubicaciones_result = adm_client.obtener_ubicaciones(skip=0, take=100)
        ubicacion_info = None
        
        if ubicaciones_result.get("success"):
            for loc in ubicaciones_result.get("data", []):
                if loc.get("ID") == location_id:
                    ubicacion_info = loc
                    break
        
        if not ubicacion_info:
            return {"success": False, "error": f"Ubicación {location_id} no encontrada en ADM Cloud", "_http_status": 404}
        
        location_name = ubicacion_info.get("Name", "")
        logger.info(f"[{triggered_by}] Iniciando sync: {location_name} (ID: {location_id})")
        
        # ✅ STAGING: Verificar si hay sync en curso (bloquear si hay)
        # Usar retry para evitar "database is locked"
        estado_sync = db_query_with_retry(
            lambda: SyncLocationStatus.query.filter_by(location_id=location_id).first(),
            max_retries=3,
            retry_delay=0.3,
            tag="verificar_sync_curso",
            meta={"location_id": location_id, "location_name": location_name}
        )
        if not estado_sync:
            estado_sync = SyncLocationStatus(
                location_id=location_id,
                location_name=location_name,
                status='pending'
            )
            db.session.add(estado_sync)
            if not db_commit_with_retry(max_retries=3, retry_delay=0.3):
                return {"success": False, "error": f"Error al crear estado de sincronización para {location_name}", "_http_status": 500}
        else:
            # Verificar si hay sync en curso
            if estado_sync.status == 'running' and estado_sync.running_run_id:
                run_actual = SyncRun.query.get(estado_sync.running_run_id)
                if run_actual and run_actual.status == 'running':
                    tiempo_transcurrido = (datetime.utcnow() - run_actual.started_at).total_seconds() / 60
                    if tiempo_transcurrido < 60:  # Menos de 1 hora = probablemente activo
                        return {"success": False, "error": f"Ya hay una sincronización en curso para {location_name}", "run_id": run_actual.run_id, "tiempo_transcurrido_min": tiempo_transcurrido, "_http_status": 409}
        
        # ✅ STAGING: Crear nuevo SyncRun
        run_id_anterior = estado_sync.current_run_id if estado_sync else None
        
        nuevo_run = SyncRun(
            location_id=location_id,
            location_name=location_name,
            status='running',
            started_at=datetime.utcnow(),
            previous_run_id=run_id_anterior
        )
        db.session.add(nuevo_run)
        db.session.flush()  # Para obtener run_id
        
        # ✅ STAGING: Actualizar estado_sync con running_run_id (NO current_run_id todavía)
        estado_sync.status = 'running'
        estado_sync.running_run_id = nuevo_run.run_id
        estado_sync.location_name = location_name
        estado_sync.last_error = None
        estado_sync.last_heartbeat_at = datetime.utcnow()  # Heartbeat inicial para auto-tick
        # Resetear contadores al inicio de una nueva sincronización
        estado_sync.items_synced = 0
        estado_sync.total_items = 0
        estado_sync.skip_actual = 0
        estado_sync.lote_actual = 0
        db.session.commit()
        
        logger.info(f"Iniciando sincronización con staging: {location_name} (ID: {location_id}, run_id: {nuevo_run.run_id})")
        
        # ✅ STAGING: Limpiar registros legacy (sin sync_run_id) de esta ubicación antes de empezar
        # También limpiar registros de runs anteriores que puedan causar conflictos
        # Esto evita conflictos con el UniqueConstraint
        registros_legacy_eliminados = StockProductoADM.query.filter(
            StockProductoADM.location_id == location_id,
            StockProductoADM.sync_run_id != nuevo_run.run_id  # Eliminar todos excepto el run actual
        ).delete()
        if registros_legacy_eliminados > 0:
            logger.info(f"Eliminados {registros_legacy_eliminados} registros legacy/antiguos (sin sync_run_id o de runs anteriores) de {location_name}")
            db.session.commit()
        
        logger.info(f"Iniciando sincronización de ubicación: {location_name} (ID: {location_id})")
        
        # ✅ Fase 3: Configuración de caps de seguridad por ubicación
        CAPS_POR_UBICACION = {
            "ADESA": {
                "max_requests": 800,      # ~40,000 items con ShowNoStock (800 * 50)
                "max_minutos": 25,         # 25 minutos máximo por corrida
                "max_items_procesados": 50000  # Límite absoluto de items
            },
            "MIRADOR SUR": {
                "max_requests": 300,       # ~15,000 items
                "max_minutos": 15,
                "max_items_procesados": 20000
            }
        }
        
        # Obtener caps para esta ubicación (default: ADESA si no está configurada)
        caps = CAPS_POR_UBICACION.get(location_name.upper(), CAPS_POR_UBICACION["ADESA"])
        
        # ✅ Habilitar ShowNoStock=true para TODAS las ubicaciones
        use_show_no_stock = True  # Todas las ubicaciones ahora incluyen items con stock=0
        logger.info(f"Usando ShowNoStock=true para {location_name} (incluirá items con stock=0)")
        
        # IMPORTANTE: Esta sincronización SOLO usa /api/Stock (NO /api/Items/{id})
        # El código de barras se obtiene con sync de catálogo separado (paginación eficiente)
        
        # Obtener stock de la ubicación con paginación
        # IMPORTANTE: ADM Cloud solo permite solicitudes de 50 items a la vez
        stock_items_count = 0
        items_synced = 0
        items_cero_synced = 0  # ✅ Fase 3: Contador de items con stock=0 procesados
        items_fallidos = set()  # ✅ Contador de items que fallaron después de múltiples intentos
        skip = 0
        batch_size = 50  # ADM Cloud limita a 50 items por solicitud
        max_items = caps["max_items_procesados"]  # Usar cap configurado
        
        # ✅ Fase 3: Tracking de caps y sync completa
        requests_realizados = 0
        tiempo_inicio = datetime.utcnow()
        se_alcanzo_cap = False
        
        # Lista de item_id que vienen en esta sincronización (para detectar productos desaparecidos)
        item_ids_en_sync = set()  # Items con stock > 0
        item_ids_con_stock_cero = set()  # ✅ Fase 3: Items con stock=0 explícito (ShowNoStock)
        
        logger.info(f"Obteniendo stock de {location_name} con paginación (lotes de {batch_size} items, límite máximo de {max_items}, caps: {caps['max_requests']} requests / {caps['max_minutos']} min)...")
        
        while skip < max_items and not se_alcanzo_cap:
            # ✅ Fase 3: Verificar caps ANTES de cada request
            requests_realizados += 1
            tiempo_transcurrido = (datetime.utcnow() - tiempo_inicio).total_seconds() / 60
            
            if requests_realizados >= caps["max_requests"]:
                logger.warning(f"Cap de requests alcanzado para {location_name}: {requests_realizados}/{caps['max_requests']}")
                se_alcanzo_cap = True
                break
            
            if tiempo_transcurrido >= caps["max_minutos"]:
                logger.warning(f"Cap de tiempo alcanzado para {location_name}: {tiempo_transcurrido:.1f} min/{caps['max_minutos']} min")
                se_alcanzo_cap = True
                break
            
            if stock_items_count >= caps["max_items_procesados"]:
                logger.warning(f"Cap de items alcanzado para {location_name}: {stock_items_count}/{caps['max_items_procesados']}")
                se_alcanzo_cap = True
                break
            
            logger.debug(f"Obteniendo lote {skip // batch_size + 1}: skip={skip}, take={batch_size}, requests={requests_realizados}/{caps['max_requests']}")
            
            # ✅ Fase 3: Usar ShowNoStock=true si está habilitado
            stock_result = adm_client.obtener_stock(location_id=location_id, skip=skip, take=batch_size, show_no_stock=use_show_no_stock)
            
            if not stock_result.get("success", False):
                error_msg = stock_result.get('error', 'Error desconocido')
                logger.error(f"[{triggered_by}] Error al obtener stock para {location_name} (skip={skip}): {error_msg}")
                estado_sync.status = 'error'
                estado_sync.last_error = error_msg
                db.session.commit()
                return {"success": False, "error": f"Error al obtener stock para {location_name}", "message": error_msg, "_http_status": 500}
            
            items_stock = stock_result.get("data", [])
            if not items_stock or len(items_stock) == 0:
                logger.info(f"No hay más items en {location_name} después de {skip} items procesados")
                break  # No hay más items
            
            lote_numero = skip // batch_size + 1
            logger.info(f"Lote {lote_numero}: Recibidos {len(items_stock)} items de {location_name} (skip={skip}, total procesados hasta ahora: {items_synced} items con stock > 0)")
            
            # Procesar cada item de stock
            for item in items_stock:
                # Extraer ItemID
                item_id = None
                if item.get("ItemID"):
                    item_id = item.get("ItemID")
                elif item.get("ID"):
                    item_id = item.get("ID")
                elif isinstance(item.get("Item"), dict):
                    item_id = item.get("Item").get("ID") or item.get("Item").get("ItemID")
                elif item.get("Item"):
                    item_id = item.get("Item")
                
                # Extraer SKU
                item_sku = ""
                if item.get("ItemSKU"):
                    item_sku = str(item.get("ItemSKU")).upper()
                elif item.get("SKU"):
                    item_sku = str(item.get("SKU")).upper()
                elif isinstance(item.get("Item"), dict):
                    item_sku = str(item.get("Item").get("SKU") or item.get("Item").get("ItemSKU") or "").upper()
                
                # Intentar extraer código de barras directamente de la respuesta de Stock (si está disponible)
                codigo_barras_directo = None
                if item.get("Barcode") or item.get("BarcodeValue"):
                    codigo_barras_directo = item.get("Barcode") or item.get("BarcodeValue")
                elif isinstance(item.get("Item"), dict):
                    codigo_barras_directo = item.get("Item").get("Barcode") or item.get("Item").get("BarcodeValue")
                
                # Extraer Stock (prioriza campo "Stock")
                stock = 0.0
                stock_raw = None
                for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                    if item.get(field) is not None:
                        stock_raw = item.get(field)
                        break
                
                if stock_raw is None and isinstance(item.get("Item"), dict):
                    for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                        if item.get("Item").get(field) is not None:
                            stock_raw = item.get("Item").get(field)
                            break
                
                try:
                    if stock_raw is not None:
                        stock = float(stock_raw)
                except (ValueError, TypeError):
                    stock = 0.0
                
                # ✅ Fase 3: Procesar items con stock > 0 Y stock = 0 (si ShowNoStock=true)
                if stock > 0 and item_id:
                    # Agregar a lista de productos que vienen en esta sync
                    item_ids_en_sync.add(item_id)
                    
                    # Buscar o crear producto en BD (con retry y reconexión automática)
                    try:
                        producto = db_query_with_retry(
                            lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                            max_retries=3,
                            retry_delay=0.5
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar producto {item_id} (después de retries): {e}")
                        # Intentar una vez más directamente
                        try:
                            db.session.rollback()
                            producto = ProductoADM.query.filter_by(item_id=item_id).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar producto {item_id}: {e2}")
                            continue
                    
                    # Determinar código de barras: primero intentar de la respuesta de Stock, luego de la BD
                    # IMPORTANTE: NO hacer llamadas individuales a /api/Items durante sync por ubicación
                    # porque es muy lento (1 llamada por producto = timeout). El código de barras
                    # se obtiene más eficientemente con la sincronización masiva de productos.
                    codigo_barras = codigo_barras_directo or (producto.codigo_barras if producto else None)
                    nombre_completo = producto.nombre if producto else item_sku
                    
                    # Si el producto no existe, crear con datos básicos
                    # El código de barras se obtendrá después con sincronización masiva de productos
                    if not producto:
                        # Crear nuevo registro de producto con datos básicos
                        try:
                            producto = ProductoADM(
                                item_id=item_id,
                                sku=item_sku,
                                nombre=nombre_completo,  # Usar SKU como nombre temporal
                                codigo_barras=codigo_barras,  # Solo si viene en respuesta de Stock
                                updated_at=datetime.utcnow()
                            )
                            db.session.add(producto)
                            db.session.flush()
                            if codigo_barras_directo:
                                logger.debug(f"Producto creado con código de barras de Stock: SKU={item_sku}, Barcode={codigo_barras}")
                        except (IntegrityError, Exception) as e:
                            # Si hay error de integridad (duplicado), el producto ya existe
                            # Hacer rollback y buscar nuevamente
                            if isinstance(e, IntegrityError) or 'Duplicate entry' in str(e) or '1062' in str(e):
                                logger.warning(f"Producto {item_id} ya existe (duplicado detectado), buscando nuevamente...")
                                db.session.rollback()
                                # Buscar el producto que ya existe
                                producto = db_query_with_retry(
                                    lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                                    max_retries=3,
                                    retry_delay=0.5,
                                    tag="buscar_producto_duplicado",
                                    meta={"item_id": item_id, "item_sku": item_sku, "skip": skip, "lote": lote_numero, "run_id": nuevo_run.run_id}
                                )
                                if not producto:
                                    # Si aún no se encuentra, intentar directamente
                                    try:
                                        db.session.rollback()
                                        producto = ProductoADM.query.filter_by(item_id=item_id).first()
                                    except Exception as e2:
                                        logger.error(f"Error crítico al buscar producto duplicado {item_id}: {e2}")
                                        continue
                            else:
                                logger.error(f"Error al crear producto {item_id}: {e}")
                                db.session.rollback()
                                continue
                    elif codigo_barras_directo and codigo_barras_directo != producto.codigo_barras:
                        # Actualizar código de barras SOLO si viene en la respuesta de Stock
                        producto.codigo_barras = codigo_barras_directo
                        producto.updated_at = datetime.utcnow()
                        logger.debug(f"Actualizado código de barras de Stock para producto SKU={item_sku}: {codigo_barras_directo}")
                    
                    # ✅ STAGING: Buscar o crear registro de stock en NEW (sync_run_id)
                    # IMPORTANTE: Eliminar cualquier registro previo con otro sync_run_id para evitar conflictos
                    stock_obj = db_query_with_retry(
                        lambda: StockProductoADM.query.filter_by(
                            producto_id=producto.id,
                            location_id=location_id,
                            sync_run_id=nuevo_run.run_id  # NEW
                        ).first(),
                        max_retries=3,
                        retry_delay=0.5,
                        tag="buscar_stock_new",
                        meta={"producto_id": producto.id, "item_id": item_id, "item_sku": item_sku, "location_id": location_id, "run_id": nuevo_run.run_id, "skip": skip, "lote": lote_numero, "stock": stock}
                    )
                    
                    if stock_obj:
                        # Actualizar existente
                        stock_obj.stock = stock
                        stock_obj.location_name = location_name
                        stock_obj.updated_at = datetime.utcnow()
                    else:
                        # Crear nuevo - eliminar cualquier registro con otro sync_run_id primero
                        logger.debug(f"[DELETE_stock_new] Antes de DELETE | producto_id={producto.id}, item_id={item_id}, item_sku={item_sku}, location_id={location_id}, run_id={nuevo_run.run_id}, skip={skip}, lote={lote_numero}, stock={stock}")
                        try:
                            eliminados = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).filter(
                                StockProductoADM.sync_run_id != nuevo_run.run_id
                            ).delete()
                            logger.debug(f"[DELETE_stock_new] DELETE exitoso | producto_id={producto.id}, item_id={item_id}, eliminados={eliminados}, skip={skip}, lote={lote_numero}")
                        except Exception as e:
                            logger.error(f"[DELETE_stock_new] ⚠️ ERROR en DELETE | producto_id={producto.id}, item_id={item_id}, item_sku={item_sku}, location_id={location_id}, run_id={nuevo_run.run_id}, skip={skip}, lote={lote_numero} | Error: {e}")
                            db.session.rollback()
                            raise
                        
                        stock_obj = StockProductoADM(
                            producto_id=producto.id,
                            location_id=location_id,
                            location_name=location_name,
                            stock=stock,
                            sync_run_id=nuevo_run.run_id,  # NEW
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(stock_obj)
                    
                    items_synced += 1
                elif stock == 0 and item_id and use_show_no_stock:
                    # ✅ Fase 3: Procesar items con stock=0 explícito (ShowNoStock=true)
                    item_ids_con_stock_cero.add(item_id)
                    
                    # Buscar o crear producto en BD (con retry y reconexión automática)
                    try:
                        producto = db_query_with_retry(
                            lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                            max_retries=3,
                            retry_delay=0.5,
                            tag="buscar_producto_stock_cero",
                            meta={"item_id": item_id, "item_sku": item_sku, "skip": skip, "lote": lote_numero, "run_id": nuevo_run.run_id, "location_name": location_name}
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar producto {item_id} (después de retries): {e}")
                        # Intentar una vez más directamente
                        try:
                            db.session.rollback()
                            producto = ProductoADM.query.filter_by(item_id=item_id).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar producto {item_id}: {e2}")
                            continue
                    
                    codigo_barras = codigo_barras_directo or (producto.codigo_barras if producto else None)
                    nombre_completo = producto.nombre if producto else item_sku
                    
                    if not producto:
                        # Crear nuevo registro de producto con datos básicos
                        try:
                            producto = ProductoADM(
                                item_id=item_id,
                                sku=item_sku,
                                nombre=nombre_completo,
                                codigo_barras=codigo_barras,
                                updated_at=datetime.utcnow()
                            )
                            db.session.add(producto)
                            db.session.flush()
                        except (IntegrityError, Exception) as e:
                            # Si hay error de integridad (duplicado), el producto ya existe
                            if isinstance(e, IntegrityError) or 'Duplicate entry' in str(e) or '1062' in str(e):
                                logger.warning(f"Producto {item_id} ya existe (duplicado detectado), buscando nuevamente...")
                                db.session.rollback()
                                producto = db_query_with_retry(
                                    lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                                    max_retries=3,
                                    retry_delay=0.5,
                                    tag="buscar_producto_duplicado_stock_cero",
                                    meta={"item_id": item_id, "item_sku": item_sku, "skip": skip, "lote": lote_numero, "run_id": nuevo_run.run_id}
                                )
                                if not producto:
                                    try:
                                        db.session.rollback()
                                        producto = ProductoADM.query.filter_by(item_id=item_id).first()
                                    except Exception as e2:
                                        logger.error(f"Error crítico al buscar producto duplicado {item_id}: {e2}")
                                        continue
                            else:
                                logger.error(f"Error al crear producto {item_id}: {e}")
                                db.session.rollback()
                                continue
                    
                    # ✅ STAGING: Buscar o crear registro de stock=0 en NEW (sync_run_id)
                    # IMPORTANTE: Usar get_or_create para evitar conflictos de UniqueConstraint
                    try:
                        stock_obj = db_query_with_retry(
                            lambda: StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id,
                                sync_run_id=nuevo_run.run_id  # NEW
                            ).first(),
                            max_retries=3,
                            retry_delay=0.5,
                            tag="buscar_stock_cero_new",
                            meta={"producto_id": producto.id, "item_id": item_id, "item_sku": item_sku, "location_id": location_id, "run_id": nuevo_run.run_id, "skip": skip, "lote": lote_numero, "stock": 0.0}
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar stock_obj para producto {producto.id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            stock_obj = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id,
                                sync_run_id=nuevo_run.run_id
                            ).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar stock_obj para producto {producto.id}: {e2}")
                            # En lugar de saltar, intentar crear el stock_obj básico
                            try:
                                db.session.rollback()
                                stock_obj = StockProductoADM(
                                    producto_id=producto.id,
                                    location_id=location_id,
                                    location_name=location_name,
                                    stock=0.0,
                                    sync_run_id=nuevo_run.run_id,
                                    updated_at=datetime.utcnow()
                                )
                                db.session.add(stock_obj)
                                db.session.flush()
                                logger.warning(f"Stock_obj creado en modo de recuperación para producto {producto.id}")
                            except Exception as e3:
                                logger.error(f"Error al crear stock_obj para producto {producto.id} en modo de recuperación: {e3}")
                                items_fallidos.add(item_id)
                                continue
                    
                    if stock_obj:
                        # Actualizar existente
                        stock_obj.stock = 0.0  # Asegurar que esté en 0
                        stock_obj.location_name = location_name
                        stock_obj.updated_at = datetime.utcnow()
                    else:
                        # Crear nuevo - verificar que no exista con otro sync_run_id (por si acaso)
                        logger.debug(f"[DELETE_stock_cero_new] Antes de DELETE | producto_id={producto.id}, item_id={item_id}, item_sku={item_sku}, location_id={location_id}, run_id={nuevo_run.run_id}, skip={skip}, lote={lote_numero}, stock=0.0")
                        try:
                            eliminados = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).filter(
                                StockProductoADM.sync_run_id != nuevo_run.run_id
                            ).delete()
                            logger.debug(f"[DELETE_stock_cero_new] DELETE exitoso | producto_id={producto.id}, item_id={item_id}, eliminados={eliminados}, skip={skip}, lote={lote_numero}")
                        except Exception as e:
                            logger.error(f"[DELETE_stock_cero_new] ⚠️ ERROR en DELETE | producto_id={producto.id}, item_id={item_id}, item_sku={item_sku}, location_id={location_id}, run_id={nuevo_run.run_id}, skip={skip}, lote={lote_numero} | Error: {e}")
                            db.session.rollback()
                            raise
                        
                        stock_obj = StockProductoADM(
                            producto_id=producto.id,
                            location_id=location_id,
                            location_name=location_name,
                            stock=0.0,
                            sync_run_id=nuevo_run.run_id,  # NEW
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(stock_obj)
                    
                    items_cero_synced += 1
                
                stock_items_count += 1
            
            # ✅ Fase 3: Commits adaptativos (cada 200 items para volumen 2-3x mayor)
            # Commits más espaciados pero manteniendo frecuencia suficiente para no perder datos
            total_items_procesados = items_synced + items_cero_synced
            commit_interval = 200  # Cada 200 items procesados (en vez de 50)
            
            # ✅ Actualizar estado de progreso periódicamente para que el polling pueda verlo
            # Actualizar cada 50 items para tener actualizaciones más frecuentes en el frontend
            if total_items_procesados > 0 and total_items_procesados % 50 == 0:
                estado_sync.items_synced = total_items_procesados  # ✅ Incluir TODOS los items (stock>0 + stock=0)
                estado_sync.total_items = stock_items_count  # Actualizar total con el valor actual
                estado_sync.last_heartbeat_at = datetime.utcnow()  # Heartbeat para auto-tick (detectar zombies)
                if not db_commit_with_retry(max_retries=3, retry_delay=0.3):
                    logger.error(f"Error al actualizar progreso después de reintentos")
                else:
                    logger.debug(f"Progreso actualizado en BD: {total_items_procesados}/{stock_items_count} items (polling puede ver esto)")
            
            if total_items_procesados > 0 and total_items_procesados % commit_interval == 0:
                if not db_commit_with_retry(max_retries=3, retry_delay=0.3):
                    logger.error(f"Error en commit periódico después de reintentos")
                else:
                    logger.debug(f"Commit periódico: {items_synced} items con stock>0, {items_cero_synced} items con stock=0 sincronizados hasta ahora")
            
            # Si recibimos menos items de los solicitados, ya no hay más
            # IMPORTANTE: ADM Cloud puede devolver menos de 50 si es el último lote
            if len(items_stock) < batch_size:
                logger.info(f"Último lote recibido: {len(items_stock)} items (menos que batch_size={batch_size}). No hay más items.")
                break
            
            # ✅ Verificar si alcanzamos el límite máximo de items
            if skip >= max_items:
                logger.info(f"Alcanzado límite máximo de items ({max_items}). Deteniendo sincronización.")
                break
            
            # Si recibimos exactamente batch_size (50 items), puede haber más items
            # Continuar con el siguiente lote
            
            # Incrementar skip para el siguiente lote
            skip += batch_size  # Incrementar según batch_size para ser consistente con la API
            
            logger.info(f"Progreso: {skip} items consultados, {items_synced} items con stock>0, {items_cero_synced} items con stock=0 sincronizados (requests: {requests_realizados}/{caps['max_requests']})")
        
        # ✅ Fase 3: Determinar si sync fue completa
        sync_completa = False
        total_items_procesados = items_synced + items_cero_synced  # ✅ Incluir TODOS los items (stock>0 + stock=0)
        
        if not se_alcanzo_cap:
            # Verificar si llegamos al final natural (API devolvió menos items que batch_size)
            # Esta es la forma más confiable de saber que no hay más items
            if len(items_stock) < batch_size:
                sync_completa = True
                logger.info(f"Sync completa para {location_name}: llegamos al final natural de la API (último lote: {len(items_stock)} items)")
            # ✅ Verificar si alcanzamos el límite máximo de items (también se considera completa)
            elif skip >= max_items:
                sync_completa = True
                logger.info(f"Sync completa para {location_name}: alcanzamos el límite máximo de items ({max_items})")
            else:
                # Si el loop terminó sin alcanzar cap y sin llegar al límite, y no hay más items en la respuesta
                # significa que ADM Cloud no devolvió más items (probablemente items_stock está vacío o el loop terminó por break)
                sync_completa = True
                logger.info(f"Sync completa para {location_name}: loop terminó naturalmente (procesados: {total_items_procesados}, consultados: {stock_items_count})")
        else:
            logger.warning(f"Sync parcial para {location_name}: se alcanzó un cap (requests: {requests_realizados}, tiempo: {tiempo_transcurrido:.1f} min)")
        
        # ✅ Fase 3: REGLA DE ORO #1 modificada - Solo aplicar "desaparecido => 0" si sync fue COMPLETA
        discrepancias_creadas = 0
        
        if sync_completa:
            # REGLA DE ORO #1: Detectar productos que desaparecieron de /api/Stock
            # Si un producto tenía stock > 0 pero ya no viene en /api/Stock, stock ERP ahora es 0
            logger.info(f"Detectando productos desaparecidos en {location_name} (sync completa)...")
        else:
            # ❌ NO aplicar "desaparecido => 0" si sync fue parcial (evitar falsos 0)
            logger.warning(f"NO aplicando regla 'desaparecido => 0' para {location_name} porque la sync fue parcial")
        
        # ✅ STAGING: Buscar productos que tienen stock > 0 en OLD pero NO están en NEW
        # Solo si hay run anterior (OLD)
        stock_existentes = []
        if run_id_anterior:
            try:
                stock_existentes = db_query_with_retry(
                    lambda: StockProductoADM.query.join(ProductoADM).filter(
                        StockProductoADM.location_id == location_id,
                        StockProductoADM.sync_run_id == run_id_anterior,  # OLD
                        StockProductoADM.stock > 0
                    ).all(),
                    max_retries=3,
                    retry_delay=0.5,
                    tag="buscar_stock_existentes_old",
                    meta={"location_id": location_id, "location_name": location_name, "run_id_anterior": run_id_anterior, "run_id_new": nuevo_run.run_id}
                ) or []
            except Exception as e:
                logger.error(f"Error al buscar stock_existentes para ubicación {location_id} (después de retries): {e}")
                try:
                    db.session.rollback()
                    stock_existentes = StockProductoADM.query.join(ProductoADM).filter(
                        StockProductoADM.location_id == location_id,
                        StockProductoADM.sync_run_id == run_id_anterior,
                        StockProductoADM.stock > 0
                    ).all() or []
                except Exception as e2:
                    logger.error(f"Error crítico al buscar stock_existentes para ubicación {location_id}: {e2}")
                    stock_existentes = []
        
        for stock_existente in stock_existentes:
            item_id_existente = stock_existente.producto.item_id
            # Si este producto NO viene en la sync actual, significa que stock ERP ahora es 0
            if item_id_existente not in item_ids_en_sync:
                producto_existente = stock_existente.producto
                stock_anterior = float(stock_existente.stock)
                
                # ✅ STAGING: REGLA DE ORO #1: Crear registro con stock=0 en NEW (no modificar OLD)
                # Buscar si ya existe en NEW
                stock_new = StockProductoADM.query.filter_by(
                    producto_id=producto_existente.producto_id,
                    location_id=location_id,
                    sync_run_id=nuevo_run.run_id  # NEW
                ).first()
                
                if not stock_new:
                    # Crear registro con stock=0 en NEW
                    stock_new = StockProductoADM(
                        producto_id=producto_existente.producto_id,
                        location_id=location_id,
                        location_name=location_name,
                        stock=0.0,
                        sync_run_id=nuevo_run.run_id,  # NEW
                        updated_at=datetime.utcnow()
                    )
                    db.session.add(stock_new)
                    logger.info(f"Producto desaparecido detectado: SKU={producto_existente.sku}, stock anterior={stock_anterior}, ahora NEW=0")
                
                # REGLA DE ORO #3: Verificar si hay stock físico del WMS (crear discrepancia crítica)
                stock_fisico_wms = StockUbicacion.query.filter_by(sku=producto_existente.sku).all()
                stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico_wms if float(s.cantidad) > 0)
                
                # Solo crear discrepancia si ADM=0 y Físico>0 (evento crítico)
                if stock_fisico_total > 0:
                    # Verificar si ya existe una discrepancia pendiente para este producto/ubicación
                    discrepancia_existente = Discrepancia.query.filter_by(
                        producto_id=producto_existente.id,
                        location_id=location_id,
                        estado='pendiente'
                    ).first()
                    
                    if not discrepancia_existente:
                        # Obtener ubicaciones físicas para el mensaje
                        ubicaciones_fisicas = [s.ubicacion for s in stock_fisico_wms if float(s.cantidad) > 0]
                        ubicacion_fisica_str = ", ".join(ubicaciones_fisicas) if ubicaciones_fisicas else None
                        
                        # Crear discrepancia crítica
                        discrepancia = Discrepancia(
                            producto_id=producto_existente.id,
                            sku=producto_existente.sku,
                            location_id=location_id,
                            location_name=location_name,
                            ubicacion_fisica=ubicacion_fisica_str,
                            stock_erp=0.0,
                            stock_fisico_wms=stock_fisico_total,
                            tipo='critica',
                            estado='pendiente',
                            fecha_deteccion=datetime.utcnow()
                        )
                        db.session.add(discrepancia)
                        discrepancias_creadas += 1
                        logger.warning(f"DISCREPANCIA CRÍTICA creada: SKU={producto_existente.sku}, ERP=0, Físico={stock_fisico_total}, Ubicaciones={ubicacion_fisica_str}")
                    else:
                        # Actualizar discrepancia existente
                        discrepancia_existente.stock_erp = 0.0
                        discrepancia_existente.stock_fisico_wms = stock_fisico_total
                        discrepancia_existente.fecha_deteccion = datetime.utcnow()
                        logger.info(f"Discrepancia existente actualizada: SKU={producto_existente.sku}")
        
        if sync_completa:
            productos_desaparecidos = len([s for s in stock_existentes if s.producto.item_id not in item_ids_en_sync])
            logger.info(f"Productos desaparecidos: {productos_desaparecidos} productos actualizados a stock ERP=0, {discrepancias_creadas} discrepancias críticas creadas")
        else:
            productos_desaparecidos = 0
            logger.info(f"Sync parcial: NO se aplicó regla 'desaparecido => 0' (evitando falsos 0)")
        
        # ✅ Fase 2: Corregir progreso - si items_synced > total_items, ajustar total_items al real
        total_items_procesados_final = items_synced + items_cero_synced
        if total_items_procesados_final > stock_items_count:
            logger.info(f"Ajustando total_items para {location_name}: {stock_items_count} -> {total_items_procesados_final}")
            stock_items_count = total_items_procesados_final
        
        # ✅ Fase 3: Actualizar estado según si sync fue completa o parcial
        if sync_completa:
            estado_sync.status = 'done'
            estado_sync.last_sync_at = datetime.utcnow()
        else:
            estado_sync.status = 'partial'  # ✅ Fase 3: Nuevo estado para sync parcial
            estado_sync.skip_actual = skip  # Guardar checkpoint para continuar después
            logger.info(f"Estado 'partial' guardado para {location_name} en skip={skip}")
        
        # ✅ Actualizar items_synced con TODOS los items procesados (stock>0 + stock=0)
        total_items_procesados_final = items_synced + items_cero_synced
        estado_sync.items_synced = total_items_procesados_final  # ✅ Incluir TODOS los items
        estado_sync.total_items = stock_items_count  # ✅ Actualizar total_items con el valor real
        estado_sync.last_error = None
        
        # ✅ STAGING: Actualizar SyncRun con información final
        nuevo_run.items_synced = total_items_procesados_final
        nuevo_run.total_items = stock_items_count
        nuevo_run.errors_count = 0
        nuevo_run.warnings_count = 0
        
        # ✅ STAGING: Validación post-sync y detección de discrepancias
        discrepancias_detectadas = []
        if sync_completa and run_id_anterior:
            logger.info(f"Validando cambios NEW vs OLD para {location_name}...")
            discrepancias_detectadas = validar_cambios_new_vs_old(nuevo_run.run_id, run_id_anterior, location_id, location_name)
            logger.info(f"Detectadas {len(discrepancias_detectadas)} discrepancias NEW vs OLD")
        
        # ✅ STAGING: Validación ADM vs Físico (solo para ADESA)
        if "ADESA" in location_name.upper():
            logger.info(f"Validando ADM vs Físico para {location_name}...")
            discrepancias_fisico = validar_adm_vs_fisico(nuevo_run.run_id, location_id, location_name)
            discrepancias_detectadas.extend(discrepancias_fisico)
            logger.info(f"Detectadas {len(discrepancias_fisico)} discrepancias ADM vs Físico")
        
        # ✅ STAGING: Poblar EnRevision con top discrepancias
        if discrepancias_detectadas:
            top_discrepancias = sorted(
                discrepancias_detectadas,
                key=lambda x: {'critica': 4, 'alta': 3, 'media': 2, 'baja': 1}.get(x.get('severidad', 'media'), 1),
                reverse=True
            )[:50]  # Top 50
            
            poblar_en_revision(discrepancias_detectadas, nuevo_run.run_id, location_id, location_name)
            
            # ✅ STAGING: Enviar email con resumen (solo si está activo)
            try:
                from database.models import NotificacionesConfig
                config_notif = NotificacionesConfig.get_config()
                
                if config_notif.email_discrepancias_activo:
                    from utils.email import enviar_resumen_discrepancias
                    enviar_resumen_discrepancias(location_name, location_id, nuevo_run.run_id, len(discrepancias_detectadas), top_discrepancias)
                    logger.info(f"Email de discrepancias enviado para {location_name}")
            except Exception as e:
                logger.error(f"Error al enviar email de discrepancias: {e}", exc_info=True)
        
        # ✅ STAGING: Determinar status final del run
        if sync_completa:
            nuevo_run.status = 'done'
            nuevo_run.sync_type = 'full'
        else:
            nuevo_run.status = 'partial'
            nuevo_run.sync_type = 'partial'
            nuevo_run.notas = f"Sync parcial: alcanzó cap (requests: {requests_realizados}, tiempo: {tiempo_transcurrido:.1f} min)"
        
        nuevo_run.finished_at = datetime.utcnow()
        
        # ✅ Reportar items fallidos si los hay
        if items_fallidos:
            logger.warning(f"⚠️ {len(items_fallidos)} items fallaron después de múltiples intentos en {location_name}")
            nuevo_run.notas = (nuevo_run.notas or "") + f" | Items fallidos: {len(items_fallidos)}"
        
        # Calcular duración de la sincronización
        duracion_segundos = None
        if nuevo_run.started_at and nuevo_run.finished_at:
            duracion_segundos = (nuevo_run.finished_at - nuevo_run.started_at).total_seconds()
        
        # ✅ STAGING: Enviar email de estado de sincronización (si está activo)
        try:
            from database.models import NotificacionesConfig
            config_notif = NotificacionesConfig.get_config()
            
            logger.info(f"Verificando configuración de email de estado para {location_name}: email_estado_sync_activo={config_notif.email_estado_sync_activo}")
            
            if config_notif.email_estado_sync_activo:
                from utils.email import enviar_estado_sincronizacion
                
                # Calcular items con stock y sin stock
                items_con_stock = items_synced  # items con stock > 0
                items_sin_stock = items_cero_synced  # items con stock = 0
                items_procesados = items_synced + items_cero_synced
                
                logger.info(f"Preparando email de estado para {location_name}: status={nuevo_run.status}, items_procesados={items_procesados}, items_adm={stock_items_count}")
                
                enviar_estado_sincronizacion(
                    location_name=location_name,
                    location_id=location_id,
                    run_id=nuevo_run.run_id,
                    status=nuevo_run.status,
                    items_procesados=items_procesados,
                    items_adm=stock_items_count,  # Total que ADM reportó
                    items_con_stock=items_con_stock,
                    items_sin_stock=items_sin_stock,
                    is_full_sync=sync_completa,
                    error_message=getattr(nuevo_run, 'error_message', None) or nuevo_run.notas,
                    duracion_segundos=duracion_segundos
                )
                logger.info(f"Email de estado de sincronización procesado para {location_name}")
            else:
                logger.info(f"Email de estado de sincronización DESACTIVADO para {location_name} (email_estado_sync_activo=False)")
        except Exception as e:
            logger.error(f"Error al enviar email de estado de sincronización para {location_name}: {e}", exc_info=True)
        
        # ✅ STAGING: Swap atómico (NEW → LIVE) solo si sync fue completa
        try:
            if sync_completa:
                # Transacción atómica: NEW → LIVE
                estado_sync.current_run_id = nuevo_run.run_id  # NEW → LIVE
                estado_sync.running_run_id = None
                estado_sync.status = 'done'
                estado_sync.last_sync_at = datetime.utcnow()
                if not db_commit_with_retry(max_retries=5, retry_delay=0.5):
                    raise Exception("Error al hacer commit del swap atómico después de reintentos")
                logger.info(f"Swap completado: run_id={nuevo_run.run_id} ahora es LIVE para {location_name}")
            else:
                # Sync parcial: NO hacer swap, mantener LIVE anterior
                estado_sync.status = 'partial'
                estado_sync.running_run_id = None  # Ya no está corriendo
                estado_sync.skip_actual = skip  # Guardar checkpoint
                if not db_commit_with_retry(max_retries=5, retry_delay=0.5):
                    raise Exception("Error al hacer commit de sync parcial después de reintentos")
                logger.info(f"Sync parcial: NO se hizo swap. LIVE permanece en run_id={run_id_anterior}")
            
            if sync_completa:
                logger.info(f"Sincronización completada para {location_name}: {items_synced} items con stock>0, {items_cero_synced} items con stock=0 sincronizados (de {stock_items_count} items totales consultados)")
            else:
                logger.info(f"Sincronización parcial para {location_name}: {items_synced} items con stock>0, {items_cero_synced} items con stock=0 sincronizados (pausada en skip={skip}, requests={requests_realizados})")
        except Exception as e:
            logger.error(f"[{triggered_by}] Error en commit final para {location_name}: {e}")
            db.session.rollback()
            nuevo_run.status = 'failed'
            nuevo_run.finished_at = datetime.utcnow()
            estado_sync.status = 'error'
            estado_sync.running_run_id = None
            estado_sync.last_error = f"Error en commit final: {str(e)}"
            db.session.commit()
            return {"success": False, "error": f"Error al guardar datos de {location_name}", "message": str(e), "_http_status": 500}
        
        # NOTA: La actualización de catálogo (nombre, SKU, código de barras) se hace separadamente
        # mediante el endpoint /api/sincronizar/catalogo (manual desde Panel Admin)
        # Esto evita timeout y permite control manual de cuándo actualizar el catálogo
        
        logger.info(f"[{triggered_by}] Sync completada para {location_name}: {items_synced}+{items_cero_synced} items")
        return {
            "success": True,
            "message": f"Sincronización {'completada' if sync_completa else 'parcial'} para {location_name}",
            "location_name": location_name,
            "items_synced": items_synced,
            "items_cero_synced": items_cero_synced,
            "total_items": stock_items_count,
            "discrepancias_creadas": discrepancias_creadas,
            "sync_completa": sync_completa,
            "status": estado_sync.status,
            "last_sync_at": estado_sync.last_sync_at.isoformat() + 'Z' if estado_sync.last_sync_at else None
        }
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al sincronizar ubicación {location_id}: {e}", exc_info=True)
        
        # ✅ STAGING: Actualizar estado y SyncRun a "error"
        run_failed = None
        location_name_error = location_id  # fallback si no hay estado_sync
        try:
            estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
            if estado_sync:
                location_name_error = estado_sync.location_name or location_id
                running_run_id = estado_sync.running_run_id  # Guardar antes de borrar
                estado_sync.status = 'error'
                estado_sync.running_run_id = None
                estado_sync.last_error = str(e)
                
                # Si hay run en ejecución, marcarlo como failed
                if running_run_id:
                    run_failed = SyncRun.query.get(running_run_id)
                    if run_failed:
                        run_failed.status = 'failed'
                        run_failed.finished_at = datetime.utcnow()
                        run_failed.errors_count = 1
                        run_failed.notas = f"Error durante sincronización: {str(e)}"
                
                db.session.commit()
        except Exception as e2:
            logger.error(f"Error al actualizar estado de error: {e2}")
        
        # Enviar email de estado con fallo si está activo
        try:
            from database.models import NotificacionesConfig
            config_notif = NotificacionesConfig.get_config()
            if config_notif.email_estado_sync_activo:
                from utils.email import enviar_estado_sincronizacion
                run_id_val = run_failed.run_id if run_failed else 0
                items_p = run_failed.items_synced if run_failed else 0
                total_p = run_failed.total_items if run_failed else 0
                duracion = None
                if run_failed and run_failed.started_at:
                    duracion = (datetime.utcnow() - run_failed.started_at).total_seconds()
                enviar_estado_sincronizacion(
                    location_name=location_name_error,
                    location_id=location_id,
                    run_id=run_id_val,
                    status='failed',
                    items_procesados=items_p,
                    items_adm=total_p,
                    items_con_stock=items_p,
                    items_sin_stock=0,
                    is_full_sync=False,
                    error_message=str(e),
                    duracion_segundos=duracion
                )
                logger.info(f"Email de estado (sync fallida) enviado para {location_name_error}")
        except Exception as e_email:
            logger.error(f"Error al enviar email de estado por sync fallida: {e_email}", exc_info=True)
        
        return {"success": False, "error": "Error al sincronizar ubicación", "message": str(e), "_http_status": 500}


@sincronizar_bp.route('/api/sincronizar/ubicacion/<location_id>', methods=['POST'])
@require_admin_or_cron
def sincronizar_ubicacion(location_id):
    """
    Endpoint HTTP: sincroniza el stock de una ubicación. Delega a run_sync_ubicacion.
    """
    result = run_sync_ubicacion(location_id, triggered_by='manual')
    status = result.pop('_http_status', 200)
    return jsonify(result), status


def sincronizar_lote_ubicacion_interno(location_id, estado_sync, adm_client, location_name, total_items_override=None):
    """
    Función interna para sincronizar un lote (reutilizable)
    """
    try:
        total_items = total_items_override if total_items_override is not None else estado_sync.total_items
        
        # Verificar si ya está completo
        if estado_sync.items_synced >= total_items:
            estado_sync.status = 'done'
            db.session.commit()
            return {
                "success": True,
                "message": f"Sincronización de {location_name} ya está completa",
                "location_name": location_name,
                "items_synced": estado_sync.items_synced,
                "total_items": total_items,
                "completado": True
            }
        
        # Actualizar estado a "running"
        estado_sync.status = 'running'
        estado_sync.last_error = None
        db.session.commit()
        
        # ✅ Calcular rango del lote (1000 items totales, incluyendo stock = 0)
        skip_inicial = estado_sync.skip_actual
        lote_size = 1000  # 1000 items totales (stock > 0 Y stock = 0)
        lote_numero = estado_sync.lote_actual + 1
        
        # ✅ Usar ShowNoStock=true igual que la sincronización completa
        use_show_no_stock = True
        logger.info(f"Sincronizando lote {lote_numero} de {location_name}: desde skip {skip_inicial}, objetivo: {lote_size} items totales (con ShowNoStock=true, incluirá items con stock=0)")
        
        # Obtener stock de la ubicación con paginación
        stock_items_count = 0
        items_synced = 0
        items_cero_synced = 0  # ✅ Contador de items con stock=0
        skip = skip_inicial
        batch_size = 50  # ADM Cloud limita a 50 items por solicitud
        max_skip = skip_inicial + (lote_size * 2)  # Límite de seguridad: máximo 2x el lote
        item_ids_en_sync = set()  # Items con stock > 0
        item_ids_con_stock_cero = set()  # ✅ Items con stock=0
        
        # Contador para saber cuántos items totales hemos procesado
        items_totales_procesados = 0
        
        while items_totales_procesados < lote_size and skip < max_skip:
            # ✅ Usar ShowNoStock=true igual que la sincronización completa
            stock_result = adm_client.obtener_stock(location_id=location_id, skip=skip, take=batch_size, show_no_stock=use_show_no_stock)
            
            if not stock_result.get("success", False):
                error_msg = stock_result.get('error', 'Error desconocido')
                logger.error(f"Error al obtener stock para {location_name} (skip={skip}): {error_msg}")
                estado_sync.status = 'error'
                estado_sync.last_error = error_msg
                db.session.commit()
                return {
                    "success": False,
                    "error": f"Error al obtener stock para {location_name}",
                    "message": error_msg
                }
            
            items_stock = stock_result.get("data", [])
            if not items_stock or len(items_stock) == 0:
                break  # No hay más items
            
            # Procesar cada item de stock
            for item in items_stock:
                # Extraer ItemID
                item_id = None
                if item.get("ItemID"):
                    item_id = item.get("ItemID")
                elif item.get("ID"):
                    item_id = item.get("ID")
                elif isinstance(item.get("Item"), dict):
                    item_id = item.get("Item").get("ID") or item.get("Item").get("ItemID")
                elif item.get("Item"):
                    item_id = item.get("Item")
                
                # Extraer SKU
                item_sku = ""
                if item.get("ItemSKU"):
                    item_sku = str(item.get("ItemSKU")).upper()
                elif item.get("SKU"):
                    item_sku = str(item.get("SKU")).upper()
                elif isinstance(item.get("Item"), dict):
                    item_sku = str(item.get("Item").get("SKU") or item.get("Item").get("ItemSKU") or "").upper()
                
                # Extraer Stock
                stock = 0.0
                stock_raw = None
                for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                    if item.get(field) is not None:
                        stock_raw = item.get(field)
                        break
                
                if stock_raw is None and isinstance(item.get("Item"), dict):
                    for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                        if item.get("Item").get(field) is not None:
                            stock_raw = item.get("Item").get(field)
                            break
                
                try:
                    if stock_raw is not None:
                        stock = float(stock_raw)
                except (ValueError, TypeError):
                    stock = 0.0
                
                # ✅ Procesar items con stock > 0 Y stock = 0 (igual que sincronización completa)
                if stock > 0 and item_id:
                    # Si ya procesamos suficientes items de este lote, salir
                    if items_totales_procesados >= lote_size:
                        break
                    
                    items_totales_procesados += 1
                    item_ids_en_sync.add(item_id)
                    
                    # Buscar o crear producto en BD (con retry y reconexión automática)
                    try:
                        producto = db_query_with_retry(
                            lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                            max_retries=3,
                            retry_delay=0.5
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar producto {item_id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            producto = ProductoADM.query.filter_by(item_id=item_id).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar producto {item_id}: {e2}")
                            continue
                    
                    codigo_barras_directo = None
                    if item.get("Barcode") or item.get("BarcodeValue"):
                        codigo_barras_directo = item.get("Barcode") or item.get("BarcodeValue")
                    elif isinstance(item.get("Item"), dict):
                        codigo_barras_directo = item.get("Item").get("Barcode") or item.get("Item").get("BarcodeValue")
                    
                    codigo_barras = codigo_barras_directo or (producto.codigo_barras if producto else None)
                    nombre_completo = producto.nombre if producto else item_sku
                    
                    if not producto:
                        producto = ProductoADM(
                            item_id=item_id,
                            sku=item_sku,
                            nombre=nombre_completo,
                            codigo_barras=codigo_barras,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(producto)
                        db.session.flush()
                    elif codigo_barras_directo and codigo_barras_directo != producto.codigo_barras:
                        producto.codigo_barras = codigo_barras_directo
                        producto.updated_at = datetime.utcnow()
                    
                    # Buscar o crear registro de stock
                    try:
                        stock_obj = db_query_with_retry(
                            lambda: StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first(),
                            max_retries=3,
                            retry_delay=0.5
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar stock_obj para producto {producto.id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            stock_obj = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar stock_obj para producto {producto.id}: {e2}")
                            continue
                    
                    if stock_obj:
                        stock_obj.stock = stock
                        stock_obj.location_name = location_name
                        stock_obj.updated_at = datetime.utcnow()
                    else:
                        stock_obj = StockProductoADM(
                            producto_id=producto.id,
                            location_id=location_id,
                            location_name=location_name,
                            stock=stock,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(stock_obj)
                    
                    items_synced += 1
                elif stock == 0 and item_id and use_show_no_stock:
                    # ✅ Procesar items con stock=0 explícito (ShowNoStock=true)
                    # Si ya procesamos suficientes items de este lote, salir
                    if items_totales_procesados >= lote_size:
                        break
                    
                    items_totales_procesados += 1
                    item_ids_con_stock_cero.add(item_id)
                    
                    # Buscar o crear producto en BD
                    try:
                        producto = db_query_with_retry(
                            lambda: ProductoADM.query.filter_by(item_id=item_id).first(),
                            max_retries=3,
                            retry_delay=0.5,
                            tag="buscar_producto_stock_cero_lote",
                            meta={"item_id": item_id, "item_sku": item_sku, "skip": skip, "lote": lote_numero, "location_name": location_name}
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar producto {item_id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            producto = ProductoADM.query.filter_by(item_id=item_id).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar producto {item_id}: {e2}")
                            continue
                    
                    codigo_barras_directo = None
                    if item.get("Barcode") or item.get("BarcodeValue"):
                        codigo_barras_directo = item.get("Barcode") or item.get("BarcodeValue")
                    elif isinstance(item.get("Item"), dict):
                        codigo_barras_directo = item.get("Item").get("Barcode") or item.get("Item").get("BarcodeValue")
                    
                    codigo_barras = codigo_barras_directo or (producto.codigo_barras if producto else None)
                    nombre_completo = producto.nombre if producto else item_sku
                    
                    if not producto:
                        producto = ProductoADM(
                            item_id=item_id,
                            sku=item_sku,
                            nombre=nombre_completo,
                            codigo_barras=codigo_barras,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(producto)
                        db.session.flush()
                    elif codigo_barras_directo and codigo_barras_directo != producto.codigo_barras:
                        producto.codigo_barras = codigo_barras_directo
                        producto.updated_at = datetime.utcnow()
                    
                    # Buscar o crear registro de stock=0
                    try:
                        stock_obj = db_query_with_retry(
                            lambda: StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first(),
                            max_retries=3,
                            retry_delay=0.5,
                            tag="buscar_stock_cero_lote",
                            meta={"producto_id": producto.id, "item_id": item_id, "item_sku": item_sku, "location_id": location_id, "skip": skip, "lote": lote_numero, "stock": 0.0}
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar stock_obj para producto {producto.id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            stock_obj = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar stock_obj para producto {producto.id}: {e2}")
                            continue
                    
                    if stock_obj:
                        stock_obj.stock = 0.0  # Asegurar que esté en 0
                        stock_obj.location_name = location_name
                        stock_obj.updated_at = datetime.utcnow()
                    else:
                        stock_obj = StockProductoADM(
                            producto_id=producto.id,
                            location_id=location_id,
                            location_name=location_name,
                            stock=0.0,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(stock_obj)
                    
                    items_cero_synced += 1
                
                stock_items_count += 1
            
            # Commit periódico cada 50 items
            total_items_procesados = items_synced + items_cero_synced
            if total_items_procesados > 0 and total_items_procesados % 50 == 0:
                try:
                    db.session.commit()
                except Exception as e:
                    logger.error(f"Error en commit periódico: {e}")
                    db.session.rollback()
            
            # Si recibimos menos items de los solicitados, ya no hay más
            if len(items_stock) < batch_size:
                break
            
            skip += batch_size
            
            # Si ya procesamos suficientes items totales, salir
            if items_totales_procesados >= lote_size:
                break
        
        # Actualizar estado
        estado_sync.skip_actual = skip
        estado_sync.lote_actual = lote_numero
        # ✅ Incluir TODOS los items procesados (stock > 0 + stock = 0)
        total_items_procesados_lote = items_synced + items_cero_synced
        estado_sync.items_synced += total_items_procesados_lote
        
        # ✅ Fase 2: Corregir progreso - si items_synced > total_items, ajustar total_items al real
        if estado_sync.items_synced > estado_sync.total_items:
            logger.info(f"Ajustando total_items para {location_name}: {estado_sync.total_items} -> {estado_sync.items_synced}")
            estado_sync.total_items = estado_sync.items_synced
        
        # Verificar si completó
        if estado_sync.items_synced >= total_items:
            estado_sync.status = 'done'
            estado_sync.last_sync_at = datetime.utcnow()
            completado = True
        elif items_totales_procesados >= lote_size:
            estado_sync.status = 'paused'
            completado = False
        else:
            estado_sync.status = 'done'
            estado_sync.last_sync_at = datetime.utcnow()
            completado = True
        
        estado_sync.last_error = None
        
        # Commit final
        try:
            db.session.commit()
            logger.info(f"Lote {lote_numero} completado para {location_name}: {items_synced} items con stock>0, {items_cero_synced} items con stock=0 sincronizados (total: {estado_sync.items_synced}/{total_items})")
        except Exception as e:
            logger.error(f"Error en commit final: {e}")
            db.session.rollback()
            estado_sync.status = 'error'
            estado_sync.last_error = f"Error en commit final: {str(e)}"
            db.session.commit()
            return {
                "success": False,
                "error": f"Error al guardar datos de {location_name}",
                "message": str(e)
            }
        
        return {
            "success": True,
            "message": f"Lote {lote_numero} completado para {location_name}",
            "location_name": location_name,
            "lote_numero": lote_numero,
            "items_synced_lote": items_synced,  # Items con stock > 0
            "items_cero_synced_lote": items_cero_synced,  # ✅ Items con stock = 0
            "items_synced_total": estado_sync.items_synced,  # Total (stock > 0 + stock = 0)
            "total_items": total_items,
            "skip_actual": estado_sync.skip_actual,
            "completado": completado
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al sincronizar lote de ubicación {location_id}: {e}")
        import traceback
        traceback.print_exc()
        
        try:
            estado_sync.status = 'error'
            estado_sync.last_error = str(e)
            db.session.commit()
        except:
            pass
        
        return {
            "success": False,
            "error": "Error al sincronizar lote",
            "message": str(e)
        }


@sincronizar_bp.route('/api/sincronizar/ubicacion/<location_id>/contar', methods=['POST'])
@require_admin
def contar_productos_ubicacion(location_id):
    """
    Cuenta el total de productos con stock > 0 en una ubicación.
    Solo accesible por administradores.
    """
    try:
        db.create_all()
        
        adm_client = get_adm_client()
        
        # Obtener información de la ubicación
        ubicaciones_result = adm_client.obtener_ubicaciones(skip=0, take=100)
        ubicacion_info = None
        
        if ubicaciones_result.get("success"):
            for loc in ubicaciones_result.get("data", []):
                if loc.get("ID") == location_id:
                    ubicacion_info = loc
                    break
        
        if not ubicacion_info:
            return jsonify({
                "success": False,
                "error": f"Ubicación {location_id} no encontrada en ADM Cloud"
            }), 404
        
        location_name = ubicacion_info.get("Name", "")
        
        # Actualizar estado a "running"
        estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
        if not estado_sync:
            estado_sync = SyncLocationStatus(
                location_id=location_id,
                location_name=location_name,
                status='running'
            )
            db.session.add(estado_sync)
        else:
            estado_sync.status = 'running'
            estado_sync.location_name = location_name
            estado_sync.last_error = None
        db.session.commit()
        
        logger.info(f"Contando productos de {location_name} (ID: {location_id})...")
        
        # ✅ Contar TODOS los productos (con stock > 0 Y stock = 0) para ser consistente con la sincronización
        # La sincronización usa ShowNoStock=true, así que el conteo debe hacer lo mismo
        total_items = 0
        items_con_stock = 0  # Productos con stock > 0
        items_sin_stock = 0  # Productos con stock = 0
        skip = 0
        batch_size = 50
        max_items = 50000  # Límite de seguridad
        use_show_no_stock = True  # ✅ Usar ShowNoStock=true igual que la sincronización
        
        logger.info(f"Contando productos con ShowNoStock=true para {location_name} (incluirá items con stock=0)")
        
        while skip < max_items:
            # ✅ Usar show_no_stock=True igual que la sincronización
            stock_result = adm_client.obtener_stock(location_id=location_id, skip=skip, take=batch_size, show_no_stock=use_show_no_stock)
            
            if not stock_result.get("success", False):
                error_msg = stock_result.get('error', 'Error desconocido')
                logger.error(f"Error al contar stock para {location_name}: {error_msg}")
                estado_sync.status = 'error'
                estado_sync.last_error = error_msg
                db.session.commit()
                return jsonify({
                    "success": False,
                    "error": f"Error al contar productos de {location_name}",
                    "message": error_msg
                }), 500
            
            items_stock = stock_result.get("data", [])
            if not items_stock or len(items_stock) == 0:
                break  # No hay más items
            
            # ✅ Contar TODOS los items (stock > 0 Y stock = 0)
            for item in items_stock:
                stock = 0.0
                stock_raw = None
                for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                    if item.get(field) is not None:
                        stock_raw = item.get(field)
                        break
                
                if stock_raw is None and isinstance(item.get("Item"), dict):
                    for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                        if item.get("Item").get(field) is not None:
                            stock_raw = item.get("Item").get(field)
                            break
                
                try:
                    if stock_raw is not None:
                        stock = float(stock_raw)
                except (ValueError, TypeError):
                    stock = 0.0
                
                # ✅ Contar todos los items (no solo stock > 0)
                total_items += 1
                if stock > 0:
                    items_con_stock += 1
                else:
                    items_sin_stock += 1
            
            # Si recibimos menos items de los solicitados, ya no hay más
            if len(items_stock) < batch_size:
                break
            
            skip += batch_size
        
        # Guardar total y resetear para nueva sincronización
        estado_sync.total_items = total_items
        estado_sync.skip_actual = 0
        estado_sync.lote_actual = 0
        estado_sync.items_synced = 0
        
        logger.info(f"Total de productos encontrados en {location_name}: {total_items} (con stock: {items_con_stock}, sin stock: {items_sin_stock})")
        
        # MEJORA 1: Si hay menos de 1000 productos, sincronizar automáticamente
        if total_items > 0 and total_items <= 1000:
            logger.info(f"{location_name} tiene {total_items} productos (<= 1000), sincronizando automáticamente...")
            estado_sync.status = 'running'
            db.session.commit()
            
            # Llamar a la función interna de sincronización
            try:
                resultado = sincronizar_lote_ubicacion_interno(location_id, estado_sync, adm_client, location_name, total_items)
                
                if resultado.get("success"):
                    if resultado.get("completado"):
                        return jsonify({
                            "success": True,
                            "message": f"Conteo y sincronización completados para {location_name}: {total_items} productos",
                            "location_name": location_name,
                            "total_items": total_items,
                            "items_synced": resultado.get("items_synced_total", 0),
                            "auto_sync": True,
                            "completado": True
                        })
                    else:
                        return jsonify({
                            "success": True,
                            "message": f"Conteo completado y lote sincronizado para {location_name}: {resultado.get('items_synced_total', 0)} de {total_items} productos",
                            "location_name": location_name,
                            "total_items": total_items,
                            "items_synced": resultado.get("items_synced_total", 0),
                            "auto_sync": True,
                            "completado": False
                        })
                else:
                    # Si falla, dejar en paused para que se sincronice manualmente
                    estado_sync.status = 'paused'
                    db.session.commit()
                    return jsonify({
                        "success": True,
                        "message": f"Conteo completado para {location_name}: {total_items} productos. Sincronización automática falló, use 'Continuar Lote'.",
                        "location_name": location_name,
                        "total_items": total_items,
                        "auto_sync_attempted": True,
                        "auto_sync_error": resultado.get("error", "Error desconocido")
                    })
            except Exception as e:
                logger.error(f"Error al sincronizar automáticamente: {e}")
                import traceback
                traceback.print_exc()
                # Si falla, dejar en paused para que se sincronice manualmente
                estado_sync.status = 'paused'
                db.session.commit()
                return jsonify({
                    "success": True,
                    "message": f"Conteo completado para {location_name}: {total_items} productos. Sincronización automática falló, use 'Continuar Lote'.",
                    "location_name": location_name,
                    "total_items": total_items,
                    "auto_sync_attempted": True,
                    "auto_sync_error": str(e)
                })
        else:
            # Más de 1000 productos, pausar para sincronización manual
            estado_sync.status = 'paused'
            db.session.commit()
            
            return jsonify({
                "success": True,
                "message": f"Conteo completado para {location_name}: {total_items} productos ({items_con_stock} con stock, {items_sin_stock} sin stock). Use 'Continuar Lote' para sincronizar.",
                "location_name": location_name,
                "total_items": total_items,
                "items_con_stock": items_con_stock,
                "items_sin_stock": items_sin_stock,
                "auto_sync_attempted": False
            })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al contar productos de ubicación {location_id}: {e}")
        import traceback
        traceback.print_exc()
        
        try:
            estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
            if estado_sync:
                estado_sync.status = 'error'
                estado_sync.last_error = str(e)
                db.session.commit()
        except:
            pass
        
        return jsonify({
            "success": False,
            "error": "Error al contar productos",
            "message": str(e)
        }), 500


@sincronizar_bp.route('/api/sincronizar/ubicacion/<location_id>/lote', methods=['POST'])
@require_admin_or_cron
def sincronizar_lote_ubicacion(location_id):
    """
    Sincroniza un lote de 1000 productos desde skip_actual.
    Solo accesible por administradores.
    """
    try:
        db.create_all()
        
        adm_client = get_adm_client()
        
        # Obtener estado de sincronización
        estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
        if not estado_sync:
            return jsonify({
                "success": False,
                "error": "Debe contar productos primero"
            }), 400
        
        if estado_sync.total_items == 0:
            return jsonify({
                "success": False,
                "error": "Debe contar productos primero"
            }), 400
        
        location_name = estado_sync.location_name
        
        # Verificar si ya está completo
        if estado_sync.skip_actual >= estado_sync.total_items:
            estado_sync.status = 'done'
            db.session.commit()
            return jsonify({
                "success": True,
                "message": f"Sincronización de {location_name} ya está completa",
                "location_name": location_name,
                "items_synced": estado_sync.items_synced,
                "total_items": estado_sync.total_items,
                "completado": True
            })
        
        # Actualizar estado a "running"
        estado_sync.status = 'running'
        estado_sync.last_error = None
        estado_sync.last_heartbeat_at = datetime.utcnow()  # Heartbeat inicial para auto-tick
        db.session.commit()
        
        # Calcular rango del lote (1000 items con stock > 0)
        skip_inicial = estado_sync.skip_actual
        lote_size = 1000  # 1000 items con stock > 0
        lote_numero = estado_sync.lote_actual + 1
        
        logger.info(f"Sincronizando lote {lote_numero} de {location_name}: desde skip {skip_inicial}, objetivo: {lote_size} items con stock > 0")
        
        # Obtener stock de la ubicación con paginación
        stock_items_count = 0
        items_synced = 0
        skip = skip_inicial
        batch_size = 50  # ADM Cloud limita a 50 items por solicitud
        max_skip = skip_inicial + (lote_size * 3)  # Límite de seguridad: máximo 3x el lote para encontrar 1000 con stock
        item_ids_en_sync = set()
        
        # Contador para saber cuántos items con stock > 0 hemos procesado
        items_con_stock_procesados = 0
        
        while items_con_stock_procesados < lote_size and skip < max_skip:
            stock_result = adm_client.obtener_stock(location_id=location_id, skip=skip, take=batch_size)
            
            if not stock_result.get("success", False):
                error_msg = stock_result.get('error', 'Error desconocido')
                logger.error(f"Error al obtener stock para {location_name} (skip={skip}): {error_msg}")
                estado_sync.status = 'error'
                estado_sync.last_error = error_msg
                db.session.commit()
                return jsonify({
                    "success": False,
                    "error": f"Error al obtener stock para {location_name}",
                    "message": error_msg
                }), 500
            
            items_stock = stock_result.get("data", [])
            if not items_stock or len(items_stock) == 0:
                break  # No hay más items
            
            # Procesar cada item de stock
            for item in items_stock:
                # Extraer ItemID
                item_id = None
                if item.get("ItemID"):
                    item_id = item.get("ItemID")
                elif item.get("ID"):
                    item_id = item.get("ID")
                elif isinstance(item.get("Item"), dict):
                    item_id = item.get("Item").get("ID") or item.get("Item").get("ItemID")
                elif item.get("Item"):
                    item_id = item.get("Item")
                
                # Extraer SKU
                item_sku = ""
                if item.get("ItemSKU"):
                    item_sku = str(item.get("ItemSKU")).upper()
                elif item.get("SKU"):
                    item_sku = str(item.get("SKU")).upper()
                elif isinstance(item.get("Item"), dict):
                    item_sku = str(item.get("Item").get("SKU") or item.get("Item").get("ItemSKU") or "").upper()
                
                # Extraer Stock
                stock = 0.0
                stock_raw = None
                for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                    if item.get(field) is not None:
                        stock_raw = item.get(field)
                        break
                
                if stock_raw is None and isinstance(item.get("Item"), dict):
                    for field in ["Stock", "QuantityOnHand", "Quantity", "QuantityAvailable", "OnHand", "Qty", "AvailableQuantity"]:
                        if item.get("Item").get(field) is not None:
                            stock_raw = item.get("Item").get(field)
                            break
                
                try:
                    if stock_raw is not None:
                        stock = float(stock_raw)
                except (ValueError, TypeError):
                    stock = 0.0
                
                # Solo procesar items con stock > 0
                if stock > 0 and item_id:
                    # Si ya procesamos los items con stock de este lote, salir
                    if items_con_stock_procesados >= lote_size:
                        break
                    
                    items_con_stock_procesados += 1
                    
                    item_ids_en_sync.add(item_id)
                    
                    # Buscar o crear producto en BD
                    producto = ProductoADM.query.filter_by(item_id=item_id).first()
                    
                    codigo_barras_directo = None
                    if item.get("Barcode") or item.get("BarcodeValue"):
                        codigo_barras_directo = item.get("Barcode") or item.get("BarcodeValue")
                    elif isinstance(item.get("Item"), dict):
                        codigo_barras_directo = item.get("Item").get("Barcode") or item.get("Item").get("BarcodeValue")
                    
                    codigo_barras = codigo_barras_directo or (producto.codigo_barras if producto else None)
                    nombre_completo = producto.nombre if producto else item_sku
                    
                    if not producto:
                        producto = ProductoADM(
                            item_id=item_id,
                            sku=item_sku,
                            nombre=nombre_completo,
                            codigo_barras=codigo_barras,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(producto)
                        db.session.flush()
                    elif codigo_barras_directo and codigo_barras_directo != producto.codigo_barras:
                        producto.codigo_barras = codigo_barras_directo
                        producto.updated_at = datetime.utcnow()
                    
                    # Buscar o crear registro de stock
                    try:
                        stock_obj = db_query_with_retry(
                            lambda: StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first(),
                            max_retries=3,
                            retry_delay=0.5
                        )
                    except Exception as e:
                        logger.error(f"Error al buscar stock_obj para producto {producto.id} (después de retries): {e}")
                        try:
                            db.session.rollback()
                            stock_obj = StockProductoADM.query.filter_by(
                                producto_id=producto.id,
                                location_id=location_id
                            ).first()
                        except Exception as e2:
                            logger.error(f"Error crítico al buscar stock_obj para producto {producto.id}: {e2}")
                            continue
                    
                    if stock_obj:
                        stock_obj.stock = stock
                        stock_obj.location_name = location_name
                        stock_obj.updated_at = datetime.utcnow()
                    else:
                        stock_obj = StockProductoADM(
                            producto_id=producto.id,
                            location_id=location_id,
                            location_name=location_name,
                            stock=stock,
                            updated_at=datetime.utcnow()
                        )
                        db.session.add(stock_obj)
                    
                    items_synced += 1
                
                stock_items_count += 1
            
            # Commit periódico cada 50 items
            if items_synced > 0 and items_synced % 50 == 0:
                try:
                    estado_sync.last_heartbeat_at = datetime.utcnow()  # Heartbeat para auto-tick
                    db.session.commit()
                except Exception as e:
                    logger.error(f"Error en commit periódico: {e}")
                    db.session.rollback()
            
            # Si recibimos menos items de los solicitados, ya no hay más
            if len(items_stock) < batch_size:
                break
            
            skip += batch_size
            
            # Si ya procesamos suficientes items con stock, salir
            if items_con_stock_procesados >= lote_size:
                break
        
        # Actualizar estado
        # skip_actual se actualiza al skip donde quedamos (para continuar desde ahí)
        estado_sync.skip_actual = skip
        estado_sync.lote_actual = lote_numero
        estado_sync.items_synced += items_synced
        
        # Verificar si completó
        # Completado si ya sincronizamos todos los items esperados (total_items)
        if estado_sync.items_synced >= estado_sync.total_items:
            estado_sync.status = 'done'
            estado_sync.last_sync_at = datetime.utcnow()
            completado = True
        elif items_con_stock_procesados >= lote_size:
            # Lote completado, pero puede haber más
            estado_sync.status = 'paused'
            completado = False
        else:
            # No hay más items con stock, completado
            estado_sync.status = 'done'
            estado_sync.last_sync_at = datetime.utcnow()
            completado = True
        
        estado_sync.last_error = None
        
        # Commit final
        try:
            db.session.commit()
            logger.info(f"Lote {lote_numero} completado para {location_name}: {items_synced} items sincronizados (total: {estado_sync.items_synced}/{estado_sync.total_items})")
        except Exception as e:
            logger.error(f"Error en commit final: {e}")
            db.session.rollback()
            estado_sync.status = 'error'
            estado_sync.last_error = f"Error en commit final: {str(e)}"
            db.session.commit()
            return jsonify({
                "success": False,
                "error": f"Error al guardar datos de {location_name}",
                "message": str(e)
            }), 500
        
        return jsonify({
            "success": True,
            "message": f"Lote {lote_numero} completado para {location_name}",
            "location_name": location_name,
            "lote_numero": lote_numero,
            "items_synced_lote": items_synced,
            "items_synced_total": estado_sync.items_synced,
            "total_items": estado_sync.total_items,
            "skip_actual": estado_sync.skip_actual,
            "completado": completado
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al sincronizar lote de ubicación {location_id}: {e}")
        import traceback
        traceback.print_exc()
        
        try:
            estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
            if estado_sync:
                estado_sync.status = 'error'
                estado_sync.last_error = str(e)
                db.session.commit()
        except:
            pass
        
        return jsonify({
            "success": False,
            "error": "Error al sincronizar lote",
            "message": str(e)
        }), 500

