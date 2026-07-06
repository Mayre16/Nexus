@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%.venv\Scripts\activate.bat" (
  echo No se encontro "%ROOT%.venv\Scripts\activate.bat"
  echo Crear entorno: python -m venv .venv
  echo Luego: .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

REM /D fija la carpeta de trabajo de cada ventana (evita problemas con rutas con espacios)
start "WMS - Flask" /D "%ROOT%" cmd /k "call .venv\Scripts\activate.bat && python app_wms.py"
start "WMS - Consola" /D "%ROOT%" cmd /k "call .venv\Scripts\activate.bat"

exit /b 0
