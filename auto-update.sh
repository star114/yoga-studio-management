#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_DIR="${ROOT_DIR}/.auto-update.lock"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  echo "[$(timestamp)] $*"
}

cleanup() {
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}

if ! mkdir "$LOCK_DIR" >/dev/null 2>&1; then
  log "Another auto-update run is already in progress. Skipping."
  exit 0
fi

trap cleanup EXIT

cd "$ROOT_DIR"

if [ ! -f "${ROOT_DIR}/deploy.sh" ]; then
  log "ERROR: deploy.sh not found in project root."
  exit 1
fi

log "Starting docker compose auto-update..."

if bash "${ROOT_DIR}/deploy.sh"; then
  log "Auto-update completed successfully."
else
  log "ERROR: auto-update failed."
  exit 1
fi
