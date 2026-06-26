import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const contributing = readFileSync("CONTRIBUTING.md", "utf8");
const releaseDocs = readFileSync("docs/release.md", "utf8");
const makefile = readFileSync("Makefile", "utf8");

for (const file of [
  "frontend/dist/index.html",
  "frontend/dist/app.js",
  "frontend/dist/rasterklang-webplayer.json",
  "frontend/dist/assets/hvsc-library.json",
]) {
  assert.ok(existsSync(file), `${file} should exist as part of the desktop frontend snapshot`);
}

for (const path of ["frontend/dist", "frontend/dist/index.html", "frontend/dist/rasterklang-webplayer.json"]) {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { stdio: "ignore" });
    assert.fail(`${path} must not be ignored; frontend/dist is a checked-in generated snapshot`);
  } catch (error) {
    assert.equal(error.status, 1, `${path} ignore check should complete without Git errors`);
  }
}

for (const phrase of [
  "`frontend/dist` is intentionally tracked",
  "Do not edit it directly",
]) {
  assert.ok(readme.includes(phrase), `README.md should document generated frontend policy: ${phrase}`);
}

for (const phrase of [
  "Pinned Webplayer Artifact",
  "WEBPLAYER_ARTIFACT",
  "WEBPLAYER_ARTIFACT_SHA256",
  "sibling checkout fallback",
]) {
  assert.ok(releaseDocs.includes(phrase), `docs/release.md should document release frontend policy: ${phrase}`);
}

for (const phrase of [
  "Tracked generated snapshot",
  "Do not hand-edit frontend/dist",
  "Commit frontend/dist changes only with the matching webplayer source or artifact update",
  "Release builds must sync from WEBPLAYER_ARTIFACT with WEBPLAYER_ARTIFACT_SHA256",
]) {
  assert.ok(contributing.includes(phrase), `CONTRIBUTING.md should document generated frontend policy: ${phrase}`);
}

assert.ok(
  makefile.includes("check-generated-frontend-policy.mjs"),
  "Makefile check should run the generated frontend policy verifier",
);

console.log("Generated frontend policy is documented and guarded.");
