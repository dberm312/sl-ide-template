#!/usr/bin/env bash
# Screenshot pages into output/shots/page-<label>.png, to look at a page
# without opening the PDF. Builds, serves dist/, captures #print.
#
#   pnpm shots              -> every page
#   pnpm shots 2 A1         -> just those pages, by printed label
#   pnpm shots @1           -> by position (@1 is the cover)
#   SCALE=2 pnpm shots 2    -> at 2x, for close inspection
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
chrome_flags
SCALE="${SCALE:-1}"
build_dist >/dev/null
serve_dist 8243

# Printed labels in deck order, read off the audit report ("—" for unnumbered).
LABELS=($(audit_report 8243 | awk 'NR > 2 && NF >= 3 && $2 ~ /^[0-9]+$/ { print $1 }'))
N=${#LABELS[@]}
(( N > 0 )) || { echo "error: could not read the page list" >&2; exit 1; }

PAGES=()
for arg in "$@"; do
  if [[ "$arg" == @* ]]; then
    p=${arg:1}
  else
    p=0
    for i in "${!LABELS[@]}"; do [[ "${LABELS[$i]}" == "$arg" ]] && p=$(( i + 1 )); done
  fi
  (( p >= 1 && p <= N )) || { echo "error: no page '$arg' (labels: ${LABELS[*]})" >&2; exit 1; }
  PAGES+=("$p")
done
(( ${#PAGES[@]} )) || PAGES=($(seq 1 "$N"))

OUT=output/shots
mkdir -p "$OUT"
# Pages stack at 720px + 24px margin under 24px of body padding.
H=$(( 24 + N * 744 ))
"$CHROME" "${CHROME_FLAGS[@]}" --hide-scrollbars --force-device-scale-factor="$SCALE" \
  --window-size=1280,$H --screenshot="$OUT/all.png" "http://127.0.0.1:8243/index.html#print" 2>/dev/null
for i in "${PAGES[@]}"; do
  label=${LABELS[$(( i - 1 ))]}
  [[ "$label" == "—" ]] && label="at$i"
  python3 - "$OUT/all.png" "$OUT/page-$label.png" "$(( (24 + (i - 1) * 744) * SCALE ))" "$SCALE" <<'PY' 2>/dev/null \
    || sips -c $(( 720 * SCALE )) $(( 1280 * SCALE )) --cropOffset $(( (24 + (i - 1) * 744) * SCALE )) 0 "$OUT/all.png" --out "$OUT/page-$label.png" >/dev/null
import sys
from PIL import Image
src, dst, top, scale = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
Image.open(src).crop((0, top, 1280 * scale, top + 720 * scale)).save(dst)
PY
  echo "wrote $OUT/page-$label.png"
done
rm "$OUT/all.png"
