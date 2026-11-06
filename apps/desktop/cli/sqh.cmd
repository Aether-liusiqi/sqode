@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\Sqode.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@liusiqi-dev\sqh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
