@echo off
cd /d "%~dp0"
echo Mode LAN: akses dari HP dengan http://IP-KOMPUTER:5500
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 serve.py --host 0.0.0.0
) else (
  python serve.py --host 0.0.0.0
)
pause
