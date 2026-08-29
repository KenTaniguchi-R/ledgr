#!/usr/bin/env bash
# Run Stryker mutation testing over only the source files changed between BASE
# and HEAD (defaults: origin/main .. working tree). Keeps PR runs to minutes
# instead of a full cold sweep. Exits 0 when no mutatable source changed.
#
# Uses a two-dot diff of explicit commits so CI can pass the PR's exact base and
# head SHAs — a three-dot/merge-base diff against a moving branch tip pulls in
# files the PR never touched.
#
# With --list-only, prints the changed mutatable files (one per line) and exits
# without running Stryker. CI's cheap hosted gate job uses this to decide
# whether the mutation job is worth a self-hosted runner slot at all, so the
# gate and the run can never disagree about what counts as mutatable.
set -euo pipefail

LIST_ONLY=false
if [ "${1:-}" = "--list-only" ]; then
  LIST_ONLY=true
  shift
fi

BASE="${1:-origin/main}"
HEAD="${2:-HEAD}"

FILES=$(git diff --name-only --diff-filter=ACMR "$BASE" "$HEAD" -- \
  src/lib src/actions src/queries \
  | grep -E '\.ts$' | grep -vE '\.test\.ts$' || true)

if [ "$LIST_ONLY" = true ]; then
  printf '%s' "$FILES"
  exit 0
fi

if [ -z "$FILES" ]; then
  echo "No mutatable source changed between ${BASE} and ${HEAD} — skipping mutation testing."
  exit 0
fi

echo "Mutation-testing changed files:"
echo "$FILES" | sed 's/^/  /'

MUTATE=$(echo "$FILES" | paste -sd, -)
exec pnpm exec stryker run --mutate "$MUTATE"
