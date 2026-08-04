# Silently installs everything the ArduLens *desktop* build (Tauri) needs beyond Node.js:
# Rust, and (Windows-only) the MSVC C++ Build Tools that Rust needs to link a Windows
# binary. Everything is fetched via `winget` (Microsoft's own package manager, already on
# Windows 10/11 by default) so nothing requires opening a browser. Run via run-desktop.bat/
# run-desktop.sh - not meant to be double-clicked directly.
#
# Exit code 0 = ready to build. Non-zero = a prerequisite is still missing; the caller
# should stop and show the printed guidance rather than proceed to `npm run tauri dev`.

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WingetPackage {
    param([string]$Id, [string]$FriendlyName, [string]$Override)

    Write-Host "Installing $FriendlyName via winget (this may take a few minutes)..."
    $wingetArgs = @(
        "install", "--id", $Id, "-e",
        "--accept-source-agreements", "--accept-package-agreements",
        "--disable-interactivity"
    )
    if ($Override) {
        $wingetArgs += @("--override", $Override)
    }

    & winget @wingetArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "winget could not install $FriendlyName automatically (exit code $LASTEXITCODE)."
        return $false
    }
    return $true
}

if (-not (Test-CommandExists "winget")) {
    Write-Host "winget (Windows Package Manager) was not found."
    Write-Host "It ships with Windows 10/11 by default via 'App Installer' - update Windows or"
    Write-Host "install 'App Installer' from the Microsoft Store, then run this again."
    exit 1
}

$failed = $false

# --- Node.js ---
if (-not (Test-CommandExists "node")) {
    if (-not (Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -FriendlyName "Node.js")) {
        Write-Host "Install Node.js manually from https://nodejs.org and try again."
        $failed = $true
    }
} else {
    Write-Host "Node.js already installed."
}

# --- Rust ---
$cargoOnPath = Test-CommandExists "cargo"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (-not $cargoOnPath -and (Test-Path (Join-Path $cargoBin "cargo.exe"))) {
    $cargoOnPath = $true # installed earlier but not yet on this shell's PATH
}
if (-not $cargoOnPath) {
    if (-not (Install-WingetPackage -Id "Rustlang.Rustup" -FriendlyName "Rust")) {
        Write-Host "Install Rust manually from https://rustup.rs and try again."
        $failed = $true
    }
} else {
    Write-Host "Rust already installed."
}

# --- MSVC C++ Build Tools (Rust's Windows linker) ---
# `cargo`/`rustc` locate MSVC via the Visual Studio installation itself (like `vswhere`
# does below), not via PATH, so no PATH changes are needed for this one - unlike Node/Rust,
# a fresh install here is usable immediately by the *same* still-running shell.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVcTools = $false
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsInstall) {
        $hasVcTools = $true
    }
}
if (-not $hasVcTools) {
    Write-Host "Installing Microsoft C++ Build Tools (required by Rust on Windows)."
    Write-Host "This is a multi-GB download and can take a while - a Windows permission"
    Write-Host "(UAC) prompt may appear; please accept it to continue."
    $override = "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    if (-not (Install-WingetPackage -Id "Microsoft.VisualStudio.BuildTools" -FriendlyName "C++ Build Tools" -Override $override)) {
        Write-Host "See https://tauri.app/start/prerequisites/ for manual install instructions."
        $failed = $true
    }
} else {
    Write-Host "C++ Build Tools already installed."
}

if ($failed) {
    exit 1
}

Write-Host "All desktop-app prerequisites are ready."
exit 0
