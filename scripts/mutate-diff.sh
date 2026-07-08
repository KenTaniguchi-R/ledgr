#!/usr/bin/env bash
# Run Stryker mutation testing over only the source files changed since a base
# ref (default origin/main). Keeps PR runs to minutes instead of a full
# cold-cache sweep. Exits 0 when no mutatable source changed.
set -euo pipefail

BASE="${1:-origin/main}"

FILES=$(git diff --name-only --diff-filter=ACMR "${BASE}...HEAD" -- \
  src/lib src/actions src/queries \
  | grep -E '\.ts$' | grep -vE '\.test\.ts$' || true)

if [ -z "$FILES" ]; then
  echo "No mutatable source changed since ${BASE} — skipping mutation testing."
  exit 0
fi

echo "Mutation-testing changed files:"
echo "$FILES" | sed 's/^/  /'

MUTATE=$(echo "$FILES" | paste -sd, -)
exec pnpm exec stryker run --mutate "$MUTATE"
