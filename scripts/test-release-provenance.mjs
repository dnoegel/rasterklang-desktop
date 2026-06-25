import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "rk-desktop-provenance-"));

try {
  const catalog = join(tempRoot, "hvsc-library.json");
  const out = join(tempRoot, "RELEASE_PROVENANCE.json");
  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(catalog, "[]\n");
  const catalogSha256 = createHash("sha256").update(readFileSync(catalog)).digest("hex");
  const webplayerArtifactSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const result = spawnSync(
    process.execPath,
    [
      "scripts/write-release-provenance.mjs",
      "--out",
      out,
      "--name",
      "rasterklang-desktop",
      "--version",
      "v0.1.0",
      "--commit",
      "abcdef1",
      "--date",
      "2026-06-25T00:00:00Z",
      "--source-repository",
      "https://github.com/dnoegel/rasterklang-desktop",
      "--artifact-kind",
      "desktop-artifact",
      "--artifact-name",
      "rasterklang-desktop_v0.1.0_linux_amd64",
      "--target-os",
      "linux",
      "--target-arch",
      "amd64",
      "--asset-version",
      "v0.1.0",
      "--webplayer-artifact-sha256",
      webplayerArtifactSha256,
      "--webplayer-catalog",
      catalog,
      "--build-command",
      "make dist VERSION=v0.1.0",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        SOURCE_DIRTY: "false",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const provenance = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(provenance.build.assetVersion, "v0.1.0");
  assert.equal(provenance.build.webplayerArtifactSha256, webplayerArtifactSha256);
  assert.equal(provenance.build.webplayerCatalogSha256, catalogSha256);
  assert.equal(provenance.build.sourceDirty, false);

  const makefile = readFileSync("Makefile", "utf8");
  assert.match(makefile, /test-release-provenance\.mjs/);
  assert.match(makefile, /--webplayer-catalog\s+"frontend\/dist\/assets\/hvsc-library\.json"/);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Release provenance contract passed.");
