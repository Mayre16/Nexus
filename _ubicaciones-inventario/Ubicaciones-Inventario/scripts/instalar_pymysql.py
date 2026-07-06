"""
Script para instalar PyMySQL y verificar conexión a MySQL
Ejecutar desde cPanel: Execute python script -> instalar_pymysql.py
"""
import subprocess
import sys
import os

print("=" * 80)
print("🔧 INSTALACIÓN DE PyMySQL Y VERIFICACIÓN DE MYSQL")
print("=" * 80)
print()

# Paso 1: Instalar PyMySQL
print("📦 Paso 1: Instalando PyMySQL...")
try:
    # Intentar importar primero para ver si ya está instalado
    import pymysql
    print("   ✅ PyMySQL ya está instalado (versión: {})".format(pymysql.__version__))
except ImportError:
    print("   ⚠️  PyMySQL no está instalado, instalando...")
    try:
        # Instalar usando pip
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pymysql"], 
                             stdout=subprocess.PIPE, 
                             stderr=subprocess.PIPE)
        print("   ✅ PyMySQL instalado exitosamente")
        
        # Verificar instalación
        import pymysql
        print("   ✅ Versión instalada: {}".format(pymysql.__version__))
    except subprocess.CalledProcessError as e:
        print("   ❌ Error al instalar PyMySQL:")
        print("   {}".format(e))
        print()
        print("   💡 Intenta ejecutar manualmente desde Terminal (si tienes acceso):")
        print("   pip install pymysql")
        sys.exit(1)
    except Exception as e:
        print("   ❌ Error inesperado: {}".format(e))
        sys.exit(1)

print()

# Paso 2: Verificar variable de entorno DATABASE_URL
print("🔍 Paso 2: Verificando configuración...")
database_url = os.environ.get('DATABASE_URL', '')

if not database_url:
    print("   ❌ ERROR: DATABASE_URL no está configurada en variables de entorno")
    print("   💡 Ve a Setup Python App -> Environment Variables y agrega:")
    print("   DATABASE_URL=mysql+pymysql://adesa_wms_user:CONTRASEÑA@localhost/adesa_wms_adesa?charset=utf8mb4")
    sys.exit(1)

if 'mysql' not in database_url.lower() and 'mariadb' not in database_url.lower():
    print("   ⚠️  ADVERTENCIA: DATABASE_URL no parece ser MySQL/MariaDB")
    print("   URI actual: {}...".format(database_url[:50]))
else:
    print("   ✅ DATABASE_URL configurada correctamente")
    # Ocultar contraseña al mostrar
    if '@' in database_url:
        partes = database_url.split('@')
        if '://' in partes[0]:
            usuario_part = partes[0].split('://')[1]
            if ':' in usuario_part:
                usuario = usuario_part.split(':')[0]
                print("   📋 Usuario: {}".format(usuario))
        if '/' in partes[1]:
            bd = partes[1].split('/')[1].split('?')[0]
            print("   📋 Base de datos: {}".format(bd))

print()

# Paso 3: Probar conexión a MySQL
print("🔌 Paso 3: Probando conexión a MySQL...")
try:
    import pymysql
    
    # Extraer información de conexión de DATABASE_URL
    # Formato: mysql+pymysql://usuario:contraseña@host/base_de_datos?charset=utf8mb4
    if 'mysql+pymysql://' in database_url:
        url_sin_prefijo = database_url.replace('mysql+pymysql://', '')
    elif 'mysql://' in database_url:
        url_sin_prefijo = database_url.replace('mysql://', '')
    else:
        url_sin_prefijo = database_url
    
    # Separar usuario:contraseña@host/base
    if '@' in url_sin_prefijo:
        credenciales, resto = url_sin_prefijo.split('@', 1)
        usuario, contraseña = credenciales.split(':', 1)
        
        if '/' in resto:
            host_bd = resto.split('/', 1)
            host = host_bd[0].split(':')[0]  # Remover puerto si existe
            bd_completa = host_bd[1].split('?')[0]  # Remover parámetros
            
            # Intentar conectar
            try:
                conexion = pymysql.connect(
                    host=host,
                    user=usuario,
                    password=contraseña,
                    database=bd_completa,
                    charset='utf8mb4',
                    connect_timeout=10
                )
                
                # Probar query simple
                cursor = conexion.cursor()
                cursor.execute("SELECT VERSION()")
                version = cursor.fetchone()
                cursor.execute("SELECT DATABASE()")
                bd_actual = cursor.fetchone()
                
                cursor.close()
                conexion.close()
                
                print("   ✅ Conexión exitosa a MySQL")
                print("   📋 Versión MySQL: {}".format(version[0]))
                print("   📋 Base de datos conectada: {}".format(bd_actual[0]))
                
            except pymysql.Error as e:
                print("   ❌ Error al conectar a MySQL:")
                print("   {}".format(e))
                print()
                print("   💡 Verifica:")
                print("   - Que el usuario y contraseña sean correctos")
                print("   - Que el usuario tenga privilegios en la base de datos")
                print("   - Que la base de datos exista")
                sys.exit(1)
        else:
            print("   ⚠️  No se pudo extraer información de la base de datos de DATABASE_URL")
    else:
        print("   ⚠️  DATABASE_URL no tiene el formato esperado")
        
except Exception as e:
    print("   ❌ Error inesperado al probar conexión:")
    print("   {}".format(e))
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Paso 4: Verificar archivos necesarios
print("📁 Paso 4: Verificando archivos necesarios...")
archivos_necesarios = [
    'config.py',
    'app_wms.py',
    'migrar_sqlite_a_mysql.py',
    'utils/db_helpers.py'
]

archivos_faltantes = []
for archivo in archivos_necesarios:
    if os.path.exists(archivo):
        print("   ✅ {}".format(archivo))
    else:
        print("   ❌ {} (FALTA)".format(archivo))
        archivos_faltantes.append(archivo)

if archivos_faltantes:
    print()
    print("   ⚠️  Archivos faltantes. Por favor sube:")
    for archivo in archivos_faltantes:
        print("   - {}".format(archivo))
else:
    print()
    print("   ✅ Todos los archivos necesarios están presentes")

print()
print("=" * 80)
print("✅ VERIFICACIÓN COMPLETA")
print("=" * 80)
print()

if not archivos_faltantes:
    print("📝 Próximos pasos:")
    print("   1. ✅ PyMySQL instalado")
    print("   2. ✅ Conexión a MySQL verificada")
    print("   3. ✅ Archivos necesarios presentes")
    print()
    print("   🚀 Ahora puedes ejecutar: migrar_sqlite_a_mysql.py")
else:
    print("⚠️  Pendiente:")
    print("   - Subir archivos faltantes antes de ejecutar la migración")

print()


