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
page_size
SCALE="${SCALE:-1}"
build_dist >/dev/null
serve_dist

# Printed labels in deck order, read off the audit report ("—" for unnumbered).
LABELS=($(CHROME="$CHROME" node scripts/render.mjs "$PORT" report | awk 'NR > 2 && NF >= 3 && $2 ~ /^[0-9]+$/ { print $1 }'))
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
# Pages stack at PAGE_H + 24px margin under 24px of body padding.
STEP=$(( PAGE_H + 24 ))
H=$(( 24 + N * STEP ))
"$CHROME" "${CHROME_FLAGS[@]}" --hide-scrollbars --force-device-scale-factor="$SCALE" \
  --window-size=$PAGE_W,$H --screenshot="$OUT/all.png" "http://127.0.0.1:$PORT/index.html#print" 2>/dev/null
for i in "${PAGES[@]}"; do
  label=${LABELS[$(( i - 1 ))]}
  [[ "$label" == "—" ]] && label="at$i"
  python3 - "$OUT/all.png" "$OUT/page-$label.png" "$(( (24 + (i - 1) * STEP) * SCALE ))" "$SCALE" "$PAGE_W" "$PAGE_H" <<'PY' 2>/dev/null \
    || sips -c $(( PAGE_H * SCALE )) $(( PAGE_W * SCALE )) --cropOffset $(( (24 + (i - 1) * STEP) * SCALE )) 0 "$OUT/all.png" --out "$OUT/page-$label.png" >/dev/null
import sys
from PIL import Image
src, dst, top, scale, w, h = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
Image.open(src).crop((0, top, w * scale, top + h * scale)).save(dst)
PY
  echo "wrote $OUT/page-$label.png"
done
rm "$OUT/all.png"
