#!/usr/bin/env bash
# Start a new deck next to this one. A thin wrapper around create-sl-ide
# (`pnpm create sl-ide`), which clones the latest template from GitHub, so
# the new deck gets today's editor whatever this repo's version is.
#
#   pnpm new-project acme-pitch                    -> ../acme-pitch
#   pnpm new-project acme-pitch --team acme
#   pnpm new-project acme-pitch --public           -> a public GitHub repo
#   pnpm new-project acme-pitch --no-github        -> local only
#   pnpm new-project q3-memo --memo                -> a US Letter memo
#   DIR=~/decks pnpm new-project acme-pitch        -> ~/decks/acme-pitch
#
# Every other create-sl-ide option passes straight through (--help lists them).
set -euo pipefail
cd "$(dirname "$0")/.."
PARENT="${DIR:-$(cd .. && pwd)}"

ARGS=()
for arg in "$@"; do
  case "$arg" in
    --public) ARGS+=(--github public) ;;
    --private) ARGS+=(--github private) ;;
    --no-github) ARGS+=(--github none) ;;
    --memo) ARGS+=(--format memo) ;;
    *) ARGS+=("$arg") ;;
  esac
done

cd "$PARENT"
exec pnpm dlx create-sl-ide@latest ${ARGS[@]+"${ARGS[@]}"}
