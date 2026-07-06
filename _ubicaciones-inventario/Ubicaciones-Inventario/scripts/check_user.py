from app_wms import app
from database.models import Usuario

with app.app_context():
    target_email = "luis.useche@adesa.com.do"
    user = Usuario.query.filter_by(email=target_email).first()
    
    print(f"--- USER CHECK FOR {target_email} ---")
    if user:
        print(f"User found: ID={user.id}, Nombre={user.nombre}, Email={user.email}, Activo={user.activo}, Rol={user.rol}")
    else:
        print("User NOT found.")
        
    print("\n--- ALL USERS ---")
    users = Usuario.query.all()
    for u in users:
        print(f"ID={u.id}, Email={u.email}, Rol={u.rol}, Activo={u.activo}")
