#!/usr/bin/env bash
# Start a new deck from sl-ide, in its own repo, keeping sl-ide's history so
# harness updates can be pulled in later (`git pull upstream main`).
#
#   pnpm new-project acme-pitch               -> ../acme-pitch, private GitHub repo
#   pnpm new-project acme-pitch --public      -> a public GitHub repo instead
#   pnpm new-project acme-pitch --no-github   -> local only; add a remote later
#   pnpm new-project acme-pitch --team acme   -> publish to sl-ide cloud under team "acme"
#   pnpm new-project acme-pitch --share public  -> anyone with the link can open it
#   DIR=~/decks pnpm new-project acme-pitch   -> ~/decks/acme-pitch
#
# Publishing to sl-ide cloud: writes sl-ide.config.json (slug = the name,
# visibility "team" unless --share public) when a team is known, from
# --team, $SL_IDE_TEAM or ~/.config/sl-ide/team. Sets the repo secret
# SL_IDE_PUBLISH_TOKEN from $SL_IDE_PUBLISH_TOKEN or
# ~/.config/sl-ide/publish-token, so the first push publishes.
#
# Works from sl-ide or from any deck made by it: it clones sl-ide itself (a
# deck's `upstream` remote, else this repo's `origin`), never the deck.
set -euo pipefail
cd "$(dirname "$0")/.."

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

CONF="${XDG_CONFIG_HOME:-$HOME/.config}/sl-ide"
NAME=""
VISIBILITY="--private"
GITHUB=1
TEAM="${SL_IDE_TEAM:-$(cat "$CONF/team" 2>/dev/null || true)}"
SHARE="team"
while (( $# )); do
  case "$1" in
    --public) VISIBILITY="--public" ;;
    --private) VISIBILITY="--private" ;;
    --no-github) GITHUB=0 ;;
    --team) TEAM="${2:-}"; shift ;;
    --share) SHARE="${2:-}"; shift ;;
    -h|--help) usage ;;
    -*) echo "error: unknown option $1" >&2; usage ;;
    *) [[ -z "$NAME" ]] && NAME="$1" || { echo "error: one name only" >&2; usage; } ;;
  esac
  shift
done
[[ -n "$NAME" ]] || usage
[[ "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "error: '$NAME' isn't a valid repo name (letters, digits, . _ -)" >&2; exit 1; }
[[ "$SHARE" == "team" || "$SHARE" == "public" ]] || { echo "error: --share is team or public" >&2; exit 1; }
SLUG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed -E 's/-+/-/g; s/^-|-$//g')
SLUG_RE='^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'
[[ "$SLUG" =~ $SLUG_RE ]] || { echo "error: can't make a deck slug from '$NAME'" >&2; exit 1; }
if [[ -n "$TEAM" && ! "$TEAM" =~ $SLUG_RE ]]; then
  echo "error: team '$TEAM' isn't a team slug (lowercase letters, digits, dashes)" >&2; exit 1
fi
TOKEN="${SL_IDE_PUBLISH_TOKEN:-$(cat "$CONF/publish-token" 2>/dev/null || true)}"

# sl-ide's URL: a deck points at it as `upstream`; sl-ide itself as `origin`.
SOURCE=$(git remote get-url upstream 2>/dev/null || git remote get-url origin 2>/dev/null || true)
[[ -n "$SOURCE" ]] || { echo "error: no upstream or origin remote to clone sl-ide from" >&2; exit 1; }

# The clone comes from GitHub, so unpushed harness work wouldn't be in it.
if ! git remote get-url upstream >/dev/null 2>&1; then
  git fetch -q origin 2>/dev/null || true
  ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
  if (( ahead > 0 )) || [[ -n "$(git status --porcelain -- . ':!output' ':!dist' 2>/dev/null)" ]]; then
    echo "warning: this sl-ide has unpushed or uncommitted changes; the new deck starts from what's on $SOURCE" >&2
  fi
fi

PARENT="${DIR:-$(cd .. && pwd)}"
DEST="$PARENT/$NAME"
[[ ! -e "$DEST" ]] || { echo "error: $DEST already exists" >&2; exit 1; }

if (( GITHUB )); then
  command -v gh >/dev/null || { echo "error: gh not installed (use --no-github, or brew install gh)" >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "error: gh isn't logged in (gh auth login, or use --no-github)" >&2; exit 1; }
  OWNER=$(gh api user -q .login)
  if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then
    echo "error: github.com/$OWNER/$NAME already exists" >&2; exit 1
  fi
fi

echo "cloning sl-ide from $SOURCE into $DEST"
git clone -q "$SOURCE" "$DEST"
cd "$DEST"
git remote rename origin upstream
# Pulls from sl-ide merge rather than ask; a deck's history stays readable.
git config pull.rebase false

if [[ -n "$TEAM" ]]; then
  printf '{\n  "slug": "%s",\n  "team": "%s",\n  "visibility": "%s"\n}\n' "$SLUG" "$TEAM" "$SHARE" > sl-ide.config.json
  git add sl-ide.config.json
  git -c core.hooksPath=/dev/null commit -q -m "Publish to sl-ide cloud as $SLUG ($SHARE, team $TEAM)"
fi

if (( GITHUB )); then
  echo "creating ${VISIBILITY#--} repo github.com/$OWNER/$NAME"
  gh repo create "$NAME" "$VISIBILITY" --source . --remote origin >/dev/null
  # Before the first push, so its CI run can publish.
  if [[ -n "$TOKEN" ]]; then
    printf %s "$TOKEN" | gh secret set SL_IDE_PUBLISH_TOKEN --repo "$OWNER/$NAME" >/dev/null
  fi
  git push -q -u origin main
fi

echo "installing dependencies"
pnpm install --silent

cat <<EOF

  New deck ready: $DEST
    upstream  $SOURCE   (sl-ide: git pull upstream main for harness updates)
$( (( GITHUB )) && echo "    origin    $(git remote get-url origin)" || echo "    origin    none yet: gh repo create $NAME --private --source . --push" )

$( if [[ -n "$TEAM" ]]; then echo "    publish   https://sl-ide.com/d/$SLUG/   ($SHARE, team $TEAM; every push to main)"; else echo "    publish   not set up: rerun with --team <slug>, or add sl-ide.config.json (README)"; fi )
$( if (( GITHUB )) && [[ -n "$TEAM" && -z "$TOKEN" ]]; then echo "    secret    missing: gh secret set SL_IDE_PUBLISH_TOKEN (or save it in $CONF/publish-token)"; fi )

  Next:
    cd $DEST && pnpm dev
    then open Claude Code or Codex there and run /new-deck

EOF
