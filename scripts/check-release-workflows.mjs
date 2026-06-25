import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function readRequired(path) {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

function assertIncludes(source, path, markers) {
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${path} should include ${marker}`);
  }
}

const makefile = readRequired("Makefile");
assertIncludes(makefile, "Makefile", [
  "dist:",
  "dist-linux:",
  "dist-darwin:",
  "WEBPLAYER_ARTIFACT",
  "WEBPLAYER_ARTIFACT_SHA256",
  "check-webplayer-lock-release.mjs",
  "webplayer-lock-preflight",
  "checksum",
]);

const ci = readRequired(".github/workflows/ci.yml");
assertIncludes(ci, ".github/workflows/ci.yml", [
  "name: Desktop CI",
  "pull_request:",
  "ubuntu-24.04",
  "macos-14",
  "actions/checkout@v4",
  "actions/setup-go@v5",
  "go-version-file: go.mod",
  "make check",
]);
assert.match(ci, /libwebkit2gtk-4\.0-dev/, "CI should install Linux WebKitGTK dependencies");

const release = readRequired(".github/workflows/release.yml");
assertIncludes(release, ".github/workflows/release.yml", [
  "name: Desktop Release",
  "contents: write",
  "tags:",
  "v*",
  "ubuntu-24.04",
  "macos-14",
  "WEBPLAYER_ARTIFACT_URL",
  "WEBPLAYER_ARTIFACT_SHA256",
  "WEBPLAYER_ARTIFACT=",
  "ASSET_VERSION=",
  "VERSION=",
  "make dist",
  "dist/*.deb",
  "dist/*.deb.sha256",
  "softprops/action-gh-release@v2",
]);
assert.match(release, /sha(256sum|sum -a 256)/, "release workflow should verify checksums");
