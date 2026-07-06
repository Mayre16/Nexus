"""
Rutas para historiales de registros (Recepciones, Despachos, Transferencias, Ajustes)
"""
from flask import Blueprint, request, jsonify, session
from routes.auth import require_auth
from database import db
from database.models import Movimiento, FacturaProcesada, TransferenciaProcesada, RecepcionProcesada, Usuario, StockUbicacion
from utils.helpers import (
    formatear_fecha_iso_utc,
    formatear_fecha_documento,
    construir_mapa_nombres_ubicaciones_adm,
    resolver_nombre_ubicacion_adm,
)
from sqlalchemy import func, and_, or_, select
from datetime import datetime, timedelta
from collections import defaultdict
import json
import logging

historiales_bp = Blueprint('historiales', __name__)
logger = logging.getLogger(__name__)


def parse_date(date_str):
    """Convierte string de fecha a datetime"""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d')
    except:
        return None


def detectar_tipo_recepcion(notas: str) -> str:
    """
    Detecta el tipo de recepción desde las notas del movimiento
    
    Args:
        notas: String con las notas del movimiento
    
    Returns:
        'VEND_REC', 'CREDIT_NOTE' o 'RECEPTION'
    """
    if not notas:
        return 'RECEPTION'
    
    notas_upper = notas.upper()
    
    # Detectar Compra con Recepción (VendorReception)
    if any(keyword in notas_upper for keyword in ['VENDOR', 'PROVEEDOR', 'COMPRA CON RECEPCIÓN', 'VEND_REC']):
        return 'VEND_REC'
    
    # Detectar Nota de Crédito
    if any(keyword in notas_upper for keyword in ['NOTA DE CRÉDITO', 'NOTA DE CREDITO', 'CREDIT NOTE', 'CREDIT_NOTE', 'CUST_CRE', 'DEVOLUCIÓN']):
        return 'CREDIT_NOTE'
    
    # Por defecto, Recepción normal
    return 'RECEPTION'


