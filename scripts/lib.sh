#!/usr/bin/env bash
# Shared by the scripts in this folder: find Chrome, build, and serve dist/.
# Source it; don't run it.

find_chrome() {
  local c
  for c in "${CHROME:-}" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v chromium 2>/dev/null)" "$(command -v chromium-browser 2>/dev/null)" \
    "$(command -v google-chrome 2>/dev/null)" \
    "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"; do
    if [[ -n "$c" && -x "$c" ]]; then CHROME="$c"; return 0; fi
  done
  echo "error: Chrome not found (set CHROME=/path/to/chrome)" >&2
  return 1
}

# Headless Chrome refuses its own sandbox when run as root; harmless elsewhere.
chrome_flags() {
  CHROME_FLAGS=(--headless --disable-gpu --virtual-time-budget=8000)
  if [[ "$(id -u)" -eq 0 ]]; then CHROME_FLAGS+=(--no-sandbox); fi
}

# Chrome blocks ES modules over file://, so serve dist/ on localhost.
serve_dist() {
  local port="$1"
  python3 -m http.server "$port" --directory dist --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
  for _ in $(seq 1 50); do
    curl -s -o /dev/null "http://127.0.0.1:$port/index.html" && return 0
    sleep 0.1
  done
}

build_dist() {
  [[ -d node_modules ]] || pnpm install
  pnpm exec vite build --logLevel warn
}

# The audit report from the #audit route, as plain text.
audit_report() {
  local port="$1"
  "$CHROME" "${CHROME_FLAGS[@]}" --dump-dom "http://127.0.0.1:$port/index.html#audit" 2>/dev/null \
    | python3 -c '
import html, re, sys
m = re.search(r"<pre id=\"audit\"[^>]*>(.*?)</pre>", sys.stdin.read(), re.S)
if not m:
    print("audit: could not read the report", file=sys.stderr); sys.exit(1)
print(html.unescape(re.sub(r"<[^>]+>", "", m.group(1))))
'
}
