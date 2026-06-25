# Third-Party Notices

Rasterklang Desktop is licensed under the MIT License. See `LICENSE`.

This repository depends on third-party Go modules declared in `go.mod` and
locked in `go.sum`, including Wails and the Rasterklang engine module. Release
archives are built from the exact tagged source state, so this notice must be
reviewed whenever `go.mod`, `go.sum`, or the pinned webplayer artifact changes.

Known runtime dependency and artifact surface for the desktop release:

| Component | Version | License | Use |
| --- | --- | --- | --- |
| `github.com/dnoegel/rasterklang-cli` | v0.1.0 | MIT | SID parsing, rendering, and playback engine. |
| `github.com/ebitengine/oto/v3` | v3.4.0 | Apache-2.0 | Native audio output. |
| `github.com/wailsapp/wails/v2` | v2.12.0 | MIT | Desktop shell and native/frontend bridge. |
| `rasterklang-webplayer-ui` | pinned by release artifact | MIT plus its notices | Shared frontend embedded into the desktop app. |

Desktop builds embed a web frontend generated from the Rasterklang webplayer
source plus `frontend/overrides`. The exact webplayer source or artifact used for
a release must be pinned and recorded before the desktop artifact is published.

Desktop builds do not intentionally include the HVSC tune corpus, C64 ROM
images, or third-party SID files. Users provide their own local SID collection.

Before each public release, generate and review a complete dependency license
report from the exact tagged source state and include any required notices with
the release.