@historiales_bp.route('/api/historial/recepciones', methods=['GET'])
@require_auth
def historial_recepciones():
    """Lista el historial de recepciones con filtros. Usa RecepcionProcesada como fuente
    (como Despacho usa FacturaProcesada) para incluir docs solo buscados, aunque no tengan movimientos."""
    try:
        # Obtener parámetros de filtro
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        ubicacion_adm = request.args.get('ubicacion_adm', '').strip()
        ubicacion_fisica = request.args.get('ubicacion_fisica', '').strip()
        proveedor = request.args.get('proveedor', '').strip()
        tipo_recepcion = request.args.get('tipo_recepcion', '').strip()
        estado = request.args.get('estado', '').strip()
        usuario_id = request.args.get('usuario_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '').strip()

        # Query base desde RecepcionProcesada (como Despacho desde FacturaProcesada)
        query = RecepcionProcesada.query

        if fecha_desde:
            fecha_desde_dt = parse_date(fecha_desde)
            if fecha_desde_dt:
                query = query.filter(RecepcionProcesada.fecha >= fecha_desde_dt)

        if fecha_hasta:
            fecha_hasta_dt = parse_date(fecha_hasta)
            if fecha_hasta_dt:
                fecha_hasta_dt = fecha_hasta_dt + timedelta(days=1)
                query = query.filter(RecepcionProcesada.fecha < fecha_hasta_dt)

        if ubicacion_adm:
            query = query.filter(RecepcionProcesada.location_name.ilike(f'%{ubicacion_adm}%'))

        if proveedor:
            query = query.filter(RecepcionProcesada.cliente.ilike(f'%{proveedor}%'))

        if tipo_recepcion:
            query = query.filter(RecepcionProcesada.tipo_recepcion == tipo_recepcion)

        if estado:
            estado_filter = estado.upper().strip()
            if estado_filter == 'PROCESADA':
                query = query.filter(RecepcionProcesada.estado_recepcion == 'COMPLETO')
            else:
                query = query.filter(RecepcionProcesada.estado_recepcion == estado_filter)

        if usuario_id:
            query = query.filter(
                or_(
                    RecepcionProcesada.usuario_solicitante == usuario_id,
                    RecepcionProcesada.usuario_procesador == usuario_id
                )
            )

        if search:
            query = query.filter(
                or_(
                    RecepcionProcesada.recepcion_docid.ilike(f'%{search}%'),
                    RecepcionProcesada.cliente.ilike(f'%{search}%'),
                    RecepcionProcesada.recepcion_guid.like(f'%{search}%')
                )
            )

        # Filtro por ubicación física (buscar en movimientos RECEIPT)
        if ubicacion_fisica:
            movimientos_ubicacion = Movimiento.query.filter(
                Movimiento.tipo == 'RECEIPT',
                Movimiento.ubicacion_destino.ilike(f'%{ubicacion_fisica}%')
            ).with_entities(Movimiento.factura_guid).distinct().all()
            guids_ubicacion = [m[0] for m in movimientos_ubicacion]
            if guids_ubicacion:
                query = query.filter(RecepcionProcesada.recepcion_guid.in_(guids_ubicacion))
            else:
                query = query.filter(False)

        # Count usando Core API (evita MultipleResultsFound y "result does not return rows")
        count_stmt = select(func.count()).select_from(query.subquery())
        total = db.session.execute(count_stmt).scalar() or 0
        offset = (page - 1) * per_page
        recepciones_proc = query.order_by(
            RecepcionProcesada.created_at.desc()
        ).offset(offset).limit(per_page).all()

        resultados = []
        for recepcion in recepciones_proc:
            movimientos = Movimiento.query.filter_by(
                tipo='RECEIPT',
                factura_guid=recepcion.recepcion_guid
            ).all()

            ubicaciones_fisicas = list(set([m.ubicacion_destino for m in movimientos if m.ubicacion_destino]))
            productos = json.loads(recepcion.productos_json) if recepcion.productos_json else []
            cantidad_productos = len(productos) if productos else (len(set(m.sku for m in movimientos)) if movimientos else 0)
            cantidad_total = sum(float(p.get('Quantity', 0)) for p in productos) if productos else (sum(float(m.cantidad) for m in movimientos) if movimientos else 0.0)

            usuario_solicitante = Usuario.query.get(recepcion.usuario_solicitante) if recepcion.usuario_solicitante else None
            usuario_procesador = Usuario.query.get(recepcion.usuario_procesador) if recepcion.usuario_procesador else None
            usuario_registro = Usuario.query.get(movimientos[0].usuario_id) if movimientos and movimientos[0].usuario_id else None

            docid_recepcion = recepcion.recepcion_docid or ''
            if len(docid_recepcion) < 8 and docid_recepcion.isdigit():
                docid_recepcion = docid_recepcion.zfill(8)

            resultados.append({
                'id': recepcion.recepcion_guid,
                'numero': docid_recepcion or (recepcion.recepcion_guid[:8].upper() if recepcion.recepcion_guid else 'N/A'),
                'fecha': formatear_fecha_iso_utc(recepcion.fecha or recepcion.created_at),
                'tipo': recepcion.tipo_recepcion or 'RECEPTION',
                'proveedor': recepcion.cliente or 'N/A',
                'ubicacion_adm': recepcion.location_name or 'N/A',
                'ubicaciones_fisicas': ubicaciones_fisicas,
                'cantidad_productos': cantidad_productos,
                'cantidad_total': float(cantidad_total),
                'estado': recepcion.estado_recepcion,
                'usuario': usuario_registro.nombre if usuario_registro else (usuario_procesador.nombre if usuario_procesador else 'N/A'),
                'usuario_id': movimientos[0].usuario_id if movimientos and movimientos[0].usuario_id else None,
                'usuario_solicitante': usuario_solicitante.nombre if usuario_solicitante else None,
                'usuario_procesador': usuario_procesador.nombre if usuario_procesador else None,
                'completed_at': formatear_fecha_iso_utc(recepcion.completed_at) if recepcion.completed_at else None,
                'created_at': formatear_fecha_iso_utc(recepcion.created_at)
            })

        return jsonify({
            "success": True,
            "recepciones": resultados,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error al obtener historial de recepciones: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener historial de recepciones",
            "message": str(e)
        }), 500


@historiales_bp.route('/api/historial/despachos', methods=['GET'])
@require_auth
def historial_despachos():
    """Lista el historial de despachos con filtros"""
    try:
        # Obtener parámetros de filtro
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        ubicacion_adm = request.args.get('ubicacion_adm', '').strip()
        ubicacion_fisica = request.args.get('ubicacion_fisica', '').strip()
        tipo_documento = request.args.get('tipo_documento', '').strip()
        estado = request.args.get('estado', '').strip()
        cliente = request.args.get('cliente', '').strip()
        usuario_id = request.args.get('usuario_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '').strip()

        # Query base
        query = FacturaProcesada.query

        # Aplicar filtros
        if fecha_desde:
            fecha_desde_dt = parse_date(fecha_desde)
            if fecha_desde_dt:
                query = query.filter(FacturaProcesada.fecha >= fecha_desde_dt)

        if fecha_hasta:
            fecha_hasta_dt = parse_date(fecha_hasta)
            if fecha_hasta_dt:
                fecha_hasta_dt = fecha_hasta_dt + timedelta(days=1)
                query = query.filter(FacturaProcesada.fecha < fecha_hasta_dt)

        if ubicacion_adm:
            query = query.filter(FacturaProcesada.location_name.ilike(f'%{ubicacion_adm}%'))

        if tipo_documento:
            query = query.filter(FacturaProcesada.tipo_factura == tipo_documento)

        if estado:
            query = query.filter(FacturaProcesada.estado_despacho == estado)

        if cliente:
            query = query.filter(FacturaProcesada.cliente.ilike(f'%{cliente}%'))

        if usuario_id:
            query = query.filter(FacturaProcesada.usuario_despachador == usuario_id)

        if search:
            # Buscar en DocID, cliente y también en notas de movimientos
            from database.models import Movimiento
            movimientos_con_notas = Movimiento.query.filter(
                Movimiento.tipo == 'PICK',
                Movimiento.notas.ilike(f'%{search}%')
            ).with_entities(Movimiento.factura_guid).distinct().all()
            guids_con_notas = [m[0] for m in movimientos_con_notas]
            
            query = query.filter(
                or_(
                    FacturaProcesada.factura_docid.ilike(f'%{search}%'),
                    FacturaProcesada.cliente.ilike(f'%{search}%'),
                    FacturaProcesada.factura_guid.in_(guids_con_notas) if guids_con_notas else False
                )
            )
        
        # Filtro por ubicación física (buscar en movimientos PICK)
        if ubicacion_fisica:
            from database.models import Movimiento
            movimientos_ubicacion = Movimiento.query.filter(
                Movimiento.tipo == 'PICK',
                Movimiento.ubicacion_origen.ilike(f'%{ubicacion_fisica}%')
            ).with_entities(Movimiento.factura_guid).distinct().all()
            guids_ubicacion = [m[0] for m in movimientos_ubicacion]
            if guids_ubicacion:
                query = query.filter(FacturaProcesada.factura_guid.in_(guids_ubicacion))
            else:
                # Si no hay resultados, retornar query vacío
                query = query.filter(False)

        # Contar total
        total = query.count()

        # Paginación
        offset = (page - 1) * per_page
        despachos = query.order_by(FacturaProcesada.fecha.desc(), FacturaProcesada.created_at.desc()).offset(offset).limit(per_page).all()

        # Obtener cantidad de productos y ubicaciones físicas
        resultados = []
        for desp in despachos:
            import json
            productos = json.loads(desp.productos_json) if desp.productos_json else []
            cantidad_productos = len(productos)
            
            # Obtener ubicaciones físicas donde se despachó
            from database.models import Movimiento
            movimientos = Movimiento.query.filter_by(
                tipo='PICK',
                factura_guid=desp.factura_guid
            ).all()
            
            ubicaciones_fisicas = set()
            cantidad_total_despachada = 0.0
            for mov in movimientos:
                if mov.ubicacion_origen:
                    ubicaciones_fisicas.add(mov.ubicacion_origen)
                cantidad_total_despachada += float(mov.cantidad) if mov.cantidad else 0.0

            # Obtener usuarios
            usuario = Usuario.query.get(desp.usuario_despachador) if desp.usuario_despachador else None
            usuario_solicitante = Usuario.query.get(desp.usuario_solicitante) if desp.usuario_solicitante else None

            resultados.append({
                'id': desp.id,
                'factura_docid': desp.factura_docid,
                'factura_guid': desp.factura_guid,
                'fecha': formatear_fecha_documento(desp.fecha),
                'tipo_documento': desp.tipo_factura,
                'cliente': desp.cliente,
                'ubicacion_adm': desp.location_name or 'N/A',
                'ubicaciones_fisicas': sorted(list(ubicaciones_fisicas)),
                'cantidad_total_despachada': cantidad_total_despachada,
                'estado': desp.estado_despacho,
                'cantidad_productos': cantidad_productos,
                'total': float(desp.total) if desp.total else 0.0,
                'usuario': usuario.nombre if usuario else 'N/A',
                'usuario_id': desp.usuario_despachador,
                'usuario_solicitante': usuario_solicitante.nombre if usuario_solicitante else None,
                'usuario_solicitante_id': desp.usuario_solicitante,
                'created_at': formatear_fecha_iso_utc(desp.created_at)
            })

        return jsonify({
            "success": True,
            "despachos": resultados,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error al obtener historial de despachos: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener historial de despachos",
            "message": str(e)
        }), 500


@historiales_bp.route('/api/historial/transferencias', methods=['GET'])
@require_auth
def historial_transferencias():
    """Lista el historial de transferencias con filtros"""
    try:
        # Obtener parámetros de filtro
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        ubicacion_origen = request.args.get('ubicacion_origen', '').strip()
        ubicacion_destino = request.args.get('ubicacion_destino', '').strip()
        estado = request.args.get('estado', '').strip()
        usuario_id = request.args.get('usuario_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '').strip()

        # Query base
        query = TransferenciaProcesada.query

        # Aplicar filtros
        if fecha_desde:
            fecha_desde_dt = parse_date(fecha_desde)
            if fecha_desde_dt:
                query = query.filter(TransferenciaProcesada.fecha_transferencia >= fecha_desde_dt)

        if fecha_hasta:
            fecha_hasta_dt = parse_date(fecha_hasta)
            if fecha_hasta_dt:
                fecha_hasta_dt = fecha_hasta_dt + timedelta(days=1)
                query = query.filter(TransferenciaProcesada.fecha_transferencia < fecha_hasta_dt)

        if ubicacion_origen:
            query = query.filter(TransferenciaProcesada.location_name_origen.ilike(f'%{ubicacion_origen}%'))

        if ubicacion_destino:
            query = query.filter(TransferenciaProcesada.location_name_destino.ilike(f'%{ubicacion_destino}%'))

        if estado:
            query = query.filter(TransferenciaProcesada.estado_procesamiento == estado)

        if usuario_id:
            query = query.filter(TransferenciaProcesada.usuario_procesador == usuario_id)

        if search:
            query = query.filter(
                or_(
                    TransferenciaProcesada.transferencia_docid.ilike(f'%{search}%'),
                    TransferenciaProcesada.location_name_origen.ilike(f'%{search}%'),
                    TransferenciaProcesada.location_name_destino.ilike(f'%{search}%')
                )
            )

        # Contar total
        total = query.count()

        # Paginación
        offset = (page - 1) * per_page
        transferencias = query.order_by(TransferenciaProcesada.fecha_transferencia.desc(), TransferenciaProcesada.created_at.desc()).offset(offset).limit(per_page).all()

        ids_para_nombres = []
        for trans in transferencias:
            ids_para_nombres.append(trans.location_id_origen)
            ids_para_nombres.append(trans.location_id_destino)
        mapa_nombres_adm = construir_mapa_nombres_ubicaciones_adm(ids_para_nombres)

        # Obtener cantidad de productos
        resultados = []
        for trans in transferencias:
            import json
            productos = json.loads(trans.productos_json) if trans.productos_json else []
            cantidad_productos = len(productos)

            # Obtener usuarios
            usuario = Usuario.query.get(trans.usuario_procesador) if trans.usuario_procesador else None
            usuario_solicitante = Usuario.query.get(trans.usuario_solicitante) if trans.usuario_solicitante else None

            resultados.append({
                'id': trans.id,
                'transferencia_docid': trans.transferencia_docid,
                'transferencia_guid': trans.transferencia_guid,
                'fecha': formatear_fecha_documento(trans.fecha_transferencia),
                'ubicacion_origen': resolver_nombre_ubicacion_adm(
                    trans.location_id_origen, trans.location_name_origen, mapa_nombres_adm
                ),
                'ubicacion_destino': resolver_nombre_ubicacion_adm(
                    trans.location_id_destino, trans.location_name_destino, mapa_nombres_adm
                ),
                'ubicacion_fisica_origen': trans.ubicacion_fisica_origen,
                'ubicacion_fisica_destino': trans.ubicacion_fisica_destino,
                'cantidad_productos': cantidad_productos,
                'estado': trans.estado_procesamiento,
                'usuario': usuario.nombre if usuario else 'N/A',
                'usuario_id': trans.usuario_procesador,
                'usuario_solicitante': usuario_solicitante.nombre if usuario_solicitante else None,
                'usuario_solicitante_id': trans.usuario_solicitante,
                'created_at': formatear_fecha_iso_utc(trans.created_at)
            })

        return jsonify({
            "success": True,
            "transferencias": resultados,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error al obtener historial de transferencias: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener historial de transferencias",
            "message": str(e)
        }), 500


@historiales_bp.route('/api/historial/ajustes', methods=['GET'])
@require_auth
def historial_ajustes():
    """Lista el historial de ajustes con filtros"""
    try:
        # Obtener parámetros de filtro
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        ubicacion_fisica = request.args.get('ubicacion_fisica', '').strip()
        sku = request.args.get('sku', '').strip().upper()
        tipo_ajuste = request.args.get('tipo_ajuste', '').strip()
        usuario_id = request.args.get('usuario_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '').strip()

        # Query base: agrupar movimientos ADJUSTMENT por timestamp y ubicación
        # ✅ CORRECCIÓN: Usar COALESCE para agrupar por ubicacion_destino O ubicacion_origen (para ajustes a 0)
        query = db.session.query(
            Movimiento.timestamp,
            func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen).label('ubicacion'),
            func.min(Movimiento.usuario_id).label('usuario_id'),
            func.count(Movimiento.id).label('cantidad_productos'),
            func.min(Movimiento.notas).label('notas')
        ).filter(
            Movimiento.tipo == 'ADJUSTMENT'
        ).group_by(
            Movimiento.timestamp,
            func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen)
        )

        # Aplicar filtros
        if fecha_desde:
            fecha_desde_dt = parse_date(fecha_desde)
            if fecha_desde_dt:
                query = query.having(Movimiento.timestamp >= fecha_desde_dt)

        if fecha_hasta:
            fecha_hasta_dt = parse_date(fecha_hasta)
            if fecha_hasta_dt:
                fecha_hasta_dt = fecha_hasta_dt + timedelta(days=1)
                query = query.having(Movimiento.timestamp < fecha_hasta_dt)

        if ubicacion_fisica:
            # ✅ CORRECCIÓN: Filtrar por ubicacion (que es COALESCE de ubicacion_destino y ubicacion_origen)
            query = query.having(func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen).like(f'%{ubicacion_fisica}%'))

        if usuario_id:
            query = query.having(func.min(Movimiento.usuario_id) == usuario_id)

        if search:
            # Filtrar por notas o ubicación usando subquery
            # ✅ CORRECCIÓN: Usar COALESCE para buscar en ubicacion_destino o ubicacion_origen
            subquery = db.session.query(
                Movimiento.timestamp,
                func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen).label('ubicacion')
            ).filter(
                Movimiento.tipo == 'ADJUSTMENT',
                or_(
                    Movimiento.notas.like(f'%{search}%'),
                    func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen).like(f'%{search}%')
                )
            ).distinct()
            ajustes_filtrados = [(row[0], row[1]) for row in subquery.all()]
            if ajustes_filtrados:
                # Crear condiciones para filtrar
                condiciones = []
                for timestamp, ubicacion in ajustes_filtrados:
                    condiciones.append(
                        and_(
                            Movimiento.timestamp == timestamp,
                            func.coalesce(Movimiento.ubicacion_destino, Movimiento.ubicacion_origen) == ubicacion
                        )
                    )
                query = query.filter(or_(*condiciones))
            else:
                # Si no hay resultados, devolver query vacío
                query = query.filter(Movimiento.timestamp == datetime(1900, 1, 1))

        # Obtener todos los ajustes (sin paginación aún, para aplicar filtro por tipo)
        ajustes_todos = query.order_by(Movimiento.timestamp.desc()).all()

        # ✅ OPTIMIZACIÓN: Cargar todos los movimientos de una vez en lugar de hacer queries individuales
        # Esto evita el problema de timeout cuando hay muchos ajustes
        from database.models import UbicacionFisica
        from sqlalchemy import or_
        
        if not ajustes_todos:
            return jsonify({
                "success": True,
                "ajustes": [],
                "total": 0,
                "page": page,
                "pages": 0
            })
        
        # Obtener todos los timestamps y ubicaciones únicos
        timestamps_ubicaciones = set()
        for aj in ajustes_todos:
            ubicacion_ref = aj.ubicacion if aj.ubicacion else None
            if aj.timestamp and ubicacion_ref:
                timestamps_ubicaciones.add((aj.timestamp, ubicacion_ref))
        
        # Cargar todos los movimientos de estos ajustes en una sola query
        condiciones_movimientos = []
        for timestamp, ubicacion_ref in timestamps_ubicaciones:
            condiciones_movimientos.append(
                and_(
                    Movimiento.tipo == 'ADJUSTMENT',
                    Movimiento.timestamp == timestamp,
                    or_(
                        Movimiento.ubicacion_destino == ubicacion_ref,
                        Movimiento.ubicacion_origen == ubicacion_ref
                    )
                )
            )
        
        # Cargar todos los movimientos de una vez
        # ✅ OPTIMIZACIÓN: Usar timeout y manejo de errores para evitar problemas de conexión
        movimientos_por_ajuste = defaultdict(list)
        
        try:
            if condiciones_movimientos:
                # Limitar a 1000 condiciones por query para evitar queries muy largas
                if len(condiciones_movimientos) > 1000:
                    # Dividir en chunks si hay muchos ajustes
                    movimientos_todos = []
                    for i in range(0, len(condiciones_movimientos), 1000):
                        chunk = condiciones_movimientos[i:i+1000]
                        movimientos_chunk = Movimiento.query.filter(
                            or_(*chunk)
                        ).all()
                        movimientos_todos.extend(movimientos_chunk)
                else:
                    movimientos_todos = Movimiento.query.filter(
                        or_(*condiciones_movimientos)
                    ).all()
                
                # Crear diccionario para acceso rápido: (timestamp, ubicacion) -> [movimientos]
                for mov in movimientos_todos:
                    ubicacion_ref = mov.ubicacion_destino or mov.ubicacion_origen
                    if mov.timestamp and ubicacion_ref:
                        movimientos_por_ajuste[(mov.timestamp, ubicacion_ref)].append(mov)
            else:
                movimientos_todos = []
        except Exception as e:
            logger.error(f"Error al cargar movimientos del historial de ajustes: {e}")
            # Si falla, usar diccionario vacío y cargar movimientos individualmente cuando se necesiten
            movimientos_por_ajuste = defaultdict(list)
        
        # Obtener detalles y aplicar filtro por tipo_ajuste
        resultados = []
        
        for aj in ajustes_todos:
            # ✅ CORRECCIÓN: Ahora aj.ubicacion es el COALESCE(ubicacion_destino, ubicacion_origen)
            ubicacion_ref = aj.ubicacion if aj.ubicacion else None
            
            # ✅ OPTIMIZACIÓN: Obtener movimientos del diccionario en memoria (O(1))
            # Si no están precargados, cargar individualmente (fallback)
            movimientos = movimientos_por_ajuste.get((aj.timestamp, ubicacion_ref), [])
            if not movimientos and aj.timestamp and ubicacion_ref:
                # Fallback: cargar movimientos individualmente si no están en el diccionario
                try:
                    movimientos = Movimiento.query.filter(
                        Movimiento.tipo == 'ADJUSTMENT',
                        Movimiento.timestamp == aj.timestamp,
                        or_(
                            Movimiento.ubicacion_destino == ubicacion_ref,
                            Movimiento.ubicacion_origen == ubicacion_ref
                        )
                    ).limit(10000).all()  # Limitar a 10000 para evitar problemas
                except Exception as e:
                    logger.error(f"Error al cargar movimientos individuales para ajuste {aj.timestamp} {ubicacion_ref}: {e}")
                    movimientos = []

            # Obtener usuario
            usuario = Usuario.query.get(aj.usuario_id) if aj.usuario_id else None
            
            # Determinar si es ubicación física o ADM
            ubicacion = ubicacion_ref or ''
            es_ubicacion_fisica = False
            if ubicacion:
                # Verificar si existe en UbicacionFisica
                ubicacion_fisica = UbicacionFisica.query.filter_by(
                    codigo=ubicacion.upper(),
                    activa=True
                ).first()
                es_ubicacion_fisica = ubicacion_fisica is not None
                # Si no está en UbicacionFisica pero tiene formato de ubicación física (ej: 2P1D01N1)
                if not es_ubicacion_fisica and len(ubicacion) >= 6 and any(c.isdigit() for c in ubicacion):
                    # Podría ser una ubicación física no registrada, pero la tratamos como física
                    es_ubicacion_fisica = True
            
            # Obtener SKUs únicos y cantidades
            skus_unicos = set()
            cantidad_total_ajustada = 0.0
            for mov in movimientos:
                if mov.sku:
                    skus_unicos.add(mov.sku)
                cantidad_total_ajustada += float(mov.cantidad) if mov.cantidad else 0.0
            
            # Determinar tipo de ajuste
            tipo_ajuste_calculado = 'Físico' if es_ubicacion_fisica else 'ADM'
            
            # ✅ FILTRAR por tipo_ajuste si se especificó
            if tipo_ajuste and tipo_ajuste != tipo_ajuste_calculado:
                continue  # Saltar este ajuste si no coincide con el filtro
            
            # Formatear SKUs para mostrar
            skus_lista = sorted(list(skus_unicos))
            if len(skus_lista) <= 3:
                skus_display = ', '.join(skus_lista)
            else:
                skus_display = f"{', '.join(skus_lista[:3])}... (+{len(skus_lista) - 3} más)"
            
            # Icono según tipo
            icono_ubicacion = '📍' if es_ubicacion_fisica else '🏢'
            
            resultados.append({
                'id': f"{formatear_fecha_iso_utc(aj.timestamp)}_{ubicacion_ref or 'None'}",  # ID compuesto (usa ubicacion_ref)
                'fecha': formatear_fecha_iso_utc(aj.timestamp),
                'ubicacion': aj.ubicacion,  # ✅ CORRECCIÓN: Usar aj.ubicacion (COALESCE)
                'ubicacion_display': f"{icono_ubicacion} {aj.ubicacion}",
                'es_ubicacion_fisica': es_ubicacion_fisica,
                'tipo_ajuste': tipo_ajuste_calculado,
                'skus': skus_lista,
                'skus_display': skus_display,
                'cantidad_productos': aj.cantidad_productos,
                'cantidad_total_ajustada': cantidad_total_ajustada,
                'usuario': usuario.nombre if usuario else 'N/A',
                'usuario_id': aj.usuario_id,
                'notas': aj.notas,
                'created_at': formatear_fecha_iso_utc(aj.timestamp)
            })
        
        # Contar total después de aplicar filtro por tipo_ajuste
        total = len(resultados)
        
        # Aplicar paginación manualmente
        offset = (page - 1) * per_page
        resultados_paginados = resultados[offset:offset + per_page]

        return jsonify({
            "success": True,
            "ajustes": resultados_paginados,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error al obtener historial de ajustes: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Error al obtener historial de ajustes",
            "message": str(e)
        }), 500


@historiales_bp.route('/api/historial/usuarios', methods=['GET'])
@require_auth
def listar_usuarios():
    """Lista usuarios para filtros"""
    try:
        usuarios = Usuario.query.filter_by(activo=True).order_by(Usuario.nombre).all()
        return jsonify({
            "success": True,
            "usuarios": [{"id": u.id, "nombre": u.nombre} for u in usuarios]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Error al obtener usuarios",
            "message": str(e)
        }), 500

