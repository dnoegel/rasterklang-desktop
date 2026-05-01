# Rasterklang Desktop

| Search | Insight |
| --- | --- |
| ![Rasterklang Desktop search view](docs/assets/Search.png) | ![Rasterklang Desktop audio insight view](docs/assets/Insight.png) |

`rk-desktop` is the native desktop player for Rasterklang. It packages the
shared web player interface with a local Go/Wails shell and plays HVSC SID files
through the native `github.com/dnoegel/zmk-sid` audio engine.

The UI and catalog browsing experience are shared with `rk-webplayer`, but
audio playback, HVSC folder selection, configuration, equalizer state, and
debug snapshots are handled locally by the desktop app.

## Run

```sh
cd rk-desktop
make run
```

`make run` syncs the bundled web UI, generates the app icon, and starts the app
with the Wails tags `desktop,production`.

On first launch, use the `HVSC Collection` button in the sidebar and select
your local `C64Music` folder, or a parent folder that contains `C64Music`. The
selection is stored in the platform user config directory.

## Build

```sh
make build
```

This creates `bin/rasterklang`. The web UI, app icon, and
`hvsc-library.json` manifest are embedded into the binary. The actual HVSC SID
files stay on your local disk.

The app icon is generated from `scripts/generate-icon.go` into:

- `build/appicon.png`
- `build/appicon.svg`

Wails uses `build/appicon.png` for application icons and platform packaging.

## Install

```sh
make install
```

On macOS, this builds `build/Rasterklang.app` and installs it to
`/Applications`.

```sh
INSTALL_APP_DIR="$HOME/Applications" make install
```

On Linux, this installs the binary as `rasterklang`, plus a desktop entry and
icon under `PREFIX`.

```sh
PREFIX="$HOME/.local" make install
```

## Dependencies

Linux needs the Wails/WebKitGTK development packages for your distribution.
On Debian/Ubuntu:

```sh
sudo apt-get install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev libasound2-dev
```

macOS needs the Xcode command line tools:

```sh
xcode-select --install
```

The Makefile adds the Wails linker flags required for
`UniformTypeIdentifiers` on macOS.

## Architecture

- `../zmk-webplayer` is the source for the shared UI: shell, sections, player,
  catalog logic, and CSS.
- `frontend/overrides` contains only the desktop-specific frontend layer:
  Wails bootstrap, native engine bridge, and Wails bindings.
- `frontend/dist` is generated from webplayer sources plus overrides. Do not
  edit it directly; `make run`, `make build`, and `make sync-webplayer`
  regenerate it.
- `frontend/dist/src/lib/native-engine.js` exposes the same frontend API as the
  browser engine, but delegates playback to Wails/Go.
- `app.go` provides native dialogs, HVSC root configuration, and playback API
  methods.
- `audio.go` renders SID audio with `github.com/dnoegel/zmk-sid` and outputs it
  through Oto.

## Sync The Web UI

```sh
make sync-webplayer
```

The source directory and asset version can be overridden:

```sh
WEBPLAYER_DIR=../zmk-webplayer ASSET_VERSION=dev make sync-webplayer
```
