#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBPLAYER_DIR="${WEBPLAYER_DIR:-"$ROOT_DIR/../rasterklang-webplayer"}"
DIST_DIR="$ROOT_DIR/frontend/dist"
OVERLAY_DIR="$ROOT_DIR/frontend/overrides"
VERSION="${ASSET_VERSION:-$(date -u +%Y-%m-%d-%H%M%S)}"

if [[ ! -d "$WEBPLAYER_DIR/src" ]]; then
  echo "webplayer source not found at: $WEBPLAYER_DIR" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rasterklang-desktop-sync.XXXXXX")"
STAGE_DIR="$TMP_DIR/dist"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$STAGE_DIR"

for name in app.js index.html styles.css assets src; do
  entry="$WEBPLAYER_DIR/$name"
  if [[ -e "$entry" ]]; then
    cp -R "$entry" "$STAGE_DIR/"
  fi
done

if [[ -d "$OVERLAY_DIR" ]]; then
  cp -R "$OVERLAY_DIR"/. "$STAGE_DIR"/
fi

export VERSION
find "$STAGE_DIR" -type f \( -name '*.js' -o -name '*.html' \) -exec perl -0pi -e '
  BEGIN { $v = $ENV{"VERSION"}; }
  s/\?v=[A-Za-z0-9_.:-]+/?v=$v/g;
  s/(const\s+(?:APP_VERSION|SECTION_VERSION)\s*=\s*")[^"]+(")/$1$v$2/g;
' {} +

rm -rf "$DIST_DIR"
mkdir -p "$(dirname "$DIST_DIR")"
mv "$STAGE_DIR" "$DIST_DIR"

echo "Synced rasterklang-webplayer into rasterklang-desktop frontend/dist (asset version: $VERSION)"
