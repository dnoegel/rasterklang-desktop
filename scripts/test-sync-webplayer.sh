#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rasterklang-desktop-sync-test.XXXXXX")"
LOCK_BACKUP="$TMP_DIR/webplayer.lock.original"
cp "$ROOT_DIR/webplayer.lock" "$LOCK_BACKUP"

cleanup() {
  cp "$LOCK_BACKUP" "$ROOT_DIR/webplayer.lock" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

ARTIFACT_DIR="$TMP_DIR/artifact"
OUTPUT_DIR="$TMP_DIR/output"
ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-artifact-test.tar.gz"

mkdir -p "$ARTIFACT_DIR/assets" "$ARTIFACT_DIR/src/shell"

cat > "$ARTIFACT_DIR/rasterklang-webplayer.json" <<'JSON'
{
  "name": "rasterklang-webplayer-ui",
  "version": "artifact-test",
  "assetVersion": "artifact-test",
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
  ],
  "provenance": {
    "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
    "sourceDirty": false,
    "builtAt": "2026-06-26T00:00:00.000Z",
    "releaseURL": "https://github.com/dnoegel/rasterklang-webplayer/releases/tag/artifact-test"
  }
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

node - "$ARTIFACT_DIR/rasterklang-webplayer.json" "$ARTIFACT_DIR/assets/hvsc-library.json" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const [metadataPath, catalogPath] = process.argv.slice(2);
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
metadata.assets = {
  ...(metadata.assets || {}),
  hvscLibrary: {
    path: "assets/hvsc-library.json",
    sha256: createHash("sha256").update(readFileSync(catalogPath)).digest("hex"),
  },
};
writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
NODE

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

CHECKOUT_OUTPUT_DIR="$TMP_DIR/checkout-output"
node - "$ROOT_DIR/webplayer.lock" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const lock = JSON.parse(readFileSync(path, "utf8"));
lock.requiredDesktopCapabilities = [
  ...new Set([
    ...lock.requiredDesktopCapabilities,
    "TemporaryCapabilityForSyncTest",
  ]),
];
writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
NODE

WEBPLAYER_DIR="$ARTIFACT_DIR" \
SYNC_OUTPUT_DIR="$CHECKOUT_OUTPUT_DIR" \
ASSET_VERSION="checkout-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null

node - "$CHECKOUT_OUTPUT_DIR/rasterklang-webplayer.json" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const metadata = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.ok(
  metadata.requiredDesktopCapabilities.includes("TemporaryCapabilityForSyncTest"),
  "checkout metadata should be generated from webplayer.lock requiredDesktopCapabilities",
);
NODE

cp "$LOCK_BACKUP" "$ROOT_DIR/webplayer.lock"

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

NO_CHECKSUM_OUTPUT_DIR="$TMP_DIR/no-checksum-output"
if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$ARCHIVE" \
  SYNC_OUTPUT_DIR="$NO_CHECKSUM_OUTPUT_DIR" \
  ASSET_VERSION="missing-checksum" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/no-checksum.err"; then
  echo "sync accepted a webplayer artifact without WEBPLAYER_ARTIFACT_SHA256" >&2
  exit 1
fi

grep -q "WEBPLAYER_ARTIFACT_SHA256 is required" "$TMP_DIR/no-checksum.err"

NO_CATALOG_HASH_ARTIFACT_DIR="$TMP_DIR/no-catalog-hash-artifact"
NO_CATALOG_HASH_ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-no-catalog-hash.tar.gz"
NO_CATALOG_HASH_OUTPUT_DIR="$TMP_DIR/no-catalog-hash-output"
cp -R "$ARTIFACT_DIR" "$NO_CATALOG_HASH_ARTIFACT_DIR"
node - "$NO_CATALOG_HASH_ARTIFACT_DIR/rasterklang-webplayer.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const metadata = JSON.parse(readFileSync(path, "utf8"));
delete metadata.assets.hvscLibrary.sha256;
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
tar -C "$NO_CATALOG_HASH_ARTIFACT_DIR" -czf "$NO_CATALOG_HASH_ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  NO_CATALOG_HASH_CHECKSUM="$(sha256sum "$NO_CATALOG_HASH_ARCHIVE" | awk '{print $1}')"
else
  NO_CATALOG_HASH_CHECKSUM="$(shasum -a 256 "$NO_CATALOG_HASH_ARCHIVE" | awk '{print $1}')"
fi

if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$NO_CATALOG_HASH_ARCHIVE" \
  WEBPLAYER_ARTIFACT_SHA256="$NO_CATALOG_HASH_CHECKSUM" \
  SYNC_OUTPUT_DIR="$NO_CATALOG_HASH_OUTPUT_DIR" \
  ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/no-catalog-hash.err"; then
  echo "sync accepted a webplayer artifact without assets.hvscLibrary.sha256" >&2
  exit 1
fi

grep -q "assets.hvscLibrary.sha256" "$TMP_DIR/no-catalog-hash.err"

BAD_VERSION_ARTIFACT_DIR="$TMP_DIR/bad-version-artifact"
BAD_VERSION_ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-bad-version.tar.gz"
BAD_VERSION_OUTPUT_DIR="$TMP_DIR/bad-version-output"

cp -R "$ARTIFACT_DIR" "$BAD_VERSION_ARTIFACT_DIR"
node - "$BAD_VERSION_ARTIFACT_DIR/rasterklang-webplayer.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const metadata = JSON.parse(readFileSync(path, "utf8"));
metadata.version = "stale-artifact";
metadata.assetVersion = "stale-artifact";
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
tar -C "$BAD_VERSION_ARTIFACT_DIR" -czf "$BAD_VERSION_ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  BAD_VERSION_CHECKSUM="$(sha256sum "$BAD_VERSION_ARCHIVE" | awk '{print $1}')"
else
  BAD_VERSION_CHECKSUM="$(shasum -a 256 "$BAD_VERSION_ARCHIVE" | awk '{print $1}')"
fi

if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$BAD_VERSION_ARCHIVE" \
  WEBPLAYER_ARTIFACT_SHA256="$BAD_VERSION_CHECKSUM" \
  SYNC_OUTPUT_DIR="$BAD_VERSION_OUTPUT_DIR" \
  ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/bad-version.err"; then
  echo "sync accepted a webplayer artifact with stale version metadata" >&2
  exit 1
fi

grep -q "webplayer artifact version mismatch" "$TMP_DIR/bad-version.err"

DIRTY_ARTIFACT_DIR="$TMP_DIR/dirty-source-artifact"
DIRTY_ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-dirty-source.tar.gz"
DIRTY_OUTPUT_DIR="$TMP_DIR/dirty-source-output"

cp -R "$ARTIFACT_DIR" "$DIRTY_ARTIFACT_DIR"
node - "$DIRTY_ARTIFACT_DIR/rasterklang-webplayer.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const metadata = JSON.parse(readFileSync(path, "utf8"));
metadata.provenance = {
  ...(metadata.provenance || {}),
  sourceDirty: true,
};
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
tar -C "$DIRTY_ARTIFACT_DIR" -czf "$DIRTY_ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  DIRTY_CHECKSUM="$(sha256sum "$DIRTY_ARCHIVE" | awk '{print $1}')"
else
  DIRTY_CHECKSUM="$(shasum -a 256 "$DIRTY_ARCHIVE" | awk '{print $1}')"
fi

if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$DIRTY_ARCHIVE" \
  WEBPLAYER_ARTIFACT_SHA256="$DIRTY_CHECKSUM" \
  SYNC_OUTPUT_DIR="$DIRTY_OUTPUT_DIR" \
  ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/dirty-source.err"; then
  echo "sync accepted a webplayer artifact built from dirty source" >&2
  exit 1
fi

grep -q "provenance.sourceDirty" "$TMP_DIR/dirty-source.err"

MISSING_PROVENANCE_ARTIFACT_DIR="$TMP_DIR/missing-provenance-artifact"
MISSING_PROVENANCE_ARCHIVE="$TMP_DIR/rasterklang-webplayer-ui-missing-provenance.tar.gz"
MISSING_PROVENANCE_OUTPUT_DIR="$TMP_DIR/missing-provenance-output"

cp -R "$ARTIFACT_DIR" "$MISSING_PROVENANCE_ARTIFACT_DIR"
node - "$MISSING_PROVENANCE_ARTIFACT_DIR/rasterklang-webplayer.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = process.argv[2];
const metadata = JSON.parse(readFileSync(path, "utf8"));
delete metadata.provenance.sourceCommit;
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
tar -C "$MISSING_PROVENANCE_ARTIFACT_DIR" -czf "$MISSING_PROVENANCE_ARCHIVE" .

if command -v sha256sum >/dev/null 2>&1; then
  MISSING_PROVENANCE_CHECKSUM="$(sha256sum "$MISSING_PROVENANCE_ARCHIVE" | awk '{print $1}')"
else
  MISSING_PROVENANCE_CHECKSUM="$(shasum -a 256 "$MISSING_PROVENANCE_ARCHIVE" | awk '{print $1}')"
fi

if WEBPLAYER_DIR="$TMP_DIR/missing-checkout" \
  WEBPLAYER_ARTIFACT="$MISSING_PROVENANCE_ARCHIVE" \
  WEBPLAYER_ARTIFACT_SHA256="$MISSING_PROVENANCE_CHECKSUM" \
  SYNC_OUTPUT_DIR="$MISSING_PROVENANCE_OUTPUT_DIR" \
  ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/missing-provenance.err"; then
  echo "sync accepted a webplayer artifact without provenance.sourceCommit" >&2
  exit 1
fi

grep -q "provenance.sourceCommit" "$TMP_DIR/missing-provenance.err"

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
  ASSET_VERSION="artifact-test" \
  "$ROOT_DIR/scripts/sync-webplayer.sh" >/dev/null 2>"$TMP_DIR/bad-contract.err"; then
  echo "sync accepted a webplayer artifact with a stale desktop capability contract" >&2
  exit 1
fi

grep -q "requiredDesktopCapabilities" "$TMP_DIR/bad-contract.err"
