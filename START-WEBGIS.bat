@echo off
cd /d "%~dp0"
echo Menjalankan GeoPortal Magelang pada http://localhost:5500
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 serve.py
) else (
  python serve.py
)
pause
