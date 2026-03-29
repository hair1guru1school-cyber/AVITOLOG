@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
if not exist "node_modules\" (
  echo Installing npm packages...
  call npm install
  if errorlevel 1 exit /b 1
)
echo.
echo Backend will run at http://localhost:8787  (needed for Claude / analytics generation in the app)
echo Close this window to stop the server.
echo.
call npm run dev
