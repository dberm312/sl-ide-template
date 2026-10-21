#!/usr/bin/env bash
# Every font embedded in the PDF must be one of ours. Anything else is a
# fallback for a glyph the self-hosted subsets lack.
#
#   scripts/check-fonts.sh [pdf...]     (default: output/*.pdf)
#
# Allowed names come from src/fonts/*.woff2: "inter-tight-700.woff2" allows
# any PDF font whose name starts with "InterTight" (any case). The names are
# read straight from the PDF's /BaseFont entries, which Chrome writes
# uncompressed, so no pdffonts (and no poppler install in CI).
set -euo pipefail
cd "$(dirname "$0")/.."
FILES=("$@")
(( ${#FILES[@]} )) || FILES=(output/*.pdf)
ALLOW=$(ls src/fonts/*.woff2 | xargs -n1 basename \
  | sed -E 's/-[0-9]{3}.*$//' | sort -u \
  | awk -F- '{ s=""; for (i=1; i<=NF; i++) s = s toupper(substr($i,1,1)) substr($i,2); print s }' \
  | paste -sd'|' -)
status=0
for f in "${FILES[@]}"; do
  fonts=$(LC_ALL=C grep -ao '/BaseFont */[^/<>[:space:]]*' "$f" | sed -E 's#^/BaseFont */##; s/^[A-Z]{6}\+//' | sort -u)
  if [[ -z "$fonts" ]]; then
    echo "check-fonts: no fonts found in $f" >&2
    status=1
    continue
  fi
  strays=$(grep -viE "^($ALLOW)" <<<"$fonts" || true)
  if [[ -n "$strays" ]]; then
    echo "check-fonts: fallback fonts in $f:" $strays >&2
    status=1
  fi
done
(( status )) || echo "check-fonts: ok ($ALLOW)"
exit $status
