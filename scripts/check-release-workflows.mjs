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
  "MACOSX_DEPLOYMENT_TARGET",
  "CGO_CFLAGS",
  "webkit2_41",
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
assert.match(ci, /libwebkit2gtk-4\.1-dev/, "CI should install Linux WebKitGTK dependencies");

const release = readRequired(".github/workflows/release.yml");
assertIncludes(release, ".github/workflows/release.yml", [
  "name: Desktop Release",
  "contents: write",
  "workflow_dispatch:",
  "webplayer_artifact_url",
  "webplayer_artifact_sha256",
  "asset_version",
  "desktop_version",
  "github.event.inputs.webplayer_artifact_url",
  "github.event.inputs.webplayer_artifact_sha256",
  "github.event.inputs.asset_version",
  "github.event.inputs.desktop_version",
  "ubuntu-24.04",
  "macos-14",
  "WEBPLAYER_ARTIFACT_URL",
  "WEBPLAYER_ARTIFACT_SHA256",
  "WEBPLAYER_ARTIFACT=",
  "ASSET_VERSION=",
  "VERSION=",
  'node scripts/check-webplayer-lock-release.mjs webplayer.lock "$WEBPLAYER_ARTIFACT_URL" "$WEBPLAYER_ARTIFACT_SHA256"',
  "make dist",
  "dist/*.deb",
  "dist/*.deb.sha256",
  "softprops/action-gh-release@v2",
]);
assert.match(release, /sha(256sum|sum -a 256)/, "release workflow should verify checksums");
assert.match(release, /libwebkit2gtk-4\.1-dev/, "release workflow should install Linux WebKitGTK dependencies");
for (const forbidden of [
  "tags:",
  "v*",
  "vars.WEBPLAYER_ARTIFACT_URL",
  "vars.WEBPLAYER_ARTIFACT_SHA256",
  "|| github.ref_name",
]) {
  assert.ok(
    !release.includes(forbidden),
    `.github/workflows/release.yml should not include tag-triggered or fallback release input: ${forbidden}`,
  );
}
