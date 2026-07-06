"""
Cliente para interactuar con ADM Cloud API
Mejora del código existente con funcionalidades adicionales
"""
import json
import logging
import time
import base64
from typing import Dict, List, Optional, Any

import requests
from requests.exceptions import ConnectTimeout, ReadTimeout, Timeout

logger = logging.getLogger(__name__)

# Reintentos ante cortes intermitentes (sync largo = muchas peticiones seguidas)
_ADM_MAX_RETRIES = 4
_ADM_RETRY_BACKOFF_BASE_SEC = 0.75
_ADM_REQUEST_TIMEOUT_SEC = 45


class ADMCloudClient:
    """Cliente para ADM Cloud REST API"""
    
    def __init__(self, api_base: str, email: str, password: str, appid: str, company: str, role: str):
        """
        Inicializa el cliente ADM Cloud
        
        Args:
            api_base: URL base del API (ej: "https://api.admcloud.net/api/")
            email: Email de usuario
            password: Contraseña
            appid: ID de integración
            company: ID de empresa
            role: Rol del usuario
        """
        self.api_base = api_base.rstrip('/')
        self.email = email
        self.password = password
        self.appid = appid
        self.company = company
        self.role = role
        self._auth_header = None
    
    def _get_auth_header(self) -> str:
        """Genera el header de autenticación Basic Auth"""
        if not self._auth_header:
            credentials = f"{self.email}:{self.password}"
            encoded = base64.b64encode(credentials.encode('ascii')).decode('ascii')
            self._auth_header = f"Basic {encoded}"
        return self._auth_header
    
    def _get_common_params(self) -> Dict[str, str]:
        """Retorna parámetros comunes para todas las peticiones"""
        return {
            "appid": self.appid,
            "company": self.company,
            "role": self.role,
            "OnlyActive": "false"
        }
    
    def _make_request(self, endpoint: str, params: Optional[Dict] = None, method: str = 'GET') -> Dict[str, Any]:
        """
        Hace una petición al API de ADM Cloud.
        Reintenta automáticamente ante Timeout o ConnectionError (red intermitente en sync largos).

        Args:
            endpoint: Endpoint del API (ej: "items/" o "CashInvoices/")
            params: Parámetros adicionales
            method: Método HTTP (GET, POST, PUT, DELETE)

        Returns:
            Dict con 'success', 'data' y opcionalmente 'error', 'message'
        """
        url = f"{self.api_base}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": self._get_auth_header(),
            "Accept": "application/json",
        }

        if params is None:
            params = {}
        params.update(self._get_common_params())

        timeout = _ADM_REQUEST_TIMEOUT_SEC
        last_transient_message = ""

        for attempt in range(_ADM_MAX_RETRIES):
            try:
                if method.upper() == 'GET':
                    response = requests.get(url, headers=headers, params=params, timeout=timeout)
                else:
                    response = requests.request(
                        method,
                        url,
                        headers=headers,
                        params=params,
                        json=params if 'json' in str(type(params)) else None,
                        timeout=timeout,
                    )

                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, dict) and "data" in data:
                        return {"success": True, "data": data["data"]}
                    if isinstance(data, list):
                        return {"success": True, "data": data}
                    return {"success": True, "data": data}

                error_msg = response.text[:500] if response.text else "Sin mensaje de error"
                ra = response.headers.get("Retry-After")
                # Bloqueo / límite suele venir como HTTP con cuerpo (403/429/503) y a veces Retry-After
                logger.warning(
                    "ADM HTTP %s endpoint=%s retry_after=%s cuerpo=%s",
                    response.status_code,
                    endpoint[:120],
                    ra,
                    error_msg[:200].replace("\n", " "),
                )
                out: Dict[str, Any] = {
                    "success": False,
                    "error": f"Error {response.status_code}",
                    "message": error_msg,
                    "status_code": response.status_code,
                    "failure_kind": "http_error",
                }
                if ra:
                    out["retry_after"] = ra
                return out

            except Timeout as e:
                if isinstance(e, ConnectTimeout):
                    last_transient_message = "Timeout al conectar con ADM (sin abrir TCP/TLS a tiempo)"
                    fk = "timeout_connect"
                elif isinstance(e, ReadTimeout):
                    last_transient_message = "Timeout esperando respuesta de ADM (conexión abierta, respuesta lenta)"
                    fk = "timeout_read"
                else:
                    last_transient_message = "El servidor no respondió a tiempo"
                    fk = "timeout"
                if attempt < _ADM_MAX_RETRIES - 1:
                    logger.info(
                        "ADM reintento %s/%s %s endpoint=%s",
                        attempt + 1,
                        _ADM_MAX_RETRIES,
                        fk,
                        endpoint[:120],
                    )
                    time.sleep(_ADM_RETRY_BACKOFF_BASE_SEC * (2**attempt))
                    continue
                logger.warning(
                    "ADM fallo tras reintentos: %s endpoint=%s",
                    fk,
                    endpoint[:120],
                )
                return {
                    "success": False,
                    "error": "Timeout",
                    "message": last_transient_message,
                    "failure_kind": fk,
                }

            except requests.exceptions.ConnectionError as e:
                last_transient_message = "No se pudo conectar al servidor"
                # Pista: reset/remoto cerró / SSL — no es timeout si no hubo excepción Timeout antes
                err_hint = (str(e) or type(e).__name__)[:400]
                if attempt < _ADM_MAX_RETRIES - 1:
                    logger.info(
                        "ADM reintento %s/%s connection_error endpoint=%s hint=%s",
                        attempt + 1,
                        _ADM_MAX_RETRIES,
                        endpoint[:120],
                        err_hint.replace("\n", " "),
                    )
                    time.sleep(_ADM_RETRY_BACKOFF_BASE_SEC * (2**attempt))
                    continue
                logger.warning(
                    "ADM fallo tras reintentos: connection_error endpoint=%s hint=%s",
                    endpoint[:120],
                    err_hint.replace("\n", " "),
                )
                return {
                    "success": False,
                    "error": "Error de conexión",
                    "message": last_transient_message,
                    "failure_kind": "connection_error",
                    "connection_hint": err_hint,
                }

            except Exception as e:
                logger.exception("ADM error inesperado endpoint=%s", endpoint[:120])
                return {
                    "success": False,
                    "error": "Error inesperado",
                    "message": str(e),
                    "failure_kind": "unexpected",
                }

        return {
            "success": False,
            "error": "Error de conexión",
            "message": last_transient_message or "No se pudo conectar al servidor",
            "failure_kind": "connection_error",
        }
    
    def obtener_todos_los_items(self, max_items: int = 5000) -> Dict[str, Any]:
        """
        Obtiene TODOS los productos usando paginación
        
        Args:
            max_items: Máximo de items a obtener (por defecto 5000)
        
        Returns:
            Dict con 'success' y 'data' (lista de productos)
        """
        todos_items = []
        skip = 0
        batch_size = 50  # ADM Cloud limita a 50 productos por petición
        
        while len(todos_items) < max_items:
            result = self._make_request("items/", {"skip": skip, "take": batch_size})
            
            if not result["success"]:
                return result
            
            items = result["data"]
            
            if not items or len(items) == 0:
                break
            
            todos_items.extend(items)
            
            # Si recibimos menos items de los solicitados, significa que ya no hay más
            if len(items) < batch_size:
                break
            
            skip += batch_size
        
        return {"success": True, "data": todos_items}
    
    def buscar_item_por_sku(self, sku: str) -> Optional[Dict[str, Any]]:
        """
        Busca un producto por SKU (búsqueda flexible: con y sin guiones)
        Optimizada para buscar de forma eficiente paginando en lotes
        
        Args:
            sku: SKU del producto a buscar (ej: "VP1" o "VP-1")
        
        Returns:
            Dict del producto o None si no se encuentra
        """
        sku_upper = sku.upper().strip()
        # Normalizar SKU: remover guiones y espacios para comparación flexible
        sku_normalizado = sku_upper.replace('-', '').replace('_', '').replace(' ', '')
        
        # Buscar en lotes pequeños para optimizar velocidad
        # Primero buscar en los primeros 300 productos (más comunes, más rápido)
        skip = 0
        batch_size = 50
        max_search = 300  # Buscar en los primeros 300 productos primero (reducido para velocidad)
        
        while skip < max_search:
            result = self._make_request("items/", {"skip": skip, "take": batch_size})
            
            if not result["success"]:
                break
            
            items = result["data"]
            if not items or len(items) == 0:
                break
            
            # Buscar en este lote
            for item in items:
                item_sku = item.get("SKU", "") or item.get("ItemSKU", "")
                item_sku_upper = item_sku.upper().strip()
                item_sku_normalizado = item_sku_upper.replace('-', '').replace('_', '').replace(' ', '')
                
                # Comparación exacta primero (más rápida)
                if item_sku_upper == sku_upper:
                    return item
                
                # Comparación normalizada (sin guiones, espacios, etc.)
                if item_sku_normalizado == sku_normalizado:
                    return item
            
            # Si encontramos menos items de los solicitados, no hay más
            if len(items) < batch_size:
                break
            
            skip += batch_size
        
        # Si no se encontró en los primeros 300, buscar en más productos (hasta 1000)
        if skip >= max_search:
            max_search_extended = 1000  # Reducido de 2000 a 1000 para velocidad
            while skip < max_search_extended:
                result = self._make_request("items/", {"skip": skip, "take": batch_size})
                
                if not result["success"]:
                    break
                
                items = result["data"]
                if not items or len(items) == 0:
                    break
                
                for item in items:
                    item_sku = item.get("SKU", "") or item.get("ItemSKU", "")
                    item_sku_upper = item_sku.upper().strip()
                    item_sku_normalizado = item_sku_upper.replace('-', '').replace('_', '').replace(' ', '')
                    
                    if item_sku_upper == sku_upper or item_sku_normalizado == sku_normalizado:
                        return item
                
                if len(items) < batch_size:
                    break
                
                skip += batch_size
        
        return None
    
    def obtener_item_por_id(self, item_id: str) -> Dict[str, Any]:
        """
        Obtiene un producto por su ItemID (GUID)
        
        Args:
            item_id: GUID del producto
        
        Returns:
            Dict con 'success' y 'data'
        """
        return self._make_request(f"Items/{item_id}")
    
    def listar_facturas_contado(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
        """
        Lista facturas de contado (CashInvoices)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
        
        Returns:
            Dict con 'success' y 'data' (lista de facturas)
        """
        return self._make_request("CashInvoices/", {"skip": skip, "take": take})
    
    def listar_facturas_credito(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
        """
        Lista facturas a crédito (CreditInvoices)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
        
        Returns:
            Dict con 'success' y 'data' (lista de facturas)
        """
        return self._make_request("CreditInvoices/", {"skip": skip, "take": take})
    
    def listar_pedidos(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
        """
        Lista pedidos de venta (SalesOrders)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
        
        Returns:
            Dict con 'success' y 'data' (lista de pedidos)
        """
        return self._make_request("SalesOrders/", {"skip": skip, "take": take})
    
    def listar_dispatchs(self, skip: int = 0, take: int = 50, location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista despachos/conduces (Dispatchs)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (lista de despachos)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        return self._make_request("Dispatchs/", params)
    
    def obtener_dispatch_por_guid(self, guid: str) -> Dict[str, Any]:
        """
        Obtiene un despacho/conduce completo por su GUID
        
        Args:
            guid: GUID del despacho
        
        Returns:
            Dict con 'success' y 'data' (despacho completo con Items)
        """
        return self._make_request(f"Dispatchs/{guid}")
    
    def buscar_dispatch_por_docid(self, docid: str, max_search: int = 2000, location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Busca un despacho/conduce por su DocID (número de documento)
        
        Args:
            docid: Número de documento (ej: "00002932" o "2967")
            max_search: Máximo de despachos a buscar (por defecto 2000)
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (despacho completo con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # Buscar en el listado de despachos
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            result = self.listar_dispatchs(skip=skip, take=batch_size, location_id=location_id)
            
            if not result["success"]:
                return None
            
            dispatchs = result["data"]
            if not dispatchs or len(dispatchs) == 0:
                break
            
            # Buscar por DocID en el lote actual
            for dispatch in dispatchs:
                dispatch_docid = dispatch.get("DocID", "")
                if not dispatch_docid:
                    continue
                
                # Comparar en diferentes formatos
                dispatch_docid_clean = str(dispatch_docid).strip()
                dispatch_docid_normalizado = dispatch_docid_clean.lstrip('0') if dispatch_docid_clean else ''
                
                if (dispatch_docid_clean == docid_original or 
                    dispatch_docid_clean == docid_con_ceros or
                    dispatch_docid_normalizado == docid_normalizado):
                    # Encontrado, obtener el detalle completo
                    dispatch_guid = dispatch.get("ID")
                    if dispatch_guid:
                        return self.obtener_dispatch_por_guid(dispatch_guid)
                    return {"success": True, "data": dispatch}
            
            if len(dispatchs) < batch_size:
                break
            
            skip += batch_size
        
        return None
    
    def listar_recepciones(self, skip: int = 0, take: int = 50, location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista recepciones (Receptions)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (lista de recepciones)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        return self._make_request("Receptions/", params)
    
    def obtener_recepcion_por_guid(self, guid: str) -> Dict[str, Any]:
        """
        Obtiene una recepción completa por su GUID
        
        Args:
            guid: GUID de la recepción
        
        Returns:
            Dict con 'success' y 'data' (recepción completa con Items)
        """
        return self._make_request(f"Receptions/{guid}")
    
    def buscar_recepcion_por_docid(self, docid: str, max_search: int = 2000, location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Busca una recepción por su DocID (número de documento)
        
        Args:
            docid: Número de documento (ej: "00000350" o "350")
            max_search: Máximo de recepciones a buscar (por defecto 2000)
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (recepción completa con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # Buscar en el listado de recepciones
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            result = self.listar_recepciones(skip=skip, take=batch_size, location_id=location_id)
            
            if not result["success"]:
                return None
            
            recepciones = result["data"]
            if not recepciones or len(recepciones) == 0:
                break
            
            # Buscar por DocID en el lote actual
            for recepcion in recepciones:
                recepcion_docid = recepcion.get("DocID", "")
                if not recepcion_docid:
                    continue
                
                # Comparar en diferentes formatos
                recepcion_docid_clean = str(recepcion_docid).strip()
                recepcion_docid_normalizado = recepcion_docid_clean.lstrip('0') if recepcion_docid_clean else ''
                
                if (recepcion_docid_clean == docid_original or 
                    recepcion_docid_clean == docid_con_ceros or
                    recepcion_docid_normalizado == docid_normalizado):
                    # Encontrado, obtener el detalle completo
                    recepcion_guid = recepcion.get("ID")
                    # Preservar LocationName y LocationID del listado por si el detalle no los tiene
                    location_name_listado = recepcion.get("LocationName")
                    location_id_listado = recepcion.get("LocationID")
                    
                    if recepcion_guid:
                        detalle_completo = self.obtener_recepcion_por_guid(recepcion_guid)
                        # Si el detalle completo no tiene LocationName, usar el del listado
                        if detalle_completo and detalle_completo.get("success"):
                            detalle_data = detalle_completo.get("data", {})
                            if not detalle_data.get("LocationName") and location_name_listado:
                                detalle_data["LocationName"] = location_name_listado
                            if not detalle_data.get("LocationID") and location_id_listado:
                                detalle_data["LocationID"] = location_id_listado
                        return detalle_completo
                    return {"success": True, "data": recepcion}
            
            if len(recepciones) < batch_size:
                break
            
            skip += batch_size
        
        return None
    
    def listar_vendor_recepciones(self, skip: int = 0, take: int = 50, location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista compras con recepción (VendorReceptions)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (lista de compras con recepción)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        return self._make_request("VendorReceptions/", params)
    
    def obtener_vendor_recepcion_por_guid(self, guid: str) -> Dict[str, Any]:
        """
        Obtiene una compra con recepción completa por su GUID
        
        Args:
            guid: GUID de la compra con recepción
        
        Returns:
            Dict con 'success' y 'data' (compra con recepción completa con Items)
        """
        return self._make_request(f"VendorReceptions/{guid}")
    
    def buscar_vendor_recepcion_por_docid(self, docid: str, max_search: int = 2000, location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Busca una compra con recepción por su DocID (número de documento)
        
        Args:
            docid: Número de documento (ej: "00000048" o "48")
            max_search: Máximo de recepciones a buscar (por defecto 2000)
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (compra con recepción completa con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # Buscar en el listado de vendor recepciones
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            result = self.listar_vendor_recepciones(skip=skip, take=batch_size, location_id=location_id)
            
            if not result["success"]:
                return None
            
            vendor_recepciones = result["data"]
            if not vendor_recepciones or len(vendor_recepciones) == 0:
                break
            
            # Buscar por DocID en el lote actual
            for vendor_recepcion in vendor_recepciones:
                vendor_recepcion_docid = vendor_recepcion.get("DocID", "")
                if not vendor_recepcion_docid:
                    continue
                
                # Comparar en diferentes formatos
                vendor_recepcion_docid_clean = str(vendor_recepcion_docid).strip()
                vendor_recepcion_docid_normalizado = vendor_recepcion_docid_clean.lstrip('0') if vendor_recepcion_docid_clean else ''
                
                if (vendor_recepcion_docid_clean == docid_original or 
                    vendor_recepcion_docid_clean == docid_con_ceros or
                    vendor_recepcion_docid_normalizado == docid_normalizado):
                    # Encontrado, obtener el detalle completo
                    vendor_recepcion_guid = vendor_recepcion.get("ID")
                    # Preservar LocationName y LocationID del listado por si el detalle no los tiene
                    location_name_listado = vendor_recepcion.get("LocationName")
                    location_id_listado = vendor_recepcion.get("LocationID")
                    
                    if vendor_recepcion_guid:
                        detalle_completo = self.obtener_vendor_recepcion_por_guid(vendor_recepcion_guid)
                        # Si el detalle completo no tiene LocationName, usar el del listado
                        if detalle_completo and detalle_completo.get("success"):
                            detalle_data = detalle_completo.get("data", {})
                            # Preservar LocationName del listado si el detalle no lo tiene o está vacío
                            if (not detalle_data.get("LocationName") or detalle_data.get("LocationName") == "") and location_name_listado:
                                detalle_data["LocationName"] = location_name_listado
                            # Preservar LocationID del listado si el detalle no lo tiene o está vacío
                            if (not detalle_data.get("LocationID") or detalle_data.get("LocationID") == "") and location_id_listado:
                                detalle_data["LocationID"] = location_id_listado
                            
                            # NUEVA LÓGICA: Si aún no hay LocationName pero sí LocationID, consultar /Locations
                            # Manejar None explícitamente: si LocationName es None, convertir a cadena vacía
                            location_name_raw = detalle_data.get("LocationName")
                            location_name_final = (location_name_raw or "").strip() if location_name_raw is not None else ""
                            
                            location_id_raw = detalle_data.get("LocationID")
                            location_id_final = (location_id_raw or "").strip() if location_id_raw is not None else ""
                            
                            if (not location_name_final or location_name_final == "") and location_id_final:
                                # Consultar /Locations para resolver el LocationName
                                location_info = self.obtener_location_por_id(location_id_final)
                                if location_info and location_info.get("Name"):
                                    detalle_data["LocationName"] = location_info.get("Name")
                        
                        return detalle_completo
                    return {"success": True, "data": vendor_recepcion}
            
            if len(vendor_recepciones) < batch_size:
                break
            
            skip += batch_size
        
        return None
    
    def listar_location_transfers(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
        """
        Lista transferencias entre ubicaciones (LocationTransfers)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
        
        Returns:
            Dict con 'success' y 'data' (lista de transferencias)
        """
        params = {"skip": skip, "take": take}
        return self._make_request("LocationTransfers/", params)
    
    def obtener_location_transfer_por_guid(self, guid: str) -> Dict[str, Any]:
        """
        Obtiene una transferencia completa por su GUID
        
        Args:
            guid: GUID de la transferencia
        
        Returns:
            Dict con 'success' y 'data' (transferencia completa con Items)
        """
        return self._make_request(f"LocationTransfers/{guid}")
    
    def buscar_location_transfer_por_docid(self, docid: str, max_search: int = 2000) -> Optional[Dict[str, Any]]:
        """
        Busca una transferencia por su DocID (número de documento)
        
        Args:
            docid: Número de documento (ej: "00000231" o "231")
            max_search: Máximo de transferencias a buscar (por defecto 2000)
        
        Returns:
            Dict con 'success' y 'data' (transferencia completa con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # Buscar en el listado de transferencias
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            result = self.listar_location_transfers(skip=skip, take=batch_size)
            
            if not result["success"]:
                return None
            
            transferencias = result["data"]
            if not transferencias or len(transferencias) == 0:
                break
            
            # Buscar por DocID en el lote actual
            for transferencia in transferencias:
                transferencia_docid = transferencia.get("DocID", "")
                if not transferencia_docid:
                    continue
                
                # Comparar en diferentes formatos
                transferencia_docid_clean = str(transferencia_docid).strip()
                transferencia_docid_normalizado = transferencia_docid_clean.lstrip('0') if transferencia_docid_clean else ''
                
                if (transferencia_docid_clean == docid_original or 
                    transferencia_docid_clean == docid_con_ceros or
                    transferencia_docid_normalizado == docid_normalizado):
                    # Encontrado, obtener el detalle completo
                    transferencia_guid = transferencia.get("ID")
                    if transferencia_guid:
                        return self.obtener_location_transfer_por_guid(transferencia_guid)
                    return {"success": True, "data": transferencia}
            
            if len(transferencias) < batch_size:
                break
            
            skip += batch_size
        
        return None
    
    def obtener_factura_por_guid(self, guid: str, tipo: str = "CASH") -> Dict[str, Any]:
        """
        Obtiene una factura completa por su GUID
        
        Args:
            guid: GUID de la factura
            tipo: Tipo de factura ("CASH", "CREDIT", "ORDER")
        
        Returns:
            Dict con 'success' y 'data' (factura completa con Items)
        """
        if tipo == "CASH":
            endpoint = f"CashInvoices/{guid}"
        elif tipo == "CREDIT":
            endpoint = f"CreditInvoices/{guid}"
        elif tipo == "ORDER":
            endpoint = f"SalesOrders/{guid}"
        else:
            return {
                "success": False,
                "error": "Tipo inválido",
                "message": f"Tipo debe ser CASH, CREDIT o ORDER, recibido: {tipo}"
            }
        
        return self._make_request(endpoint)
    
    def buscar_factura_por_docid(self, docid: str, tipo: str = "CASH", max_search: int = 2000) -> Optional[Dict[str, Any]]:
        """
        Busca una factura por su DocID (número de factura)
        
        Args:
            docid: Número de factura (ej: "00002932" o "2967")
            tipo: Tipo de factura ("CASH", "CREDIT", "ORDER")
            max_search: Máximo de facturas a buscar (por defecto 2000)
        
        Returns:
            Dict con 'success' y 'data' (factura completa con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        # Pero mantener también el formato original con ceros
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # Buscar en el listado de facturas
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            if tipo == "CASH":
                result = self.listar_facturas_contado(skip=skip, take=batch_size)
            elif tipo == "CREDIT":
                result = self.listar_facturas_credito(skip=skip, take=batch_size)
            elif tipo == "ORDER":
                result = self.listar_pedidos(skip=skip, take=batch_size)
            else:
                return None
            
            if not result["success"]:
                return None
            
            facturas = result["data"]
            if not facturas or len(facturas) == 0:
                break
            
            # Buscar por DocID (comparación exacta y normalizada)
            for factura in facturas:
                try:
                    factura_docid_raw = factura.get("DocID")
                    if factura_docid_raw is None:
                        continue
                    
                    factura_docid = str(factura_docid_raw).strip()
                    factura_docid_normalizado = factura_docid.lstrip('0') if factura_docid else ''
                    
                    # Comparar en múltiples formatos
                    match = (
                        factura_docid == docid_original or
                        factura_docid == docid_con_ceros or
                        factura_docid_normalizado == docid_normalizado or
                        factura_docid == docid_normalizado or
                        factura_docid_normalizado == docid_original or
                        factura_docid_normalizado == docid_con_ceros.lstrip('0') if docid_con_ceros.isdigit() else False
                    )
                    
                    if match:
                        # Encontrada, obtener el detalle completo
                        guid = factura.get("ID")
                        if guid:
                            try:
                                resultado = self.obtener_factura_por_guid(guid, tipo)
                                if resultado and isinstance(resultado, dict) and resultado.get("success"):
                                    return resultado
                            except Exception as e:
                                # Si obtener_factura_por_guid falla, continuar buscando
                                continue
                except Exception as e:
                    # Si hay error procesando una factura, continuar con la siguiente
                    continue
            
            # Si recibimos menos facturas de las solicitadas, ya no hay más
            if len(facturas) < batch_size:
                break
            
            skip += batch_size
        
        # No se encontró la factura
        return None
    
    def obtener_stock(self, location_id: Optional[str] = None, skip: int = 0, take: int = 50, show_no_stock: bool = False) -> Dict[str, Any]:
        """
        Obtiene información de stock
        
        Args:
            location_id: ID de ubicación (opcional, para filtrar por ubicación)
            skip: Número de registros a saltar
            take: Número de registros a obtener
            show_no_stock: Si True, incluye items con stock=0 (Fase 3: ShowNoStock)
        
        Returns:
            Dict con 'success' y 'data' (lista de stock)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        if show_no_stock:
            params["ShowNoStock"] = "true"  # ✅ Fase 3: Agregar parámetro ShowNoStock
        
        return self._make_request("Stock", params)
    
    def obtener_ubicaciones(self, skip: int = 0, take: int = 50) -> Dict[str, Any]:
        """
        Obtiene la lista de ubicaciones/sucursales
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
        
        Returns:
            Dict con 'success' y 'data' (lista de ubicaciones)
        """
        return self._make_request("Locations/", {"skip": skip, "take": take})
    
    def buscar_ubicacion_por_nombre(self, nombre: str) -> Optional[Dict[str, Any]]:
        """
        Busca una ubicación por nombre
        
        Args:
            nombre: Nombre de la ubicación (ej: "ADESA")
        
        Returns:
            Dict de la ubicación o None si no se encuentra
        """
        # Buscar en las primeras 100 ubicaciones
        result = self.obtener_ubicaciones(skip=0, take=100)
        
        if not result["success"]:
            return None
        
        nombre_upper = nombre.upper().strip()
        for location in result["data"]:
            if location.get("Name", "").upper().strip() == nombre_upper:
                return location
        
        return None
    
    def obtener_location_por_id(self, location_id: str) -> Optional[Dict[str, Any]]:
        """
        Busca una ubicación por su LocationID consultando /Locations
        
        Args:
            location_id: ID de la ubicación (GUID)
        
        Returns:
            Dict de la ubicación con 'Name' o None si no se encuentra
        """
        if not location_id:
            return None
        
        # Buscar paginando hasta encontrar el LocationID
        skip = 0
        take = 100
        max_search = 5000  # Límite de seguridad
        
        while skip < max_search:
            result = self.obtener_ubicaciones(skip=skip, take=take)
            
            if not result["success"]:
                break
            
            locations = result["data"]
            if not locations or len(locations) == 0:
                break
            
            # Buscar el LocationID en el lote actual
            for location in locations:
                if location.get("ID") == location_id:
                    return location
            
            # Si el lote es menor que take, ya no hay más
            if len(locations) < take:
                break
            
            skip += take
        
        return None
    
    def listar_credit_notes_unprinted(self, skip: int = 0, take: int = 50, location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista notas de crédito no impresas (Unprinted)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (lista de notas de crédito)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        return self._make_request("CustomerCreditNotes/Unprinted", params)
    
    def listar_credit_notes_printed(self, skip: int = 0, take: int = 50, location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista notas de crédito impresas (Printed)
        
        Args:
            skip: Número de registros a saltar
            take: Número de registros a obtener
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (lista de notas de crédito)
        """
        params = {"skip": skip, "take": take}
        if location_id:
            params["LocationID"] = location_id
        return self._make_request("CustomerCreditNotes/Printed", params)
    
    def obtener_credit_note_por_guid(self, guid: str) -> Dict[str, Any]:
        """
        Obtiene una nota de crédito completa por su GUID
        
        Args:
            guid: GUID de la nota de crédito
        
        Returns:
            Dict con 'success' y 'data' (nota de crédito completa con Items)
        """
        return self._make_request(f"CustomerCreditNotes/{guid}")
    
    def _buscar_credit_note_en_listado(self, docid_original: str, docid_normalizado: str, 
                                        docid_con_ceros: str, endpoint: str, 
                                        max_search: int = 2000, 
                                        location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Método auxiliar para buscar nota de crédito en un listado específico (Unprinted o Printed)
        
        Args:
            docid_original: DocID original sin modificar
            docid_normalizado: DocID sin ceros a la izquierda
            docid_con_ceros: DocID con ceros a la izquierda
            endpoint: Endpoint a consultar ("CustomerCreditNotes/Unprinted" o "CustomerCreditNotes/Printed")
            max_search: Máximo de notas de crédito a buscar
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (nota de crédito completa con Items) o None si no se encuentra
        """
        skip = 0
        batch_size = 50
        
        while skip < max_search:
            params = {"skip": skip, "take": batch_size}
            if location_id:
                params["LocationID"] = location_id
            
            result = self._make_request(endpoint, params)
            
            if not result["success"]:
                return None
            
            credit_notes = result["data"]
            if not credit_notes or len(credit_notes) == 0:
                break
            
            # Buscar por DocID en el lote actual
            for credit_note in credit_notes:
                credit_note_docid = credit_note.get("DocID", "")
                if not credit_note_docid:
                    continue
                
                # Comparar en diferentes formatos
                credit_note_docid_clean = str(credit_note_docid).strip()
                credit_note_docid_normalizado = credit_note_docid_clean.lstrip('0') if credit_note_docid_clean else ''
                
                if (credit_note_docid_clean == docid_original or 
                    credit_note_docid_clean == docid_con_ceros or
                    credit_note_docid_normalizado == docid_normalizado):
                    # Encontrado, obtener el detalle completo
                    credit_note_guid = credit_note.get("ID")
                    # Preservar LocationName y LocationID del listado por si el detalle no los tiene
                    location_name_listado = credit_note.get("LocationName")
                    location_id_listado = credit_note.get("LocationID")
                    
                    if credit_note_guid:
                        detalle_completo = self.obtener_credit_note_por_guid(credit_note_guid)
                        # Si el detalle completo no tiene LocationName, usar el del listado
                        if detalle_completo and detalle_completo.get("success"):
                            detalle_data = detalle_completo.get("data", {})
                            if not detalle_data.get("LocationName") and location_name_listado:
                                detalle_data["LocationName"] = location_name_listado
                            if not detalle_data.get("LocationID") and location_id_listado:
                                detalle_data["LocationID"] = location_id_listado
                        return detalle_completo
                    return {"success": True, "data": credit_note}
            
            if len(credit_notes) < batch_size:
                break
            
            skip += batch_size
        
        return None
    
    def buscar_credit_note_por_docid(self, docid: str, max_search: int = 2000, location_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Busca una nota de crédito por su DocID (número de documento)
        Estrategia optimizada: Busca primero en Unprinted (más probable), luego en Printed si no encuentra
        
        Args:
            docid: Número de documento (ej: "00000161" o "161")
            max_search: Máximo de notas de crédito a buscar en cada endpoint (por defecto 2000)
            location_id: ID de ubicación para filtrar (opcional)
        
        Returns:
            Dict con 'success' y 'data' (nota de crédito completa con Items) o None si no se encuentra
        """
        # Normalizar DocID: quitar ceros a la izquierda para comparación flexible
        docid_clean = docid.strip()
        docid_normalizado = docid_clean.lstrip('0') if docid_clean else ''
        docid_original = docid_clean
        # También probar con ceros a la izquierda si no los tiene
        docid_con_ceros = docid_clean.zfill(8) if docid_clean.isdigit() else docid_clean
        
        # 1️⃣ Buscar primero en Unprinted (más probable, más reciente)
        resultado = self._buscar_credit_note_en_listado(
            docid_original, docid_normalizado, docid_con_ceros,
            endpoint="CustomerCreditNotes/Unprinted",
            max_search=max_search,
            location_id=location_id
        )
        if resultado:
            return resultado
        
        # 2️⃣ Si no se encuentra, buscar en Printed
        resultado = self._buscar_credit_note_en_listado(
            docid_original, docid_normalizado, docid_con_ceros,
            endpoint="CustomerCreditNotes/Printed",
            max_search=max_search,
            location_id=location_id
        )
        return resultado

