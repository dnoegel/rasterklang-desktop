# Changelog

All notable changes to Rasterklang Desktop should be recorded here before a
public tag is created. The project follows semantic version-style tags such as
`v0.1.0`.

## Unreleased

- Added MIT licensing and starter third-party notices.
- Added macOS and Linux release artifact targets with SHA-256 checksum files.
- Added release workflows that build from a pinned `rasterklang-webplayer` UI
  artifact using `WEBPLAYER_ARTIFACT_URL` and `WEBPLAYER_ARTIFACT_SHA256`.
- Added `webplayer.lock` as the desktop/webplayer contract record.
- Added a release preflight that requires `webplayer.lock` to point at a
  published webplayer release asset with a recorded SHA-256 checksum before
  desktop release packaging can run.
- Hardened the desktop release workflow so supplied webplayer artifact URL and
  SHA-256 inputs must exactly match `webplayer.lock` before download or
  packaging.
- Added frontend contract checks for embedded webplayer metadata, required Wails
  bridge capabilities, desktop override boundaries, and bridge API versioning.
- Added `assets.hvscLibrary.sha256` validation so desktop sync and embedded
  frontend checks prove the webplayer catalog metadata matches the shipped file.
- Added native browser-local `.sid` upload playback through the Wails bridge;
  uploaded bytes are parsed locally and played by the Go audio engine without an
  HVSC root.
- Added artifact sync tests for local archive sync and sibling-checkout fallback.
- Synced the embedded webplayer snapshot, desktop override copy, and native
  picker/error states to describe a local SID collection instead of HVSC-branded
  first-run and navigation labels.
- Added `make check` as the local and CI release gate for formatting, shell
  syntax, webplayer sync, frontend contract checks, release workflow checks, Go
  vet, and Go tests.

## v0.1.0

Initial public release target. This version is not tagged until the release
checklist in `Rasterklang-Releaseplan.md` is complete for the desktop player.
