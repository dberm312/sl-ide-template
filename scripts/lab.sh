#!/usr/bin/env bash
# Check and screenshot the slide lab's takes (lab.html), for the agent to look at
# before you do. The lab lives on the dev server only, so this starts one
# on its own port and stops it again.
#
#   ./scripts/lab.sh            -> fit report, then output/lab/<id>.png for every take
#   ./scripts/lab.sh strip      -> report, then just that take's screenshot
#   SCALE=2 ./scripts/lab.sh    -> screenshots at 2x
#
# Exits 1 if any take is CLIPPED, SPILL, OVERLAP or WORDY, as audit.sh does.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh
find_chrome
page_size
SCALE="${SCALE:-1}"
PORT=8244

pnpm exec vite --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://localhost:$PORT/lab.html" && break
  sleep 0.2
done

URL="http://localhost:$PORT/lab.html"
REPORT=$("$CHROME" --headless --disable-gpu --virtual-time-budget=15000 \
  --dump-dom "$URL#audit" 2>/dev/null | python3 -c '
import html, re, sys
m = re.search(r"<pre id=\"lab-audit\"[^>]*>(.*?)</pre>", sys.stdin.read(), re.S)
print(html.unescape(m.group(1)) if m else "lab: could not read the report")
')
echo "$REPORT"

IDS=("$@")
if (( $# == 0 )); then
  IDS=($(echo "$REPORT" | awk 'NR > 1 { print $1 }'))
fi
OUT=output/lab
mkdir -p "$OUT"
for id in ${IDS[@]+"${IDS[@]}"}; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor="$SCALE" \
    --window-size=$PAGE_W,$PAGE_H --virtual-time-budget=15000 \
    --screenshot="$OUT/$id.png" "$URL#solo=$id" 2>/dev/null
  echo "wrote $OUT/$id.png"
done

! echo "$REPORT" | grep -qE 'CLIPPED|SPILL|OVERLAP|WORDY|FONTS-PENDING|could not read'
