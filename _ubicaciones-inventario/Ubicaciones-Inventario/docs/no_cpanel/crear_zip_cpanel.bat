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

REM Crear ZIP con todos los archivos y carpetas esenciales
powershell -Command "Compress-Archive -Path 'api','database','routes','static','templates','utils','app_wms.py','config.py','init_db.py','passenger_wsgi.py','requirements.txt' -DestinationPath 'wms_cpanel.zip' -Force"

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
) else (
    echo.
    echo ❌ Error al crear el ZIP
)

echo.
pause

