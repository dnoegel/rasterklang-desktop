import { readFileSync } from "node:fs";

const lockPath = process.argv[2] ?? "webplayer.lock";
const expectedPackage = "rasterklang-webplayer-ui";
const expectedRepo = "rasterklang-webplayer";
const releaseAssetPattern =
  /^https:\/\/github\.com\/dnoegel\/rasterklang-webplayer\/releases\/download\/([^/]+)\/rasterklang-webplayer-ui-([^/]+)\.tar\.gz$/;

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (error) {
  fail([`failed to read ${lockPath}`, "", error.message].join("\n"));
}

const errors = [];

if (lock.package !== expectedPackage) {
  errors.push(`webplayer.lock package must be ${expectedPackage}`);
}

if (lock.repo !== expectedRepo) {
  errors.push(`webplayer.lock repo must be ${expectedRepo}`);
}

if (lock.status !== "released") {
  errors.push("webplayer.lock status must be released");
}

if (!isNonEmptyString(lock.version)) {
  errors.push("webplayer.lock version must be a non-empty string");
}

if (!isNonEmptyString(lock.bridgeApiVersion)) {
  errors.push("webplayer.lock bridgeApiVersion must be a non-empty string");
}

validateStringArray(lock.requiredDesktopCapabilities, "webplayer.lock requiredDesktopCapabilities");

if (!lock.artifact || typeof lock.artifact !== "object") {
  errors.push("webplayer.lock artifact must be an object");
} else {
  if (lock.artifact.checksumRequiredForRelease !== true) {
    errors.push("artifact.checksumRequiredForRelease must be true");
  }

  if (!/^[a-f0-9]{64}$/.test(lock.artifact.checksumSha256 ?? "")) {
    errors.push("artifact.checksumSha256 must be a 64-character lowercase SHA-256");
  }

  const releaseAssetMatch = (lock.artifact.url ?? "").match(releaseAssetPattern);
  if (!releaseAssetMatch) {
    errors.push("artifact.url must point at the rasterklang-webplayer GitHub release asset");
  } else {
    const [, releaseTag, archiveVersion] = releaseAssetMatch;
    if (releaseTag !== lock.version || archiveVersion !== lock.version) {
      errors.push("artifact.url release tag and archive name must match webplayer.lock version");
    }
  }

  if (lock.artifact.filePattern !== "rasterklang-webplayer-ui-{version}.tar.gz") {
    errors.push("artifact.filePattern must be rasterklang-webplayer-ui-{version}.tar.gz");
  }

  if (lock.artifact.generatedBy !== "make dist-ui VERSION={version}") {
    errors.push("artifact.generatedBy must be make dist-ui VERSION={version}");
  }
}

if (errors.length > 0) {
  fail(
    [
      "webplayer release lock preflight failed",
      "",
      ...errors.map((error) => `- ${error}`),
      "",
      "Release rasterklang-webplayer first, then update webplayer.lock with the published asset URL and SHA-256 before building desktop release artifacts.",
    ].join("\n"),
  );
}

console.log(`Webplayer release lock preflight passed for ${lock.repo}@${lock.version}.`);

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }

  const seen = new Set();
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      errors.push(`${label} must contain only non-empty strings`);
      return;
    }
    if (seen.has(entry)) {
      errors.push(`${label} contains duplicate value: ${entry}`);
      return;
    }
    seen.add(entry);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
