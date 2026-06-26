import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

globalThis.window = {
  go: {
    main: {
      App: {},
    },
  },
  setInterval: () => 0,
};

const tempRoot = mkdtempSync(join(tmpdir(), "rk-native-engine-contract-"));

try {
  const tempEngine = join(tempRoot, "frontend/dist/src/lib/native-engine.mjs");
  const tempBridge = join(tempRoot, "frontend/dist/wailsjs/go/main/App.mjs");
  mkdirSync(dirname(tempEngine), { recursive: true });
  mkdirSync(dirname(tempBridge), { recursive: true });

  const bridgeSource = readFileSync("frontend/dist/wailsjs/go/main/App.js", "utf8");
  const engineSource = readFileSync("frontend/dist/src/lib/native-engine.js", "utf8").replace(
    "../../wailsjs/go/main/App.js",
    "../../wailsjs/go/main/App.mjs",
  );
  writeFileSync(tempBridge, bridgeSource);
  writeFileSync(tempEngine, engineSource);

  const { createNativeEngineController } = await import(pathToFileURL(tempEngine).href);

  const controller = createNativeEngineController({
    events: {
      emit() {},
    },
    toast: null,
  });

  const capabilities = controller.getCapabilities();
  assert.equal(capabilities.runtime, "go-native");
  assert.equal(capabilities.features.snapshot, true);
  assert.equal(capabilities.features.trace, false);
  assert.equal(capabilities.features.nativeAudio, true);
  assert.equal(
    capabilities.features.stepInstruction,
    undefined,
    "native desktop bridge must not advertise instruction stepping until a real Wails step stream exists",
  );

  await assert.rejects(
    controller.createStepStream(),
    (error) => {
      assert.equal(error.name, "UnsupportedNativeFeatureError");
      assert.equal(error.code, "ERR_NATIVE_FEATURE_UNSUPPORTED");
      assert.equal(error.feature, "stepInstruction");
      assert.match(error.message, /Native desktop instruction stepping is not available in this release/);
      return true;
    },
    "native desktop instruction stepping should fail as a structured unsupported-feature boundary",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Native engine contract passed.");
