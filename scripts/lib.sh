#!/usr/bin/env bash
# Shared by the scripts in this folder: find Chrome, build, and serve dist/.
# Source it; don't run it.

# google-chrome before chromium: CI warms google-chrome up (publish.yml), and
# on the runner chromium's cold start is slower still.
find_chrome() {
  local c
  for c in "${CHROME:-}" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome 2>/dev/null)" \
    "$(command -v chromium 2>/dev/null)" "$(command -v chromium-browser 2>/dev/null)" \
    "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"; do
    if [[ -n "$c" && -x "$c" ]]; then CHROME="$c"; return 0; fi
  done
  echo "error: Chrome not found (set CHROME=/path/to/chrome)" >&2
  return 1
}

# Headless Chrome refuses its own sandbox when run as root; harmless elsewhere.
chrome_flags() {
  # Keep headless jobs separate from the person's existing Chrome process.
  # A fresh HOME otherwise starts Chrome without producing the requested PDF.
  CHROME_PROFILE=$(mktemp -d "${TMPDIR:-/tmp}/sl-ide-chrome.XXXXXX")
  CHROME_FLAGS=(--headless --disable-gpu --no-first-run --user-data-dir="$CHROME_PROFILE" --virtual-time-budget=8000)
  trap '[[ -z "${SERVER_PID:-}" ]] || kill "$SERVER_PID" 2>/dev/null || true; rm -rf -- "$CHROME_PROFILE"' EXIT
  if [[ "$(id -u)" -eq 0 ]]; then CHROME_FLAGS+=(--no-sandbox); fi
}

# Chrome blocks ES modules over file://, so serve dist/ on localhost.
# Serve dist/ on a free port (scripts/serve.mjs) and set PORT, so parallel
# worktrees never measure each other's deck.
serve_dist() {
  local log
  log=$(mktemp "${TMPDIR:-/tmp}/sl-ide-serve.XXXXXX")
  node scripts/serve.mjs dist >"$log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 100); do
    PORT=$(sed -n 's/^listening on //p' "$log")
    if [[ -n "$PORT" ]]; then rm -f -- "$log"; return 0; fi
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.05
  done
  cat "$log" >&2; rm -f -- "$log"
  echo "error: could not start the deck server" >&2
  return 1
}

page_size() {
  read -r PAGE_W PAGE_H < <(node -e "import('./src/components/page.js').then(({ PAGE }) => console.log(PAGE.w, PAGE.h))")
}

build_dist() {
  # CI builds once, then explicitly reuses that artifact for audit and PDF.
  # Local commands still build by default; missing artifacts fail closed.
  if [[ "${SL_IDE_REUSE_DIST:-}" == "1" ]]; then
    [[ -s dist/index.html ]] || { echo "error: SL_IDE_REUSE_DIST needs a built dist/index.html" >&2; return 1; }
    return 0
  fi
  [[ -d node_modules ]] || pnpm install
  pnpm exec vite build --logLevel warn
}
