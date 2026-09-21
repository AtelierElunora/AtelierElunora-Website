@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 goto :failed
set "ELUNORA_APP_DIR=%~dp0shopify-owner-app"
if not exist "%ELUNORA_APP_DIR%\shopify.app.toml" goto :missingconfig
echo Owner app folder: "%ELUNORA_APP_DIR%"
where node.exe >nul 2>nul
if errorlevel 1 goto :missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto :missing
node -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Node 22 or newer is required.');process.exit(1)}"
if errorlevel 1 goto :failed
call npm.cmd ci
if errorlevel 1 goto :failed
call npm.cmd ci --prefix shopify-owner-app
if errorlevel 1 goto :failed
call npm.cmd test
if errorlevel 1 goto :failed
call npm.cmd run test:owner
if errorlevel 1 goto :failed
call npm.cmd run check:build
if errorlevel 1 goto :failed
pushd "%ELUNORA_APP_DIR%"
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app config validate --path "%ELUNORA_APP_DIR%" --config shopify.app.toml --json
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app build --path "%ELUNORA_APP_DIR%" --config shopify.app.toml
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app deploy --path "%ELUNORA_APP_DIR%" --config shopify.app.toml --no-release --message "Live template preview and wrap text positioning"
if errorlevel 1 goto :failed
echo.
echo App version uploaded for review. It has NOT been released or installed.
echo Save the version identifier shown above and share it in the conversation.
echo Release that exact version in Shopify Developer Dashboard: Atelier Elunora Galleries, Versions.
echo Then close and reopen the owner app to see Live template preview and wording positioning.
echo This owner-app preview update does not require publishing a theme.
pause
exit /b 0
:missingconfig
echo The extracted repository is incomplete: "%ELUNORA_APP_DIR%\shopify.app.toml" is missing.
echo Extract the complete branch ZIP, keeping this script beside the shopify-owner-app folder.
goto :failed
:missing
echo Node.js and npm are required. Install Node 22 or newer from nodejs.org.
:failed
echo.
echo Setup stopped. Read the error above or send a screenshot without credentials.
echo No later setup steps were run after the error.
pause
exit /b 1
