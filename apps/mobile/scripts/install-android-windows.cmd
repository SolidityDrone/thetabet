@echo off
REM Chunked APK install from Windows (no WSL). Put APK at C:\Users\Public\thetabet-debug.apk
set APK=%~1
if "%APK%"=="" set APK=C:\Users\Public\thetabet-debug.apk
if not exist "%APK%" (
  echo APK not found: %APK%
  echo Copy your build to C:\Users\Public\thetabet-debug.apk first.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found on Windows PATH.
  echo Install Node, or run from WSL: cd apps/mobile && npm run install:android
  exit /b 1
)

for %%I in ("%~dp0..") do set MOBILE=%%~fI
node "%MOBILE%\scripts\install-android.mjs" "%APK%"
