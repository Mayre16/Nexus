"""
Funciones auxiliares para el sistema WMS
"""
from datetime import datetime, timezone as _tz_utc_module
from typing import Dict, List, Optional
import re
from database.models import StockUbicacion
import logging

try:
    from dateutil import parser as date_parser
    HAS_DATEUTIL = True
except ImportError:
    HAS_DATEUTIL = False

_helpers_logger = logging.getLogger(__name__)


def calcular_stock_total_wms(product_id: str = None, sku: str = None) -> float:
    """
    Calcula el stock total en el WMS (suma de todas las ubicaciones)
    
    Args:
        product_id: ItemID del producto (opcional)
        sku: SKU del producto (opcional)
    
    Returns:
        Stock total (suma de todas las ubicaciones)
    """
    from database import db
    
    query = StockUbicacion.query
    
    if product_id:
        query = query.filter_by(product_id=product_id)
    elif sku:
        query = query.filter_by(sku=sku)
    else:
        return 0.0
    
    stocks = query.all()
    total = sum(float(stock.cantidad) if stock.cantidad else 0.0 for stock in stocks)
    return total


def formatear_fecha(fecha: datetime, formato: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    Formatea una fecha para mostrar
    
    Args:
        fecha: Objeto datetime
        formato: Formato de fecha (por defecto: "%Y-%m-%d %H:%M:%S")
    
    Returns:
        Fecha formateada como string
    """
    if not fecha:
        return ""
    
    try:
        return fecha.strftime(formato)
    except:
        return ""


def formatear_fecha_iso_utc(fecha: datetime) -> str:
    """
    Formatea una fecha a ISO string con 'Z' para indicar UTC
    Usar para timestamps reales (created_at, timestamp, etc.)
    
    Args:
        fecha: Objeto datetime
    
    Returns:
        Fecha formateada como ISO string con 'Z' (UTC)
    """
    if not fecha:
        return None
    
    try:
        if fecha.tzinfo is None:
            fecha_utc = fecha
        else:
            fecha_utc = fecha.astimezone(_tz_utc_module.utc).replace(tzinfo=None)
        
        return fecha_utc.isoformat() + 'Z'
    except Exception as e:
        return None


def parsear_ajuste_id(ajuste_id_raw: str):
    """Parsea un ID compuesto de ajuste (timestamp_ubicacion).
    Devuelve (timestamp_naive, ubicacion). El timestamp siempre es NAIVE (sin timezone)
    para ser compatible con los valores almacenados en la DB (datetime.utcnow)."""
    import urllib.parse
    # Unquote recursivo: Passenger/Apache + encodeURIComponent pueden producir
    # doble o triple encoding (%253A = %25 + 3A → %3A → :)
    ajuste_id_decoded = ajuste_id_raw
    for _ in range(5):
        decoded = urllib.parse.unquote(ajuste_id_decoded)
        if decoded == ajuste_id_decoded:
            break
        ajuste_id_decoded = decoded

    if '_' not in ajuste_id_decoded:
        return None, None

    partes = ajuste_id_decoded.rsplit('_', 1)
    if len(partes) != 2:
        return None, None

    timestamp_str = partes[0]
    ubicacion = partes[1]
    timestamp = None

    ts_sin_z = timestamp_str.rstrip('Z')

    try:
        timestamp = datetime.fromisoformat(ts_sin_z)
    except (ValueError, TypeError):
        pass

    if timestamp is None:
        formatos = [
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S'
        ]
        for fmt in formatos:
            try:
                timestamp = datetime.strptime(ts_sin_z, fmt)
                break
            except (ValueError, TypeError):
                continue

    if timestamp is not None and timestamp.tzinfo is not None:
        timestamp = timestamp.astimezone(_tz_utc_module.utc).replace(tzinfo=None)

    return timestamp, ubicacion


def formatear_fecha_documento(fecha) -> str:
    """
    Formatea la fecha de un documento (DocDate) como YYYY-MM-DD.
    DocDate en ADM es solo fecha de negocio (sin hora), por lo que se retorna
    la fecha en formato date-only para que coincida con ADM y República Dominicana,
    sin variar por zona horaria.
    
    Args:
        fecha: datetime o string de fecha
    
    Returns:
        Fecha como 'YYYY-MM-DD' o None
    """
    if not fecha:
        return None
    try:
        if isinstance(fecha, datetime):
            return fecha.strftime('%Y-%m-%d')
        # Si es string, extraer la parte de fecha
        if isinstance(fecha, str):
            parte_fecha = fecha.split('T')[0].split(' ')[0]
            if len(parte_fecha) >= 10 and parte_fecha[4] == '-' and parte_fecha[7] == '-':
                return parte_fecha[:10]
            dt = parse_fecha_adm(fecha)
            return dt.strftime('%Y-%m-%d') if dt else None
        return None
    except Exception:
        return None


def parse_fecha_adm(fecha_str) -> Optional[datetime]:
    """
    Convierte una fecha de ADM Cloud (string) a objeto datetime de Python.
    Versión canónica centralizada - usar esta en lugar de copias locales.
    
    Args:
        fecha_str: Fecha como string (ej: "2026-01-16T00:00:00" o "2026-01-16")
    
    Returns:
        datetime object o None si no se puede parsear
    """
    if not fecha_str:
        return None
    
    if isinstance(fecha_str, datetime):
        return fecha_str
    
    fecha_str_clean = str(fecha_str).strip()
    
    formatos = [
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%S.%f',
        '%Y-%m-%d',
        '%Y-%m-%d %H:%M:%S',
    ]
    
    if HAS_DATEUTIL:
        try:
            return date_parser.parse(fecha_str_clean)
        except Exception:
            pass
    
    try:
        return datetime.fromisoformat(fecha_str_clean.replace('Z', '+00:00'))
    except Exception:
        pass
    
    for formato in formatos:
        try:
            return datetime.strptime(fecha_str_clean, formato)
        except Exception:
            continue
    
    try:
        fecha_simple = fecha_str_clean.split('T')[0].split(' ')[0]
        return datetime.strptime(fecha_simple, '%Y-%m-%d')
    except Exception:
        _helpers_logger.warning(f"No se pudo parsear la fecha: {fecha_str}")
        return None


def obtener_productos_factura(factura_data: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de una factura desde ADM Cloud
    
    Args:
        factura_data: Diccionario con datos de la factura desde ADM Cloud
    
    Returns:
        Lista de productos normalizados
    """
    productos = []
    
    # Intentar obtener Items de diferentes formas
    items = factura_data.get("Items", [])
    if not items:
        items = factura_data.get("items", [])
    if not items:
        items = factura_data.get("Products", [])
    if not items:
        items = factura_data.get("products", [])
    
    if not items:
        return productos
    
    for item in items:
        item_type = item.get("ItemType", "I")
        producto = {
            "RowOrder": item.get("RowOrder"),
            "ItemID": item.get("ItemID"),
            "ItemSKU": item.get("ItemSKU", ""),
            "SKU": item.get("SKU", item.get("ItemSKU", "")),
            "Name": item.get("Name", ""),
            "Quantity": float(item.get("Quantity", 0)) if item.get("Quantity") else 0.0,
            "Cost": float(item.get("Cost", 0)) if item.get("Cost") else 0.0,
            "ExtendedCost": float(item.get("ExtendedCost", 0)) if item.get("ExtendedCost") else 0.0,
            "UOMName": item.get("UOMName", ""),
            "ItemType": item_type,
            "requiere_ubicacion": item_type == "I",
        }
        productos.append(producto)
    return agregar_productos_por_sku(productos)


def obtener_productos_location_transfer(transfer: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de una transferencia entre ubicaciones desde ADM Cloud
    
    Args:
        transfer: Diccionario con datos de la transferencia desde ADM Cloud
    
    Returns:
        Lista de productos normalizados
    """
    items = transfer.get("Items", [])
    if not items:
        return []
    productos = []
    for item in items:
        item_type = item.get("ItemType", "I")
        producto = {
            "RowOrder": item.get("RowOrder"),
            "ItemID": item.get("ItemID"),
            "ItemSKU": item.get("ItemSKU", ""),
            "SKU": item.get("SKU", item.get("ItemSKU", "")),
            "Name": item.get("Name", ""),
            "Quantity": float(item.get("Quantity", 0)) if item.get("Quantity") else 0.0,
            "Cost": float(item.get("Cost", 0)) if item.get("Cost") else 0.0,
            "ExtendedCost": float(item.get("ExtendedCost", 0)) if item.get("ExtendedCost") else 0.0,
            "UOMName": item.get("UOMName", ""),
            "ItemType": item_type,
            "requiere_ubicacion": item_type == "I",
        }
        productos.append(producto)
    return agregar_productos_por_sku(productos)


def es_ubicacion_adesa(location_id: str, location_name: str) -> bool:
    """
    Determina si una ubicación es ADESA usando whitelist de LocationID y fallback a LocationName
    
    PRIORIDAD 1: LocationID whitelist (más confiable)
    PRIORIDAD 2: LocationName contiene "ADESA" (fallback)
    
    Args:
        location_id: GUID de la ubicación ADM
        location_name: Nombre de la ubicación ADM
    
    Returns:
        True si es ADESA, False si no
    """
    from config import get_config
    config = get_config()
    
    # PRIORIDAD 1: Verificar whitelist de LocationID (más confiable)
    if location_id:
        adesa_location_ids = getattr(config, 'ADESA_LOCATION_IDS', [])
        if location_id in adesa_location_ids:
            return True
    
    # PRIORIDAD 2: Verificar LocationName (fallback)
    if location_name:
        location_name_upper = location_name.upper()
        keywords = getattr(config, 'ADESA_LOCATION_NAME_KEYWORDS', ['ADESA'])
        for keyword in keywords:
            if keyword.upper() in location_name_upper:
                return True
    
    return False


def es_nombre_ubicacion_placeholder(stored: Optional[str], location_id: Optional[str]) -> bool:
    """
    True si el valor guardado es el fallback corto de GUID (p. ej. df40f1ef...),
    no un nombre legible de ubicación.
    """
    if not stored or not location_id:
        return False
    s = stored.strip()
    lid = location_id.strip()
    if len(lid) >= 8 and s.lower() == (lid[:8].lower() + "..."):
        return True
    return bool(re.match(r"^[0-9a-fA-F]{8}\.\.\.$", s))


def construir_mapa_nombres_ubicaciones_adm(location_ids: List[str]) -> Dict[str, str]:
    """
    Resuelve nombres legibles para muchos location_id en pocas consultas.
    Prioridad: SyncLocationStatus, luego cualquier fila stock_productos_adm por location_id.
    """
    from database import db
    from database.models import SyncLocationStatus, StockProductoADM
    from sqlalchemy import func

    ids = list({i for i in location_ids if i})
    if not ids:
        return {}
    m: Dict[str, str] = {}
    for r in SyncLocationStatus.query.filter(SyncLocationStatus.location_id.in_(ids)).all():
        if r.location_name:
            m[r.location_id] = r.location_name
    missing = [i for i in ids if i not in m]
    if not missing:
        return m
    rows = (
        db.session.query(
            StockProductoADM.location_id,
            func.max(StockProductoADM.location_name).label("ln"),
        )
        .filter(StockProductoADM.location_id.in_(missing))
        .group_by(StockProductoADM.location_id)
        .all()
    )
    for lid, ln in rows:
        if lid and ln:
            m[lid] = ln
    return m


def resolver_nombre_ubicacion_adm(
    location_id: Optional[str],
    nombre_almacenado: Optional[str] = None,
    mapa_precargado: Optional[Dict[str, str]] = None,
) -> str:
    """
    Nombre legible para una ubicación ADM: cache de sync, stock por ubicación,
    o el nombre guardado si no es un placeholder de GUID.
    """
    from database.models import SyncLocationStatus, StockProductoADM

    if mapa_precargado and location_id and location_id in mapa_precargado:
        return mapa_precargado[location_id]

    if not location_id:
        return nombre_almacenado or "N/A"

    u = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if u and u.location_name:
        return u.location_name

    spa = StockProductoADM.query.filter_by(location_id=location_id).first()
    if spa and spa.location_name:
        return spa.location_name

    if nombre_almacenado and not es_nombre_ubicacion_placeholder(nombre_almacenado, location_id):
        return nombre_almacenado

    return nombre_almacenado if nombre_almacenado else (location_id[:8] + "...")


def calcular_cantidad_despachada(factura_guid: str, sku: str) -> float:
    """
    Calcula la cantidad total despachada de un SKU en una factura
    
    Args:
        factura_guid: GUID de la factura
        sku: SKU del producto
    
    Returns:
        Cantidad total despachada (suma de movimientos tipo PICK)
    """
    from database.models import Movimiento
    
    movimientos = Movimiento.query.filter_by(
        tipo='PICK',
        factura_guid=factura_guid,
        sku=sku.upper()
    ).all()
    
    total = sum(float(mov.cantidad) if mov.cantidad else 0.0 for mov in movimientos)
    return total


def calcular_cantidad_pendiente(factura_guid: str, sku: str, cantidad_solicitada: float) -> float:
    """
    Calcula la cantidad pendiente por despachar de un SKU en una factura
    
    Args:
        factura_guid: GUID de la factura
        sku: SKU del producto
        cantidad_solicitada: Cantidad total solicitada en la factura
    
    Returns:
        Cantidad pendiente (cantidad_solicitada - cantidad_despachada)
    """
    cantidad_despachada = calcular_cantidad_despachada(factura_guid, sku)
    pendiente = float(cantidad_solicitada) - cantidad_despachada
    return max(0.0, pendiente)  # No permitir valores negativos


def calcular_cantidad_asignada_recepcion(recepcion_guid: str, sku: str) -> float:
    """
    Calcula la cantidad total asignada (recibida) de un SKU en una recepción
    
    Args:
        recepcion_guid: GUID de la recepción
        sku: SKU del producto
    
    Returns:
        Cantidad total asignada (suma de movimientos tipo RECEIPT)
    """
    from database.models import Movimiento
    
    movimientos = Movimiento.query.filter_by(
        tipo='RECEIPT',
        factura_guid=recepcion_guid,
        sku=sku.upper()
    ).all()
    
    total = sum(float(mov.cantidad) if mov.cantidad else 0.0 for mov in movimientos)
    return total


def calcular_cantidad_restante_recepcion(recepcion_guid: str, sku: str, cantidad_recibida: float) -> float:
    """
    Calcula la cantidad restante por asignar de un SKU en una recepción
    
    Args:
        recepcion_guid: GUID de la recepción
        sku: SKU del producto
        cantidad_recibida: Cantidad total recibida en la recepción
    
    Returns:
        Cantidad restante (cantidad_recibida - cantidad_asignada)
    """
    cantidad_asignada = calcular_cantidad_asignada_recepcion(recepcion_guid, sku)
    restante = float(cantidad_recibida) - cantidad_asignada
    return max(0.0, restante)


def calcular_cantidad_asignada_transfer(transferencia_guid: str, sku: str) -> float:
    """
    Calcula la cantidad total transferida de un SKU en una transferencia (desde movimientos TRANSFER)
    """
    from database.models import Movimiento
    movimientos = Movimiento.query.filter_by(
        tipo='TRANSFER',
        factura_guid=transferencia_guid,
        sku=sku.upper()
    ).all()
    return sum(float(mov.cantidad) if mov.cantidad else 0.0 for mov in movimientos)


def calcular_cantidad_restante_transfer(transferencia_guid: str, sku: str, cantidad_total: float) -> float:
    """Cantidad restante por transferir de un SKU"""
    asignada = calcular_cantidad_asignada_transfer(transferencia_guid, sku)
    return max(0.0, float(cantidad_total) - asignada)


def agregar_productos_por_sku(productos: List[dict]) -> List[dict]:
    """
    Agrega productos con mismo SKU sumando Quantity.
    Evita duplicados que generan IDs repetidos en la UI y tarjetas vacías.
    Usada por recepciones, despachos, transferencias, notas de crédito.
    """
    agregados: dict = {}
    for p in productos:
        sku = (p.get("SKU") or p.get("ItemSKU") or "").strip().upper()
        if not sku:
            continue
        qty = float(p.get("Quantity", 0) or 0)
        if sku in agregados:
            agregados[sku]["Quantity"] += qty
        else:
            agregados[sku] = dict(p)
            agregados[sku]["Quantity"] = qty
            agregados[sku]["SKU"] = sku
    return list(agregados.values())


def obtener_productos_recepcion(recepcion_data: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de una recepción desde ADM Cloud.
    Agrega por SKU (evita duplicados que generan tarjetas vacías en la UI).
    """
    items = recepcion_data.get("Items", []) or recepcion_data.get("items", []) or recepcion_data.get("Products", []) or recepcion_data.get("products", [])
    if not items:
        return []
    productos = []
    for item in items:
        item_type = item.get("ItemType", "I")
        productos.append({
            "RowOrder": item.get("RowOrder"),
            "ItemID": item.get("ItemID"),
            "ItemSKU": item.get("ItemSKU", ""),
            "SKU": item.get("SKU", item.get("ItemSKU", "")),
            "Name": item.get("Name", ""),
            "Quantity": float(item.get("Quantity", 0)) if item.get("Quantity") else 0.0,
            "Cost": float(item.get("Cost", 0)) if item.get("Cost") else 0.0,
            "ExtendedCost": float(item.get("ExtendedCost", 0)) if item.get("ExtendedCost") else 0.0,
            "UOMName": item.get("UOMName", ""),
            "ItemType": item_type,
            "requiere_ubicacion": item_type == "I",
        })
    return agregar_productos_por_sku(productos)


def obtener_productos_vendor_recepcion(recepcion_data: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de una vendor recepción desde ADM Cloud
    
    Args:
        recepcion_data: Diccionario con datos de la vendor recepción desde ADM Cloud
    
    Returns:
        Lista de productos normalizados
    """
    # Similar a obtener_productos_recepcion
    return obtener_productos_recepcion(recepcion_data)


def obtener_productos_credit_note(credit_note_data: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de una nota de crédito desde ADM Cloud
    
    Args:
        credit_note_data: Diccionario con datos de la nota de crédito desde ADM Cloud
    
    Returns:
        Lista de productos normalizados
    """
    # La estructura de Items en notas de crédito es igual que en recepciones
    return obtener_productos_recepcion(credit_note_data)


def obtener_productos_dispatch(dispatch_data: dict) -> List[dict]:
    """
    Extrae y normaliza los productos de un dispatch desde ADM Cloud
    
    Args:
        dispatch_data: Diccionario con datos del dispatch desde ADM Cloud
    
    Returns:
        Lista de productos normalizados
    """
    # Similar a obtener_productos_factura
    return obtener_productos_factura(dispatch_data)


def obtener_stock_vigente(producto_id: int, location_id: str):
    """
    ÚNICA función para obtener stock vigente (LIVE) en operaciones.
    SIEMPRE retorna stock del current_run_id (LIVE).
    
    Esta función garantiza que todas las operaciones (transferencias, ajustes, búsquedas)
    usen el stock correcto del run vigente, evitando mezclar runs.
    
    Args:
        producto_id: ID del producto en ProductoADM
        location_id: GUID de la ubicación ADM
    
    Returns:
        StockProductoADM del run vigente (LIVE) o None si no existe
    """
    from database.models import StockProductoADM, SyncLocationStatus
    
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    if not estado_sync or not estado_sync.current_run_id:
        # Fallback: registros sin sync_run_id (migración gradual)
        # Esto permite compatibilidad con datos existentes antes de implementar staging
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=None
        ).first()
    
    # SIEMPRE LIVE (current_run_id)
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=estado_sync.current_run_id
    ).first()


def obtener_mapa_stock_vigente(producto_ids: list, location_id: str) -> dict:
    """
    Stock vigente (LIVE) para muchos productos en una ubicación.
    Usa como máximo 2 consultas (SyncLocationStatus + StockProductoADM IN ...).
    Cada producto_id sin fila en cache cuenta como stock 0.0.
    Retorna dict[int, tuple[float, datetime | None]].
    """
    from database.models import StockProductoADM, SyncLocationStatus

    out: dict = {}
    if not producto_ids:
        return out
    uniq = list(dict.fromkeys(int(x) for x in producto_ids))

    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()

    if not estado_sync or not estado_sync.current_run_id:
        q = StockProductoADM.query.filter(
            StockProductoADM.location_id == location_id,
            StockProductoADM.sync_run_id.is_(None),
            StockProductoADM.producto_id.in_(uniq),
        )
    else:
        q = StockProductoADM.query.filter(
            StockProductoADM.location_id == location_id,
            StockProductoADM.sync_run_id == estado_sync.current_run_id,
            StockProductoADM.producto_id.in_(uniq),
        )
    for sp in q.all():
        st = float(sp.stock) if sp.stock is not None else 0.0
        ts = sp.updated_at if getattr(sp, 'updated_at', None) else None
        out[sp.producto_id] = (st, ts)
    for pid in uniq:
        if pid not in out:
            out[pid] = (0.0, None)
    return out


def actualizar_cache_adm(producto_id: int, location_id: str, delta: float = None,
                         valor_absoluto: float = None, location_name: str = None):
    """
    Actualiza StockProductoADM en la fila vigente (LIVE).

    Modos:
      - delta != None  → stock += delta  (recepciones, despachos, transferencias)
      - valor_absoluto != None → stock = valor_absoluto  (ajustes ADM)

    Si no existe fila vigente y hay que crear, asigna sync_run_id = current_run_id
    para que la fila sea visible de inmediato en la lectura vigente.
    No toca SyncRun ni current_run_id.

    Returns:
        (stock_anterior, stock_nuevo, fila_creada)
        o (None, None, False) si no se pudo operar
    """
    from database import db
    from database.models import StockProductoADM, SyncLocationStatus
    import logging
    logger = logging.getLogger(__name__)

    fila = obtener_stock_vigente(producto_id, location_id)
    stock_anterior = float(fila.stock) if fila and fila.stock else 0.0
    fila_creada = False

    if delta is not None:
        if fila:
            stock_nuevo = max(0.0, stock_anterior + delta)
            fila.stock = stock_nuevo
            fila.updated_at = datetime.utcnow()
        else:
            if delta <= 0:
                logger.info(f"[CACHE ADM] Sin fila vigente producto_id={producto_id}, "
                            f"location_id={location_id}; delta={delta} <= 0, omitido")
                return (0.0, 0.0, False)
            stock_nuevo = float(delta)
            fila = _crear_fila_cache_adm(producto_id, location_id, stock_nuevo, location_name)
            fila_creada = True
    elif valor_absoluto is not None:
        stock_nuevo = float(valor_absoluto)
        if fila:
            fila.stock = stock_nuevo
            fila.updated_at = datetime.utcnow()
        else:
            fila = _crear_fila_cache_adm(producto_id, location_id, stock_nuevo, location_name)
            fila_creada = True
    else:
        return (None, None, False)

    logger.info(f"[CACHE ADM] {'Creada' if fila_creada else 'Actualizada'}: "
                f"producto_id={producto_id}, location={location_name or location_id}, "
                f"anterior={stock_anterior}, nuevo={stock_nuevo}")
    return (stock_anterior, stock_nuevo, fila_creada)


def _crear_fila_cache_adm(producto_id: int, location_id: str,
                           stock: float, location_name: str = None):
    """
    Crea fila en StockProductoADM con sync_run_id = current_run_id (visible de inmediato).
    Fallback legacy: sync_run_id = None si no hay current_run_id.
    """
    from database import db
    from database.models import StockProductoADM, SyncLocationStatus

    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    run_id = estado_sync.current_run_id if estado_sync and estado_sync.current_run_id else None

    if not location_name and estado_sync:
        location_name = estado_sync.location_name

    fila = StockProductoADM(
        producto_id=producto_id,
        location_id=location_id,
        location_name=location_name or "",
        stock=stock,
        sync_run_id=run_id,
        updated_at=datetime.utcnow()
    )
    db.session.add(fila)
    return fila


def eliminar_fila_cache_adm(producto_id: int, location_id: str) -> bool:
    """
    Elimina la fila vigente de cache ADM.
    Uso: revertir ajustes ADM que crearon una fila nueva.
    """
    from database import db

    fila = obtener_stock_vigente(producto_id, location_id)
    if fila:
        db.session.delete(fila)
        return True
    return False


def resolver_producto_adm(item_id: str = None, sku: str = None):
    """
    Resuelve un ProductoADM usando ItemID (prioridad) con fallback a SKU.
    
    ItemID es un GUID estable de ADM que nunca cambia.
    SKU puede cambiar en ADM (ej: corrección de código) y dejar obsoletos
    los registros guardados en JSON (productos_json de documentos).
    
    Orden de búsqueda:
      1. item_id exacto (GUID estable - más confiable)
      2. sku exacto (case-insensitive)
      3. sku normalizado (sin guiones, espacios, puntos)
    
    Args:
        item_id: GUID del producto en ADM Cloud (prioridad)
        sku: SKU del producto (fallback)
    
    Returns:
        ProductoADM o None
    """
    from database.models import ProductoADM
    import logging
    logger = logging.getLogger(__name__)

    if item_id:
        producto = ProductoADM.query.filter_by(item_id=item_id).first()
        if producto:
            if sku and producto.sku != sku:
                logger.info(f"[RESOLVER] ItemID={item_id} encontrado. SKU cambió: JSON='{sku}' → BD='{producto.sku}'")
            return producto

    if sku:
        sku_upper = sku.strip().upper()
        producto = ProductoADM.query.filter_by(sku=sku_upper).first()
        if producto:
            return producto

        producto = ProductoADM.query.filter(ProductoADM.sku.ilike(sku_upper)).first()
        if producto:
            return producto

        if any(c in sku_upper for c in '-_ .'):
            sku_norm = sku_upper.replace('-', '').replace('_', '').replace(' ', '').replace('.', '')
            from sqlalchemy import func
            candidatos = ProductoADM.query.filter(
                ProductoADM.sku.isnot(None),
                func.length(ProductoADM.sku) >= len(sku_norm) - 3,
                func.length(ProductoADM.sku) <= len(sku_norm) + 3
            ).all()
            for p in candidatos:
                if p.sku and p.sku.replace('-', '').replace('_', '').replace(' ', '').replace('.', '') == sku_norm:
                    return p

    return None


def obtener_stock_vigente_por_sku(sku: str, location_id: str):
    """
    Obtiene stock vigente (LIVE) por SKU (busca producto primero)
    
    Args:
        sku: SKU del producto
        location_id: GUID de la ubicación ADM
    
    Returns:
        StockProductoADM del run vigente (LIVE) o None si no existe
    """
    producto = resolver_producto_adm(sku=sku)
    if not producto:
        return None
    
    return obtener_stock_vigente(producto.id, location_id)


def get_adm_client():
    """
    Obtiene una instancia del cliente ADM Cloud usando la configuración global.
    Versión canónica centralizada - usar esta en lugar de copias locales.
    """
    from api.adm_cloud import ADMCloudClient
    from config import get_config
    config = get_config()
    return ADMCloudClient(
        api_base=config.ADM_API_BASE,
        email=config.ADM_EMAIL,
        password=config.ADM_PASSWORD,
        appid=config.ADM_APPID,
        company=config.ADM_COMPANY,
        role=config.ADM_ROLE
    )
