#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found in project root."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [ -z "${DOCKERHUB_USERNAME:-}" ]; then
  echo "ERROR: DOCKERHUB_USERNAME is required in .env"
  exit 1
fi

if [ -z "${APP_TAG:-}" ]; then
  echo "APP_TAG is not set. Using 'latest'."
  export APP_TAG=latest
fi

if command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
else
  DOCKER_COMPOSE="docker compose"
fi

echo "[1/4] Pulling images..."
$DOCKER_COMPOSE -f docker-compose.prod.yml pull

echo "[2/4] Starting containers..."
$DOCKER_COMPOSE -f docker-compose.prod.yml up -d

echo "[3/4] Waiting for database..."
MAX_RETRIES=30
COUNT=0
until $DOCKER_COMPOSE -f docker-compose.prod.yml exec -T db pg_isready -U "${DB_USER:-yoga_admin}" >/dev/null 2>&1; do
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: database did not become ready in time"
    exit 1
  fi
  sleep 1
done

echo "[4/4] Deployment complete."
echo ""
echo "Running containers:"
$DOCKER_COMPOSE -f docker-compose.prod.yml ps
