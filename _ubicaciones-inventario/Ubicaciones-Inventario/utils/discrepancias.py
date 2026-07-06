"""
Utilidades para detección y clasificación de discrepancias
"""
from typing import Dict, Optional, Tuple, Set, List, Union
from datetime import datetime
from config import get_config
import logging

logger = logging.getLogger(__name__)


def actualizar_discrepancias_por_skus(skus_afectados: Union[Set[str], List[str]]) -> int:
    """
    Tras cualquier operación que modifique StockUbicacion (despacho, transferencia, ajuste, reversión),
    actualiza o resuelve discrepancias pendientes.
    Recalcula stock_fisico_wms desde StockUbicacion y marca como resuelto si ya no hay desfase.
    
    Args:
        skus_afectados: lista o set de SKUs que fueron modificados
    
    Returns:
        Número de discrepancias marcadas como resueltas
    """
    from database import db
    from database.models import Discrepancia, StockUbicacion, ProductoADM

    if not skus_afectados:
        return 0
    skus = list(skus_afectados)[:500]  # Límite para evitar timeout
    resueltas = 0
    modificadas = False
    try:
        for sku in skus:
            sku_clean = (sku or "").strip().upper()
            if not sku_clean:
                continue
            from utils.helpers import resolver_producto_adm
            producto = resolver_producto_adm(sku=sku_clean)
            if not producto:
                continue
            discrepancias_pendientes = Discrepancia.query.filter_by(
                producto_id=producto.id,
                estado='pendiente'
            ).all()
            for disc in discrepancias_pendientes:
                stock_fisico_list = StockUbicacion.query.filter_by(sku=sku_clean).all()
                stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico_list if s.cantidad and float(s.cantidad) > 0)
                stock_erp = float(disc.stock_erp) if disc.stock_erp else 0.0
                disc.stock_fisico_wms = stock_fisico_total
                modificadas = True
                if abs(stock_fisico_total - stock_erp) < 0.01:
                    disc.estado = 'resuelto'
                    disc.fecha_resolucion = datetime.utcnow()
                    resueltas += 1
                    logger.info(f"Discrepancia resuelta: SKU={sku_clean}, ERP={stock_erp}, Físico={stock_fisico_total}")
        if modificadas:
            db.session.commit()
        return resueltas
    except Exception as e:
        logger.error(f"Error al actualizar discrepancias por SKUs: {e}", exc_info=True)
        return 0


def clasificar_severidad_discrepancia(tipo: str, stock_old: float, stock_new: float, 
                                     stock_fisico: Optional[float] = None) -> str:
    """
    Clasifica discrepancia por severidad según umbrales
    
    Args:
        tipo: Tipo de discrepancia (desaparecido, cambio_brusco, critica_adm_vs_fisico, etc.)
        stock_old: Stock anterior (OLD)
        stock_new: Stock nuevo (NEW)
        stock_fisico: Stock físico (opcional, solo para ADESA)
    
    Returns:
        Severidad: 'critica', 'alta', 'media', 'baja'
    """
    config = get_config()
    umbrales = config.DISCREPANCIAS_UMBRALES
    
    # Discrepancia ADM vs Físico siempre es crítica
    if tipo == 'critica_adm_vs_fisico':
        return 'critica'
    
    # Desaparecido: crítico si hay stock físico, alto si no
    if tipo == 'desaparecido':
        if stock_fisico and stock_fisico > 0:
            return 'critica'
        return 'alta'
    
    # Cambio brusco: calcular porcentaje y absoluto
    if tipo == 'cambio_brusco':
        if stock_old == 0:
            return 'media'  # De 0 a X es menos crítico
        
        cambio_absoluto = abs(stock_new - stock_old)
        cambio_porcentual = (cambio_absoluto / stock_old) * 100 if stock_old > 0 else 0
        
        # Crítico: >500% Y >100 unidades
        if cambio_porcentual > umbrales['critico']['cambio_porcentual'] and \
           cambio_absoluto > umbrales['critico']['cambio_absoluto']:
            return 'critica'
        
        # Alto: >300% Y >50 unidades
        if cambio_porcentual > umbrales['alto']['cambio_porcentual'] and \
           cambio_absoluto > umbrales['alto']['cambio_absoluto']:
            return 'alta'
        
        # Media: cambio significativo pero dentro de umbrales
        if cambio_porcentual > 100 or cambio_absoluto > 10:
            return 'media'
        
        return 'baja'
    
    return 'media'  # Por defecto


def es_cambio_sospechoso(stock_old: float, stock_new: float, umbrales: Optional[Dict] = None) -> Tuple[bool, str]:
    """
    Determina si un cambio es sospechoso según umbrales
    
    Args:
        stock_old: Stock anterior
        stock_new: Stock nuevo
        umbrales: Umbrales personalizados (opcional)
    
    Returns:
        Tuple (es_sospechoso, severidad)
    """
    if umbrales is None:
        config = get_config()
        umbrales = config.DISCREPANCIAS_UMBRALES
    
    if stock_old == 0:
        return False, 'media'  # De 0 a X es normal
    
    cambio_absoluto = abs(stock_new - stock_old)
    cambio_porcentual = (cambio_absoluto / stock_old) * 100 if stock_old > 0 else 0
    
    # Crítico: >500% Y >100 unidades
    if cambio_porcentual > umbrales['critico']['cambio_porcentual'] and \
       cambio_absoluto > umbrales['critico']['cambio_absoluto']:
        return True, 'critica'
    
    # Alto: >300% Y >50 unidades
    if cambio_porcentual > umbrales['alto']['cambio_porcentual'] and \
       cambio_absoluto > umbrales['alto']['cambio_absoluto']:
        return True, 'alta'
    
    # Media: cambio significativo
    if cambio_porcentual > 100 or cambio_absoluto > 10:
        return True, 'media'
    
    return False, 'baja'

