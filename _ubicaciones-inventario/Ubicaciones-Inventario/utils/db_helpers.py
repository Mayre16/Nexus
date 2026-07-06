"""
Helpers para operaciones de base de datos con manejo de errores y retry
Soporta SQLite y MySQL/MariaDB
"""
import time
import logging
import uuid
from sqlalchemy.exc import OperationalError, DisconnectionError, InternalError
from sqlalchemy import event
from database import db
import pymysql

logger = logging.getLogger(__name__)

# Excepciones que indican conexión desincronizada/rota (pymysql, SQLAlchemy)
try:
    _pymysql_internal = (pymysql.err.InternalError, pymysql.err.OperationalError)
except AttributeError:
    _pymysql_internal = ()
DB_DESYNC_EXCEPTIONS = (OperationalError, DisconnectionError, InternalError) + _pymysql_internal


def _is_db_desync_error(error):
    """True si el error indica conexión desincronizada o perdida"""
    error_str = str(error).lower()
    checks = [
        'packet sequence number wrong',
        'packet sequence',
        'command out of sync',
        'lost connection to mysql server',
        'mysql server has gone away',
        'result length not requested length',
    ]
    if any(c in error_str for c in checks):
        return True
    # pymysql.err.InternalError envuelto
    if hasattr(error, 'orig') and error.orig:
        code = getattr(error.orig, 'args', (None,))[0] if error.orig.args else None
        if code in (2006, 2013, 2014):
            return True
    return isinstance(error, DB_DESYNC_EXCEPTIONS)


def _reset_db_session(request_id=None):
    """Rollback, remove, dispose. Ignora errores internos."""
    prefix = f"[{request_id}]" if request_id else ""
    try:
        db.session.rollback()
    except Exception as e:
        logger.warning(f"{prefix} rollback en reset ignorado: {e}")
    try:
        db.session.remove()
    except Exception as e:
        logger.warning(f"{prefix} session.remove ignorado: {e}")
    try:
        db.session.close()
    except Exception as e:
        logger.warning(f"{prefix} session.close ignorado: {e}")
    try:
        db.engine.dispose()
        logger.info(f"{prefix} Pool descartado (dispose)")
    except Exception as e:
        logger.warning(f"{prefix} engine.dispose ignorado: {e}")


def safe_db_call(fn, name, request_id=None):
    """
    Ejecuta fn() con retry ante errores de conexión desincronizada.
    Máx 2 intentos (1 original + 1 retry).

    Returns:
        (result, recovered) - result es el retorno de fn o None; recovered=True si se recuperó en retry
    """
    rid = request_id or uuid.uuid4().hex[:8]
    for attempt in range(2):
        try:
            result = fn()
            if attempt > 0:
                logger.info(f"[{rid}] {name} OK en retry (intento {attempt + 1})")
            return (result, attempt > 0)
        except Exception as e:
            error_str = str(e).lower()
            if _is_db_desync_error(e) or 'packet sequence' in error_str or 'command out of sync' in error_str:
                logger.warning(f"[{rid}] {name} error DB (intento {attempt + 1}/2): {e}")
                _reset_db_session(rid)
                if attempt == 0:
                    time.sleep(0.3)
                    continue
            logger.error(f"[{rid}] {name} falló después de {attempt + 1} intento(s): {e}")
            return (None, False)
    return (None, False)


def _needs_reconnect(error):
    """
    Determina si un error requiere reconexión
    """
    error_str = str(error).lower()
    error_code = getattr(error, 'orig', None)
    
    # Errores de MySQL que requieren reconexión
    mysql_reconnect_errors = [
        'mysql server has gone away',
        'lost connection to mysql server',
        'command out of sync',
        'broken pipe',
        'can\'t connect to mysql server',
        'packet sequence number wrong',  # Conexión desincronizada (pymysql.err.InternalError)
    ]
    
    # Códigos de error de MySQL que requieren reconexión
    mysql_reconnect_codes = [2006, 2013, 2014]
    
    # Verificar mensaje de error
    if any(msg in error_str for msg in mysql_reconnect_errors):
        return True
    
    # Verificar código de error
    if error_code:
        if hasattr(error_code, 'args') and len(error_code.args) > 0:
            if error_code.args[0] in mysql_reconnect_codes:
                return True
    
    # Errores de SQLite
    if "database is locked" in error_str:
        return False  # SQLite locked no requiere reconexión, solo retry
    
    return False


def _reconnect_db():
    """Fuerza la reconexión: rollback, remove, close, dispose"""
    _reset_db_session()
    return True


