"""
Funciones de validación para el sistema WMS
"""
import re
from typing import Tuple


def validar_sku(sku: str) -> Tuple[bool, str]:
    """
    Valida que un SKU tenga formato válido
    
    Args:
        sku: SKU a validar
    
    Returns:
        Tupla (es_valido, mensaje_error)
    """
    if not sku:
        return False, "SKU no puede estar vacío"
    
    if len(sku.strip()) < 1:
        return False, "SKU no puede estar vacío"
    
    if len(sku) > 100:
        return False, "SKU no puede tener más de 100 caracteres"
    
    if re.search(r'[<>\"\';&|]', sku):
        return False, "SKU contiene caracteres no permitidos"
    
    return True, ""


def validar_ubicacion(ubicacion: str) -> Tuple[bool, str]:
    """
    Valida que una ubicación tenga formato válido
    
    Args:
        ubicacion: Código de ubicación (ej: "P2-P1-AR-N1")
    
    Returns:
        Tupla (es_valido, mensaje_error)
    """
    if not ubicacion:
        return False, "Ubicación no puede estar vacía"
    
    if len(ubicacion.strip()) < 1:
        return False, "Ubicación no puede estar vacía"
    
    if len(ubicacion) > 50:
        return False, "Ubicación no puede tener más de 50 caracteres"
    
    # Permitir letras, números, guiones, puntos, barras
    if not re.match(r'^[A-Za-z0-9\-_./]+$', ubicacion):
        return False, "Ubicación contiene caracteres inválidos (solo letras, números, guiones, puntos y barras)"
    
    return True, ""


def validar_cantidad(cantidad: float) -> Tuple[bool, str]:
    """
    Valida que una cantidad sea válida
    
    Args:
        cantidad: Cantidad a validar
    
    Returns:
        Tupla (es_valido, mensaje_error)
    """
    if cantidad is None:
        return False, "Cantidad no puede estar vacía"
    
    try:
        cantidad_float = float(cantidad)
    except (ValueError, TypeError):
        return False, "Cantidad debe ser un número"
    
    if cantidad_float <= 0:
        return False, "Cantidad debe ser mayor a cero"
    
    if cantidad_float > 999999.99:
        return False, "Cantidad excede el límite máximo"
    
    return True, ""


def validar_factura_docid(docid: str) -> Tuple[bool, str]:
    """
    Valida que un DocID de factura tenga formato válido
    
    Args:
        docid: Número de factura (ej: "00002932")
    
    Returns:
        Tupla (es_valido, mensaje_error)
    """
    if not docid:
        return False, "Número de factura no puede estar vacío"
    
    if len(docid.strip()) < 1:
        return False, "Número de factura no puede estar vacío"
    
    # Permitir números, letras y guiones (algunas facturas pueden tener formato especial)
    if not re.match(r'^[A-Za-z0-9\-]+$', docid):
        return False, "Número de factura contiene caracteres inválidos"
    
    return True, ""
















