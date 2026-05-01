import { mountShell } from "./src/shell/shell.js?v=2026-05-01-084125";
import { createNativeEngineController } from "./src/lib/native-engine.js";
import { createEventBus } from "./src/lib/events.js";
import { createToast } from "./src/lib/ui.js";
import { createCatalog } from "./src/lib/catalog.js?v=2026-05-01-084125";
import { createFavorites } from "./src/lib/favorites.js?v=2026-05-01-084125";
import { ChooseHVSCRoot, GetLibraryState } from "./wailsjs/go/main/App.js";

const APP_VERSION = "2026-05-01-084125";
const APP_NAME = "Rasterklang";

async function boot() {
  const isMac = navigator.platform?.toLowerCase().includes("mac");
  document.documentElement.dataset.platform = isMac ? "mac" : "other";
  if (isMac) mountMacTitlebarDragRegion();

  const events = createEventBus();
  const toast = createToast(document.getElementById("toast-host"));
  const engine = createNativeEngineController({ events, toast });

  const response = await fetch(`./assets/hvsc-library.json?v=${APP_VERSION}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HVSC Manifest konnte nicht geladen werden (${response.status}).`);
  const library = await response.json();
  const catalog = createCatalog(library);
  const nativeState = await GetLibraryState();

  const ctx = {
    brandName: APP_NAME,
    events,
    toast,
    engine,
    library,
    catalog,
    favorites: null,
    queue: { tracks: [], index: -1 },
    native: {
      state: nativeState,
      async chooseHVSCRoot() {
        const next = await ChooseHVSCRoot();
        ctx.native.state = next;
        events.emit("native.library.changed", next);
        return next;
      },
    },
    version: APP_VERSION,
  };
  ctx.favorites = createFavorites(ctx);
  window.zmkWebplayer = ctx;

  await engine.loadSDK();
  await mountShell(document.getElementById("app"), ctx);
  document.getElementById("app").removeAttribute("data-loading");

  if (!nativeState?.hvscRootValid) {
    toast.warn("Bitte lokale HVSC Collection auswaehlen.", 5200);
  }
}

function mountMacTitlebarDragRegion() {
  if (document.querySelector(".native-titlebar-drag-region")) return;
  const region = document.createElement("div");
  region.className = "native-titlebar-drag-region";
  region.setAttribute("aria-hidden", "true");
  document.body.append(region);
}

boot().catch((error) => {
  console.error("[zmk-nativeplayer] Boot failed:", error);
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div class="boot-error">
        <h1>${APP_NAME} konnte nicht starten.</h1>
        <pre>${(error && error.message) || error}</pre>
      </div>
    `;
  }
});
