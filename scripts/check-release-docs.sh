#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "THIRD_PARTY_NOTICES.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "missing required release document: $file" >&2
    exit 1
  fi
done

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -Fq "$text" "$file"; then
    echo "$file should mention: $text" >&2
    exit 1
  fi
}

reject_text() {
  local file="$1"
  local text="$2"
  if grep -Fq "$text" "$file"; then
    echo "$file should not mention: $text" >&2
    exit 1
  fi
}

require_text README.md "Release Artifacts"
require_text README.md "Build Metadata"
require_text README.md "Release Provenance"
require_text README.md "RELEASE_PROVENANCE.json"
require_text README.md "Platform Caveats"
require_text README.md "Platform Support Matrix"
require_text README.md "GitHub Release download"
require_text README.md "Generated Debian package"
require_text README.md "macOS release runner architecture"
reject_text README.md "macOS arm64/amd64"
require_text README.md "Unsupported for the first release candidate"
require_text README.md "No Windows desktop artifact"
require_text README.md "No native package channels"
require_text README.md "not signed or notarized"
require_text README.md "rasterklang-desktop --version"
require_text README.md "BUILD_VERSION"
require_text README.md "Desktop/Webplayer Contract"
require_text README.md "WEBPLAYER_ARTIFACT_SHA256"
require_text README.md 'version` and `assetVersion` must match the `ASSET_VERSION`'
require_text README.md 'provenance.sourceDirty` must be `false`'
require_text README.md "rasterklang-desktop_0.1.0_amd64.deb"
require_text README.md "sudo apt install ./rasterklang-desktop_0.1.0_amd64.deb"
require_text README.md "Release Identity Preflight"
require_text README.md "dnoegel/rasterklang-desktop"
require_text README.md "github.com/dnoegel/rasterklang-desktop"
require_text README.md "Standalone Preflight"
require_text README.md "GOWORK=off go mod download all"
require_text README.md "github.com/dnoegel/rasterklang-cli@v0.1.0"
require_text README.md "HVSC SID files stay on your local disk"
require_text README.md "make smoke"
require_text README.md "Support Boundaries"
require_text README.md "Unsupported Tune Behavior"
require_text README.md "Unsupported RSID/BASIC/ROM edge cases"
require_text README.md "C64 ROM images"
require_text README.md "Native Feature Gaps"
require_text README.md 'browser-local `.sid` upload playback'
require_text README.md "instruction stepping"
require_text README.md "debug bridge parity"

require_text CHANGELOG.md "## Unreleased"
require_text CHANGELOG.md "## v0.1.0"
require_text CHANGELOG.md "pinned"
require_text CHANGELOG.md "rasterklang-webplayer"
require_text CHANGELOG.md "macOS and Linux"

require_text CONTRIBUTING.md "make check"
require_text CONTRIBUTING.md "scripts/test-sync-webplayer.sh"
require_text CONTRIBUTING.md "Do not commit SID files"
require_text CONTRIBUTING.md "frontend/dist"
require_text CONTRIBUTING.md "dist/"
require_text CONTRIBUTING.md "webplayer.lock"

require_text SECURITY.md "Supported Versions"
require_text SECURITY.md "Reporting a Vulnerability"
require_text SECURITY.md "untrusted SID files"
require_text SECURITY.md "local HVSC"

require_text THIRD_PARTY_NOTICES.md "github.com/dnoegel/rasterklang-cli"
require_text THIRD_PARTY_NOTICES.md "github.com/ebitengine/oto/v3"
require_text THIRD_PARTY_NOTICES.md "github.com/wailsapp/wails/v2"
require_text THIRD_PARTY_NOTICES.md "rasterklang-webplayer-ui"

for file in CHANGELOG.md CONTRIBUTING.md SECURITY.md; do
  require_text Makefile "$file"
done
