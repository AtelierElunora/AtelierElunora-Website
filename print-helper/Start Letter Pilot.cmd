@echo off
setlocal
cd /d "%~dp0"
set "ATELIER_PRINT_STATE=%~dp0atelier-letter-pilot"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer, then reopen this launcher.
 pause
 exit /b 1
)
if not exist "node_modules\@napi-rs\canvas\package.json" (
 call npm ci --omit=dev
 if errorlevel 1 exit /b 1
)
echo This prints TWO sample Letter sheets to HP OfficeJet Pro 8020 series (Copy 1).
echo Use Letter paper. Enable Keep printed documents for Copy 1 first.
node letter-pilot.mjs --resume
echo Reopening resumes the saved job. Completed pilots do not print again.
pause
