"""
Utilidades para limpieza de runs antiguos
"""
import logging
from datetime import datetime, timedelta
from database import db
from database.models import SyncRun, SyncLocationStatus, StockProductoADM

logger = logging.getLogger(__name__)


def limpiar_runs_antiguos(dias=7, mantener_ultimos=3):
    """
    Limpia runs antiguos preservando últimos N y current_run_id
    
    Args:
        dias: Días de antigüedad para eliminar (default: 7)
        mantener_ultimos: Cantidad de runs a mantener por ubicación (default: 3)
    
    Returns:
        Número de runs eliminados
    """
    fecha_limite = datetime.utcnow() - timedelta(days=dias)
    
    # Obtener current_run_id por ubicación (NO eliminar estos)
    current_runs = set(
        db.session.query(SyncLocationStatus.current_run_id)
        .filter(SyncLocationStatus.current_run_id.isnot(None))
        .scalar_all()
    )
    
    # Por cada ubicación, mantener últimos N runs
    ubicaciones = db.session.query(SyncRun.location_id).distinct().all()
    total_eliminados = 0
    
    for (location_id,) in ubicaciones:
        # Obtener últimos N runs (ordenados por finished_at DESC)
        ultimos_runs = SyncRun.query.filter_by(
            location_id=location_id
        ).filter(
            SyncRun.finished_at.isnot(None)
        ).order_by(SyncRun.finished_at.desc()).limit(mantener_ultimos).all()
        
        run_ids_preservar = {r.run_id for r in ultimos_runs} | current_runs
        
        # Eliminar runs antiguos que no están en preservar
        runs_a_eliminar = SyncRun.query.filter(
            SyncRun.location_id == location_id,
            SyncRun.finished_at < fecha_limite,
            ~SyncRun.run_id.in_(run_ids_preservar) if run_ids_preservar else True
        ).all()
        
        for run in runs_a_eliminar:
            # Eliminar registros de stock asociados
            registros_eliminados = StockProductoADM.query.filter_by(
                sync_run_id=run.run_id
            ).delete()
            
            # Eliminar run
            db.session.delete(run)
            total_eliminados += 1
            
            logger.info(f"Eliminado run {run.run_id} de {run.location_name} "
                       f"(registros stock: {registros_eliminados})")
    
    db.session.commit()
    logger.info(f"Limpieza completada: {total_eliminados} runs eliminados")
    return total_eliminados



