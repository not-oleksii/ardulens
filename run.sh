#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found. Install it from https://nodejs.org and try again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies, this only happens once..."
  npm install
fi

echo "Building and starting ArduLens..."
npm run start
