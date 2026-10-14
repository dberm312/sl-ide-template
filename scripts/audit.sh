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
# WORDY    the page is over META.wordBudget words.
# RAGGED   (advisory) a wrapped line's last line is under half full.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
chrome_flags
build_dist >/dev/null
serve_dist 8242
REPORT=$(audit_report 8242)
echo "$REPORT"
! grep -qE 'CLIPPED|WORDY|SPILL|OVERLAP|FONTS-PENDING' <<<"$REPORT"
