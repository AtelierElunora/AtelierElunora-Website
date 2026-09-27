@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, then open this launcher again.
  pause
  exit /b 1
)
if not exist "node_modules\@napi-rs\canvas\package.json" (
  call npm ci --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:4318 in your browser after the helper starts.
node control.mjs
if errorlevel 1 pause
