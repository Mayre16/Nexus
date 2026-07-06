"""
Configuración del sistema WMS
Soporta desarrollo local y producción en CPanel
"""
import os
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # En producción (cPanel) las variables vienen del panel, no del .env

# Directorio base del proyecto
BASE_DIR = Path(__file__).parent

# Plan B: deshabilitar pooling si DB_USE_NULLPOOL=true (evita "packet sequence wrong" en cPanel)
USE_NULL_POOL = os.environ.get('DB_USE_NULLPOOL', 'false').lower() == 'true'


class Config:
    """Configuración base"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-cambiar-en-produccion'
    
    # Base de datos
    # Si DATABASE_URL está configurado, usarlo (MySQL/MariaDB en producción)
    # Si no, usar SQLite (desarrollo local)
    DATABASE_URL = os.environ.get('DATABASE_URL')
    if DATABASE_URL:
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
        # Configuración MySQL/MariaDB para cPanel + Passenger
        if USE_NULL_POOL:
            # Plan B: NullPool = sin pooling, 1 conexión por request (evita packet sequence wrong)
            from sqlalchemy.pool import NullPool
            SQLALCHEMY_ENGINE_OPTIONS = {
                'poolclass': NullPool,
                'connect_args': {
                    'connect_timeout': 10,
                    'read_timeout': 30,
                    'write_timeout': 30,
                    'charset': 'utf8mb4',
                    'autocommit': False,
                },
                'echo': False,
            }
        else:
            SQLALCHEMY_ENGINE_OPTIONS = {
                'pool_pre_ping': True,
                'pool_recycle': 280,
                'pool_reset_on_return': 'rollback',
                'pool_size': 3,
                'max_overflow': 5,
                'pool_timeout': 30,
                'connect_args': {
                    'connect_timeout': 10,
                    'read_timeout': 30,
                    'write_timeout': 30,
                    'charset': 'utf8mb4',
                    'autocommit': False,
                },
                'echo': False,
            }
    else:
        # SQLite para desarrollo local
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{BASE_DIR}/database/wms.db'
        SQLALCHEMY_ENGINE_OPTIONS = {
            'connect_args': {
                'timeout': 30,  # Timeout de 30 segundos para operaciones
                'check_same_thread': False  # Permitir acceso desde múltiples threads
            },
            'pool_pre_ping': True,
            'pool_recycle': 3600,
        }
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Configuración ADM Cloud API
    # SEGURIDAD: Estas credenciales DEBEN estar en variables de entorno.
    # Se han eliminado los fallbacks hardcodeados para proteger la seguridad del sistema.
    ADM_API_BASE = os.environ.get('ADM_API_BASE') or "https://api.admcloud.net/api/"
    ADM_EMAIL = os.environ.get('ADM_EMAIL')
    ADM_PASSWORD = os.environ.get('ADM_PASSWORD')
    ADM_APPID = os.environ.get('ADM_APPID')
    ADM_COMPANY = os.environ.get('ADM_COMPANY')
    ADM_ROLE = os.environ.get('ADM_ROLE')
    
    # Configuración de sesión
    SESSION_COOKIE_SECURE = False  # True en producción con HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 28800  # 8 horas
    
    # Paginación
    ITEMS_PER_PAGE = 50  # Límite de ADM Cloud
    MAX_PRODUCTS_CACHE = 5000  # Máximo de productos en cache
    
    # Ubicación por defecto
    DEFAULT_LOCATION_NAME = "ADESA"
    
    # Whitelist de LocationID ADESA (GUIDs de ubicaciones ADESA físicas)
    # Obtener estos GUIDs desde ADM Cloud o SyncLocationStatus
    # PRIORIDAD 1: Detección por LocationID (más confiable)
    ADESA_LOCATION_IDS = [
        # Ejemplo: "guid-ubicacion-adesa-principal",
        # Agregar más según necesidad desde ADM Cloud
    ]
    
    # Fallback: Palabras clave para detectar ADESA por nombre
    # PRIORIDAD 2: Detección por nombre (fallback)
    ADESA_LOCATION_NAME_KEYWORDS = ["ADESA"]
    
    # Token para cron de auto-sincronización (X-CRON-TOKEN header)
    CRON_TOKEN = os.environ.get('CRON_TOKEN')
    
    # Feature flags - Módulo usuarios y seguridad (OFF = comportamiento actual)
    FEATURE_MUST_CHANGE_PASSWORD = os.environ.get('FEATURE_MUST_CHANGE_PASSWORD', 'false').lower() == 'true'
    FEATURE_AUDIT_LOG = os.environ.get('FEATURE_AUDIT_LOG', 'false').lower() == 'true'
    FEATURE_RATE_LIMIT_LOGIN = os.environ.get('FEATURE_RATE_LIMIT_LOGIN', 'false').lower() == 'true'

    # Abastecimiento (mín/máx por ubicación ADM). GUID preferido; si vacío se resuelve por nombre.
    ABASTECIMIENTO_LOCATION_ID = os.environ.get('ABASTECIMIENTO_LOCATION_ID', '').strip()
    ABASTECIMIENTO_LOCATION_NAME = os.environ.get('ABASTECIMIENTO_LOCATION_NAME', 'Mirador Sur').strip()

    # Umbrales para detección de discrepancias
    DISCREPANCIAS_UMBRALES = {
        'critico': {
            'cambio_porcentual': 500,  # >500%
            'cambio_absoluto': 100     # >100 unidades
        },
        'alto': {
            'cambio_porcentual': 300,  # >300%
            'cambio_absoluto': 50      # >50 unidades
        }
    }

class DevelopmentConfig(Config):
    """Configuración para desarrollo"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Configuración para producción (CPanel)"""
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or Config.SECRET_KEY
    SESSION_COOKIE_SECURE = True

# Seleccionar configuración según entorno
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Retorna la configuración según el entorno"""
    import logging
    _logger = logging.getLogger(__name__)
    env = os.environ.get('FLASK_ENV', 'development')
    cfg = config.get(env, config['default'])
    if env == 'production':
        if not os.environ.get('ADM_EMAIL') or not os.environ.get('ADM_PASSWORD'):
            _logger.warning("SEGURIDAD: ADM_EMAIL/ADM_PASSWORD no definidas en variables de entorno. Usando fallbacks de desarrollo.")
        if not os.environ.get('SECRET_KEY'):
            _logger.warning("SEGURIDAD: SECRET_KEY no definida en variables de entorno. Usando fallback inseguro.")
    return cfg


