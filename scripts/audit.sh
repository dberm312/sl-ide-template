#!/usr/bin/env bash
# Does every slide still fit, and is any of them wordy? Builds, serves dist/,
# and asks the page.
#
#   pnpm run audit        (not `pnpm audit`, which audits dependencies)
#
# CLIPPED  content runs past the footer. .slide is overflow:hidden, so this is
#          the failure the PDF hides from you.
# SPILL    a card or region is too small for its own copy.
# OVERLAP  two stacked bands print on top of each other.
# WORDY    the page is over META.wordBudget words (not a memo's flowing pages).
# LONG     the document is over META.pageBudget pages, when it sets one.
# RAGGED   (advisory) a wrapped line's last line is under half full.
# RUNT     (advisory) a memo's last flowing page is under a quarter full.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
export CHROME
trap '[[ -z "${SERVER_PID:-}" ]] || kill "$SERVER_PID" 2>/dev/null || true' EXIT
build_dist >/dev/null
serve_dist
node scripts/render.mjs "$PORT" audit
