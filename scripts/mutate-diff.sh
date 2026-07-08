#!/usr/bin/env bash
# Run Stryker mutation testing over only the source files changed between BASE
# and HEAD (defaults: origin/main .. working tree). Keeps PR runs to minutes
# instead of a full cold sweep. Exits 0 when no mutatable source changed.
#
# Uses a two-dot diff of explicit commits so CI can pass the PR's exact base and
# head SHAs — a three-dot/merge-base diff against a moving branch tip pulls in
# files the PR never touched.
set -euo pipefail

BASE="${1:-origin/main}"
HEAD="${2:-HEAD}"

FILES=$(git diff --name-only --diff-filter=ACMR "$BASE" "$HEAD" -- \
  src/lib src/actions src/queries \
  | grep -E '\.ts$' | grep -vE '\.test\.ts$' || true)

if [ -z "$FILES" ]; then
  echo "No mutatable source changed between ${BASE} and ${HEAD} — skipping mutation testing."
  exit 0
fi

echo "Mutation-testing changed files:"
echo "$FILES" | sed 's/^/  /'

MUTATE=$(echo "$FILES" | paste -sd, -)
exec pnpm exec stryker run --mutate "$MUTATE"
