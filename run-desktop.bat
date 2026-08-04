@echo off
cd /d "%~dp0"

where node >nul 2>nul
set NEED_NODE=0
if errorlevel 1 set NEED_NODE=1

where cargo >nul 2>nul
set NEED_CARGO=0
if errorlevel 1 if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" set NEED_CARGO=1

if %NEED_NODE%==1 goto ensure_prereqs
if %NEED_CARGO%==1 goto ensure_prereqs
goto have_node_and_cargo

:ensure_prereqs
echo Some prerequisites are missing - installing them automatically via winget
echo ^(Windows' built-in package manager^), no browser required. This can take a
echo while on a clean machine, especially the C++ Build Tools step.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-desktop-prereqs.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)

:have_node_and_cargo
rem Node/Rust may have just been installed by the step above - this process's PATH won't
rem see that on its own, so prepend their well-known install locations unconditionally.
set "PATH=%ProgramFiles%\nodejs;%USERPROFILE%\.cargo\bin;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js still not found after setup. Install it manually from https://nodejs.org and try again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust still not found after setup. Install it manually from https://rustup.rs and try again.
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

echo Building and starting the ArduLens desktop app...
call npm run tauri dev
pause
