@echo off
if "%~1"=="KEEP" goto main
start "" cmd /k "%~f0" KEEP
exit /b

:main
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo AVTOMAT - obnovlenie sayta
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git ne nayden.
  goto open_site
)

if not exist ".git" (
  echo ERROR: Ne Git-repozitoriy.
  goto open_site
)

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%i
if not defined BRANCH set BRANCH=main

echo Step 1 Pull...
git pull origin %BRANCH% 2>&1
if errorlevel 1 (
  echo Pull ne udalos. Prodolzhayu...
)

echo Step 2 Add...
git add .

echo Step 3 Commit...
set "MSG=auto update"
git commit -m "!MSG!" 2>nul
if errorlevel 1 (
  echo Net izmeneniy dlya kommita.
) else (
  echo Kommit sozdan.
)

echo Step 4 Push...
git push origin %BRANCH% 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Push ne vypolnen!
  echo Proverte: internet, avtorizaciyu v Git, GitHub.
  echo Mozhno vruchnuyu: git push origin main
) else (
  echo Push uspeshen. Sayt obnovlen na GitHub.
)

echo.

:open_site
echo Step 5 Otkrivayu sayt...
if exist "index.html" (
  start "" "index.html"
  echo index.html otkryt.
) else (
  echo index.html ne nayden.
)

echo.
echo Gotovo.
pause
