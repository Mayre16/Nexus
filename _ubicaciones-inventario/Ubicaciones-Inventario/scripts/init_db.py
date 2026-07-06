"""
Script para inicializar la base de datos
Ejecutar desde raíz: python scripts/init_db.py
"""
from app_wms import app
from database import db
from database.models import Usuario, StockUbicacion, Movimiento, FacturaProcesada, PendienteUbicacion, ProductoADM, StockProductoADM, TransferenciaProcesada, RecepcionProcesada, MapeoUbicacionADM_WMS
import bcrypt

def init_database():
    """Inicializa la base de datos con tablas y usuario por defecto"""
    with app.app_context():
        # Crear todas las tablas
        print("Creando tablas...")
        db.create_all()
        print("✓ Tablas creadas")
        
        # Crear usuario administrador por defecto
        admin = Usuario.query.filter_by(email='admin@wms.local').first()
        if not admin:
            password_hash = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            admin = Usuario(
                nombre='Administrador',
                email='admin@wms.local',
                password_hash=password_hash,
                rol='administrador',
                activo=True
            )
            db.session.add(admin)
            db.session.commit()
            print("✓ Usuario administrador creado")
            print("  Email: admin@wms.local")
            print("  Contraseña: admin123")
        else:
            print("✓ Usuario administrador ya existe")
        
        print("\nBase de datos inicializada correctamente!")
        print("\nPara empezar a usar el sistema:")
        print("1. Inicia el servidor: python app_wms.py")
        print("2. Accede a: http://localhost:5000")
        print("3. Inicia sesión con: admin@wms.local / admin123")

if __name__ == '__main__':
    init_database()

