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
- Added frontend contract checks for embedded webplayer metadata, required Wails
  bridge capabilities, desktop override boundaries, and bridge API versioning.
- Added native browser-local `.sid` upload playback through the Wails bridge;
  uploaded bytes are parsed locally and played by the Go audio engine without an
  HVSC root.
- Added artifact sync tests for local archive sync and sibling-checkout fallback.
- Added `make check` as the local and CI release gate for formatting, shell
  syntax, webplayer sync, frontend contract checks, release workflow checks, Go
  vet, and Go tests.

## v0.1.0

Initial public release target. This version is not tagged until the release
checklist in `Rasterklang-Releaseplan.md` is complete for the desktop player.
