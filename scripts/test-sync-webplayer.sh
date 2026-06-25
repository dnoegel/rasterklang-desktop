#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rasterklang-desktop-sync-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

ARTIFACT_DIR="$TMP_DIR/artifact"
OUTPUT_DIR="$TMP_DIR/output"
ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-artifact-test.tar.gz"

mkdir -p "$ARTIFACT_DIR/assets" "$ARTIFACT_DIR/src/shell"

cat > "$ARTIFACT_DIR/rasterklang-webplayer.json" <<'JSON'
{
  "name": "rasterklang-webplayer-ui",
  "version": "artifact-test-source",
  "assetVersion": "artifact-test-source",
  "bridgeApiVersion": "1",
  "entrypoint": "index.html",
  "staticRoot": ".",
  "requiredDesktopCapabilities": [
    "GetPlaybackState",
    "LoadTrack",
    "PlayTrack",
    "ResetEqualizer",
    "Seek",
    "SetAudioControls",
    "SetEqualizer",
    "SetVolume",
    "Stop",
    "ToggleMute",
    "TogglePause"
  ]
}
JSON

cat > "$ARTIFACT_DIR/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="./styles.css?v=source-version">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./app.js?v=source-version"></script>
  </body>
</html>
HTML

cat > "$ARTIFACT_DIR/app.js" <<'JS'
const APP_VERSION = "source-version";
console.log(APP_VERSION);
JS

cat > "$ARTIFACT_DIR/styles.css" <<'CSS'
:root { color-scheme: dark; }
CSS

cat > "$ARTIFACT_DIR/assets/hvsc-library.json" <<'JSON'
[]
JSON

cat > "$ARTIFACT_DIR/src/shell/shell.js" <<'JS'
const SECTION_VERSION = "source-version";
export { SECTION_VERSION };
JS

cat > "$ARTIFACT_DIR/artifact-sync-marker.txt" <<'TEXT'
artifact sync test marker
TEXT

tar -C "$ARTIFACT_DIR" -czf "$ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
else
  CHECKSUM="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
fi

WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
WEBPLAYER_ARTIFACT="$ARCHIVE" \
WEBPLAYER_ARTIFACT_SHA256="$CHECKSUM" \
SYNC_OUTPUT_DIR="$OUTPUT_DIR" \
ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null

test -f "$OUTPUT_DIR/rasterklang-webplayer.json"
test -f "$OUTPUT_DIR/artifact-sync-marker.txt"
test -f "$OUTPUT_DIR/wailsjs/go/main/App.js"
test -f "$OUTPUT_DIR/src/lib/native-engine.js"
grep -q '?v=artifact-test' "$OUTPUT_DIR/index.html"
grep -q 'APP_VERSION = "artifact-test"' "$OUTPUT_DIR/app.js"

if [[ -e "$ROOT_DIR/frontend/dist/artifact-sync-marker.txt" ]]; then
  echo "test output leaked into tracked frontend/dist" >&2
  exit 1
fi

BAD_ARTIFACT_DIR="$TMP_DIR/bad-artifact"
BAD_ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-bad-contract.tar.gz"
BAD_OUTPUT_DIR="$TMP_DIR/bad-output"

cp -R "$ARTIFACT_DIR" "$BAD_ARTIFACT_DIR"
node - "$BAD_ARTIFACT_DIR/rasterklang-webplayer.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const metadata = JSON.parse(readFileSync(path, "utf8"));
metadata.requiredDesktopCapabilities = ["GetPlaybackState"];
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
tar -C "$BAD_ARTIFACT_DIR" -czf "$BAD_ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  BAD_CHECKSUM="$(sha256sum "$BAD_ARCHIVE" | awk '{print $1}')"
else
  BAD_CHECKSUM="$(shasum -a 256 "$BAD_ARCHIVE" | awk '{print $1}')"
fi

if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$BAD_ARCHIVE" \
  WEBPLAYER_ARTIFACT_SHA256="$BAD_CHECKSUM" \
  SYNC_OUTPUT_DIR="$BAD_OUTPUT_DIR" \
  ASSET_VERSION="bad-contract" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/bad-contract.err"; then
  echo "sync accepted a webplayer artifact with a stale desktop capability contract" >&2
  exit 1
fi

grep -q "requiredDesktopCapabilities" "$TMP_DIR/bad-contract.err"
