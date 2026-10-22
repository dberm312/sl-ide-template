#!/usr/bin/env bash
# Build the deck and print it to a vector PDF through headless Chrome.
#
#   pnpm pdf                      -> output/<META.pdfName>.pdf, output/cover.png
#   OUT_DIR=pdf pnpm pdf          -> somewhere else
#
# Vector with selectable text: slides are never screenshotted, and every font
# is self-hosted, so nothing is fetched at print time. cover.png is the one
# screenshot: the top of #print, its 24px of body padding then the first
# page, which publish-deck uploads for the deck list on sl-ide cloud.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
chrome_flags
page_size
OUT_DIR="${OUT_DIR:-output}"
NAME=$(node -e "import('./src/deck/content.js').then((m) => console.log(m.META.pdfName || 'deck'))")
mkdir -p "$OUT_DIR"
build_dist
serve_dist 8241
OUT="$OUT_DIR/$NAME.pdf"
"$CHROME" "${CHROME_FLAGS[@]}" --no-pdf-header-footer \
  --print-to-pdf="$OUT" "http://127.0.0.1:8241/index.html#print" 2>/dev/null
[[ -s "$OUT" ]] || { echo "error: Chrome did not write $OUT" >&2; exit 1; }
echo "wrote $OUT"
"$CHROME" "${CHROME_FLAGS[@]}" --hide-scrollbars --window-size=$PAGE_W,$(( PAGE_H + 24 )) \
  --screenshot="$OUT_DIR/cover.png" "http://127.0.0.1:8241/index.html#print" 2>/dev/null
[[ -s "$OUT_DIR/cover.png" ]] || { echo "error: Chrome did not write the cover" >&2; exit 1; }
echo "wrote $OUT_DIR/cover.png"
