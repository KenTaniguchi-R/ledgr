#!/bin/sh
# Sourced by docker-entrypoint.sh before migrations run.
#
# Resolves ENCRYPTION_KEY and BETTER_AUTH_SECRET, in order of preference:
#   1. Environment variable (always wins — power users, key rotation setups)
#   2. File persisted in LEDGR_DATA_DIR (auto-generated on first boot)
#
# LEDGR_DATA_DIR is the persistence contract: whoever mounts durable storage
# declares it (docker-compose.yml sets it alongside the appdata volume).
# When it is unset there is nowhere safe to keep a generated encryption key,
# so the script refuses to boot rather than mint a key that vanishes with the
# container and takes all encrypted data (Plaid tokens, API keys) with it.

KEY_FILE="$LEDGR_DATA_DIR/encryption-key"
AUTH_SECRET_FILE="$LEDGR_DATA_DIR/auth-secret"

if [ -n "$LEDGR_DATA_DIR" ] && [ -d "$LEDGR_DATA_DIR" ]; then
  HAVE_DATA_DIR=1
else
  HAVE_DATA_DIR=
fi

random_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('$1'))"
}

# resolve_secret FILE ENCODING VALIDATE_REGEX LABEL — prints the secret value.
# Reads FILE when present (refusing invalid contents rather than clobbering a
# possibly corrupt secret), otherwise generates a value and persists it
# atomically with 0600 permissions. Announcements go to stderr so the value
# can be captured from stdout.
resolve_secret() {
  if [ -f "$1" ]; then
    _value="$(cat "$1")"
    if ! printf '%s' "$_value" | grep -Eq "$3"; then
      echo "ERROR: $1 exists but does not contain a valid $4." >&2
      echo "  Refusing to overwrite it — the file may be corrupt or truncated." >&2
      echo "  Restore it from a backup, or delete it to generate a fresh one." >&2
      return 1
    fi
  else
    _value="$(random_secret "$2")"
    (
      umask 077
      printf '%s\n' "$_value" > "$1.tmp"
    )
    mv "$1.tmp" "$1"
    echo "Generated $4: $1" >&2
    echo "  Back this file up along with your database." >&2
  fi
  printf '%s' "$_value"
}

if [ -n "$ENCRYPTION_KEY" ]; then
  if [ -n "$HAVE_DATA_DIR" ] && [ -f "$KEY_FILE" ] && [ "$(cat "$KEY_FILE")" != "$ENCRYPTION_KEY" ]; then
    echo "WARNING: ENCRYPTION_KEY is set but differs from the auto-generated key in $KEY_FILE." >&2
    echo "  The environment variable takes precedence. Data encrypted with the" >&2
    echo "  auto-generated key will be unreadable until that key is restored." >&2
    echo "" >&2
  fi
elif [ -n "$HAVE_DATA_DIR" ]; then
  ENCRYPTION_KEY="$(resolve_secret "$KEY_FILE" hex '^[0-9a-f]{64}$' 'encryption key')" || exit 1
  export ENCRYPTION_KEY
else
  echo "" >&2
  echo "ERROR: ENCRYPTION_KEY is not set and no data directory is configured." >&2
  echo "" >&2
  echo "  This key encrypts sensitive data (Plaid tokens, API keys)." >&2
  echo "  Losing it means losing access to all encrypted data." >&2
  echo "" >&2
  echo "  Either use the provided docker-compose.yml (which mounts a data" >&2
  echo "  volume and sets LEDGR_DATA_DIR so a key is generated and persisted" >&2
  echo "  automatically), or generate one and add it to your .env file:" >&2
  echo "" >&2
  echo "    openssl rand -hex 32" >&2
  echo "" >&2
  exit 1
fi

if [ -z "$BETTER_AUTH_SECRET" ]; then
  if [ -n "$HAVE_DATA_DIR" ]; then
    BETTER_AUTH_SECRET="$(resolve_secret "$AUTH_SECRET_FILE" base64 '^[A-Za-z0-9+/=]{44}$' 'auth session secret')" || exit 1
  else
    BETTER_AUTH_SECRET="$(random_secret base64)"
    echo "WARNING: BETTER_AUTH_SECRET not set — generated a temporary one." >&2
    echo "  Sessions will not persist across restarts." >&2
    echo "  Generate a permanent one: openssl rand -base64 32" >&2
    echo "" >&2
  fi
  export BETTER_AUTH_SECRET
fi
