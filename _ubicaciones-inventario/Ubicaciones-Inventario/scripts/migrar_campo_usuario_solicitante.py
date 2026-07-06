"""
Script de migración para agregar campo usuario_solicitante
a las tablas facturas_procesadas y transferencias_procesadas
"""
from app_wms import app
from database import db
from sqlalchemy import text

def migrar_campo_usuario_solicitante():
    with app.app_context():
        try:
            print("=" * 60)
            print("MIGRACION: Campo usuario_solicitante")
            print("=" * 60)

            # Verificar y agregar campo en facturas_procesadas
            print("\n[1] Verificando tabla facturas_procesadas...")
            inspector = db.inspect(db.engine)
            columns = [col['name'] for col in inspector.get_columns('facturas_procesadas')]

            if 'usuario_solicitante' not in columns:
                print("[*] Agregando columna 'usuario_solicitante' a facturas_procesadas...")
                db.session.execute(text("""
                    ALTER TABLE facturas_procesadas 
                    ADD COLUMN usuario_solicitante INTEGER 
                    REFERENCES usuarios(id)
                """))
                print("[OK] Columna 'usuario_solicitante' agregada a facturas_procesadas")
            else:
                print("[OK] Columna 'usuario_solicitante' ya existe en facturas_procesadas")

            # Verificar y agregar campo en transferencias_procesadas
            print("\n[2] Verificando tabla transferencias_procesadas...")
            columns = [col['name'] for col in inspector.get_columns('transferencias_procesadas')]

            if 'usuario_solicitante' not in columns:
                print("[*] Agregando columna 'usuario_solicitante' a transferencias_procesadas...")
                db.session.execute(text("""
                    ALTER TABLE transferencias_procesadas 
                    ADD COLUMN usuario_solicitante INTEGER 
                    REFERENCES usuarios(id)
                """))
                print("[OK] Columna 'usuario_solicitante' agregada a transferencias_procesadas")
            else:
                print("[OK] Columna 'usuario_solicitante' ya existe en transferencias_procesadas")

            db.session.commit()
            print("\n" + "=" * 60)
            print("MIGRACION COMPLETADA")
            print("=" * 60)

        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error durante la migración: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == '__main__':
    migrar_campo_usuario_solicitante()




