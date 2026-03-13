@echo off
if "%~1"=="KEEP" goto main
start "" cmd /k "%~f0" KEEP
exit /b

:main
setlocal EnableDelayedExpansion

pushd "%~dp0\.."

echo.
echo === Obnovit sayt ===
echo.

call git --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git ne nayden.
  goto end
)

if not exist ".git" (
  echo ERROR: Ne Git-repozitoriy.
  goto end
)

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%i
if not defined BRANCH set BRANCH=main

echo Vetka: %BRANCH%
echo.

echo Step 1 Pull...
call git pull origin %BRANCH% 2>&1
if errorlevel 1 echo Pull ne udalos. Prodolzhayu...
echo.

echo Step 2 Add...
call git add .
echo.

echo Step 3 Commit message:
set /p "MSG=Commit: "
if "!MSG!"=="" set "MSG=update site"

call git commit -m "!MSG!" 2>nul
if errorlevel 1 (
  echo Net izmeneniy.
) else (
  echo Kommit sozdan.
)
echo.

echo Step 4 Push...
call git push origin %BRANCH% 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Push ne vypolnen.
  echo Proverte internet i avtorizaciyu GitHub.
) else (
  echo Sayt obnovlen na GitHub.
)

:end
echo.
popd
endlocal
echo Zaversheno. Okno mozhno zakryt.
pause
