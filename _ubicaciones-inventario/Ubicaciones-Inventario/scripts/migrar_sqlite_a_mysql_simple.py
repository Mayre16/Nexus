"""
Script SIMPLIFICADO para migrar a MySQL - Solo estructura y datos esenciales
NO migra productos ni stock (se llenarán con sincronización)
Ejecutar UNA SOLA VEZ después de configurar MySQL en cPanel
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
import sqlite3
from datetime import datetime

def migrar_datos_simple():
    """Migra solo datos esenciales, deja productos/stock para sincronización"""
    
    with app.app_context():
        print("=" * 80)
        print("🔄 MIGRACIÓN SIMPLIFICADA: SQLITE → MYSQL")
        print("=" * 80)
        print()
        print("ℹ️  Este script migra solo:")
        print("   - Estructura de tablas (todas)")
        print("   - Usuarios (necesarios para login)")
        print("   - Ubicaciones físicas (si existen)")
        print("   - Configuración de notificaciones")
        print()
        print("⚠️  NO migra:")
        print("   - Productos ADM (se llenarán con sincronización)")
        print("   - Stock productos ADM (se llenará con sincronización)")
        print("   - Historial de sincronizaciones (empezará de cero)")
        print()
        
        # Verificar que estamos usando MySQL
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        if 'sqlite' in db_uri.lower():
            print("❌ ERROR: La aplicación aún está configurada para SQLite")
            print("   Por favor, configura DATABASE_URL en variables de entorno para MySQL")
            return False
        
        if 'mysql' not in db_uri.lower() and 'mariadb' not in db_uri.lower():
            print("❌ ERROR: DATABASE_URL no parece ser MySQL/MariaDB")
            print(f"   URI actual: {db_uri[:50]}...")
            return False
        
        print(f"✅ Conectado a: {db_uri.split('@')[1] if '@' in db_uri else 'MySQL'}")
        print()
        
        # Crear todas las tablas vacías
        print("📋 Paso 1: Creando estructura de tablas...")
        try:
            db.create_all()
            print("   ✅ Tablas creadas/verificadas")
        except Exception as e:
            print(f"   ❌ Error al crear tablas: {e}")
            return False
        print()
        
        # Ruta al archivo SQLite original
        sqlite_path = BASE_DIR / 'database' / 'wms.db'
        
        if not sqlite_path.exists():
            print(f"⚠️  No se encontró archivo SQLite en: {sqlite_path}")
            print("   Continuando solo con creación de tablas...")
            print()
        else:
            print(f"📂 Archivo SQLite encontrado: {sqlite_path}")
            print()
            
            # Conectar a SQLite
            sqlite_conn = sqlite3.connect(str(sqlite_path))
            sqlite_conn.row_factory = sqlite3.Row
            sqlite_cursor = sqlite_conn.cursor()
            
            try:
                # 1. Migrar Usuarios (ESENCIAL para login)
                print("👥 Paso 2: Migrando usuarios...")
                try:
                    usuarios_sqlite = sqlite_cursor.execute("SELECT * FROM usuarios").fetchall()
                    for row in usuarios_sqlite:
                        usuario = Usuario.query.filter_by(email=row['email']).first()
                        if not usuario:
                            usuario = Usuario(
                                nombre=row['nombre'],
                                email=row['email'],
                                password_hash=row['password_hash'],
                                rol=row['rol'],
                                activo=bool(row['activo']),
                                created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.utcnow()
                            )
                            db.session.add(usuario)
                    db.session.commit()
                    print(f"   ✅ {len(usuarios_sqlite)} usuarios migrados")
                except sqlite3.OperationalError as e:
                    if "no such table" in str(e).lower():
                        print("   ⚠️  Tabla usuarios no existe en SQLite (normal si es instalación nueva)")
                    else:
                        raise
                except Exception as e:
                    print(f"   ⚠️  Error al migrar usuarios: {e}")
                    db.session.rollback()
                print()
                
                # 2. Migrar Ubicaciones Físicas (opcional, pero útil)
                print("🏢 Paso 3: Migrando ubicaciones físicas...")
                try:
                    ubic_fisicas_sqlite = sqlite_cursor.execute("SELECT * FROM ubicaciones_fisicas").fetchall()
                    if ubic_fisicas_sqlite:
                        for row in ubic_fisicas_sqlite:
                            ubic = UbicacionFisica.query.filter_by(codigo=row['codigo']).first()
                            if not ubic:
                                keys = row.keys()
                                ubic = UbicacionFisica(
                                    codigo=row['codigo'],
                                    nombre=row['nombre'],
                                    descripcion=row['descripcion'] if 'descripcion' in keys and row['descripcion'] else None,
                                    tipo=row['tipo'] if 'tipo' in keys and row['tipo'] else None,
                                    activa=bool(row['activa']) if 'activa' in keys and row['activa'] is not None else True,
                                    created_at=datetime.fromisoformat(row['created_at']) if 'created_at' in keys and row['created_at'] else datetime.utcnow()
                                )
                                db.session.add(ubic)
                        db.session.commit()
                        print(f"   ✅ {len(ubic_fisicas_sqlite)} ubicaciones físicas migradas")
                    else:
                        print("   ℹ️  No hay ubicaciones físicas para migrar")
                except sqlite3.OperationalError as e:
                    if "no such table" in str(e).lower():
                        print("   ⚠️  Tabla ubicaciones_fisicas no existe en SQLite (normal si es instalación nueva)")
                    else:
                        raise
                except Exception as e:
                    print(f"   ⚠️  Error al migrar ubicaciones físicas: {e}")
                    db.session.rollback()
                print()
                
            finally:
                sqlite_conn.close()
        
        # Crear configuración de notificaciones por defecto
        print("📧 Paso 4: Creando configuración de notificaciones...")
        try:
            config = NotificacionesConfig.get_config()
            print("   ✅ Configuración de notificaciones lista")
        except Exception as e:
            print(f"   ⚠️  Error al crear notificaciones: {e}")
        print()
        
        print("=" * 80)
        print("✅ MIGRACIÓN SIMPLIFICADA COMPLETADA")
        print("=" * 80)
        print()
        print("📝 Próximos pasos:")
        print("   1. ✅ Tablas creadas en MySQL")
        print("   2. ✅ Usuarios migrados (puedes hacer login)")
        print("   3. ⏭️  Sincronizar productos desde ADM Cloud:")
        print("      - Ir a Panel de Administración")
        print("      - Sincronizar Catálogo (para productos)")
        print("      - Sincronizar ubicaciones (para stock)")
        print()
        print("💡 Los productos y stock se llenarán automáticamente con la sincronización")
        print()
        
        return True

if __name__ == "__main__":
    try:
        migrar_datos_simple()
    except Exception as e:
        print(f"\n❌ ERROR durante la migración: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


