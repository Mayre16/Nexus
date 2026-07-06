"""
Script para migrar datos de SQLite a MySQL/MariaDB
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

def migrar_datos():
    """Migra todos los datos de SQLite a MySQL"""
    
    with app.app_context():
        print("=" * 80)
        print("🔄 MIGRACIÓN DE SQLITE A MYSQL")
        print("=" * 80)
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
        
        # Ruta al archivo SQLite original
        sqlite_path = BASE_DIR / 'database' / 'wms.db'
        
        if not sqlite_path.exists():
            print(f"⚠️  No se encontró archivo SQLite en: {sqlite_path}")
            print("   Continuando solo con creación de tablas en MySQL...")
            print()
        else:
            print(f"📂 Archivo SQLite encontrado: {sqlite_path}")
            print()
            
            # Conectar a SQLite
            sqlite_conn = sqlite3.connect(str(sqlite_path))
            sqlite_conn.row_factory = sqlite3.Row
            sqlite_cursor = sqlite_conn.cursor()
            
            try:
                # 1. Migrar Usuarios
                print("👥 Migrando usuarios...")
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
                print()
                
                # 2. Migrar Productos ADM
                print("📦 Migrando productos ADM...")
                productos_sqlite = sqlite_cursor.execute("SELECT * FROM productos_adm").fetchall()
                for row in productos_sqlite:
                    producto = ProductoADM.query.filter_by(item_id=row['item_id']).first()
                    if not producto:
                        producto = ProductoADM(
                            item_id=row['item_id'],
                            sku=row['sku'],
                            nombre=row['nombre'],
                            codigo_barras=row['codigo_barras'] if row['codigo_barras'] else None,
                            updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.utcnow()
                        )
                        db.session.add(producto)
                db.session.commit()
                print(f"   ✅ {len(productos_sqlite)} productos migrados")
                print()
                
                # 3. Migrar Sync Runs PRIMERO (necesario para foreign key de stock)
                print("📜 Migrando historial de sincronizaciones (PRIMERO para foreign keys)...")
                try:
                    sync_runs_sqlite = sqlite_cursor.execute("SELECT * FROM sync_runs").fetchall()
                    for row in sync_runs_sqlite:
                        run = SyncRun.query.filter_by(run_id=row['run_id']).first()
                        if not run:
                            # Obtener valores de forma segura (sqlite3.Row no tiene .get())
                            keys = row.keys()
                            run = SyncRun(
                                run_id=row['run_id'],
                                location_id=row['location_id'],
                                location_name=row['location_name'],
                                started_at=datetime.fromisoformat(row['started_at']) if 'started_at' in keys and row['started_at'] else datetime.utcnow(),
                                finished_at=datetime.fromisoformat(row['finished_at']) if 'finished_at' in keys and row['finished_at'] else None,
                                status=row['status'],
                                total_items_processed=row['total_items_processed'] if 'total_items_processed' in keys and row['total_items_processed'] is not None else 0,
                                total_items_adm=row['total_items_adm'] if 'total_items_adm' in keys and row['total_items_adm'] is not None else 0,
                                requests_made=row['requests_made'] if 'requests_made' in keys and row['requests_made'] is not None else 0,
                                error_message=row['error_message'] if 'error_message' in keys and row['error_message'] else None,
                                is_full_sync=bool(row['is_full_sync']) if 'is_full_sync' in keys and row['is_full_sync'] is not None else False
                            )
                            db.session.add(run)
                    db.session.commit()
                    print(f"   ✅ {len(sync_runs_sqlite)} runs de sincronización migrados")
                except sqlite3.OperationalError as e:
                    if "no such table" in str(e).lower():
                        print("   ⚠️  Tabla sync_runs no existe en SQLite (normal si es instalación nueva)")
                    else:
                        raise
                print()
                
                # 4. Migrar Stock Productos ADM (DESPUÉS de sync_runs)
                print("📊 Migrando stock productos ADM...")
                stock_sqlite = sqlite_cursor.execute("SELECT * FROM stock_productos_adm").fetchall()
                contador = 0
                for row in stock_sqlite:
                    # Verificar si existe producto
                    producto = ProductoADM.query.filter_by(id=row['producto_id']).first()
                    if not producto:
                        print(f"   ⚠️  Producto ID {row['producto_id']} no encontrado, saltando stock...")
                        continue
                    
                    # Obtener sync_run_id de forma segura (sqlite3.Row no tiene .get())
                    keys = row.keys()
                    sync_run_id_val = row['sync_run_id'] if 'sync_run_id' in keys and row['sync_run_id'] is not None else None
                    
                    # Si hay sync_run_id, verificar que existe en sync_runs
                    if sync_run_id_val:
                        run_existe = SyncRun.query.filter_by(run_id=sync_run_id_val).first()
                        if not run_existe:
                            print(f"   ⚠️  SyncRun {sync_run_id_val} no existe, usando NULL para este registro...")
                            sync_run_id_val = None
                    
                    stock = StockProductoADM.query.filter_by(
                        producto_id=row['producto_id'],
                        location_id=row['location_id'],
                        sync_run_id=sync_run_id_val
                    ).first()
                    
                    if not stock:
                        stock = StockProductoADM(
                            producto_id=row['producto_id'],
                            location_id=row['location_id'],
                            location_name=row['location_name'],
                            stock=float(row['stock']) if row['stock'] else 0.0,
                            sync_run_id=sync_run_id_val,
                            updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.utcnow()
                        )
                        db.session.add(stock)
                        contador += 1
                        
                        # Commit cada 1000 registros
                        if contador % 1000 == 0:
                            db.session.commit()
                            print(f"   Procesados {contador} registros...")
                
                db.session.commit()
                print(f"   ✅ {contador} registros de stock migrados")
                print()
                
                # 5. Migrar Stock Ubicación (WMS físico)
                print("📍 Migrando stock ubicación (WMS físico)...")
                stock_ubic_sqlite = sqlite_cursor.execute("SELECT * FROM stock_por_ubicacion").fetchall()
                for row in stock_ubic_sqlite:
                    stock_ubic = StockUbicacion.query.filter_by(
                        product_id=row['product_id'],
                        ubicacion=row['ubicacion']
                    ).first()
                    if not stock_ubic:
                        stock_ubic = StockUbicacion(
                            product_id=row['product_id'],
                            sku=row['sku'],
                            ubicacion=row['ubicacion'],
                            cantidad=float(row['cantidad']) if row['cantidad'] else 0.0,
                            updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.utcnow()
                        )
                        db.session.add(stock_ubic)
                db.session.commit()
                print(f"   ✅ {len(stock_ubic_sqlite)} registros de stock físico migrados")
                print()
                
                # 6. Migrar Sync Location Status
                print("🔄 Migrando estado de sincronización...")
                sync_status_sqlite = sqlite_cursor.execute("SELECT * FROM sync_locations_status").fetchall()
                for row in sync_status_sqlite:
                    status = SyncLocationStatus.query.filter_by(location_id=row['location_id']).first()
                    if not status:
                        # Obtener valores de forma segura (sqlite3.Row no tiene .get())
                        keys = row.keys()
                        status = SyncLocationStatus(
                            location_id=row['location_id'],
                            location_name=row['location_name'],
                            status=row['status'],
                            last_sync_at=datetime.fromisoformat(row['last_sync_at']) if 'last_sync_at' in keys and row['last_sync_at'] else None,
                            last_error=row['last_error'] if 'last_error' in keys and row['last_error'] else None,
                            items_synced=row['items_synced'] if 'items_synced' in keys and row['items_synced'] is not None else 0,
                            total_items=row['total_items'] if 'total_items' in keys and row['total_items'] is not None else 0,
                            skip_actual=row['skip_actual'] if 'skip_actual' in keys and row['skip_actual'] is not None else 0,
                            lote_actual=row['lote_actual'] if 'lote_actual' in keys and row['lote_actual'] is not None else 0,
                            current_run_id=row['current_run_id'] if 'current_run_id' in keys and row['current_run_id'] else None,
                            running_run_id=row['running_run_id'] if 'running_run_id' in keys and row['running_run_id'] else None
                        )
                        db.session.add(status)
                db.session.commit()
                print(f"   ✅ {len(sync_status_sqlite)} estados de sincronización migrados")
                print()
                
                # 7. Migrar En Revision
                print("⚠️  Migrando discrepancias en revisión...")
                try:
                    en_revision_sqlite = sqlite_cursor.execute("SELECT * FROM en_revision").fetchall()
                    for row in en_revision_sqlite:
                        revision = EnRevision.query.filter_by(id=row['id']).first()
                        if not revision:
                            # Obtener valores de forma segura (sqlite3.Row no tiene .get())
                            keys = row.keys()
                            revision = EnRevision(
                                producto_id=row['producto_id'],
                                sku=row['sku'],
                                location_id=row['location_id'],
                                location_name=row['location_name'],
                                motivo=row['motivo'],
                                tipo=row['tipo'],
                                severidad=row['severidad'],
                                estado=row['estado'],
                                stock_old=float(row['stock_old']) if 'stock_old' in keys and row['stock_old'] else None,
                                stock_new=float(row['stock_new']) if 'stock_new' in keys and row['stock_new'] else None,
                                stock_fisico=float(row['stock_fisico']) if 'stock_fisico' in keys and row['stock_fisico'] else None,
                                run_detectado=row['run_detectado'],
                                veces_detectado=row['veces_detectado'] if 'veces_detectado' in keys and row['veces_detectado'] is not None else 1,
                                fecha_deteccion=datetime.fromisoformat(row['fecha_deteccion']) if 'fecha_deteccion' in keys and row['fecha_deteccion'] else datetime.utcnow(),
                                fecha_resolucion=datetime.fromisoformat(row['fecha_resolucion']) if 'fecha_resolucion' in keys and row['fecha_resolucion'] else None,
                                resuelto_por=row['resuelto_por'] if 'resuelto_por' in keys and row['resuelto_por'] else None,
                                notas=row['notas'] if 'notas' in keys and row['notas'] else None
                            )
                            db.session.add(revision)
                    db.session.commit()
                    print(f"   ✅ {len(en_revision_sqlite)} discrepancias migradas")
                except sqlite3.OperationalError as e:
                    if "no such table" in str(e).lower():
                        print("   ⚠️  Tabla en_revision no existe en SQLite (normal si es instalación nueva)")
                    else:
                        raise
                print()
                
                # 8. Migrar Ubicaciones Físicas (ya estaba antes, mantener orden)
                print("🏢 Migrando ubicaciones físicas...")
                try:
                    ubic_fisicas_sqlite = sqlite_cursor.execute("SELECT * FROM ubicaciones_fisicas").fetchall()
                    for row in ubic_fisicas_sqlite:
                        ubic = UbicacionFisica.query.filter_by(codigo=row['codigo']).first()
                        if not ubic:
                            # Obtener valores de forma segura (sqlite3.Row no tiene .get())
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
                except sqlite3.OperationalError as e:
                    if "no such table" in str(e).lower():
                        print("   ⚠️  Tabla ubicaciones_fisicas no existe en SQLite (normal si es instalación nueva)")
                    else:
                        raise
                print()
                
            finally:
                sqlite_conn.close()
        
        # Crear tablas en MySQL si no existen
        print("📋 Creando/verificando tablas en MySQL...")
        db.create_all()
        print("   ✅ Tablas verificadas/creadas")
        print()
        
        # Verificar configuración de notificaciones
        print("📧 Verificando configuración de notificaciones...")
        try:
            config = NotificacionesConfig.get_config()
            print("   ✅ Configuración de notificaciones lista")
        except Exception as e:
            print(f"   ⚠️  Error al verificar notificaciones: {e}")
        print()
        
        print("=" * 80)
        print("✅ MIGRACIÓN COMPLETADA")
        print("=" * 80)
        print()
        print("📝 Próximos pasos:")
        print("   1. Verificar que todas las tablas se crearon correctamente")
        print("   2. Probar una sincronización pequeña")
        print("   3. Verificar que los datos se guardan correctamente")
        print()
        
        return True

if __name__ == "__main__":
    try:
        migrar_datos()
    except Exception as e:
        print(f"\n❌ ERROR durante la migración: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

