import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(rootDir, "scripts/check-webplayer-lock-release.mjs");
const tmpDir = mkdtempSync(join(tmpdir(), "rasterklang-webplayer-lock-test."));

try {
  expectSuccess(releasedLock(), "released webplayer lock should pass release preflight");
  expectFailure(
    { ...releasedLock(), status: "pending-first-release" },
    "webplayer.lock status must be released",
  );
  expectFailure(
    {
      ...releasedLock(),
      artifact: {
        ...releasedLock().artifact,
        checksumSha256: null,
      },
    },
    "artifact.checksumSha256 must be a 64-character lowercase SHA-256",
  );
  expectFailure(
    {
      ...releasedLock(),
      artifact: {
        ...releasedLock().artifact,
        url: "",
      },
    },
    "artifact.url must point at the rasterklang-webplayer GitHub release asset",
  );
  expectFailure(
    {
      ...releasedLock(),
      artifact: {
        ...releasedLock().artifact,
        checksumRequiredForRelease: false,
      },
    },
    "artifact.checksumRequiredForRelease must be true",
  );
  expectFailure(
    {
      ...releasedLock(),
      artifact: {
        ...releasedLock().artifact,
        url: "https://github.com/dnoegel/rasterklang-webplayer/releases/download/v0.1.1/rasterklang-webplayer-ui-v0.1.0.tar.gz",
      },
    },
    "artifact.url release tag and archive name must match webplayer.lock version",
  );
  expectFailure(
    {
      ...releasedLock(),
      artifact: {
        ...releasedLock().artifact,
        url: "https://github.com/dnoegel/rasterklang-webplayer/releases/download/v0.1.0/rasterklang-webplayer-ui-v0.1.1.tar.gz",
      },
    },
    "artifact.url release tag and archive name must match webplayer.lock version",
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

function releasedLock() {
  return {
    package: "rasterklang-webplayer-ui",
    repo: "rasterklang-webplayer",
    status: "released",
    version: "v0.1.0",
    bridgeApiVersion: "1",
    requiredDesktopCapabilities: [
      "GetPlaybackState",
      "LoadTrack",
      "PlayTrack",
      "ResetEqualizer",
      "Seek",
      "SetAudioControls",
      "SetEqualizer",
      "SetVolume",
      "Stop",
      "ToggleMute",
      "TogglePause",
    ],
    artifact: {
      filePattern: "rasterklang-webplayer-ui-{version}.tar.gz",
      url: "https://github.com/dnoegel/rasterklang-webplayer/releases/download/v0.1.0/rasterklang-webplayer-ui-v0.1.0.tar.gz",
      checksumSha256: "a".repeat(64),
      checksumRequiredForRelease: true,
      generatedBy: "make dist-ui VERSION={version}",
    },
  };
}

function expectSuccess(lock, description) {
  const result = run(lock);
  assert.equal(result.status, 0, `${description}\n${result.stderr}`);
  assert.match(result.stdout, /Webplayer release lock preflight passed/);
}

function expectFailure(lock, expectedError) {
  const result = run(lock);
  assert.notEqual(result.status, 0, `expected failure containing ${expectedError}`);
  assert.match(result.stderr, new RegExp(escapeRegExp(expectedError)));
}

function run(lock) {
  const lockPath = join(tmpDir, `${lock.status}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return spawnSync(process.execPath, [scriptPath, lockPath], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
