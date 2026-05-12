#!/bin/sh
set -e

if [ -z "$ENCRYPTION_KEY" ]; then
  echo ""
  echo "ERROR: ENCRYPTION_KEY is not set."
  echo ""
  echo "  This key encrypts sensitive data (Plaid tokens, API keys)."
  echo "  Losing it means losing access to all encrypted data."
  echo ""
  echo "  Generate one and add it to your .env file:"
  echo ""
  echo "    openssl rand -hex 32"
  echo ""
  exit 1
fi

if [ -z "$BETTER_AUTH_SECRET" ]; then
  export BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  echo "WARNING: BETTER_AUTH_SECRET not set — generated a temporary one."
  echo "  Sessions will not persist across restarts."
  echo "  Generate a permanent one: openssl rand -base64 32"
  echo ""
fi

echo "Running database migrations..."
node migrations/migrate.mjs

echo "Starting server..."
exec node server.js
