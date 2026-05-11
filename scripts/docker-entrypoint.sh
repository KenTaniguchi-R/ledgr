#!/bin/sh
set -e

echo "Running database migrations..."
node migrations/migrate.mjs

echo "Starting server..."
exec node server.js
