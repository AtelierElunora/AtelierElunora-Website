@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 goto :failed
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
pushd shopify-owner-app
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app config validate --json
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app build
if errorlevel 1 goto :failed
call npx.cmd --yes --package=@shopify/cli@4.8.0 shopify app deploy --no-release --message "Magnet wrap templates"
if errorlevel 1 goto :failed
echo.
echo App version uploaded for review. It has NOT been released or installed.
echo Save the version identifier shown above and share it in the conversation.
echo Publish the prepared Magnet Wrap Templates theme and release this app version.
pause
exit /b 0
:missing
echo Node.js and npm are required. Install Node 22 or newer from nodejs.org.
:failed
echo.
echo Setup stopped. Read the error above or send a screenshot without credentials.
echo No later setup steps were run after the error.
pause
exit /b 1
