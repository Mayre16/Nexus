"""
Rutas para consulta de productos con ubicaciones ADM y físicas
Permite buscar productos por SKU, nombre o código de barras
y ver en qué ubicación ADM y ubicaciones físicas están
"""
from flask import Blueprint, request, jsonify, render_template, session
from routes.auth import require_auth
from database import db
from database.models import StockUbicacion, ProductoADM, StockProductoADM, Discrepancia
import logging

productos_bp = Blueprint('productos', __name__)
logger = logging.getLogger(__name__)


@productos_bp.route('/productos')
@require_auth
def productos_page():
    """Página de consulta de productos"""
    return render_template('productos.html')


@productos_bp.route('/api/productos/buscar', methods=['POST'])
@require_auth
def buscar_producto():
    """
    Busca un producto por SKU, nombre o código de barras
    Usa la base de datos local (cache) para búsquedas rápidas
    Devuelve información del producto, ubicación ADM y ubicaciones físicas WMS
    """
    try:
        data = request.json or {}
        busqueda = data.get('busqueda', '').strip()
        tipo_busqueda = data.get('tipo', 'sku').lower()  # sku, nombre, codigo_barras
        
        if not busqueda:
            return jsonify({
                "success": False,
                "error": "Término de búsqueda requerido"
            }), 400
        
        # Verificar si hay productos en cache
        total_cache = ProductoADM.query.count()
        if total_cache == 0:
            return jsonify({
                "success": False,
                "error": "Base de datos de productos no sincronizada",
                "message": "Por favor, sincroniza los productos desde ADM Cloud primero"
            }), 400
        
        producto_db = None
        
        # Buscar en base de datos local según el tipo de búsqueda
        if tipo_busqueda == 'sku':
            from utils.helpers import resolver_producto_adm
            producto_db = resolver_producto_adm(sku=busqueda.upper())
        
        elif tipo_busqueda == 'codigo_barras':
            # Búsqueda por código de barras (sin importar mayúsculas/minúsculas)
            busqueda_upper = busqueda.strip().upper()
            # Buscar exacto primero
            producto_db = ProductoADM.query.filter(
                ProductoADM.codigo_barras.ilike(busqueda_upper)
            ).first()
            
            # Si no se encuentra exacto, buscar normalizando espacios y guiones
            if not producto_db:
                busqueda_normalizada = busqueda_upper.replace('-', '').replace(' ', '').replace('_', '')
                from sqlalchemy import func
                productos = ProductoADM.query.filter(
                    ProductoADM.codigo_barras.isnot(None),
                    func.length(ProductoADM.codigo_barras) >= len(busqueda_normalizada) - 3,
                    func.length(ProductoADM.codigo_barras) <= len(busqueda_normalizada) + 3
                ).all()
                for p in productos:
                    if p.codigo_barras:
                        codigo_normalizado = p.codigo_barras.replace('-', '').replace(' ', '').replace('_', '').upper()
                        if codigo_normalizado == busqueda_normalizada:
                            producto_db = p
                            break
        
        elif tipo_busqueda == 'nombre':
            # Búsqueda parcial por nombre (usando LIKE)
            busqueda_lower = busqueda.lower()
            producto_db = ProductoADM.query.filter(
                ProductoADM.nombre.ilike(f'%{busqueda_lower}%')
            ).first()
        
        if not producto_db:
            return jsonify({
                "success": False,
                "error": f"Producto no encontrado con {tipo_busqueda}: {busqueda}",
                "sugerencia": "Verifica el término de búsqueda o sincroniza los productos desde ADM Cloud"
            }), 404
        
        # Obtener stock ADM desde cache (SOLO mostrar ubicaciones con stock > 0)
        # ✅ STAGING: Obtener stock vigente (LIVE) para todas las ubicaciones
        from utils.helpers import obtener_stock_vigente
        from database.models import SyncLocationStatus
        
        # Obtener todas las ubicaciones con current_run_id (LIVE)
        estados_sync = SyncLocationStatus.query.filter(
            SyncLocationStatus.current_run_id.isnot(None)
        ).all()
        
        # Obtener stock vigente para cada ubicación
        stock_ubicaciones_adm = []
        for estado in estados_sync:
            stock_vigente = obtener_stock_vigente(producto_db.id, estado.location_id)
            if stock_vigente:
                stock_ubicaciones_adm.append(stock_vigente)
        
        # Fallback: si no hay ubicaciones con current_run_id, usar registros sin sync_run_id (migración gradual)
        if not stock_ubicaciones_adm:
            stock_ubicaciones_adm = StockProductoADM.query.filter_by(
                producto_id=producto_db.id,
                sync_run_id=None
            ).all()
        ubicaciones_adm = []
        stock_total_adm = 0.0
        stock_adesa = 0.0  # Stock en ADESA (ubicación principal "En mano")
        
        # Log para depuración
        logger.info(f"Buscando stock para producto ID={producto_db.id}, SKU={producto_db.sku}, ItemID={producto_db.item_id}")
        logger.info(f"Encontrados {len(stock_ubicaciones_adm)} registros de stock en BD")
        
        for stock_adm in stock_ubicaciones_adm:
            stock_cantidad = float(stock_adm.stock) if stock_adm.stock else 0.0
            
            # SOLO incluir ubicaciones con stock > 0 (regla de ADM Cloud)
            if stock_cantidad > 0:
                ubicaciones_adm.append({
                    "nombre": stock_adm.location_name,
                    "id": stock_adm.location_id,
                    "stock": stock_cantidad,
                    "updated_at": (stock_adm.updated_at.isoformat() + 'Z') if stock_adm.updated_at else None
                })
                stock_total_adm += stock_cantidad
                
                # Si es ADESA, guardar stock para "En mano"
                if stock_adm.location_name.upper() == "ADESA":
                    stock_adesa = stock_cantidad
                
                # Log para depuración
                logger.debug(f"Stock en {stock_adm.location_name}: {stock_cantidad}")
        
        # Ordenar por stock descendente (ADESA primero si tiene stock)
        ubicaciones_adm.sort(key=lambda x: (x["nombre"].upper() != "ADESA", -x["stock"]))
        
        # Si no hay ubicaciones ADM con stock, mostrar mensaje informativo
        if len(ubicaciones_adm) == 0:
            logger.warning(f"Producto {producto_db.sku} (ItemID: {producto_db.item_id}) no tiene stock en ninguna ubicación ADM (todas en 0 o no registradas).")
        
        # Obtener ubicaciones físicas WMS (usar product_id: evita fallos por SKU inconsistente, ej: "CT-5" vs "CT5")
        stock_ubicaciones = StockUbicacion.query.filter_by(product_id=producto_db.item_id).all()
        ubicaciones_fisicas = []
        for stock_ubic in stock_ubicaciones:
            if float(stock_ubic.cantidad) > 0:
                ubicaciones_fisicas.append({
                    "ubicacion": stock_ubic.ubicacion,
                    "cantidad": float(stock_ubic.cantidad),
                    "updated_at": (stock_ubic.updated_at.isoformat() + 'Z') if stock_ubic.updated_at else None
                })
        
        stock_total_wms = sum(float(s.cantidad) for s in stock_ubicaciones)
        
        # REGLA DE ORO #3: Detectar discrepancias críticas (ADM=0 pero Físico>0)
        discrepancias = []
        
        # Verificar discrepancias pendientes para este producto
        discrepancias_db = Discrepancia.query.filter_by(
            producto_id=producto_db.id,
            estado='pendiente'
        ).all()
        
        for disc in discrepancias_db:
            discrepancias.append({
                "location_name": disc.location_name,
                "ubicacion_fisica": disc.ubicacion_fisica,
                "stock_erp": float(disc.stock_erp) if disc.stock_erp else 0.0,
                "stock_fisico_wms": float(disc.stock_fisico_wms) if disc.stock_fisico_wms else 0.0,
                "tipo": disc.tipo,
                "fecha_deteccion": disc.fecha_deteccion.isoformat() if disc.fecha_deteccion else None
            })
        
        # Si hay stock físico pero stock ERP total es 0, verificar si hay discrepancia no registrada
        if stock_total_wms > 0 and stock_total_adm == 0:
            # Verificar si ya hay discrepancia registrada
            if not any(d['stock_erp'] == 0 and d['stock_fisico_wms'] > 0 for d in discrepancias):
                # Crear discrepancia temporal para mostrar (no guardar, solo mostrar en consulta)
                ubicaciones_fisicas_str = ", ".join([u['ubicacion'] for u in ubicaciones_fisicas])
                discrepancias.append({
                    "location_name": "General",
                    "ubicacion_fisica": ubicaciones_fisicas_str,
                    "stock_erp": 0.0,
                    "stock_fisico_wms": stock_total_wms,
                    "tipo": "critica",
                    "fecha_deteccion": None
                })
        
        # Formatear respuesta con datos del producto
        producto_dict = {
            "ID": producto_db.item_id,
            "SKU": producto_db.sku,
            "ItemSKU": producto_db.sku,
            "Name": producto_db.nombre,
            "Barcode": producto_db.codigo_barras,
            "activo": producto_db.activo  # ✅ Fase 1: Incluir estado activo/inactivo
        }
        
        return jsonify({
            "success": True,
            "producto": producto_dict,
            "ubicaciones_adm": ubicaciones_adm,
            "stock_total_adm": stock_total_adm,
            "stock_adesa": stock_adesa,  # Stock en ADESA ("En mano")
            "ubicaciones_fisicas": ubicaciones_fisicas,
            "stock_total_wms": stock_total_wms,
            "discrepancias": discrepancias  # Discrepancias críticas detectadas
        })
        
    except Exception as e:
        logger.error(f"Error al buscar producto: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al buscar producto",
            "message": str(e)
        }), 500
