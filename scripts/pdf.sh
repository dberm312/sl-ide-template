#!/usr/bin/env bash
# Build the deck and print it to a vector PDF through headless Chrome.
#
#   pnpm pdf                      -> output/<META.pdfName>.pdf
#   OUT_DIR=pdf pnpm pdf          -> somewhere else (CI writes to pdf/)
#
# Vector with selectable text: slides are never screenshotted, and every font
# is self-hosted, so nothing is fetched at print time.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
chrome_flags
OUT_DIR="${OUT_DIR:-output}"
NAME=$(node -e "import('./src/deck/content.js').then((m) => console.log(m.META.pdfName || 'deck'))")
mkdir -p "$OUT_DIR"
build_dist
serve_dist 8241
OUT="$OUT_DIR/$NAME.pdf"
"$CHROME" "${CHROME_FLAGS[@]}" --no-pdf-header-footer \
  --print-to-pdf="$OUT" "http://127.0.0.1:8241/index.html#print" 2>/dev/null
echo "wrote $OUT"
