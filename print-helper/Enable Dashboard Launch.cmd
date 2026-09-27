@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer first.
 pause
 exit /b 1
)
call npm ci --omit=dev
if errorlevel 1 exit /b 1
node install-launcher.mjs
pause
