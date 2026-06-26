# Rasterklang Desktop

[![Desktop CI](https://github.com/dnoegel/rasterklang-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/dnoegel/rasterklang-desktop/actions/workflows/ci.yml)
[![Desktop Release](https://github.com/dnoegel/rasterklang-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/dnoegel/rasterklang-desktop/actions/workflows/release.yml)

Rasterklang Desktop is a native SID library player for macOS and Linux. It uses
the shared Rasterklang web player interface for browsing and insight views, then
plays local SID files through the native Go audio engine.

| Search | Insight |
| --- | --- |
| ![Rasterklang Desktop search view](docs/assets/Search.png) | ![Rasterklang Desktop audio insight view](docs/assets/Insight.png) |

## Features

- Browse local SID collections and HVSC-style folder layouts.
- Search artists, games, demos, and tracks.
- Play subtunes through the native Rasterklang engine.
- Keep favorites in the platform user config directory.
- Inspect playback through the shared Insight views.
- Use the same player UI surface as `rasterklang-webplayer`.

Rasterklang Desktop does not bundle HVSC, C64 ROM images, BASIC/KERNAL ROMs, or
uncleared third-party SID files.

## Run From Source

```sh
make run
```

`make run` syncs the bundled web UI, generates the app icon, and starts the app.

On first launch, choose your local SID folder with the `SID Collection` button in
the sidebar. HVSC-style `C64Music` folders are recognized automatically,
including parent folders that contain `C64Music`.

Config and favorites are stored in the platform user config directory:

- macOS: `~/Library/Application Support/rasterklang`
- Linux: `$XDG_CONFIG_HOME/rasterklang` or `~/.config/rasterklang`

## Build

```sh
make build
```

This creates `bin/rasterklang-desktop`. The web UI, app icon, and
`hvsc-library.json` manifest are embedded into the binary. SID files stay on
your local disk.

Install locally:

```sh
make install
```

On macOS this installs `Rasterklang.app` to `/Applications` by default:

```sh
INSTALL_APP_DIR="$HOME/Applications" make install
```

On Linux this installs the binary, desktop entry, and icon under `PREFIX`:

```sh
PREFIX="$HOME/.local" make install
```

## Release Downloads

GitHub Releases provide macOS app archives and Linux packages. On Debian/Ubuntu,
install the generated package like this:

```sh
sudo apt install ./rasterklang-desktop_0.1.0_amd64.deb
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

## Development

```sh
make check
make smoke
make sync-webplayer
```

The smoke target builds the desktop binary, validates embedded frontend assets,
initializes the native app bridge, reads library/playback/favorites state, and
exits before opening a GUI window.

`frontend/dist` is intentionally tracked as the embedded Wails frontend snapshot.
Do not edit it directly; refresh it through `make sync-webplayer`, `make build`,
or `make dist`.

## Architecture

- `../rasterklang-webplayer` owns the shared shell, catalog, routes, and player UI.
- `frontend/overrides` contains the desktop-specific frontend layer.
- `app.go` provides dialogs, SID root configuration, favorites, and playback API
  methods.
- `audio.go` renders SID audio with `github.com/dnoegel/rasterklang-cli` and
  outputs it through Oto.

If desktop needs a shared UI capability, add it to the webplayer contract first
and then implement the native bridge here.

## Current Limits

- macOS builds are not signed or notarized yet.
- Linux builds depend on distribution WebKitGTK/GTK/ALSA runtime libraries.
- Windows desktop artifacts are not part of the first release path.
- Native instruction stepping is still WASM/debugger-only.
- Native trace-stream parity is incomplete.

Maintainer release and webplayer-artifact notes live in
[docs/release.md](docs/release.md).
