import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const version = normalizeVersion(required(args.version, "--version"));
const arch = normalizeArch(required(args.arch, "--arch"));
const binary = resolve(required(args.binary, "--binary"));
const icon = resolve(required(args.icon, "--icon"));
const desktopEntry = resolve(required(args.desktopEntry, "--desktop-entry"));
const licenseReport = resolve(required(args.licenseReport, "--license-report"));
const provenance = resolve(required(args.provenance, "--provenance"));
const outDir = resolve(args.outDir || "dist");
const workRoot = resolve(args.workRoot || "build/deb");
const packageName = "rasterklang-desktop";
const packageId = `${packageName}_${version}_${arch}`;
const stageRoot = join(workRoot, packageId);
const debPath = join(outDir, `${packageId}.deb`);

for (const path of [binary, icon, desktopEntry, licenseReport, provenance]) {
  if (!existsSync(path)) {
    fail(`required file is missing: ${path}`);
  }
}

rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(join(stageRoot, "DEBIAN"), { recursive: true });
mkdirSync(join(stageRoot, "usr/bin"), { recursive: true });
mkdirSync(join(stageRoot, "usr/share/applications"), { recursive: true });
mkdirSync(join(stageRoot, "usr/share/icons/hicolor/1024x1024/apps"), { recursive: true });
mkdirSync(join(stageRoot, "usr/share/doc/rasterklang-desktop"), { recursive: true });
mkdirSync(outDir, { recursive: true });

copyFileSync(binary, join(stageRoot, "usr/bin/rasterklang-desktop"));
chmodSync(join(stageRoot, "usr/bin/rasterklang-desktop"), 0o755);
copyFileSync(desktopEntry, join(stageRoot, "usr/share/applications/rasterklang.desktop"));
copyFileSync(icon, join(stageRoot, "usr/share/icons/hicolor/1024x1024/apps/rasterklang.png"));

for (const doc of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md"]) {
  copyFileSync(doc, join(stageRoot, "usr/share/doc/rasterklang-desktop", doc));
}
copyFileSync("LICENSE", join(stageRoot, "usr/share/doc/rasterklang-desktop/copyright"));
copyFileSync(licenseReport, join(stageRoot, "usr/share/doc/rasterklang-desktop/THIRD_PARTY_LICENSE_REPORT.md"));
copyFileSync(provenance, join(stageRoot, "usr/share/doc/rasterklang-desktop/RELEASE_PROVENANCE.json"));

writeFileSync(
  join(stageRoot, "DEBIAN/control"),
  [
    "Package: rasterklang-desktop",
    `Version: ${version}`,
    `Architecture: ${arch}`,
    "Maintainer: Rasterklang Maintainers <noreply@rasterklang.de>",
    "Depends: libgtk-3-0, libwebkit2gtk-4.0-37, libasound2",
    "Section: sound",
    "Priority: optional",
    "Homepage: https://github.com/dnoegel/rasterklang-desktop",
    "Description: Native Rasterklang SID desktop player",
    " Rasterklang Desktop packages the shared Rasterklang web player with a",
    " native Go/Wails shell for local HVSC SID playback.",
    "",
  ].join("\n"),
);

const result = spawnSync("dpkg-deb", ["--build", stageRoot, debPath], {
  stdio: "inherit",
});
if (result.status !== 0) {
  fail("dpkg-deb failed");
}

const checksum = createHash("sha256").update(readFileSync(debPath)).digest("hex");
writeFileSync(`${debPath}.sha256`, `${checksum}  ${basename(debPath)}\n`);
console.log(`Created ${debPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      fail(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${arg} requires a value`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function required(value, name) {
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
}

function normalizeVersion(value) {
  return value.replace(/^v/, "");
}

function normalizeArch(value) {
  switch (value) {
    case "x86_64":
    case "amd64":
      return "amd64";
    case "aarch64":
    case "arm64":
      return "arm64";
    default:
      fail(`unsupported Debian architecture: ${value}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
