#!/usr/bin/env python3
"""
Runner de sincronización WMS - ejecutable por cron (sin HTTP).
Modos: --auto (tick + sync) o --location-id <id> (pruebas).
Logs: /home2/adesa/wms.adesa.com.do/logs/Sync-wms/
"""
import sys
import os
import argparse
import logging
from datetime import datetime

# Bootstrap: rutas absolutas compatibles con passenger_wsgi.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
VENV_PATH = '/home2/adesa/virtualenv/wms.adesa.com.do/3.11'
LOG_DIR = '/home2/adesa/wms.adesa.com.do/logs/Sync-wms'

# Path y venv
if os.path.exists(VENV_PATH):
    site_packages = os.path.join(VENV_PATH, 'lib', 'python3.11', 'site-packages')
    if os.path.exists(site_packages) and site_packages not in sys.path:
        sys.path.insert(0, site_packages)
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)
os.chdir(PROJECT_DIR)

# Cargar .env si existe (para variables en cron)
try:
    from dotenv import load_dotenv
    env_path = os.path.join(PROJECT_DIR, '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
except ImportError:
    pass

# Configurar logging ANTES de importar app
os.makedirs(LOG_DIR, exist_ok=True)
log_file = os.path.join(LOG_DIR, f"run_sync_{datetime.utcnow().strftime('%Y%m%d')}.log")
file_handler = logging.FileHandler(log_file, encoding='utf-8')
file_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s %(message)s'))
logging.basicConfig(level=logging.INFO, handlers=[file_handler, logging.StreamHandler(sys.stderr)])
logger = logging.getLogger('run_sync')


def main():
    parser = argparse.ArgumentParser(description='WMS Sync Runner (cron, sin HTTP)')
    parser.add_argument('--auto', action='store_true', help='Modo automático: tick + pick next + sync')
    parser.add_argument('--location-id', type=str, help='Forzar ubicación (para pruebas)')
    args = parser.parse_args()

    if not args.auto and not args.location_id:
        logger.error("Usar --auto o --location-id <id>")
        sys.exit(1)

    # Importar app y módulos (después del bootstrap)
    try:
        from app_wms import app
        from database import db
        from routes.sincronizar import run_sync_ubicacion, run_tick_internal
    except Exception as e:
        logger.error(f"Error al importar app: {e}", exc_info=True)
        sys.exit(1)

    location_id = None
    triggered_by = 'cron_script'

    with app.app_context():
        try:
            if args.auto:
                logger.info(f"[{triggered_by}] run_tick_internal...")
                tick_result = run_tick_internal()
                status = tick_result.get('status', '')
                logger.info(f"[{triggered_by}] tick status={status}")

                if status == 'busy':
                    logger.info(f"[{triggered_by}] Nada que hacer (busy)")
                    sys.exit(0)
                if status == 'idle':
                    logger.info(f"[{triggered_by}] Todas las ubicaciones al día (idle)")
                    sys.exit(0)
                if status == 'error':
                    logger.error(f"[{triggered_by}] Tick error: {tick_result.get('error', '')}")
                    sys.exit(1)

                location_id = tick_result.get('location_id')
                location_name = tick_result.get('location_name', '')
                if not location_id:
                    logger.warning(f"[{triggered_by}] Tick ready pero sin location_id")
                    sys.exit(0)
                logger.info(f"[{triggered_by}] Sincronizando: {location_name} ({location_id})")
            else:
                location_id = args.location_id
                logger.info(f"[{triggered_by}] Modo prueba: location_id={location_id}")

            result = run_sync_ubicacion(location_id, triggered_by=triggered_by)
            result.pop('_http_status', None)

            if result.get('success'):
                logger.info(f"[{triggered_by}] Sync OK: {result.get('message', '')}")
                sys.exit(0)
            else:
                logger.error(f"[{triggered_by}] Sync fallida: {result.get('error', '')}")
                sys.exit(1)
        except Exception as e:
            logger.error(f"[{triggered_by}] Error: {e}", exc_info=True)
            sys.exit(1)
        finally:
            try:
                db.session.remove()
            except Exception as e2:
                logger.warning(f"Error en db.session.remove: {e2}")


if __name__ == '__main__':
    main()
