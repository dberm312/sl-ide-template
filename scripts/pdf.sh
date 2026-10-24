#!/usr/bin/env bash
# Build the deck and print it to a vector PDF through headless Chrome.
#
#   pnpm pdf                      -> output/<META.pdfName>.pdf, output/cover.png
#   OUT_DIR=pdf pnpm pdf          -> somewhere else
#   pnpm pdf --audit              -> run audit.sh's gate first, in the same
#                                    Chrome, and print nothing if it fails (CI)
#
# Vector with selectable text: slides are never screenshotted, and every font
# is self-hosted, so nothing is fetched at print time. cover.png is the one
# screenshot: the top of #print, its 24px of body padding then the first
# page, which publish-deck uploads for the deck list on sl-ide cloud.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
STEPS=(pdf cover)
[[ "${1:-}" == "--audit" ]] && STEPS=(audit pdf cover)
find_chrome
export CHROME
trap '[[ -z "${SERVER_PID:-}" ]] || kill "$SERVER_PID" 2>/dev/null || true' EXIT
page_size
OUT_DIR="${OUT_DIR:-output}"
NAME=$(node -e "import('./src/deck/content.js').then((m) => console.log(m.META.pdfName || 'deck'))")
mkdir -p "$OUT_DIR"
build_dist
serve_dist 8241
OUT_PDF="$OUT_DIR/$NAME.pdf" OUT_COVER="$OUT_DIR/cover.png" PAGE_W="$PAGE_W" PAGE_H="$PAGE_H" \
  node scripts/render.mjs 8241 "${STEPS[@]}"
