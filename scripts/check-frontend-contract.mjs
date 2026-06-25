import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "frontend/dist/index.html",
  "frontend/dist/app.js",
  "frontend/dist/styles.css",
  "frontend/dist/assets/hvsc-library.json",
  "frontend/dist/rasterklang-webplayer.json",
  "frontend/dist/src/lib/native-engine.js",
  "frontend/dist/src/lib/native-favorites.js",
  "frontend/dist/wailsjs/go/main/App.js",
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `${file} should exist in embedded frontend/dist`);
}

const manifest = JSON.parse(readFileSync("frontend/dist/assets/hvsc-library.json", "utf8"));
assert.equal(typeof manifest.generatedAt, "string", "HVSC manifest should include generatedAt");
assert.ok(Number(manifest.trackCount) > 0, "HVSC manifest should include tracks");
assert.ok(Array.isArray(manifest.tracks), "HVSC manifest tracks should be an array");

const metadata = JSON.parse(readFileSync("frontend/dist/rasterklang-webplayer.json", "utf8"));
const lock = JSON.parse(readFileSync("webplayer.lock", "utf8"));
assert.equal(metadata.name, lock.package);
assert.equal(metadata.bridgeApiVersion, lock.bridgeApiVersion);
assert.ok(
  Array.isArray(metadata.requiredDesktopCapabilities),
  "webplayer metadata should declare requiredDesktopCapabilities",
);
assert.deepEqual(
  normalizeCapabilities(metadata.requiredDesktopCapabilities, "webplayer metadata requiredDesktopCapabilities"),
  normalizeCapabilities(lock.requiredDesktopCapabilities, "webplayer.lock requiredDesktopCapabilities"),
  "webplayer metadata requiredDesktopCapabilities should match webplayer.lock",
);

const bridgeSource = readFileSync("frontend/dist/wailsjs/go/main/App.js", "utf8");
const goSource = readFileSync("app.go", "utf8");
const nativeEngineSource = readFileSync("frontend/dist/src/lib/native-engine.js", "utf8");
const readme = readFileSync("README.md", "utf8");

for (const capability of metadata.requiredDesktopCapabilities) {
  assert.match(
    bridgeSource,
    new RegExp(`export function ${capability}\\(`),
    `Wails bridge should export ${capability}`,
  );
  assert.match(
    goSource,
    new RegExp(`func \\(a \\*App\\) ${capability}\\(`),
    `Go App should implement ${capability}`,
  );
}

for (const capability of ["LoadUploadedTune", "PlayUploadedTune"]) {
  assert.match(
    bridgeSource,
    new RegExp(`export function ${capability}\\(`),
    `Wails bridge should export desktop-owned native upload method ${capability}`,
  );
  assert.match(
    goSource,
    new RegExp(`func \\(a \\*App\\) ${capability}\\(`),
    `Go App should implement desktop-owned native upload method ${capability}`,
  );
  assert.ok(
    nativeEngineSource.includes(capability),
    `native engine override should call desktop-owned native upload method ${capability}`,
  );
}

assert.ok(
  !nativeEngineSource.includes("Uploads sind in der nativen App noch nicht verdrahtet"),
  "native engine override should not keep the old upload-not-wired error",
);

for (const phrase of [
  "## Desktop/Webplayer Contract",
  "frontend/overrides/app.js",
  "frontend/overrides/src/lib/native-engine.js",
  "frontend/overrides/src/lib/native-favorites.js",
  "frontend/overrides/wailsjs/go/main/App.js",
  "must not override shared shell, catalog, route, or presentation modules",
  "webplayer.lock.requiredDesktopCapabilities",
  "requiredDesktopCapabilities",
  "Bridge Compatibility Rule",
  "bridgeApiVersion",
  "Breaking changes to required Wails bridge calls require a bridgeApiVersion bump",
  "native upload-byte loading",
]) {
  assert.ok(readme.includes(phrase), `README.md should document desktop/webplayer contract phrase: ${phrase}`);
}

function normalizeCapabilities(value, label) {
  assert.ok(Array.isArray(value), `${label} should be an array`);
  const sorted = [...value].sort();
  for (const capability of sorted) {
    assert.equal(typeof capability, "string", `${label} entries should be strings`);
    assert.notEqual(capability.trim(), "", `${label} entries should be non-empty`);
  }
  for (let index = 1; index < sorted.length; index += 1) {
    assert.notEqual(sorted[index], sorted[index - 1], `${label} should not contain duplicates`);
  }
  return sorted;
}
