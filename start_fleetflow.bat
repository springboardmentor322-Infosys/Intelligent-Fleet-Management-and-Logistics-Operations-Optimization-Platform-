@echo off
cd /d "%%~dp0"
start "FleetFlow Backend" cmd /k "cd /d ""%%~dp0backend"" ^&^& call venv\Scripts\activate.bat ^&^& uvicorn main:app --reload"
start "FleetFlow Frontend" cmd /k "cd /d ""%%~dp0frontend"" ^&^& npm run dev"
timeout /t 3 >nul
start http://localhost:5173
