#!/usr/bin/env bash
# Called by the panel ("Update panel" button), runs as the arkpanel user.
# Pulls the latest code and rebuilds. The panel restarts itself afterwards (systemd Restart=always).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Current version: $(git rev-parse --short HEAD)"
git fetch --quiet origin
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse '@{u}')"
if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "Already up to date. Rebuilding anyway."
fi
git pull --ff-only
echo "Installing dependencies..."
# "install" (not "ci") keeps the current modules if the network fails halfway
npm install --no-audit --no-fund --loglevel=error
echo "Building web interface..."
npm run build --silent
echo "Removing build tools..."
npm prune --omit=dev --no-audit --no-fund --loglevel=error
echo "New version: $(git rev-parse --short HEAD)"
