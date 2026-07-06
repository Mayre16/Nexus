from app_wms import app
from database import db
from database.models import Usuario
import bcrypt

with app.app_context():
    email = "luis.useche@adesa.com.do"
    password = "123456"
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    user = Usuario.query.filter_by(email=email).first()
    
    if user:
        print(f"Usuario existente encontrado: {user.nombre}")
        user.password_hash = password_hash
        user.activo = True
        action = "actualizado"
    else:
        print("Usuario no encontrado. Creando nuevo usuario...")
        user = Usuario(
            email=email,
            nombre="Luis Useche",
            password_hash=password_hash,
            rol="Administrador",
            activo=True
        )
        db.session.add(user)
        action = "creado"
        
    try:
        db.session.commit()
        print(f"EXITO: Usuario {email} {action} correctamente.")
        print(f"Nueva contraseña: {password}")
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: No se pudo actualizar el usuario. {e}")
