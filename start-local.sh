#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ROOT_ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ROOT_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_ENV_FILE"
  set +a
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/package.json" ]; then
  echo "ERROR: backend/package.json not found."
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo "ERROR: frontend/package.json not found."
  exit 1
fi

DB_NAME="${DB_NAME:-yoga_studio}"
DB_USER="${DB_USER:-yoga_admin}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_PORT="${DB_PORT:-5432}"
JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-change-me}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@yoga.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

if [ -n "${DATABASE_URL:-}" ]; then
  LOCAL_DATABASE_URL="$DATABASE_URL"
else
  if [ -z "$DB_PASSWORD" ]; then
    echo "ERROR: DB_PASSWORD is not set. Add it to .env."
    exit 1
  fi
  LOCAL_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
fi

DOCKER_COMPOSE=""
if command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
fi

if [ -n "$DOCKER_COMPOSE" ]; then
  echo "[0/5] Ensuring local Postgres (db) is running via Docker..."
  if ! (cd "$ROOT_DIR" && $DOCKER_COMPOSE up -d db); then
    echo "ERROR: Failed to start Docker Postgres service."
    echo "Make sure Docker Desktop is running, then retry."
    exit 1
  fi

  echo "      Waiting for Postgres readiness..."
  MAX_RETRIES=30
  COUNT=0
  until (cd "$ROOT_DIR" && $DOCKER_COMPOSE exec -T db pg_isready -U "$DB_USER" >/dev/null 2>&1); do
    COUNT=$((COUNT + 1))
    if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
      echo "ERROR: Postgres did not become ready in time."
      echo "Try: $DOCKER_COMPOSE logs db"
      exit 1
    fi
    sleep 1
  done
else
  echo "[0/5] Docker Compose not found. Assuming a local Postgres is already running."
fi

echo "[1/5] Installing backend dependencies..."
(cd "$BACKEND_DIR" && npm install)
echo "[2/5] Installing frontend dependencies..."
(cd "$FRONTEND_DIR" && npm install)

echo "[3/5] Starting backend dev server..."
(
  cd "$BACKEND_DIR" && \
    DATABASE_URL="$LOCAL_DATABASE_URL" \
    JWT_SECRET="$JWT_SECRET" \
    ADMIN_EMAIL="$ADMIN_EMAIL" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    CORS_ORIGIN="http://localhost:3000" \
    PORT=3001 \
    npm run dev
) &
BACKEND_PID=$!

echo "[4/5] Starting frontend dev server..."
(cd "$FRONTEND_DIR" && npm start) &
FRONTEND_PID=$!

echo ""
echo "Local development is running."
echo "- Frontend: http://localhost:3000"
echo "- Backend API: http://localhost:3001"
echo "Press Ctrl+C to stop both servers."
echo ""

CLEANED_UP=0

cleanup() {
  if [ "$CLEANED_UP" -eq 1 ]; then
    return
  fi

  CLEANED_UP=1
  echo ""
  echo "Stopping local development servers..."

  if kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  wait "$BACKEND_PID" >/dev/null 2>&1 || true
  wait "$FRONTEND_PID" >/dev/null 2>&1 || true
}

trap 'cleanup; exit 130' INT TERM
trap 'cleanup' EXIT

EXIT_CODE=0

while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || EXIT_CODE=$?
    echo "Backend server stopped."
    break
  fi

  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID" || EXIT_CODE=$?
    echo "Frontend server stopped."
    break
  fi

  sleep 1
done

exit "$EXIT_CODE"
