@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════════════════════════════
echo   CREAR ZIP PARA CPANEL - SISTEMA WMS
echo ═══════════════════════════════════════════════════════════════
echo.

cd /d "%~dp0"

REM Eliminar ZIP anterior si existe
if exist "wms_cpanel.zip" (
    echo Eliminando ZIP anterior...
    del "wms_cpanel.zip"
)

echo Creando ZIP con archivos para CPanel...
echo.

REM Verificar que existan los archivos esenciales
if not exist "app_wms.py" (
    echo ERROR: app_wms.py no encontrado
    pause
    exit /b 1
)

if not exist "passenger_wsgi.py" (
    echo ERROR: passenger_wsgi.py no encontrado
    pause
    exit /b 1
)

REM Crear ZIP con todos los archivos y carpetas esenciales
powershell -Command "$files = @('api', 'database', 'routes', 'static', 'templates', 'utils', 'app_wms.py', 'config.py', 'init_db.py', 'passenger_wsgi.py', 'requirements.txt'); $exists = $files | Where-Object { Test-Path $_ }; if ($exists.Count -eq 0) { Write-Host 'ERROR: No se encontraron archivos'; exit 1 } else { Compress-Archive -Path $exists -DestinationPath 'wms_cpanel.zip' -Force }"

if exist "wms_cpanel.zip" (
    echo.
    echo ✓ ZIP creado exitosamente: wms_cpanel.zip
    echo.
    echo 📋 Archivos incluidos:
    echo    - api/
    echo    - database/
    echo    - routes/
    echo    - static/
    echo    - templates/
    echo    - utils/
    echo    - app_wms.py
    echo    - config.py
    echo    - init_db.py
    echo    - passenger_wsgi.py
    echo    - requirements.txt
    echo.
    echo ⚠️  IMPORTANTE: La carpeta "no_cpanel" NO fue incluida
    echo.
    echo ✅ Listo para subir a CPanel
    echo.
    echo 📝 Ubicación del ZIP: %cd%\wms_cpanel.zip
) else (
    echo.
    echo ❌ Error al crear el ZIP
    echo.
    echo Verifica que todos los archivos existan:
    echo   - api/
    echo   - database/
    echo   - routes/
    echo   - static/
    echo   - templates/
    echo   - utils/
    echo   - app_wms.py
    echo   - passenger_wsgi.py
    echo   - requirements.txt
)

echo.
pause
