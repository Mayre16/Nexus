═══════════════════════════════════════════════════════════════
  ARCHIVOS PARA CPANEL - SISTEMA WMS
═══════════════════════════════════════════════════════════════

📋 INSTRUCCIONES PARA ACTUALIZAR EN CPANEL
═══════════════════════════════════════════════════════════════

1. CREAR ZIP CON ARCHIVOS ESENCIALES
   ───────────────────────────────────
   - Ejecuta: crear_zip_cpanel.bat
   - O manualmente: Selecciona TODAS las carpetas y archivos de la raíz
   - Excluye la carpeta "no_cpanel"
   - Crea un ZIP llamado "wms_cpanel.zip"

2. SUBIR A CPANEL
   ───────────────
   - Accede a File Manager en CPanel
   - Navega a: /home2/adesa/wms.adesa.com.do/
   - ⚠️ IMPORTANTE: NO BORRES estos archivos/carpetas:
     * passenger_wsgi.py (CRÍTICO - No borrar)
     * .htaccess (si existe)
     * Cualquier archivo de log (stderr.log, stdout.log)
     * La carpeta __pycache__ (se regenera sola)

3. ACTUALIZAR ARCHIVOS
   ────────────────────
   - Borra TODAS las carpetas excepto las mencionadas arriba
   - Borra TODOS los archivos .py excepto passenger_wsgi.py
   - Extrae el ZIP en la raíz del directorio
   - Verifica que passenger_wsgi.py siga existiendo

4. REINICIAR APLICACIÓN
   ─────────────────────
   - Ve a: Setup Python App
   - Busca: wms.adesa.com.do
   - Clic en: RESTART
   - Espera: 30-60 segundos

5. VERIFICAR
   ──────────
   - Accede a: https://wms.adesa.com.do/
   - Verifica que la aplicación cargue correctamente

═══════════════════════════════════════════════════════════════

📁 ESTRUCTURA DE CARPETAS PARA CPANEL
═══════════════════════════════════════════════════════════════

✅ DEBEN IR A CPANEL (Archivos esenciales):
   ├── api/
   │   ├── __init__.py
   │   └── adm_cloud.py
   ├── database/
   │   ├── __init__.py
   │   └── models.py
   │   (wms.db se crea automáticamente, no subir si no existe)
   ├── routes/
   │   ├── __init__.py
   │   ├── auth.py
   │   ├── consulta.py
   │   ├── dashboard.py
   │   ├── despacho.py
   │   ├── facturas.py
   │   └── stock.py
   ├── static/
   │   ├── css/
   │   └── js/
   ├── templates/
   │   ├── despacho.html
   │   ├── index.html
   │   └── login.html
   ├── utils/
   │   ├── __init__.py
   │   ├── helpers.py
   │   └── validaciones.py
   ├── app_wms.py
   ├── config.py
   ├── init_db.py
   ├── passenger_wsgi.py ⚠️ NO BORRAR ESTE
   └── requirements.txt

❌ NO VAN A CPANEL (Están en carpeta "no_cpanel"):
   ├── docs/ (documentación)
   ├── pruebas/ (scripts de prueba)
   ├── *.md (archivos markdown)
   ├── *.txt (excepto requirements.txt y README_CPANEL.txt)
   ├── install_deps.py
   ├── test_deps.py
   └── *.zip

═══════════════════════════════════════════════════════════════

⚠️ ARCHIVOS QUE NUNCA DEBES BORRAR EN CPANEL
═══════════════════════════════════════════════════════════════

1. passenger_wsgi.py
   ──────────────────
   Este archivo es CRÍTICO. Sin él, la aplicación no funcionará.
   Si lo borras, tendrás que recrearlo desde cero.

2. .htaccess (si existe)
   ─────────────────────
   Archivo de configuración de Apache. Puede contener reglas
   importantes de redirección o seguridad.

3. Archivos de log
   ───────────────
   - stderr.log (errores)
   - stdout.log (salida estándar)
   Estos archivos son útiles para depurar problemas.

4. Carpeta __pycache__ (opcional)
   ───────────────────────────────
   Se regenera automáticamente, pero no afecta si la borras.

═══════════════════════════════════════════════════════════════

🔄 PROCESO COMPLETO DE ACTUALIZACIÓN
═══════════════════════════════════════════════════════════════

PASO 1: Preparar ZIP
   - Ejecuta crear_zip_cpanel.bat
   - O crea manualmente el ZIP con todas las carpetas
     (api, database, routes, static, templates, utils)
     y archivos (app_wms.py, config.py, etc.)

PASO 2: Acceder a CPanel
   - File Manager > /home2/adesa/wms.adesa.com.do/

PASO 3: Hacer backup de passenger_wsgi.py
   - Descarga passenger_wsgi.py a tu PC (por si acaso)

PASO 4: Borrar archivos antiguos
   - Selecciona todas las carpetas: api, database, routes, 
     static, templates, utils, migrations
   - Selecciona todos los archivos .py (excepto passenger_wsgi.py)
   - Bórralos

PASO 5: Subir nuevo ZIP
   - Sube el archivo wms_cpanel.zip
   - Extrae en la raíz del directorio
   - Verifica que passenger_wsgi.py siga existiendo

PASO 6: Reiniciar aplicación
   - Setup Python App > RESTART

PASO 7: Probar
   - https://wms.adesa.com.do/

═══════════════════════════════════════════════════════════════

