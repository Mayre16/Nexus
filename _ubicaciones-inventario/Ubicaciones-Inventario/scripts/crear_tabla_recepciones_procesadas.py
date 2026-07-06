"""
Script para crear la tabla recepciones_procesadas (RecepcionProcesada)
Ejecutar desde raíz: python scripts/crear_tabla_recepciones_procesadas.py
"""
from app_wms import app
from database import db
from database.models import RecepcionProcesada

def crear_tabla():
    with app.app_context():
        RecepcionProcesada.__table__.create(db.engine, checkfirst=True)
        print("✓ Tabla recepciones_procesadas creada o ya existe")

if __name__ == '__main__':
    crear_tabla()
