#!/usr/bin/env bash
# Fetch the deck's typefaces from Google Fonts and self-host them in src/fonts/.
#
#   pnpm fonts
#
# Edit FACES to change the deck's type (the /sl-ide-setup skill does this when it
# sets the style), then add a matching @font-face per file in src/styles.css.
# Each entry is  <file-stem>:<css2 family query>.  The file stem must start
# with the family in kebab case (inter-tight-…), because scripts/check-fonts.sh
# derives the allowed PDF font names from the file names.
#
# Nothing may be fetched at print time: a face missing at print falls back to
# Arial without a word. The woff2 files are committed; this script only makes
# them reproducible. Only use faces whose licence allows self-hosting (OFL).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/fonts

FACES=(
  "inter-tight-400:Inter+Tight:wght@400"
  "inter-tight-500:Inter+Tight:wght@500"
  "inter-tight-600:Inter+Tight:wght@600"
  "inter-tight-700:Inter+Tight:wght@700"
  "inter-tight-800:Inter+Tight:wght@800"
  "source-serif-400:Source+Serif+4:wght@400"
  "source-serif-600:Source+Serif+4:wght@600"
  "source-serif-400i:Source+Serif+4:ital,wght@1,400"
  "jetbrains-mono-400:JetBrains+Mono:wght@400"
)
# Glyphs the latin subset lacks but the copy uses (→ ≈), cut per weight.
SYMBOL_FAMILY="Inter+Tight"
SYMBOL_STEM="inter-tight"
SYMBOL_WEIGHTS=(400 600 700)
SYMBOL_TEXT="%E2%86%92%E2%89%88"

# Google's CSS API serves woff2 only when the UA looks modern.
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

# The CSS2 API returns one @font-face per unicode-range subset with latin
# last; select by the `/* latin */` comment that precedes it.
grab() {
  local out="$1" query="$2" url
  url=$(curl -sf -A "$UA" "https://fonts.googleapis.com/css2?family=$query" \
        | awk '/\/\* latin \*\//{f=1} f&&/src:/{print;exit}' \
        | grep -oE 'https://[^)]+\.woff2')
  [[ -n "$url" ]] || { echo "error: no latin woff2 for $query" >&2; return 1; }
  curl -sf -o "src/fonts/$out" "$url"
  printf '  %-30s %7s bytes\n' "$out" "$(wc -c < "src/fonts/$out" | tr -d ' ')"
}

echo "fetching latin woff2 subsets into src/fonts/"
for f in "${FACES[@]}"; do grab "${f%%:*}.woff2" "${f#*:}"; done
for w in ${SYMBOL_WEIGHTS[@]+"${SYMBOL_WEIGHTS[@]}"}; do
  url=$(curl -sf -A "$UA" "https://fonts.googleapis.com/css2?family=$SYMBOL_FAMILY:wght@$w&text=$SYMBOL_TEXT" | grep -oE 'https://[^)]+')
  curl -sf -o "src/fonts/$SYMBOL_STEM-$w-symbols.woff2" "$url"
  printf '  %-30s %7s bytes\n' "$SYMBOL_STEM-$w-symbols.woff2" "$(wc -c < "src/fonts/$SYMBOL_STEM-$w-symbols.woff2" | tr -d ' ')"
done
echo "done. Update the @font-face rules in src/styles.css, then rebuild."
