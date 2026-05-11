#!/bin/sh
set -e

if [ -z "$BETTER_AUTH_SECRET" ]; then
  export BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  echo "Generated BETTER_AUTH_SECRET (set this env var to keep sessions across restarts)"
fi

if [ -z "$ENCRYPTION_KEY" ]; then
  export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "Generated ENCRYPTION_KEY (set this env var to keep Plaid tokens across restarts)"
fi

echo "Running database migrations..."
node migrations/migrate.mjs

echo "Starting server..."
exec node server.js
