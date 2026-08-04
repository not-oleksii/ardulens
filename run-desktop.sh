#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

install_via_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    return 1
  fi
  echo "Installing $1 via Homebrew..."
  brew install "$2"
}

install_via_linux_pkg_manager() {
  local name="$1" pkg="$2"
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing $name via apt..."
    sudo apt-get update -y && sudo apt-get install -y "$pkg"
  elif command -v dnf >/dev/null 2>&1; then
    echo "Installing $name via dnf..."
    sudo dnf install -y "$pkg"
  elif command -v pacman >/dev/null 2>&1; then
    echo "Installing $name via pacman..."
    sudo pacman -Sy --noconfirm "$pkg"
  else
    return 1
  fi
}

ensure_installed() {
  local check_cmd="$1" name="$2" brew_pkg="$3" linux_pkg="$4" manual_url="$5"
  if command -v "$check_cmd" >/dev/null 2>&1; then
    echo "$name already installed."
    return 0
  fi

  if [ "$(uname)" = "Darwin" ]; then
    install_via_brew "$name" "$brew_pkg" && return 0
  else
    install_via_linux_pkg_manager "$name" "$linux_pkg" && return 0
  fi

  echo "Could not install $name automatically (no supported package manager found)."
  echo "Install it manually from $manual_url and try again."
  return 1
}

FAILED=0
ensure_installed node "Node.js" node nodejs "https://nodejs.org" || FAILED=1
ensure_installed cargo "Rust" rust cargo "https://rustup.rs" || FAILED=1

if [ "$(uname)" = "Darwin" ]; then
  if ! command -v clang >/dev/null 2>&1; then
    echo "Installing Xcode Command Line Tools (required by Rust on macOS) - a system dialog will appear, please accept it..."
    xcode-select --install || true
    echo "Re-run this script once that install finishes."
    FAILED=1
  fi
elif ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
  ensure_installed gcc "a C compiler" gcc build-essential "your distro's package manager" || FAILED=1
fi

if [ "$FAILED" != "0" ]; then
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies, this only happens once..."
  npm install
fi

echo "Building and starting the ArduLens desktop app..."
npm run tauri dev
