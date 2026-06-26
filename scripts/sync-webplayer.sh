#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBPLAYER_DIR="${WEBPLAYER_DIR:-"$ROOT_DIR/../rasterklang-webplayer"}"
WEBPLAYER_ARTIFACT="${WEBPLAYER_ARTIFACT:-}"
WEBPLAYER_ARTIFACT_SHA256="${WEBPLAYER_ARTIFACT_SHA256:-}"
DIST_DIR="${SYNC_OUTPUT_DIR:-"$ROOT_DIR/frontend/dist"}"
OVERLAY_DIR="$ROOT_DIR/frontend/overrides"
VERSION="${ASSET_VERSION:-$(date -u +%Y-%m-%d-%H%M%S)}"

if [[ -z "$DIST_DIR" || "$DIST_DIR" == "/" ]]; then
  echo "refusing to sync into unsafe output directory: ${DIST_DIR:-<empty>}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rasterklang-desktop-sync.XXXXXX")"
STAGE_DIR="$TMP_DIR/dist"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$STAGE_DIR"

calculate_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

validate_tar_paths() {
  local archive="$1"
  local entry
  while IFS= read -r entry; do
    case "$entry" in
      /*|../*|*/../*)
        echo "unsafe path in webplayer artifact: $entry" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "$archive")
}

validate_tar_member_types() {
  local archive="$1"
  local listing
  while IFS= read -r listing; do
    case "${listing:0:1}" in
      -|d)
        ;;
      *)
        echo "non-regular entry in webplayer artifact: $listing" >&2
        exit 1
        ;;
    esac
  done < <(tar -tvzf "$archive")
}

validate_webplayer_contract() {
  local hvsc_sha="$1"
  node - "$ROOT_DIR/webplayer.lock" "$STAGE_DIR/rasterklang-webplayer.json" "$VERSION" "${WEBPLAYER_ARTIFACT:+artifact}" "$hvsc_sha" <<'NODE'
const { readFileSync } = require("node:fs");

const [lockPath, metadataPath, expectedAssetVersion, sourceMode, expectedHvscSha256] = process.argv.slice(2);
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function uniqueSortedStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    fail(`${label} must be an array of non-empty strings`);
  }
  const sorted = [...value].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) {
      fail(`${label} contains duplicate capability: ${sorted[index]}`);
    }
  }
  return sorted;
}

if (metadata.name !== lock.package) {
  fail(`webplayer artifact package mismatch: expected ${lock.package}, got ${metadata.name}`);
}

if (metadata.version !== expectedAssetVersion) {
  fail(`webplayer artifact version mismatch: expected ${expectedAssetVersion}, got ${metadata.version}`);
}

if (metadata.assetVersion !== expectedAssetVersion) {
  fail(`webplayer artifact assetVersion mismatch: expected ${expectedAssetVersion}, got ${metadata.assetVersion}`);
}

if (sourceMode === "artifact") {
  const provenance = metadata.provenance || {};

  if (typeof provenance.sourceCommit !== "string" || !/^[0-9a-f]{7,40}$/i.test(provenance.sourceCommit)) {
    fail("webplayer artifact provenance.sourceCommit must be a Git commit SHA");
  }

  if (provenance.sourceDirty !== false) {
    fail("webplayer artifact provenance.sourceDirty must be false");
  }

  if (typeof provenance.builtAt !== "string" || Number.isNaN(Date.parse(provenance.builtAt))) {
    fail("webplayer artifact provenance.builtAt must be a valid timestamp");
  }

  if (
    typeof provenance.releaseURL !== "string" ||
    !/^https:\/\/github\.com\/dnoegel\/rasterklang-webplayer\/releases\/tag\/.+/.test(provenance.releaseURL)
  ) {
    fail("webplayer artifact provenance.releaseURL must point at the rasterklang-webplayer GitHub release tag");
  }
}

if (metadata.bridgeApiVersion !== lock.bridgeApiVersion) {
  fail(
    `webplayer bridgeApiVersion mismatch: expected ${lock.bridgeApiVersion}, got ${metadata.bridgeApiVersion}`,
  );
}

const expected = uniqueSortedStrings(lock.requiredDesktopCapabilities, "webplayer.lock requiredDesktopCapabilities");
const actual = uniqueSortedStrings(metadata.requiredDesktopCapabilities, "webplayer artifact requiredDesktopCapabilities");

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  fail(
    [
      "webplayer artifact requiredDesktopCapabilities do not match webplayer.lock",
      `expected: ${expected.join(", ")}`,
      `actual:   ${actual.join(", ")}`,
    ].join("\n"),
  );
}

if (metadata.assets?.hvscLibrary?.path !== "assets/hvsc-library.json") {
  fail("webplayer artifact assets.hvscLibrary.path must be assets/hvsc-library.json");
}

if (metadata.assets?.hvscLibrary?.sha256 !== expectedHvscSha256) {
  fail(
    [
      "webplayer artifact assets.hvscLibrary.sha256 does not match assets/hvsc-library.json",
      `expected: ${expectedHvscSha256}`,
      `actual:   ${metadata.assets?.hvscLibrary?.sha256 || "<missing>"}`,
    ].join("\n"),
  );
}
NODE
}

write_checkout_metadata() {
  node - "$ROOT_DIR/webplayer.lock" "$STAGE_DIR/rasterklang-webplayer.json" "$VERSION" "$HVSC_LIBRARY_SHA256" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");

const [lockPath, metadataPath, version, hvscLibrarySha256] = process.argv.slice(2);
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const metadata = {
  name: lock.package,
  version,
  assetVersion: version,
  bridgeApiVersion: lock.bridgeApiVersion,
  entrypoint: "index.html",
  staticRoot: ".",
  requiredDesktopCapabilities: lock.requiredDesktopCapabilities,
  assets: {
    hvscLibrary: {
      path: "assets/hvsc-library.json",
      sha256: hvscLibrarySha256,
    },
  },
  source: {
    type: "sibling-checkout",
    path: "../rasterklang-webplayer",
  },
};

writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
NODE
}

if [[ -n "$WEBPLAYER_ARTIFACT" ]]; then
  if [[ ! -f "$WEBPLAYER_ARTIFACT" ]]; then
    echo "webplayer artifact not found at: $WEBPLAYER_ARTIFACT" >&2
    exit 1
  fi
  if [[ -z "$WEBPLAYER_ARTIFACT_SHA256" ]]; then
    echo "WEBPLAYER_ARTIFACT_SHA256 is required when WEBPLAYER_ARTIFACT is set" >&2
    exit 1
  fi
  expected_sha="${WEBPLAYER_ARTIFACT_SHA256%%[[:space:]]*}"
  actual_sha="$(calculate_sha256 "$WEBPLAYER_ARTIFACT")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "webplayer artifact checksum mismatch" >&2
    echo "expected: $expected_sha" >&2
    echo "actual:   $actual_sha" >&2
    exit 1
  fi
  validate_tar_member_types "$WEBPLAYER_ARTIFACT"
  validate_tar_paths "$WEBPLAYER_ARTIFACT"
  tar -xzf "$WEBPLAYER_ARTIFACT" -C "$STAGE_DIR"
  SOURCE_LABEL="$WEBPLAYER_ARTIFACT"
else
  if [[ ! -d "$WEBPLAYER_DIR/src" ]]; then
    echo "webplayer source not found at: $WEBPLAYER_DIR" >&2
    exit 1
  fi
  for name in app.js index.html styles.css assets src; do
    entry="$WEBPLAYER_DIR/$name"
    if [[ -e "$entry" ]]; then
      cp -R "$entry" "$STAGE_DIR/"
    fi
  done
  SOURCE_LABEL="$WEBPLAYER_DIR"
fi

if [[ -n "$WEBPLAYER_ARTIFACT" && ! -f "$STAGE_DIR/rasterklang-webplayer.json" ]]; then
  echo "webplayer artifact is missing rasterklang-webplayer.json" >&2
  exit 1
fi

if [[ -z "$WEBPLAYER_ARTIFACT" && ! -f "$STAGE_DIR/rasterklang-webplayer.json" ]]; then
  HVSC_LIBRARY_SHA256="$(calculate_sha256 "$STAGE_DIR/assets/hvsc-library.json")"
  write_checkout_metadata
fi

for required in app.js index.html styles.css assets/hvsc-library.json src/shell/shell.js; do
  if [[ ! -e "$STAGE_DIR/$required" ]]; then
    echo "webplayer package is missing required file: $required" >&2
    exit 1
  fi
done

HVSC_LIBRARY_SHA256="${HVSC_LIBRARY_SHA256:-$(calculate_sha256 "$STAGE_DIR/assets/hvsc-library.json")}"
validate_webplayer_contract "$HVSC_LIBRARY_SHA256"

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

echo "Synced rasterklang-webplayer from $SOURCE_LABEL into $DIST_DIR (asset version: $VERSION)"
