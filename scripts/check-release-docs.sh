#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "THIRD_PARTY_NOTICES.md"
  "docs/release.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "missing required document: $file" >&2
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

require_text README.md "native SID library player"
require_text README.md "does not bundle HVSC"
require_text README.md "## Run From Source"
require_text README.md "## Current Limits"
require_text README.md "docs/release.md"

require_text docs/release.md "Release Artifacts"
require_text docs/release.md "Pinned Webplayer Artifact"
require_text docs/release.md "webplayer.lock"
require_text docs/release.md "Desktop/Webplayer Contract"

require_text CHANGELOG.md "## Unreleased"
require_text CHANGELOG.md "## v0.1.0"

require_text CONTRIBUTING.md "make check"
require_text CONTRIBUTING.md "frontend/dist"
require_text CONTRIBUTING.md "Do not commit SID files"

require_text SECURITY.md "Supported Versions"
require_text SECURITY.md "Reporting a Vulnerability"

require_text THIRD_PARTY_NOTICES.md "github.com/dnoegel/rasterklang-cli"
require_text THIRD_PARTY_NOTICES.md "github.com/wailsapp/wails/v2"

reject_text README.md "macOS arm64/amd64"
reject_text app.go "HVSC Collection oder C64Music Ordner auswaehlen"
reject_text app.go "lokale HVSC Collection"
reject_text app.go "sieht nicht wie eine HVSC Collection aus"
reject_text app.go "HVSC nicht erkannt"
reject_text app.go "Keine HVSC gewaehlt"
reject_text app.go "gespeicherte HVSC Ordner"
reject_text frontend/dist/app.js "Bitte lokale HVSC Collection auswaehlen."
reject_text frontend/dist/app.js "HVSC Manifest konnte nicht geladen werden"
reject_text frontend/overrides/app.js "Bitte lokale HVSC Collection auswaehlen."
reject_text frontend/overrides/app.js "HVSC Manifest konnte nicht geladen werden"
reject_text frontend/dist/app.js "Could not load HVSC manifest"
reject_text frontend/dist/src/sections/artists.js "from the HVSC"
reject_text frontend/dist/src/sections/demos.js "from the HVSC"
reject_text frontend/dist/src/sections/games.js "from the HVSC"
reject_text frontend/dist/src/sections/home.js "HVSC Picks"
reject_text frontend/dist/src/sections/home.js "large HVSC catalogs"
reject_text frontend/dist/src/sections/home.js "Your local HVSC"
reject_text frontend/dist/src/sections/releases.js "HVSC files"
reject_text frontend/dist/src/sections/search.js "Ready for HVSC search."
reject_text frontend/dist/src/shell/shell.js "HVSC Collection"
reject_text frontend/dist/src/shell/shell.js "No HVSC selected"
reject_text frontend/dist/src/shell/shell.js "Could not open HVSC"

echo "Release documents are present."
