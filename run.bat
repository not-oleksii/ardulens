@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Building and starting ArduLens...
call npm run start
pause
