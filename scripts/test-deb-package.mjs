import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "rk-desktop-deb-"));
const fakeBin = join(tempRoot, "bin");
const fixture = join(tempRoot, "fixture");
const outDir = join(tempRoot, "dist");
const workRoot = join(tempRoot, "work");

try {
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(join(fixture, "bin"), { recursive: true });
  mkdirSync(join(fixture, "build"), { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const fakeDpkg = join(fakeBin, "dpkg-deb");
  writeFileSync(
    fakeDpkg,
    [
      "#!/bin/sh",
      "set -eu",
      "printf '%s\\n' \"$@\" > \"$RK_DPKG_LOG\"",
      "touch \"$3\"",
      "",
    ].join("\n"),
  );
  chmodSync(fakeDpkg, 0o755);

  const binary = join(fixture, "bin/rasterklang-desktop");
  const icon = join(fixture, "build/appicon.png");
  const licenseReport = join(fixture, "THIRD_PARTY_LICENSE_REPORT.md");
  const provenance = join(fixture, "RELEASE_PROVENANCE.json");
  writeFileSync(binary, "#!/bin/sh\n");
  chmodSync(binary, 0o755);
  writeFileSync(icon, "png");
  writeFileSync(licenseReport, "# licenses\n");
  writeFileSync(provenance, '{"schemaVersion":1}\n');

  const result = spawnSync(
    process.execPath,
    [
      "scripts/build-deb-package.mjs",
      "--version",
      "v0.1.0",
      "--arch",
      "x86_64",
      "--binary",
      binary,
      "--icon",
      icon,
      "--desktop-entry",
      "packaging/linux/rasterklang.desktop",
      "--license-report",
      licenseReport,
      "--provenance",
      provenance,
      "--out-dir",
      outDir,
      "--work-root",
      workRoot,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        RK_DPKG_LOG: join(tempRoot, "dpkg.log"),
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const debPath = join(outDir, "rasterklang-desktop_0.1.0_amd64.deb");
  assert.ok(existsSync(debPath), "deb package should be created");
  assert.ok(existsSync(`${debPath}.sha256`), "deb checksum should be created");

  const stageRoot = join(workRoot, "rasterklang-desktop_0.1.0_amd64");
  const control = readFileSync(join(stageRoot, "DEBIAN/control"), "utf8");
  assert.match(control, /^Package: rasterklang-desktop$/m);
  assert.match(control, /^Version: 0\.1\.0$/m);
  assert.match(control, /^Architecture: amd64$/m);
  assert.match(control, /^Depends: libgtk-3-0, libwebkit2gtk-4\.0-37, libasound2$/m);
  assert.match(control, /^Description: Native Rasterklang SID desktop player$/m);

  for (const expectedPath of [
    "usr/bin/rasterklang-desktop",
    "usr/share/applications/rasterklang.desktop",
    "usr/share/icons/hicolor/1024x1024/apps/rasterklang.png",
    "usr/share/doc/rasterklang-desktop/README.md",
    "usr/share/doc/rasterklang-desktop/CHANGELOG.md",
    "usr/share/doc/rasterklang-desktop/CONTRIBUTING.md",
    "usr/share/doc/rasterklang-desktop/SECURITY.md",
    "usr/share/doc/rasterklang-desktop/THIRD_PARTY_NOTICES.md",
    "usr/share/doc/rasterklang-desktop/THIRD_PARTY_LICENSE_REPORT.md",
    "usr/share/doc/rasterklang-desktop/RELEASE_PROVENANCE.json",
    "usr/share/doc/rasterklang-desktop/copyright",
  ]) {
    assert.ok(existsSync(join(stageRoot, expectedPath)), `${expectedPath} should be staged`);
  }

  const dpkgArgs = readFileSync(join(tempRoot, "dpkg.log"), "utf8");
  assert.match(dpkgArgs, /^--build\n/);
  assert.match(dpkgArgs, new RegExp(`${escapeRegExp(stageRoot)}\n${escapeRegExp(debPath)}\n$`));

  const checksum = readFileSync(`${debPath}.sha256`, "utf8").trim();
  assert.match(checksum, /^[a-f0-9]{64}\s+rasterklang-desktop_0\.1\.0_amd64\.deb$/);

  const makefile = readFileSync("Makefile", "utf8");
  assert.match(makefile, /\.PHONY:.*dist-deb/s);
  assert.match(makefile, /dist-linux:.*dist-deb/s);
  assert.match(makefile, /build-deb-package\.mjs/);

  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /rasterklang-desktop_0\.1\.0_amd64\.deb/);
  assert.match(readme, /sudo apt install \.\/rasterklang-desktop_0\.1\.0_amd64\.deb/);

  const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(releaseWorkflow, /dist\/\*\.deb/);
  assert.match(releaseWorkflow, /dist\/\*\.deb\.sha256/);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Debian package contract passed.");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
