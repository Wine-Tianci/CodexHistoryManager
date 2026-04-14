@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js ^(node^) is not installed or not in PATH.
  echo Install Node.js, then run start-server.bat again.
  pause
  exit /b 1
)

echo Starting Codex History Manager...
echo URL: http://localhost:4173
echo.

node server.js
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Server exited with code: %EXIT_CODE%
  pause
)

exit /b %EXIT_CODE%
