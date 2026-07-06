"""
Script para cambiar la contraseña de un usuario
Uso: python cambiar_password.py
"""
from app_wms import app
from database import db
from database.models import Usuario
import bcrypt
import getpass

def cambiar_password():
    """Cambia la contraseña de un usuario"""
    with app.app_context():
        print("=" * 60)
        print("CAMBIO DE CONTRASEÑA - WMS")
        print("=" * 60)
        print()
        
        # Pedir email del usuario
        email = input("Email del usuario: ").strip().lower()
        
        if not email:
            print("❌ Error: El email no puede estar vacío")
            return
        
        # Buscar usuario
        usuario = Usuario.query.filter_by(email=email).first()
        
        if not usuario:
            print(f"❌ Error: Usuario con email '{email}' no encontrado")
            return
        
        print(f"✓ Usuario encontrado: {usuario.nombre} ({usuario.email})")
        print(f"  Rol: {usuario.rol}")
        print()
        
        # Pedir nueva contraseña
        nueva_password = getpass.getpass("Nueva contraseña: ")
        
        if not nueva_password:
            print("❌ Error: La contraseña no puede estar vacía")
            return
        
        confirmar = getpass.getpass("Confirmar contraseña: ")
        
        if nueva_password != confirmar:
            print("❌ Error: Las contraseñas no coinciden")
            return
        
        if len(nueva_password) < 6:
            print("⚠️  Advertencia: La contraseña tiene menos de 6 caracteres")
            respuesta = input("¿Continuar de todas formas? (s/n): ").strip().lower()
            if respuesta != 's':
                print("❌ Operación cancelada")
                return
        
        # Hashear nueva contraseña
        password_hash = bcrypt.hashpw(nueva_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Actualizar contraseña
        usuario.password_hash = password_hash
        db.session.commit()
        
        print()
        print("=" * 60)
        print("✅ CONTRASEÑA ACTUALIZADA EXITOSAMENTE")
        print("=" * 60)
        print(f"Usuario: {usuario.nombre} ({usuario.email})")
        print("La nueva contraseña ya está activa")
        print()

if __name__ == '__main__':
    cambiar_password()







