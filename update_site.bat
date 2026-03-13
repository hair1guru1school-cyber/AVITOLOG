@echo off
cd /d "%~dp0"
chcp 437 >nul 2>&1

echo.
echo === UPDATE SITE ===
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git not found.
  goto done
)

if not exist ".git" (
  echo ERROR: Not a Git repository.
  goto done
)

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%i
if not defined BRANCH set BRANCH=main

echo Branch: %BRANCH%
echo.

echo [1/4] Pull...
call git pull origin %BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: Pull failed. Fix conflicts or check connection, then run again.
  goto done
)
echo.

echo [2/4] Add...
call git add .
echo.

echo [3/4] Commit...
set "MSG=update site"
call git commit -m "%MSG%" 2>nul
if errorlevel 1 (
  echo No changes to commit.
) else (
  echo Commit created.
)
echo.

echo [4/4] Push...
call git push origin %BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: Push failed. Check internet and GitHub auth.
) else (
  echo Site updated on GitHub.
)

:done
echo.
echo Done. Press any key to close...
pause >nul
