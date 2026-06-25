# Contributing

Rasterklang Desktop is the native Wails player for the Rasterklang SID engine.
Keep changes small, documented, and covered by the closest practical check.

## Local Checks

Run the full release gate before sending changes:

```sh
make check
```

For webplayer sync changes, run or inspect:

```sh
bash scripts/test-sync-webplayer.sh
node scripts/check-frontend-contract.mjs
```

For release workflow or package changes, run:

```sh
node scripts/check-release-workflows.mjs
```

## Webplayer And Generated Frontend Rules

`rasterklang-webplayer` owns the shared shell, catalog, route, and presentation
modules. Desktop-specific frontend behavior belongs under `frontend/overrides`.

Tracked generated snapshot policy:

- `frontend/dist` is a checked-in generated snapshot because Wails embeds it in
  the Go binary and the desktop smoke path must work from a fresh checkout.
- Do not hand-edit frontend/dist. Regenerate it with `make sync-webplayer`,
  `make build`, or `make dist`.
- Commit frontend/dist changes only with the matching webplayer source or artifact update, so reviewers can see why the generated snapshot changed.
- Release builds must sync from WEBPLAYER_ARTIFACT with WEBPLAYER_ARTIFACT_SHA256.
  The sibling checkout fallback is for local development only.
- Release workflow inputs must match `webplayer.lock` exactly before artifact
  download or packaging.
- The first public release must record its artifact URL and checksum in
  `webplayer.lock`, set the lock status to `released`, and pass
  `make webplayer-lock-preflight`.

`dist/` is generated release output from `make dist`, `make license-report`, and
`make check`. Do not commit files from `dist/`; release archives, checksums, and
generated license reports should be rebuilt from the tagged source.

If webplayer requires new native bridge behavior, update the shared webplayer
artifact contract first, then update the Wails bridge and Go `App` methods in
desktop. Breaking bridge changes require a `bridgeApiVersion` bump.

## Legal Data Boundaries

Do not commit SID files, HVSC extracts, C64 ROM images, generated compatibility
reports from private corpora, or other third-party media unless the license is
explicitly documented and compatible with redistribution.

The desktop app should point at a local HVSC folder chosen by the user. It must
not bundle the HVSC tune corpus.

## Release Changes

Release-facing edits should keep these files current:

- `README.md` for platform support, artifact usage, installation, and current
  limitations.
- `CHANGELOG.md` for user-visible changes.
- `THIRD_PARTY_NOTICES.md` for dependency, Wails, webplayer, and runtime notices.
- `webplayer.lock` for the pinned shared UI contract.
- `.github/workflows/release.yml` for tag-built artifacts.
- `scripts/check-release-workflows.mjs`, `scripts/check-frontend-contract.mjs`,
  and `scripts/check-webplayer-lock-release.mjs` for release contract changes.
