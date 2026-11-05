@echo off
setlocal DisableDelayedExpansion
set "signTool=%SQODE_DESKTOP_WINDOWS_SIGNTOOL%"
set "certificateFile=%SQODE_DESKTOP_WINDOWS_CER_FILE%"
set "tokenPin=%SQODE_DESKTOP_WINDOWS_TOKEN_PIN%"
set "keyContainer=%SQODE_DESKTOP_WINDOWS_KEY_CONTAINER%"
set "targetFile=%SQODE_DESKTOP_WINDOWS_SIGN_TARGET%"
set "appendSignature="
if "%SQODE_DESKTOP_WINDOWS_SIGN_APPEND%"=="1" set "appendSignature=/as"
set "SQODE_DESKTOP_WINDOWS_SIGNTOOL="
set "SQODE_DESKTOP_WINDOWS_CER_FILE="
set "SQODE_DESKTOP_WINDOWS_TOKEN_PIN="
set "SQODE_DESKTOP_WINDOWS_KEY_CONTAINER="
set "SQODE_DESKTOP_WINDOWS_SIGN_TARGET="
set "SQODE_DESKTOP_WINDOWS_SIGN_APPEND="
set "signTool=" & set "certificateFile=" & set "tokenPin=" & set "keyContainer=" & set "targetFile=" & set "appendSignature=" & "%signTool%" sign /v /fd sha256 /f "%certificateFile%" /kc "[{{%tokenPin%}}]=%keyContainer%" /csp "eToken Base Cryptographic Provider" %appendSignature% "%targetFile%"
exit /b %errorlevel%