def db_commit_with_retry(max_retries=3, retry_delay=0.5):
    """
    Intenta hacer commit con retry y reconexión automática si es necesario
    
    Args:
        max_retries: Número máximo de intentos
        retry_delay: Delay entre intentos en segundos
    
    Returns:
        True si el commit fue exitoso, False en caso contrario
    """
    for attempt in range(max_retries):
        try:
            db.session.commit()
            return True
        except (OperationalError, DisconnectionError, InternalError) as e:
            error_str = str(e).lower()
            
            # Verificar si necesita reconexión (InternalError: "Packet sequence number wrong")
            if _needs_reconnect(e):
                logger.warning(f"Error de conexión en commit (intento {attempt + 1}/{max_retries}), reconectando...")
                db.session.rollback()
                if _reconnect_db() and attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 1.5
                    continue
                else:
                    logger.error(f"Error en commit después de {attempt + 1} intentos: {e}")
                    return False
            
            # SQLite locked - solo retry
            elif "database is locked" in error_str and attempt < max_retries - 1:
                logger.warning(f"Database locked en commit (intento {attempt + 1}/{max_retries}), reintentando en {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 1.5
            else:
                logger.error(f"Error en commit después de {attempt + 1} intentos: {e}")
                db.session.rollback()
                return False
        except Exception as e:
            logger.error(f"Error inesperado en commit: {e}")
            db.session.rollback()
            return False
    
    return False


def db_query_with_retry(query_func, max_retries=3, retry_delay=0.5, tag=None, meta=None):
    """
    Ejecuta una query con retry y reconexión automática si es necesario
    
    Args:
        query_func: Función que ejecuta la query (debe retornar el resultado)
        max_retries: Número máximo de intentos
        retry_delay: Delay entre intentos en segundos
        tag: Identificador de la operación para logging (ej: "buscar_producto", "buscar_stock")
        meta: Diccionario con contexto adicional para logging (ej: {"item_id": "...", "run_id": 16})
    
    Returns:
        Resultado de la query o None si falló
    """
    # Formatear metadatos para logging
    meta_str = ""
    if meta:
        meta_parts = [f"{k}={v}" for k, v in meta.items() if v is not None]
        meta_str = " | " + ", ".join(meta_parts) if meta_parts else ""
    
    tag_prefix = f"[{tag}]" if tag else "[QUERY]"
    
    for attempt in range(max_retries):
        try:
            # Log antes de ejecutar (solo en primer intento o si hay tag)
            if attempt == 0 and tag:
                logger.debug(f"{tag_prefix} Ejecutando query (intento {attempt + 1}/{max_retries}){meta_str}")
            
            result = query_func()
            
            # Log de éxito (solo si hay tag y fue exitoso)
            if tag and attempt == 0:
                logger.debug(f"{tag_prefix} Query exitosa{meta_str}")
            
            return result
        except (OperationalError, DisconnectionError, InternalError) as e:
            error_str = str(e).lower()
            
            # Verificar si necesita reconexión (InternalError: "Packet sequence number wrong")
            if _needs_reconnect(e):
                logger.warning(f"{tag_prefix} Error de conexión en query (intento {attempt + 1}/{max_retries}), reconectando...{meta_str} | Error: {e}")
                db.session.rollback()
                if _reconnect_db() and attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 1.5
                    continue
                else:
                    logger.error(f"{tag_prefix} Error en query después de {attempt + 1} intentos{meta_str} | Error: {e}")
                    db.session.rollback()  # ✅ Agregar rollback antes de retornar
                    return None
            
            # SQLite locked - solo retry
            elif "database is locked" in error_str and attempt < max_retries - 1:
                logger.warning(f"{tag_prefix} Database locked en query (intento {attempt + 1}/{max_retries}), reintentando en {retry_delay}s...{meta_str}")
                time.sleep(retry_delay)
                retry_delay *= 1.5
            else:
                logger.error(f"{tag_prefix} Error en query después de {attempt + 1} intentos{meta_str} | Error: {e}")
                db.session.rollback()  # ✅ Agregar rollback antes de retornar
                return None
        except Exception as e:
            # ✅ CRÍTICO: Detectar "does not return rows" específicamente
            error_msg = str(e).lower()
            if "does not return rows" in error_msg or "result object" in error_msg:
                logger.error(f"{tag_prefix} ⚠️ ERROR CRÍTICO: 'does not return rows' detectado (intento {attempt + 1}/{max_retries}){meta_str} | Error: {e}")
            elif "packet sequence number wrong" in error_msg:
                # Puede llegar aquí si InternalError no fue capturado (ej: excepción envuelta)
                logger.warning(f"{tag_prefix} Packet sequence wrong detectado (intento {attempt + 1}/{max_retries}), reconectando...{meta_str} | Error: {e}")
                try:
                    db.session.rollback()
                    _reconnect_db()
                except Exception as rollback_error:
                    logger.error(f"{tag_prefix} Error al reconectar{meta_str} | Rollback error: {rollback_error}")
            else:
                logger.error(f"{tag_prefix} Error inesperado en query (intento {attempt + 1}/{max_retries}){meta_str} | Error: {e}")
            
            # ✅ SIEMPRE hacer rollback si no se hizo antes (en el bloque packet sequence ya se hace)
            try:
                if "packet sequence number wrong" not in error_msg:
                    db.session.rollback()
            except Exception as rollback_error:
                logger.error(f"{tag_prefix} Error al hacer rollback después de error{meta_str} | Rollback error: {rollback_error}")
            
            # Si no es el último intento, continuar (reintentar con reconexión ya aplicada si aplica)
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 1.5
                continue
            else:
                return None
    
    # Si llegamos aquí, todos los intentos fallaron
    logger.error(f"{tag_prefix} Todos los intentos fallaron{meta_str}")
    try:
        db.session.rollback()
    except Exception as rollback_error:
        logger.error(f"{tag_prefix} Error al hacer rollback final{meta_str} | Rollback error: {rollback_error}")
    return None

