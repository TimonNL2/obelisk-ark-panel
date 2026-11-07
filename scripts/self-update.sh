#!/usr/bin/env bash
# Called by the panel ("Update panel" button), runs as the arkpanel user.
# Downloads the latest code and rebuilds. The panel restarts itself afterwards (systemd Restart=always).
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Current version: $(git rev-parse --short HEAD)"
git fetch --quiet origin "$BRANCH"
# Mirror GitHub exactly; local changes in the code folder (e.g. npm touching
# package-lock.json) are discarded. Settings and game data live elsewhere.
git checkout --quiet --force -B "$BRANCH" "origin/$BRANCH"
echo "Installing dependencies..."
# "install" (not "ci") keeps the current modules if the network fails halfway;
# --no-save keeps package-lock.json untouched.
npm install --no-save --no-audit --no-fund --loglevel=error
echo "Building web interface..."
npm run build --silent
echo "Removing build tools..."
npm prune --omit=dev --no-save --no-audit --no-fund --loglevel=error
echo "New version: $(git rev-parse --short HEAD)"
