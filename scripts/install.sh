#!/bin/sh
# curl -fsSL https://raw.githubusercontent.com/KenTaniguchi-R/ledgr/main/scripts/install.sh | sh
set -e

REPO_RAW="https://raw.githubusercontent.com/KenTaniguchi-R/ledgr/main"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but wasn't found. Install it from https://docs.docker.com/get-docker/ and re-run this script." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required but wasn't found. Install it from https://docs.docker.com/compose/install/ and re-run this script." >&2
  exit 1
fi

mkdir -p ledgr
cd ledgr

if [ -f docker-compose.yml ]; then
  echo "docker-compose.yml already exists in $(pwd), skipping download."
else
  echo "Downloading docker-compose.yml..."
  curl -fsSL -o docker-compose.yml "$REPO_RAW/docker-compose.yml"
fi

echo "Starting Ledgr..."
docker compose up -d

echo ""
echo "Ledgr is starting. Visit http://localhost:4200 once the containers are healthy."
echo "Run 'docker compose logs -f' in $(pwd) to watch startup."
