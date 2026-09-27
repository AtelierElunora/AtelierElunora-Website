@echo off
setlocal
cd /d "%~dp0"
set "ATELIER_PRINT_STATE=%~dp0atelier-letter-pilot"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer first.
 pause
 exit /b 1
)
if not exist "node_modules\@napi-rs\canvas\package.json" (
 call npm ci --omit=dev
 if errorlevel 1 exit /b 1
)
echo NEW two-sheet sample test: HP OfficeJet Pro 8020 series (Copy 1).
echo For the paper-out test, load ONLY ONE sheet of Letter paper.
echo Previous results will be preserved. Unfinished tests must be resumed first.
choice /C YN /N /M "Start a new test now? [Y/N] "
if errorlevel 2 exit /b 0
node letter-pilot.mjs --new
echo To resume this test, use Start Letter Pilot.cmd, NOT Start New Sample Test.cmd.
pause
