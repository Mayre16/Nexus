"""
Script para limpiar/reiniciar la base de datos MySQL
⚠️ ADVERTENCIA: Esto elimina TODOS los datos de la base de datos
Usar solo para pruebas o cuando quieras empezar de cero
"""
import os
import sys
from pathlib import Path

# Agregar el directorio del proyecto al path
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from app_wms import app
from database import db
from database.models import (
    Usuario, ProductoADM, StockProductoADM, StockUbicacion,
    SyncLocationStatus, SyncRun, EnRevision, UbicacionFisica,
    NotificacionesConfig
)

def limpiar_base_datos():
    """Elimina todas las tablas y las recrea vacías"""
    
    with app.app_context():
        print("=" * 80)
        print("⚠️  LIMPIEZA COMPLETA DE BASE DE DATOS")
        print("=" * 80)
        print()
        print("⚠️  ADVERTENCIA: Esto eliminará TODOS los datos de la base de datos")
        print()
        
        # Verificar que estamos usando MySQL (no SQLite en producción)
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        if 'sqlite' in db_uri.lower():
            print("❌ ERROR: No puedes limpiar SQLite desde este script")
            print("   Para SQLite, simplemente elimina el archivo database/wms.db")
            return False
        
        respuesta = input("¿Estás SEGURO de que quieres eliminar TODOS los datos? (escribe 'SI' para confirmar): ")
        
        if respuesta != 'SI':
            print("❌ Operación cancelada")
            return False
        
        print()
        print("🗑️  Eliminando todas las tablas...")
        
        try:
            # Eliminar todas las tablas
            db.drop_all()
            print("   ✅ Tablas eliminadas")
            
            print()
            print("📋 Creando tablas vacías...")
            
            # Crear todas las tablas vacías
            db.create_all()
            print("   ✅ Tablas creadas")
            
            print()
            print("📧 Creando configuración de notificaciones por defecto...")
            
            # Crear configuración de notificaciones por defecto
            config = NotificacionesConfig(
                email_discrepancias_activo=True,
                email_estado_sync_activo=True,
                email_destinatario=None
            )
            db.session.add(config)
            db.session.commit()
            print("   ✅ Configuración de notificaciones creada")
            
            print()
            print("=" * 80)
            print("✅ BASE DE DATOS LIMPIADA Y REINICIADA")
            print("=" * 80)
            print()
            print("📝 La base de datos está ahora vacía y lista para usar")
            print("   Puedes ejecutar migrar_sqlite_a_mysql.py nuevamente si necesitas migrar datos")
            print()
            
            return True
            
        except Exception as e:
            print(f"❌ ERROR al limpiar base de datos: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return False

if __name__ == "__main__":
    try:
        limpiar_base_datos()
    except KeyboardInterrupt:
        print("\n\n❌ Operación cancelada por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


