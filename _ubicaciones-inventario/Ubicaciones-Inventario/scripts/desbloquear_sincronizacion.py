"""
Script para desbloquear sincronización de ubicaciones
Funciona con SQLite y MySQL/MariaDB

Ejecutar: python desbloquear_sincronizacion.py
"""
from app_wms import app
from database.models import SyncLocationStatus
from database import db

def desbloquear_sincronizaciones():
    """Desbloquea todas las ubicaciones que quedaron en estado 'running'"""
    with app.app_context():
        try:
            # Buscar todas las ubicaciones bloqueadas
            bloqueadas = SyncLocationStatus.query.filter_by(status='running').all()
            
            if not bloqueadas:
                print("✅ No hay ubicaciones bloqueadas (status='running')")
                return
            
            print(f"🔍 Encontradas {len(bloqueadas)} ubicación(es) bloqueada(s):")
            for loc in bloqueadas:
                print(f"   - {loc.location_name} (ID: {loc.location_id})")
            
            # Desbloquear todas
            SyncLocationStatus.query.filter_by(status='running').update({
                'status': 'error',
                'last_error': 'Proceso interrumpido - reiniciar manualmente'
            })
            
            db.session.commit()
            print("\n✅ Ubicaciones desbloqueadas correctamente")
            print("   Estado cambiado de 'running' a 'error'")
            print("\n📌 Ahora puedes recargar el Panel Admin y sincronizar nuevamente")
            
        except Exception as e:
            print(f"❌ Error al desbloquear: {e}")
            db.session.rollback()

if __name__ == '__main__':
    print("=" * 50)
    print("Desbloquear Sincronización de Ubicaciones")
    print("=" * 50)
    desbloquear_sincronizaciones()








