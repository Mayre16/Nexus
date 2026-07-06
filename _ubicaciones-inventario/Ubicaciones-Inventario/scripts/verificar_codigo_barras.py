"""
Script para verificar que campos de codigo de barras vienen de ADM Cloud
Ejecutar desde: Execute python script en cPanel
"""
import sys
import io

# Configurar encoding UTF-8 de forma segura
# Solo si stdout/stderr no están ya configurados
if hasattr(sys.stdout, 'buffer'):
    try:
        # Verificar si ya es un TextIOWrapper
        if not isinstance(sys.stdout, io.TextIOWrapper):
            original_stdout = sys.stdout
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    except (AttributeError, ValueError, OSError):
        pass

if hasattr(sys.stderr, 'buffer'):
    try:
        if not isinstance(sys.stderr, io.TextIOWrapper):
            original_stderr = sys.stderr
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except (AttributeError, ValueError, OSError):
        pass

# Ahora importar app_wms
from app_wms import app
from database import db
from database.models import ProductoADM
from api.adm_cloud import ADMCloudClient
from config import get_config
import json

def verificar_codigo_barras():
    """Verifica que campos de codigo de barras vienen de ADM Cloud"""
    with app.app_context():
        config = get_config()
        adm_client = ADMCloudClient(
            api_base=config.ADM_API_BASE,
            email=config.ADM_EMAIL,
            password=config.ADM_PASSWORD,
            appid=config.ADM_APPID,
            company=config.ADM_COMPANY,
            role=config.ADM_ROLE
        )
        
        print("=" * 60)
        print("VERIFICACION DE CODIGOS DE BARRAS DESDE ADM CLOUD")
        print("=" * 60)
        
        # Obtener algunos productos desde ADM Cloud
        print("\n1. Obteniendo productos desde ADM Cloud (primeros 10)...")
        try:
            # Usar _make_request directamente para obtener items
            result = adm_client._make_request("items/", {"skip": 0, "take": 10})
            if not result.get("success"):
                print(f"[ERROR] Error al obtener productos: {result.get('error')}")
                return
            
            items = result.get("data", [])
            print(f"[OK] Recibidos {len(items)} productos\n")
            
            # Analizar campos de cada producto
            campos_barcode_encontrados = set()
            productos_con_barcode = 0
            productos_sin_barcode = 0
            
            print("2. Analizando campos de codigo de barras:\n")
            print("-" * 60)
            
            for idx, item in enumerate(items[:5], 1):  # Solo primeros 5 para no saturar
                item_id = item.get("ID", "N/A")
                sku = item.get("SKU") or item.get("ItemSKU", "N/A")
                nombre = item.get("Name", "N/A")
                if len(nombre) > 50:
                    nombre = nombre[:50]
                
                # Buscar todos los campos que podrian ser codigo de barras
                posibles_campos = {}
                for key in item.keys():
                    key_lower = key.lower()
                    if 'barcode' in key_lower or 'codigo' in key_lower or 'barra' in key_lower:
                        posibles_campos[key] = item[key]
                        campos_barcode_encontrados.add(key)
                
                print(f"\nProducto {idx}:")
                print(f"  SKU: {sku}")
                print(f"  Nombre: {nombre}")
                print(f"  ItemID: {item_id}")
                
                if posibles_campos:
                    productos_con_barcode += 1
                    print(f"  [OK] CAMPOS DE CODIGO DE BARRAS ENCONTRADOS:")
                    for campo, valor in posibles_campos.items():
                        print(f"     - {campo}: {valor}")
                else:
                    productos_sin_barcode += 1
                    print(f"  [X] NO se encontraron campos de codigo de barras")
                    print(f"  [INFO] Algunos campos disponibles:")
                    # Mostrar algunos campos clave para referencia
                    campos_clave = ["ID", "SKU", "ItemSKU", "Name", "Barcode", "BarcodeValue", "BarCode", "Activo"]
                    for campo_clave in campos_clave:
                        if campo_clave in item:
                            valor = item[campo_clave]
                            if isinstance(valor, str) and len(valor) > 50:
                                valor = valor[:50] + "..."
                            print(f"     - {campo_clave}: {valor}")
            
            print("\n" + "=" * 60)
            print("RESUMEN:")
            print(f"  - Productos con codigo de barras: {productos_con_barcode}")
            print(f"  - Productos sin codigo de barras: {productos_sin_barcode}")
            campos_str = ', '.join(campos_barcode_encontrados) if campos_barcode_encontrados else 'NINGUNO'
            print(f"  - Campos encontrados con 'barcode': {campos_str}")
            
            # Verificar en base de datos local
            print("\n3. Verificando en base de datos local:\n")
            productos_db_con_barcode = ProductoADM.query.filter(ProductoADM.codigo_barras.isnot(None)).count()
            productos_db_sin_barcode = ProductoADM.query.filter(ProductoADM.codigo_barras.is_(None)).count()
            productos_db_total = ProductoADM.query.count()
            
            print(f"  - Total productos en BD: {productos_db_total}")
            print(f"  - Productos CON codigo de barras: {productos_db_con_barcode}")
            print(f"  - Productos SIN codigo de barras: {productos_db_sin_barcode}")
            
            # Mostrar ejemplo de producto especifico (SKU 124293 si existe)
            print("\n4. Buscando producto especifico (SKU: 124293):\n")
            producto_especifico = ProductoADM.query.filter_by(sku="124293").first()
            if producto_especifico:
                print(f"  [OK] Producto encontrado:")
                print(f"     - SKU: {producto_especifico.sku}")
                print(f"     - Nombre: {producto_especifico.nombre}")
                codigo_barras_str = producto_especifico.codigo_barras if producto_especifico.codigo_barras else 'None (no disponible)'
                print(f"     - Codigo de barras: {codigo_barras_str}")
                print(f"     - Ultima actualizacion: {producto_especifico.updated_at}")
            else:
                print("  [X] Producto no encontrado en BD local")
            
            print("\n" + "=" * 60)
            
        except Exception as e:
            print(f"[ERROR] Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    verificar_codigo_barras()
