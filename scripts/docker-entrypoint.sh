#!/bin/sh
set -e

. "$(dirname "$0")/ensure-secrets.sh"

echo "Running database migrations..."
node migrations/migrate.mjs

echo "Provisioning restricted app DB role..."
node migrations/ensure-app-role.mjs

echo "Starting server..."
exec node server.js
