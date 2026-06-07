// Loads the rasterklang-wasm SDK with cache-busting and falls back gracefully
// to a minimal "demo" mode if the WASM bundle is not present.

const CANDIDATES = [
  { js: "/rasterklang-wasm/dist/rasterklang.js", wasmExec: "/rasterklang-wasm/dist/wasm_exec.js", wasm: "/rasterklang-wasm/dist/rasterklang.wasm" },
  { js: "../rasterklang-wasm/dist/rasterklang.js", wasmExec: "../rasterklang-wasm/dist/wasm_exec.js", wasm: "../rasterklang-wasm/dist/rasterklang.wasm" },
  { js: "../rasterklang-wasm/src/rasterklang.js",  wasmExec: "../rasterklang-wasm/dist/wasm_exec.js", wasm: "../rasterklang-wasm/dist/rasterklang.wasm" },
];
const SDK_ASSET_VERSION = "2026-05-01-7";

let cached;

export async function loadSdk() {
  if (cached) return cached;
  cached = (async () => {
    let lastError = null;
    for (const candidate of CANDIDATES) {
      try {
        const mod = await import(versionedURL(candidate.js));
        if (typeof mod.createRasterklang !== "function") continue;
        const sid = await mod.createRasterklang({
          wasmExecURL: versionedURL(candidate.wasmExec),
          wasmURL: versionedURL(candidate.wasm),
        });
        return {
          ok: true,
          sid,
          RasterklangError: mod.RasterklangError,
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
