import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const tempRoot = mkdtempSync(join(tmpdir(), "rk-native-media-controls-"));

try {
  const sourcePath = "frontend/dist/src/lib/native-media-controls.js";
  const tempModule = join(tempRoot, "frontend/dist/src/lib/native-media-controls.mjs");
  const tempCatalog = join(tempRoot, "frontend/dist/src/lib/catalog.mjs");
  mkdirSync(dirname(tempModule), { recursive: true });
  writeFileSync(
    tempModule,
    readFileSync(sourcePath, "utf8").replace("./catalog.js?v=dev", "./catalog.mjs"),
  );
  writeFileSync(
    tempCatalog,
    [
      "export async function playNextTrack() { return true; }",
      "export async function playPrevTrack() { return true; }",
    ].join("\n"),
  );

  const { handleNativeMediaControl, mountNativeMediaControls } = await import(pathToFileURL(tempModule).href);
  const calls = [];
  const ctx = {
    native: {},
    transport: {
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      togglePlay: () => calls.push("togglePlay"),
      next: () => calls.push("next"),
      previous: () => calls.push("previous"),
    },
    toast: {
      warn: (message) => calls.push(`warn:${message}`),
      error: (message) => calls.push(`error:${message}`),
    },
  };

  await handleNativeMediaControl(ctx, "play");
  await handleNativeMediaControl(ctx, "pause");
  await handleNativeMediaControl(ctx, "toggle");
  await handleNativeMediaControl(ctx, "next");
  await handleNativeMediaControl(ctx, "previous");
  await handleNativeMediaControl(ctx, "unknown");
  assert.deepEqual(calls, ["play", "pause", "togglePlay", "next", "previous"]);

  let registeredName = "";
  let registeredHandler = null;
  const unsubscribe = () => calls.push("unsubscribe");
  const stop = mountNativeMediaControls(ctx, {
    EventsOn(name, handler) {
      registeredName = name;
      registeredHandler = handler;
      return unsubscribe;
    },
  });

  assert.equal(registeredName, "native.media-control");
  await registeredHandler("next");
  assert.equal(calls.at(-1), "next");
  stop();
  assert.equal(calls.at(-1), "unsubscribe");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Native media controls contract passed.");
