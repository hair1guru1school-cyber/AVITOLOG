@echo off
cd /d "%~dp0"
chcp 437 >nul 2>&1

echo.
echo WARNING: This will OVERWRITE GitHub with your local version!
echo All commits that exist only on GitHub will be LOST.
echo.
set /p "confirm=Type YES to continue: "
if /i not "%confirm%"=="YES" (
  echo Cancelled.
  pause
  exit /b 1
)

echo.
call git push --force origin main
if errorlevel 1 (
  echo Push failed.
) else (
  echo Site overwritten on GitHub.
)
echo.
pause
