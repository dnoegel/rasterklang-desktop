# Security Policy

## Supported Versions

Rasterklang Desktop has not published a stable release yet. Security fixes
target the current `main` branch until the first public tag is cut.

After `v0.1.0`, supported versions will be listed here before release.

## Reporting a Vulnerability

Please report suspected security issues privately instead of opening a public
issue. Email the maintainer at `security@rasterklang.de` with:

- affected version or commit
- operating system and architecture
- reproduction steps or proof of concept
- expected impact

You should receive an acknowledgement within seven days. Public disclosure,
release notes, and credits will be coordinated after a fix is available.

## Scope

Security reports are most useful for crashes, hangs, unsafe filesystem access,
or runaway resource use triggered by untrusted SID files, malformed HVSC
metadata, local HVSC folder selection, native audio playback, Wails bridge calls,
release artifact integrity issues, or CI/release pipeline problems.

The desktop app reads SID files from a user-selected local folder and should not
upload the local collection by default. Reports about unexpected network access
or accidental tune-data disclosure are also in scope.
