// Loads the zmk-web SDK with cache-busting and falls back gracefully
// to a minimal "demo" mode if the WASM bundle is not present.

const CANDIDATES = [
  { js: "../zmk-web/dist/zmk-sid.js", wasmExec: "../zmk-web/dist/wasm_exec.js", wasm: "../zmk-web/dist/zmk-web-player.wasm" },
  { js: "../zmk-web/src/zmk-sid.js",  wasmExec: "../zmk-web/dist/wasm_exec.js", wasm: "../zmk-web/dist/zmk-web-player.wasm" },
];
const SDK_ASSET_VERSION = "2026-04-27-21";

let cached;

export async function loadSdk() {
  if (cached) return cached;
  cached = (async () => {
    let lastError = null;
    for (const candidate of CANDIDATES) {
      try {
        const mod = await import(versionedURL(candidate.js));
        if (typeof mod.createZmkSid !== "function") continue;
        const sid = await mod.createZmkSid({
          wasmExecURL: versionedURL(candidate.wasmExec),
          wasmURL: versionedURL(candidate.wasm),
        });
        return {
          ok: true,
          sid,
          ZmkSidError: mod.ZmkSidError,
          int16ToFloat32: mod.int16ToFloat32,
          path: candidate.js,
        };
      } catch (error) {
        lastError = error;
      }
    }
    return { ok: false, error: lastError };
  })();
  return cached;
}

function versionedURL(path) {
  const url = new URL(path, location.href);
  url.searchParams.set("v", SDK_ASSET_VERSION);
  return url.href;
}

// Reset the SDK cache. Used after errors to force a retry.
export function resetSdkCache() {
  cached = null;
}
