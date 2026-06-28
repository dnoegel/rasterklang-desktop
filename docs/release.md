# Rasterklang Desktop Release Notes

This file is for maintainers. Keep the public README focused on the desktop app
and local development.

## Release Artifacts

Build release artifacts with:

```sh
VERSION=v0.1.0 make dist
```

First release artifact scope:

- macOS: `.app.zip` for the current macOS release runner architecture
- Linux: `.tar.gz` and `.deb` for the current Linux release runner architecture
- Windows: no desktop artifact yet

macOS artifacts are not signed or notarized. Linux artifacts require distro
GTK/WebKitGTK/ALSA runtime libraries. Homebrew cask, apt repository, winget, and
other package channels are separate follow-up work.

The Debian package installs the binary, desktop entry, icon, and release
documentation:

```sh
sudo apt install ./rasterklang-desktop_0.1.0_amd64.deb
```

## Build Metadata

Release binaries print embedded build metadata:

```sh
rasterklang-desktop --version
```

`make build` and `make dist` inject `BUILD_VERSION`, `COMMIT`, and `DATE` with
Go linker flags. `VERSION=v0.1.0 make dist` uses that release tag as the build
version.

## Provenance

Desktop archives and Debian packages include `RELEASE_PROVENANCE.json` with:

- desktop version
- source commit
- build date
- source repository
- artifact target
- dirty-source flag
- pinned webplayer asset version
- optional webplayer artifact checksum
- `webplayerCatalogSha256` for the embedded `assets/hvsc-library.json`
- available GitHub Actions run context

This is a machine-readable build record, not a signed notarization or
cryptographic attestation.

## Pinned Webplayer Artifact

Release builds should consume a pinned `rasterklang-webplayer` UI artifact
rather than the sibling checkout fallback:

```sh
VERSION=v0.1.0 \
ASSET_VERSION=v0.1.0 \
WEBPLAYER_ARTIFACT=/path/to/rasterklang-webplayer-ui-v0.1.0.tar.gz \
WEBPLAYER_ARTIFACT_SHA256=<sha256> \
make dist
```

The GitHub release workflow accepts these required `workflow_dispatch` inputs:

- `webplayer_artifact_url`
- `webplayer_artifact_sha256`
- `asset_version`
- `desktop_version`

The release workflow has no tag trigger and no repository-variable fallback for
the webplayer artifact. Dispatch it only after `webplayer.lock` records the
published artifact.

## Webplayer Lock Preflight

```sh
make webplayer-lock-preflight
```

This verifies `webplayer.lock` points at a published
`rasterklang-webplayer-ui` GitHub Release asset with a recorded SHA-256 checksum.

The lock must record:

- `status: released`
- matching release tag and archive name in `artifact.url`
- exact `artifact.checksumSha256`
- expected `bridgeApiVersion`
- expected `requiredDesktopCapabilities`

Workflow inputs must exactly match `webplayer.lock.artifact.url` and
`webplayer.lock.artifact.checksumSha256`.

## Standalone Preflight

```sh
make standalone-preflight
```

This verifies the desktop app can resolve its public Go module graph without
local workspace help by running `GOWORK=off go mod download all`.

## Identity Preflight

```sh
make identity-preflight
```

This verifies the checkout points at `dnoegel/rasterklang-desktop` and that
`go.mod` declares `github.com/dnoegel/rasterklang-desktop`.

## Desktop/Webplayer Contract

`rasterklang-webplayer` owns the shared shell, catalog, route, and presentation
modules. Desktop consumes a versioned webplayer UI artifact and adds only the
native layer needed to run inside Wails.

Allowed desktop override areas:

- `frontend/overrides/app.js`
- `frontend/overrides/src/lib/native-engine.js`
- `frontend/overrides/src/lib/native-favorites.js`
- `frontend/overrides/src/lib/native-media-controls.js`
- `frontend/overrides/wailsjs/go/main/App.js`

Overrides must not replace shared shell, catalog, route, or presentation
modules.

`rasterklang-webplayer.json` inside the UI artifact must match `webplayer.lock`
for package name, version, asset version, `bridgeApiVersion`, required desktop
capabilities, and `assets.hvscLibrary.sha256`. Release sync refuses dirty-source
webplayer artifacts.

Breaking required Wails bridge calls require:

1. `bridgeApiVersion` bump in `rasterklang-webplayer`
2. updated `webplayer.lock`
3. matching desktop implementation in the same release train
